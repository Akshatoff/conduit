"""Device nodes: the transport layer behind the device controller.

``SimulatedNode`` and ``ESP32Node`` implement the same interface, so the controller (and
everything above it) is identical in simulation and real-hardware mode.
"""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Optional

import httpx

from .models import ACTION_TO_STATE, DEVICE_SPECS, DeviceAck, DeviceCommand


class NodeError(Exception):
    """Communication failure with a node (timeout, refused, malformed reply)."""


class DeviceNode(ABC):
    name: str = "node"
    simulated: bool = False

    @abstractmethod
    async def health(self) -> dict: ...

    @abstractmethod
    async def send(self, cmd: DeviceCommand) -> DeviceAck: ...

    @abstractmethod
    async def read_state(self) -> Dict[str, str]: ...

    async def register(self) -> dict:
        return await self.health()


class SimulatedNode(DeviceNode):
    """Software stand-in for the ESP32. Applies commands to virtual outputs and acknowledges.

    ``online`` can be toggled to rehearse a communication failure; commands then fail exactly
    like a real unreachable node would.
    """

    name = "simulation"
    simulated = True

    def __init__(self, ack_delay_s: float = 0.08) -> None:
        self.ack_delay_s = ack_delay_s
        self.online = True
        self.fault_state_mismatch = False  # test hook: ack OK but state does not change
        self._state: Dict[str, str] = {k: s.safe_state for k, s in DEVICE_SPECS.items()}
        self._seen: Dict[str, DeviceAck] = {}

    async def health(self) -> dict:
        if not self.online:
            raise NodeError("Simulated node offline")
        return {"status": "ok", "node": "simulation", "simulated": True, "firmware": "sim-1.0"}

    async def send(self, cmd: DeviceCommand) -> DeviceAck:
        await asyncio.sleep(self.ack_delay_s)
        if not self.online:
            raise NodeError("Simulated node offline")
        if cmd.command_id in self._seen:  # idempotent: a repeated id never re-actuates
            return self._seen[cmd.command_id]
        target = ACTION_TO_STATE[cmd.action]
        if not self.fault_state_mismatch:
            self._state[cmd.device] = target
        ack = DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                        actual_state=self._state[cmd.device], simulated=True)
        self._seen[cmd.command_id] = ack
        return ack

    async def read_state(self) -> Dict[str, str]:
        if not self.online:
            raise NodeError("Simulated node offline")
        return dict(self._state)

    def failsafe(self) -> None:
        self._state = {k: s.safe_state for k, s in DEVICE_SPECS.items()}


class ESP32Node(DeviceNode):
    """HTTP/JSON client for the ESP32 firmware (see firmware/conduit_node.ino)."""

    name = "esp32"
    simulated = False

    def __init__(self, host: str = "", port: int = 80, timeout_s: float = 2.0) -> None:
        self.host, self.port, self.timeout_s = host, port, timeout_s

    def configure(self, host: str, port: int, timeout_s: float) -> None:
        self.host, self.port, self.timeout_s = host, port, timeout_s

    @property
    def base(self) -> str:
        return f"http://{self.host}:{self.port}"

    async def _req(self, method: str, path: str, **kw) -> dict:
        if not self.host:
            raise NodeError("ESP32 host not configured")
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as c:
                r = await c.request(method, self.base + path, **kw)
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, dict):
                raise NodeError("Malformed reply from ESP32")
            return data
        except NodeError:
            raise
        except (httpx.HTTPError, ValueError) as e:
            raise NodeError(f"{type(e).__name__}: {e}") from e

    async def health(self) -> dict:
        return await self._req("GET", "/health")

    async def register(self) -> dict:
        return await self._req("GET", "/info")

    async def send(self, cmd: DeviceCommand) -> DeviceAck:
        data = await self._req("POST", "/command", json=cmd.wire())
        try:
            return DeviceAck(**{**data, "simulated": False})
        except Exception as e:  # pydantic validation error -> treat as comms failure
            raise NodeError(f"Malformed acknowledgement: {e}") from e

    async def read_state(self) -> Dict[str, str]:
        data = await self._req("GET", "/state")
        states = data.get("devices", data)
        return {k: str(v) for k, v in states.items() if k in DEVICE_SPECS}
