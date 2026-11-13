import asyncio

import httpx
import pytest

from backend.hardware.controller import DeviceController
from backend.hardware.models import CommandStatus, DeviceCommand
from backend.hardware.nodes import ESP32Node, NodeError, SimulatedNode
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
    res = await c.execute(cmd("ventilation", "ON"))
    assert res.status == CommandStatus.CONFIRMED and res.acknowledged and res.simulated
    assert c.twin["ventilation"]["confirmed_state"] == "ON"
    assert c.twin["ventilation"]["simulated"] is True
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
    res = await c.execute(cmd("ventilation", "ON"))
    assert res.status == CommandStatus.DISCONNECTED and not res.acknowledged
    assert c.twin["ventilation"]["connection"] == "disconnected"
    assert c.twin["lighting"]["confirmed_state"] == "UNKNOWN"
    c.set_simulated_fault(False)
    assert await c.refresh()
    assert c.twin["lighting"]["confirmed_state"] == "OFF"      # simulated failsafe applied
    assert (await c.execute(cmd("lighting", "ON"))).status == CommandStatus.CONFIRMED


# -------------------------------------------------------------------- hardware
async def test_hardware_mode_without_esp32_never_fakes_acknowledgement():
    c, _ = make(mode="hardware")
    c.configure_hardware("127.0.0.1", 9, 0.3)           # nothing listens on port 9
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.DISCONNECTED
    assert res.acknowledged is False and res.executed_on == "esp32"
    assert c.twin["lighting"]["confirmed_state"] == "UNKNOWN"


async def test_baseline_commands_never_reach_hardware():
    c, _ = make(mode="hardware")
    res = await c.execute(cmd("access", "UNLOCK", source="baseline_gesture", confidence=1.0))
    assert res.executed_on == "simulation"
    assert c.twin["access"]["confirmed_state"] == "UNKNOWN"   # physical twin untouched


def esp_with_transport(handler):
    node = ESP32Node("esp.local", 80, 1.0)
    real = httpx.AsyncClient

    class Patched(real):
        def __init__(self, *a, **k):
            super().__init__(*a, transport=httpx.MockTransport(handler), **k)

    return node, Patched


async def test_esp32_command_acknowledged_and_state_read_back(monkeypatch):
    state = {"lighting": "OFF", "ventilation": "OFF", "access": "LOCKED"}

    def handler(request: httpx.Request):
        if request.url.path == "/command":
            body = __import__("json").loads(request.content)
            state[body["device"]] = {"ON": "ON", "OFF": "OFF", "LOCK": "LOCKED", "UNLOCK": "UNLOCKED"}[body["action"]]
            return httpx.Response(200, json={"command_id": body["command_id"], "device": body["device"],
                                             "status": "ACKNOWLEDGED", "actual_state": state[body["device"]]})
        if request.url.path == "/state":
            return httpx.Response(200, json={"devices": state})
        return httpx.Response(200, json={"status": "ok"})

    node, patched = esp_with_transport(handler)
    monkeypatch.setattr("backend.hardware.nodes.httpx.AsyncClient", patched)
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware", min_confidence=0.75)
    assert await c.refresh()
    assert c.twin["lighting"]["connection"] == "connected"
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.CONFIRMED and res.simulated is False
    assert c.twin["lighting"]["confirmed_state"] == "ON"
    assert c.twin["lighting"]["state_source"] == "device_readback"


async def test_esp32_wrong_command_id_in_ack_is_failure(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"command_id": "someone-else", "device": "lighting", "status": "ACKNOWLEDGED", "actual_state": "ON"})

    node, patched = esp_with_transport(handler)
    monkeypatch.setattr("backend.hardware.nodes.httpx.AsyncClient", patched)
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware")
    res = await c.execute(cmd("lighting", "ON"))
    assert res.status == CommandStatus.FAILED and "does not match" in res.detail


async def test_esp32_malformed_reply_and_http_error(monkeypatch):
    node, patched = esp_with_transport(lambda r: httpx.Response(500, text="boom"))
    monkeypatch.setattr("backend.hardware.nodes.httpx.AsyncClient", patched)
    with pytest.raises(NodeError):
        await node.health()
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware")
    assert (await c.execute(cmd())).status == CommandStatus.DISCONNECTED


async def test_esp32_ack_with_rejected_status_is_failure(monkeypatch):
    def handler(request):
        body = __import__("json").loads(request.content)
        return httpx.Response(200, json={"command_id": body["command_id"], "device": body["device"], "status": "REJECTED",
                                         "actual_state": "OFF", "detail": "estop engaged"})

    node, patched = esp_with_transport(handler)
    monkeypatch.setattr("backend.hardware.nodes.httpx.AsyncClient", patched)
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware")
    res = await c.execute(cmd())
    assert res.status == CommandStatus.FAILED and "estop" in res.detail
