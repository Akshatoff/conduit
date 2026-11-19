"""Device controller / hardware abstraction layer.

One code path for simulation and real hardware:

    validate -> SENT -> (node) ACKNOWLEDGED -> state read-back -> CONFIRMED

The digital-twin state (``confirmed_state``) is ONLY updated when the node's acknowledgement
and an independent state read-back agree with the commanded state. Nothing is updated
optimistically when a command is merely sent. In real-hardware mode an acknowledgement is
never fabricated: if the Arduino Uno does not answer over USB serial, the command is reported
DISCONNECTED/FAILED.
"""
from __future__ import annotations

import asyncio
import time
from typing import Callable, Dict, Optional

from .models import (ACTION_TO_STATE, DEVICE_SPECS, HARDWARE_SOURCES, CommandResult, CommandStatus, DeviceCommand)
from .nodes import ArduinoSerialNode, DeviceNode, NodeError, SimulatedNode
from .validation import validate_command

EmitFn = Callable[[str, dict], None]


def _now() -> float:
    return time.time()


class DeviceController:
    def __init__(
        self,
        sim: Optional[SimulatedNode] = None,
        hw: Optional[ArduinoSerialNode] = None,
        mode: str = "simulation",
        emit: Optional[EmitFn] = None,
        min_confidence: float = 0.0,
        command_timeout_s: float = 3.0,
    ) -> None:
        self.sim = sim or SimulatedNode()
        self.hw = hw or ArduinoSerialNode()
        self.mode = mode
        self.emit: EmitFn = emit or (lambda t, d: None)
        self.min_confidence = min_confidence
        self.command_timeout_s = command_timeout_s
        self._results: Dict[str, CommandResult] = {}
        self._lock = asyncio.Lock()
        self.twin: Dict[str, dict] = {}
        self._reset_twin()

    # ------------------------------------------------------------------ twin
    def _reset_twin(self) -> None:
        sim_mode = self.mode == "simulation"
        for did, spec in DEVICE_SPECS.items():
            self.twin[did] = {
                "id": did, "name": spec.name, "type": spec.type, "hardware": spec.hardware,
                "actions": spec.actions, "safe_state": spec.safe_state,
                "confirmed_state": spec.safe_state if sim_mode else "UNKNOWN",
                "state_source": "simulation" if sim_mode else "none",
                "simulated": sim_mode,
                "connection": "simulated" if sim_mode else "disconnected",
                "last_command": None, "last_ack": None, "error": None,
                "pending_command_id": None, "updated_at": _now(),
            }

    def device_states(self) -> Dict[str, str]:
        return {k: v["confirmed_state"] for k, v in self.twin.items()}

    def snapshot(self) -> dict:
        return {
            "mode": self.mode,
            "node": self.active_node.name,
            "simulated": self.mode == "simulation",
            "devices": list(self.twin.values()),
            "hardware": {"port": self.hw.port, "baud": self.hw.baud, "timeout_s": self.hw.timeout_s},
        }

    @property
    def active_node(self) -> DeviceNode:
        return self.sim if self.mode == "simulation" else self.hw

    def _node_for(self, cmd: DeviceCommand) -> DeviceNode:
        if self.mode == "simulation" or cmd.source not in HARDWARE_SOURCES:
            return self.sim  # baseline gesture control can never reach physical outputs
        return self.hw

    def _emit_device_state(self, did: str, reason: str) -> None:
        self.emit("device_state_changed", {**self.twin[did], "reason": reason})

    # ------------------------------------------------------------------ mode
    async def set_mode(self, mode: str) -> None:
        if mode not in ("simulation", "hardware"):
            raise ValueError("mode must be 'simulation' or 'hardware'")
        self.mode = mode
        self._reset_twin()
        if mode == "hardware":
            await self.refresh()
        for did in self.twin:
            self._emit_device_state(did, f"Mode switched to {mode}")

    def configure_hardware(self, port: str, baud: int, timeout_s: float) -> None:
        """Point the controller at a serial port (e.g. COM3) and baud rate (9600 for the Uno)."""
        self.hw.configure(port, baud, timeout_s)

    async def refresh(self) -> bool:
        """Health-check the active node and read back device states (device registration + heartbeat)."""
        node = self.active_node
        try:
            await node.health()
            states = await node.read_state()
        except NodeError as e:
            self._mark_disconnected(str(e))
            return False
        for did, st in states.items():
            if did in self.twin:
                t = self.twin[did]
                changed = (t["confirmed_state"], t["connection"]) != (st, "simulated" if node.simulated else "connected")
                t.update(confirmed_state=st, connection="simulated" if node.simulated else "connected",
                         state_source="simulation" if node.simulated else "device_readback",
                         simulated=node.simulated, error=None, updated_at=_now())
                if changed:
                    self._emit_device_state(did, "State read back from node")
        return True

    def _mark_disconnected(self, why: str) -> None:
        for did, t in self.twin.items():
            was = t["connection"]
            t["connection"] = "disconnected"
            t["error"] = f"Node unreachable: {why}"
            t["pending_command_id"] = None
            # we can no longer vouch for the physical state; firmware failsafe returns outputs to safe state
            t["confirmed_state"] = "UNKNOWN"
            t["state_source"] = "none"
            t["updated_at"] = _now()
            if was != "disconnected":
                self._emit_device_state(did, "Node disconnected")

    def set_simulated_fault(self, offline: bool) -> None:
        """Rehearse a communication failure in simulation mode (also triggers the simulated failsafe)."""
        self.sim.online = not offline
        if offline:
            self.sim.failsafe()
            self._mark_disconnected("simulated link failure")

    # --------------------------------------------------------------- execute
    async def execute(self, cmd: DeviceCommand) -> CommandResult:
        if cmd.command_id in self._results:  # idempotent
            return self._results[cmd.command_id]
        async with self._lock:
            res = await self._execute(cmd)
        self._results[cmd.command_id] = res
        return res

    def _result(self, cmd: DeviceCommand, status: CommandStatus, detail: str, node: DeviceNode, **kw) -> CommandResult:
        return CommandResult(command_id=cmd.command_id, device=cmd.device, action=cmd.action, source=cmd.source,
                             status=status, detail=detail, simulated=node.simulated, executed_on=node.name, **kw)

    async def _execute(self, cmd: DeviceCommand) -> CommandResult:
        t0 = time.perf_counter()
        node = self._node_for(cmd)
        sandbox = node is not self.active_node  # e.g. baseline command while in hardware mode
        ok, why = validate_command(cmd, self.min_confidence)
        if not ok:
            res = self._result(cmd, CommandStatus.REJECTED, why or "invalid", node)
            self.emit("command_rejected", res.model_dump(mode="json"))
            return res

        twin = self.twin.get(cmd.device)
        if not sandbox and twin is not None:
            twin["pending_command_id"] = cmd.command_id
            twin["last_command"] = {**cmd.wire(), "status": CommandStatus.SENT.value, "at": _now(), "confidence": cmd.confidence}
        self.emit("command_sent", {**cmd.wire(), "status": "SENT", "executed_on": node.name,
                                   "simulated": node.simulated, "confidence": cmd.confidence, "sandbox": sandbox})

        t_send = time.perf_counter()
        try:
            ack = await asyncio.wait_for(node.send(cmd), timeout=self.command_timeout_s)
        except (NodeError, asyncio.TimeoutError) as e:
            msg = str(e) or "timeout waiting for acknowledgement"
            if not sandbox:
                self._mark_disconnected(msg)
            res = self._result(cmd, CommandStatus.DISCONNECTED, f"No acknowledgement: {msg}", node,
                               latency_ms=(time.perf_counter() - t0) * 1000)
            self._finalize_twin(cmd, res, sandbox)
            self.emit("command_rejected", res.model_dump(mode="json"))
            return res
        ack_ms = (time.perf_counter() - t_send) * 1000

        if ack.command_id != cmd.command_id or ack.device != cmd.device:
            res = self._result(cmd, CommandStatus.FAILED, "Acknowledgement does not match command", node, ack_latency_ms=ack_ms)
            self._finalize_twin(cmd, res, sandbox)
            self.emit("command_rejected", res.model_dump(mode="json"))
            return res
        if ack.status != "ACKNOWLEDGED":
            res = self._result(cmd, CommandStatus.FAILED, f"Node reported {ack.status}: {ack.detail or ''}".strip(), node,
                               ack_latency_ms=ack_ms, acknowledged=True)
            self._finalize_twin(cmd, res, sandbox)
            self.emit("command_rejected", res.model_dump(mode="json"))
            return res

        if not sandbox and twin is not None:
            twin["last_ack"] = {"command_id": cmd.command_id, "status": ack.status, "actual_state": ack.actual_state,
                                "at": _now(), "simulated": ack.simulated}
        self.emit("command_acknowledged", {**ack.model_dump(), "ack_latency_ms": round(ack_ms, 2), "executed_on": node.name,
                                           "sandbox": sandbox})

        # independent read-back before we call the state "confirmed"
        target = ACTION_TO_STATE[cmd.action]
        try:
            states = await asyncio.wait_for(node.read_state(), timeout=self.command_timeout_s)
            actual = states.get(cmd.device)
        except (NodeError, asyncio.TimeoutError) as e:
            actual = None
            readback_err = str(e) or "timeout"
        else:
            readback_err = None

        if actual == target and ack.actual_state == target:
            res = self._result(cmd, CommandStatus.CONFIRMED, f"{DEVICE_SPECS[cmd.device].name} confirmed {target}", node,
                               confirmed_state=target, ack_latency_ms=ack_ms, acknowledged=True,
                               latency_ms=(time.perf_counter() - t0) * 1000)
        else:
            detail = (f"State read-back failed: {readback_err}" if readback_err
                      else f"State mismatch: expected {target}, device reports {actual or ack.actual_state}")
            res = self._result(cmd, CommandStatus.FAILED, detail, node, ack_latency_ms=ack_ms, acknowledged=True,
                               latency_ms=(time.perf_counter() - t0) * 1000, confirmed_state=actual)
        self._finalize_twin(cmd, res, sandbox)
        if res.status != CommandStatus.CONFIRMED:
            self.emit("command_rejected", res.model_dump(mode="json"))
        return res

    def _finalize_twin(self, cmd: DeviceCommand, res: CommandResult, sandbox: bool) -> None:
        twin = self.twin.get(cmd.device)
        if sandbox or twin is None:
            self.emit("device_state_changed", {"id": cmd.device, "sandbox": True, "confirmed_state": res.confirmed_state,
                                               "reason": res.detail, "simulated": True})
            return
        twin["pending_command_id"] = None
        if twin["last_command"]:
            twin["last_command"]["status"] = res.status.value
            twin["last_command"]["detail"] = res.detail
        if res.status == CommandStatus.CONFIRMED:
            twin.update(confirmed_state=res.confirmed_state, error=None,
                        state_source="simulation" if res.simulated else "device_readback",
                        simulated=res.simulated, updated_at=_now())
        elif res.status != CommandStatus.DISCONNECTED:
            twin["error"] = res.detail
            twin["updated_at"] = _now()
        self._emit_device_state(cmd.device, res.detail)
