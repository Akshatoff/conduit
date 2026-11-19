"""Device nodes: the transport layer behind the device controller.

``SimulatedNode`` and ``ArduinoSerialNode`` implement the same interface, so the controller
(and everything above it) is identical in simulation and real-hardware mode.
"""
from __future__ import annotations

import asyncio
import threading
import time
from abc import ABC, abstractmethod
from typing import Callable, Dict, Optional

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
    """Software stand-in for the Arduino. Applies commands to virtual outputs and acknowledges.

    ``online`` can be toggled to rehearse a communication failure; commands then fail exactly
    like a real unplugged board would.
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


class _SerialLink:
    """Blocking, line-oriented link to the Arduino Uno sketch (firmware/conduit_uno).

    Every call is a strict request/response transaction, so a stale reply can never be
    mistaken for the acknowledgement of a later command:

        host -> node   PING | STATE? | CMD <id> <device> <action> <source>
        node -> host   PONG ... | STATE lighting=.. access=.. | ACK <id> <device> <status> <state>

    The link is blocking by design: the node wraps it in ``asyncio.to_thread`` so the event
    loop keeps running while the board answers.
    """

    def __init__(self, port: str, baud: int, timeout_s: float,
                 serial_factory: Optional[Callable[..., object]] = None,
                 boot_delay_s: float = 1.6) -> None:
        self.port = port
        self.baud = baud
        self.timeout_s = timeout_s
        self.serial_factory = serial_factory
        self.boot_delay_s = boot_delay_s
        self.last_line: Optional[str] = None
        self._ser = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------- lifecycle
    def configure(self, port: str, baud: int, timeout_s: float) -> None:
        with self._lock:
            if (port, baud) != (self.port, self.baud):
                self._close_locked()
            self.port, self.baud, self.timeout_s = port, baud, timeout_s

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
            self._ser = None

    def _ensure_open(self) -> None:
        if self._ser is not None:
            return
        if not self.port:
            raise NodeError("Arduino serial port is not configured (Settings -> Hardware)")
        factory = self.serial_factory
        if factory is None:
            try:
                import serial  # pyserial, imported lazily so simulation needs no hardware deps
            except ImportError as e:  # pragma: no cover - depends on the environment
                raise NodeError("pyserial is not installed (pip install pyserial)") from e
            factory = serial.Serial
        try:
            self._ser = factory(port=self.port, baudrate=self.baud, timeout=0.05, write_timeout=1.0)
        except Exception as e:
            raise NodeError(f"Cannot open serial port '{self.port}': {e}") from e
        if self.boot_delay_s:
            # Opening the Uno's port pulls DTR and resets the board; give setup() time to run.
            time.sleep(self.boot_delay_s)

    # ------------------------------------------------------------------- io
    def _read_line(self, deadline: float) -> Optional[str]:
        while time.monotonic() < deadline:
            try:
                raw = self._ser.readline()
            except Exception as e:
                self._close_locked()
                raise NodeError(f"Serial read failed: {e}") from e
            if not raw:
                time.sleep(0.005)
                continue
            text = raw.decode("utf-8", errors="replace").strip()
            if text:
                self.last_line = text
                return text
        return None

    def _drain(self) -> None:
        """Discard anything already buffered before starting a new transaction."""
        deadline = time.monotonic() + 0.05
        while True:
            try:
                if not self._ser.readline():
                    break
            except Exception:
                self._close_locked()
                raise NodeError("Serial link lost")
            if time.monotonic() > deadline:
                break

    def _request(self, line: str, prefix: str, timeout_s: float) -> str:
        with self._lock:
            self._ensure_open()
            self._drain()
            try:
                self._ser.write((line + "\n").encode("utf-8"))
                self._ser.flush()
            except Exception as e:
                self._close_locked()
                raise NodeError(f"Serial write failed: {e}") from e
            deadline = time.monotonic() + timeout_s
            while True:
                text = self._read_line(deadline)
                if text is None:
                    raise NodeError(
                        f"No reply to {line.split()[0]} within {timeout_s:.1f}s"
                        + (f" (last line: {self.last_line!r})" if self.last_line else "")
                    )
                if text.startswith("ERR"):
                    raise NodeError(f"Node rejected request: {text[3:].strip() or text}")
                if text.startswith(prefix):
                    return text

    # -------------------------------------------------------------- protocol
    def health(self) -> dict:
        last: Optional[NodeError] = None
        for _ in range(2):  # a just-reset board can miss the first PING
            try:
                text = self._request("PING", "PONG", self.timeout_s)
                parts = text.split()
                return {"status": "ok", "node": "arduino-uno", "simulated": False,
                        "firmware": parts[1] if len(parts) > 1 else "unknown"}
            except NodeError as e:
                last = e
                if "not configured" in str(e) or "Cannot open" in str(e) or "pyserial" in str(e):
                    raise
        raise last or NodeError("No reply from Arduino")

    def read_state(self) -> Dict[str, str]:
        text = self._request("STATE?", "STATE", self.timeout_s)
        states: Dict[str, str] = {}
        for token in text.split()[1:]:
            if "=" not in token:
                continue
            key, value = token.split("=", 1)
            if key in DEVICE_SPECS:
                states[key] = value
        if not states:
            raise NodeError(f"Malformed state reply: {text!r}")
        return states

    def command(self, cmd: DeviceCommand) -> DeviceAck:
        line = f"CMD {cmd.command_id} {cmd.device} {cmd.action} {cmd.source}"
        # Accept any ACK line: the controller verifies that the echoed command_id matches,
        # so a reply for a different command is reported as FAILED rather than as silence.
        text = self._request(line, "ACK ", self.timeout_s)
        parts = text.split()
        if len(parts) < 4:
            raise NodeError(f"Malformed acknowledgement: {text!r}")
        return DeviceAck(command_id=parts[1], device=parts[2], status=parts[3],
                         actual_state=parts[4] if len(parts) > 4 and parts[4] != "-" else None,
                         detail=" ".join(parts[5:]) or None, simulated=False)


class ArduinoSerialNode(DeviceNode):
    """USB-serial client for the Arduino Uno firmware (see firmware/conduit_uno)."""

    name = "arduino-uno"
    simulated = False

    def __init__(self, port: str = "", baud: int = 9600, timeout_s: float = 2.0,
                 serial_factory: Optional[Callable[..., object]] = None) -> None:
        self.link = _SerialLink(port, baud, timeout_s, serial_factory=serial_factory)

    # Convenience accessors used by the controller snapshot / Settings UI.
    @property
    def port(self) -> str:
        return self.link.port

    @property
    def baud(self) -> int:
        return self.link.baud

    @property
    def timeout_s(self) -> float:
        return self.link.timeout_s

    def configure(self, port: str, baud: int, timeout_s: float) -> None:
        self.link.configure(port, baud, timeout_s)

    async def health(self) -> dict:
        return await asyncio.to_thread(self.link.health)

    async def read_state(self) -> Dict[str, str]:
        return await asyncio.to_thread(self.link.read_state)

    async def send(self, cmd: DeviceCommand) -> DeviceAck:
        return await asyncio.to_thread(self.link.command, cmd)
