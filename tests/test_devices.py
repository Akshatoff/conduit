import asyncio

import pytest

from backend.hardware.controller import DeviceController
from backend.hardware.models import CommandStatus, DeviceCommand
from backend.hardware.nodes import ArduinoSerialNode, NodeError, SimulatedNode
from backend.hardware.validation import validate_command


def make(mode="simulation", **kw):
    events = []
    c = DeviceController(sim=SimulatedNode(ack_delay_s=0.0), mode=mode, emit=lambda t, d: events.append((t, d)),
                         min_confidence=0.75, **kw)
    return c, events


def cmd(device="lighting", action="ON", source="conduit_intent_engine", confidence=0.9, **kw):
    return DeviceCommand(device=device, action=action, source=source, confidence=confidence, **kw)


# ------------------------------------------------------------------ validation
def test_validation_accepts_valid_and_rejects_invalid():
    assert validate_command(cmd(), 0.75)[0]
    assert not validate_command(cmd(device="toaster"))[0]
    assert not validate_command(cmd(action="UNLOCK"))[0]            # lighting has no UNLOCK
    assert not validate_command(cmd(device="access", action="ON"))[0]
    assert not validate_command(cmd(source="rogue"))[0]


def test_intent_command_below_confidence_is_rejected():
    ok, why = validate_command(cmd(confidence=0.5), 0.75)
    assert not ok and "below minimum" in why
    assert not validate_command(cmd(confidence=None), 0.75)[0]


# ------------------------------------------------------------------ simulation
async def test_simulation_ack_then_confirmed_state():
    c, ev = make()
    res = await c.execute(cmd("access", "UNLOCK"))
    assert res.status == CommandStatus.CONFIRMED and res.acknowledged and res.simulated
    assert c.twin["access"]["confirmed_state"] == "UNLOCKED"
    assert c.twin["access"]["simulated"] is True
    types = [t for t, _ in ev]
    assert types.index("command_sent") < types.index("command_acknowledged") < types.index("device_state_changed")
    assert res.latency_ms is not None and res.ack_latency_ms is not None


async def test_twin_not_updated_before_acknowledgement():
    c, _ = make()
    c.sim.ack_delay_s = 0.2
    task = asyncio.create_task(c.execute(cmd("lighting", "ON")))
    await asyncio.sleep(0.05)
    assert c.twin["lighting"]["confirmed_state"] == "OFF"      # command sent but not acknowledged yet
    assert c.twin["lighting"]["pending_command_id"] is not None
    await task
    assert c.twin["lighting"]["confirmed_state"] == "ON"


async def test_access_device_uses_lock_unlock_states():
    c, _ = make()
    assert c.twin["access"]["confirmed_state"] == "LOCKED"
    res = await c.execute(cmd("access", "UNLOCK"))
    assert res.confirmed_state == "UNLOCKED"


async def test_idempotent_command_id_is_not_reapplied():
    c, ev = make()
    one = cmd("lighting", "ON")
    r1 = await c.execute(one)
    sent = [t for t, _ in ev].count("command_sent")
    r2 = await c.execute(one)
    assert r1 is r2
    assert [t for t, _ in ev].count("command_sent") == sent


async def test_invalid_command_is_rejected_and_never_sent():
    c, ev = make()
    res = await c.execute(cmd(confidence=0.2))
    assert res.status == CommandStatus.REJECTED
    assert "command_sent" not in [t for t, _ in ev]
    assert c.twin["lighting"]["confirmed_state"] == "OFF"


async def test_state_mismatch_is_failure_not_success():
    c, _ = make()
    c.sim.fault_state_mismatch = True
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.FAILED
    assert c.twin["lighting"]["confirmed_state"] == "OFF"
    assert c.twin["lighting"]["error"]


async def test_simulated_link_failure_reports_disconnected_and_failsafe():
    c, _ = make()
    await c.execute(cmd("lighting", "ON"))
    c.set_simulated_fault(True)
    res = await c.execute(cmd("access", "UNLOCK"))
    assert res.status == CommandStatus.DISCONNECTED and not res.acknowledged
    assert c.twin["access"]["connection"] == "disconnected"
    assert c.twin["lighting"]["confirmed_state"] == "UNKNOWN"
    c.set_simulated_fault(False)
    assert await c.refresh()
    assert c.twin["lighting"]["confirmed_state"] == "OFF"      # simulated failsafe applied
    assert (await c.execute(cmd("lighting", "ON"))).status == CommandStatus.CONFIRMED


# -------------------------------------------------------------------- hardware
async def test_hardware_mode_without_serial_port_never_fakes_acknowledgement():
    c, _ = make(mode="hardware")
    c.configure_hardware("", 9600, 0.3)                  # no port configured
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.DISCONNECTED
    assert res.acknowledged is False and res.executed_on == "arduino-uno"
    assert "not configured" in res.detail
    assert c.twin["lighting"]["confirmed_state"] == "UNKNOWN"


