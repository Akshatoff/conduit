"""Device nodes: the transport layer behind the device controller.

``SimulatedNode`` and ``PhoneAdbNode`` (see ``phone.py``) implement the same interface, so the
controller and everything above it is identical in simulation and real-hardware mode.
"""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Dict


class NodeError(Exception):
    """Communication failure with a node (timeout, refused, malformed reply)."""


class DeviceNode(ABC):
    name: str = "node"
    simulated: bool = False

    @abstractmethod
    async def health(self) -> dict: ...

    @abstractmethod
    async def send(self, cmd) -> object: ...

    @abstractmethod
    async def read_state(self) -> Dict[str, str]: ...

    async def register(self) -> dict:
        return await self.health()

    async def shutdown(self) -> None:
        """Release the link and return the outputs to their safe state (default: nothing to do)."""


class SimulatedNode(DeviceNode):
    """Software stand-in for the phone. Applies commands to virtual outputs and acknowledges.

    ``online`` can be toggled to rehearse a communication failure; commands then fail exactly
    like an unplugged phone would.
    """

    name = "simulation"
    simulated = True

    def __init__(self, ack_delay_s: float = 0.08) -> None:
        from .models import DEVICE_SPECS, DeviceAck

        self._DeviceAck = DeviceAck
        self.ack_delay_s = ack_delay_s
        self.online = True
        self.fault_state_mismatch = False  # test hook: ack OK but state does not change
        self._specs = DEVICE_SPECS
        self._state: Dict[str, str] = {k: s.safe_state for k, s in DEVICE_SPECS.items()}
        self._seen: Dict[str, object] = {}

    async def health(self) -> dict:
        if not self.online:
            raise NodeError("Simulated node offline")
        return {"status": "ok", "node": "simulation", "simulated": True,
                "firmware": "sim-2.0", "model": "simulated phone"}

    async def send(self, cmd) -> object:
        await asyncio.sleep(self.ack_delay_s)
        if not self.online:
            raise NodeError("Simulated node offline")
        prev = self._seen.get(cmd.command_id)
        if prev is not None:
            return prev
        if cmd.device not in self._state:
            raise NodeError(f"Unknown device '{cmd.device}'")
        target = "ON" if cmd.action == "ON" else "OFF"
        if not self.fault_state_mismatch:
            self._state[cmd.device] = target
        ack = self._DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                              actual_state=target, simulated=True, verified=True)
        self._seen[cmd.command_id] = ack
        return ack

    async def read_state(self) -> Dict[str, str]:
        if not self.online:
            raise NodeError("Simulated node offline")
        return {k: v for k, v in self._state.items() if k in self._specs}

    def failsafe(self) -> None:
        self._state = {k: s.safe_state for k, s in self._specs.items()}