async def test_baseline_commands_never_reach_hardware():
    c, _ = make(mode="hardware")
    res = await c.execute(cmd("access", "UNLOCK", source="baseline_gesture", confidence=1.0))
    assert res.executed_on == "simulation"
    assert c.twin["access"]["confirmed_state"] == "UNKNOWN"   # physical twin untouched


class FakeSerial:
    """Minimal pyserial stand-in that speaks the real Arduino Uno line protocol."""

    def __init__(self, *, silent: bool = False, reject: bool = False, wrong_id: bool = False,
                 stuck_state: bool = False) -> None:
        self.silent = silent
        self.reject = reject
        self.wrong_id = wrong_id
        self.stuck_state = stuck_state
        self.state = {"lighting": "OFF", "access": "LOCKED"}
        self.buffer = b""
        self.written: list[str] = []
        self.closed = False

    def _reply(self, text: str) -> None:
        self.buffer += (text + "\n").encode()

    def write(self, data: bytes) -> int:
        line = data.decode().strip()
        self.written.append(line)
        if self.silent:
            return len(data)
        if line == "PING":
            self._reply("PONG conduit-uno-1.0 4321")
        elif line == "STATE?":
            self._reply(f"STATE lighting={self.state['lighting']} access={self.state['access']} servo=0")
        elif line.startswith("CMD "):
            _, cid, device, action, _source = line.split(" ")
            reply_id = "someone-else" if self.wrong_id else cid
            if self.reject:
                self._reply(f"ACK {reply_id} {device} REJECTED {self.state.get(device, '-')} estop engaged")
            elif device not in self.state:
                self._reply(f"ACK {reply_id} {device} REJECTED - unknown device")
            else:
                target = {"ON": "ON", "OFF": "OFF", "LOCK": "LOCKED", "UNLOCK": "UNLOCKED"}[action]
                if not self.stuck_state:
                    self.state[device] = target
                self._reply(f"ACK {reply_id} {device} ACKNOWLEDGED {target}")
        else:
            self._reply("ERR unknown command")
        return len(data)

    def readline(self) -> bytes:
        if b"\n" not in self.buffer:
            return b""
        line, self.buffer = self.buffer.split(b"\n", 1)
        return line + b"\n"

    def flush(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True


def serial_node(fake: FakeSerial) -> ArduinoSerialNode:
    node = ArduinoSerialNode("COM3", 9600, 1.0, serial_factory=lambda **_: fake)
    node.link.boot_delay_s = 0.0
    return node


async def test_serial_command_acknowledged_and_state_read_back():
    fake = FakeSerial()
    c = DeviceController(sim=SimulatedNode(0.0), hw=serial_node(fake), mode="hardware", min_confidence=0.75)
    assert await c.refresh()
    assert c.twin["lighting"]["connection"] == "connected"
    assert c.twin["access"]["confirmed_state"] == "LOCKED"

    res = await c.execute(cmd("access", "UNLOCK"))
    assert res.status == CommandStatus.CONFIRMED and res.simulated is False
    assert c.twin["access"]["confirmed_state"] == "UNLOCKED"
    assert c.twin["access"]["state_source"] == "device_readback"
    assert any(w.startswith("CMD ") and w.endswith("access UNLOCK conduit_intent_engine") for w in fake.written)
    assert "PING" in fake.written and "STATE?" in fake.written


async def test_serial_wrong_command_id_in_ack_is_failure():
    c = DeviceController(sim=SimulatedNode(0.0), hw=serial_node(FakeSerial(wrong_id=True)), mode="hardware")
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.FAILED and "does not match" in res.detail


async def test_serial_silence_is_disconnected_not_success():
    c = DeviceController(sim=SimulatedNode(0.0), hw=serial_node(FakeSerial(silent=True)), mode="hardware")
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.DISCONNECTED and res.acknowledged is False
    assert c.twin["lighting"]["connection"] == "disconnected"
    assert c.twin["lighting"]["confirmed_state"] == "UNKNOWN"


async def test_serial_rejected_ack_is_failure():
    c = DeviceController(sim=SimulatedNode(0.0), hw=serial_node(FakeSerial(reject=True)), mode="hardware")
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.FAILED and "estop" in res.detail


async def test_serial_ack_without_state_change_is_failure():
    c = DeviceController(sim=SimulatedNode(0.0), hw=serial_node(FakeSerial(stuck_state=True)), mode="hardware")
    assert await c.refresh()                 # state read back: LED OFF
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.FAILED
    assert c.twin["lighting"]["confirmed_state"] == "OFF"


async def test_serial_node_reports_unconfigured_port():
    node = ArduinoSerialNode()
    node.link.boot_delay_s = 0.0
    with pytest.raises(NodeError):
        await node.health()
