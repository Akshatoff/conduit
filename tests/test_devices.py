"""Device layer: validation -> ACK -> read-back, on a simulated phone and on a fake adb phone.

No phone and no adb binary are needed: ``FakeAdb`` answers the exact adb shell commands the node
uses, so the acknowledgement/read-back contract can be tested end to end.
"""
import asyncio

import pytest

from backend.hardware.controller import DeviceController
from backend.hardware.models import CommandStatus, DeviceCommand
from backend.hardware.nodes import NodeError, SimulatedNode
from backend.hardware.phone import AdbRunner, PhoneAdbNode, adb_inventory
from backend.hardware.validation import validate_command


def make(mode="simulation", hw=None, **kw):
    events = []
    c = DeviceController(sim=SimulatedNode(ack_delay_s=0.0), hw=hw, mode=mode,
                         emit=lambda t, d: events.append((t, d)), min_confidence=0.75, **kw)
    return c, events


def cmd(device="torch", action="ON", source="conduit_intent_engine", confidence=0.9, **kw):
    return DeviceCommand(device=device, action=action, source=source, confidence=confidence, **kw)


class FakeAdb(AdbRunner):
    """A phone that behaves: real adb argv, canned answers, live brightness/pulse state."""

    def __init__(self, *, phones=("PHONE1",), torch=True, vibrator=True, silent=False,
                 torch_denied=False) -> None:
        super().__init__("adb", "", 2.0)
        self.phones = list(phones)
        self.torch_supported = torch
        self.vibrator_supported = vibrator
        self.silent = silent
        self.torch_denied = torch_denied
        self.brightness = 128
        self.torch_on = False
        self.pulses = 0
        self.calls: list[list[str]] = []

    # adb itself never runs; every call is answered here
    def run(self, args, timeout_s=None):
        args = list(args)
        self.calls.append(args)
        if self.silent:
            return 1, "", "error: no devices/emulators found"
        if args == ["version"]:
            return 0, "Android Debug Bridge version 1.0.41", ""
        if args[:1] == ["devices"]:
            rows = "".join(f"{p}\tdevice product:phone model:Pixel_6 device:phone\n" for p in self.phones)
            return 0, f"List of devices attached\n{rows}", ""
        if args[:1] != ["shell"]:
            return 1, "", f"unknown host command {args}"
        return self.shell(*args[1:])

    def shell(self, *args, timeout_s=None):
        a = list(args)
        self.calls.append(["shell", *a])
        if self.silent or not self.phones:
            return 1, "", "error: no devices/emulators found"
        if a[:2] == ["getprop", "ro.product.model"]:
            return 0, "Pixel 6", ""
        if a[:2] == ["getprop", "ro.product.manufacturer"]:
            return 0, "Google", ""
        if a[:2] == ["getprop", "ro.build.version.release"]:
            return 0, "14", ""
        if a[:1] == ["cmd"] and len(a) > 1 and a[1] in ("torch", "flashlight"):
            if not self.torch_supported:
                return 1, "", f"cmd: Service {a[1]} not found"
            if self.torch_denied:
                return 1, "", "java.lang.SecurityException: Permission Denial: CAMERA"
            state = a[-1]
            self.torch_on = state == "on"
            return 0, "", ""
        if a[:2] == ["cmd", "vibrator"]:
            if len(a) == 2:
                if not self.vibrator_supported:
                    return 1, "", "cmd: Service vibrator not found"
                return 0, "Vibrator commands:\n  vibrate duration [description]\n", ""
            if not self.vibrator_supported:
                return 1, "", "cmd: Service vibrator not found"
            self.pulses += 1
            return 0, "", ""
        if a[:3] == ["settings", "get", "system"]:
            if a[3:] == ["screen_brightness"]:
                return 0, str(self.brightness), ""
            return 0, "null", ""
        if a[:3] == ["settings", "put", "system"]:
            if a[3:] and a[3] == "screen_brightness":
                self.brightness = int(a[4])
            return 0, "", ""
        if a[:2] == ["input", "keyevent"] or a[:2] == ["wm", "dismiss-keyguard"]:
            return 0, "", ""
        return 0, "", ""


def fake_node(fake: FakeAdb, **kw) -> PhoneAdbNode:
    return PhoneAdbNode(adb_path="adb", runner=fake, pulse_gap_s=0.01, max_buzz_s=2.0, **kw)


# ------------------------------------------------------------------ validation
def test_validation_accepts_valid_and_rejects_invalid():
    assert validate_command(cmd(), 0.75)[0]                    # torch ON
    assert validate_command(cmd("vibration", "OFF"), 0.75)[0]
    assert not validate_command(cmd(device="toaster"))[0]
    assert not validate_command(cmd(action="LOCK"))[0]          # the phone has no latch
    assert not validate_command(cmd(device="screen", action="ON", source="rogue"))[0]


def test_intent_command_below_confidence_is_rejected():
    ok, why = validate_command(cmd(confidence=0.5), 0.75)
    assert not ok and "below minimum" in why
    assert not validate_command(cmd(confidence=None), 0.75)[0]


# ------------------------------------------------------------------ simulation
async def test_simulation_ack_then_confirmed_state():
    c, ev = make()
    res = await c.execute(cmd("vibration", "ON"))
    assert res.status == CommandStatus.CONFIRMED and res.acknowledged and res.simulated
    assert res.verified is True
    assert c.twin["vibration"]["confirmed_state"] == "ON"
    types = [t for t, _ in ev]
    assert types.index("command_sent") < types.index("command_acknowledged") < types.index("device_state_changed")
    assert res.latency_ms is not None and res.ack_latency_ms is not None


async def test_twin_not_updated_before_acknowledgement():
    c, _ = make()
    c.sim.ack_delay_s = 0.2
    task = asyncio.create_task(c.execute(cmd("torch", "ON")))
    await asyncio.sleep(0.05)
    assert c.twin["torch"]["confirmed_state"] == "OFF"
    assert c.twin["torch"]["pending_command_id"] is not None
    await task
    assert c.twin["torch"]["confirmed_state"] == "ON"


async def test_idempotent_command_id_is_not_reapplied():
    c, ev = make()
    one = cmd("torch", "ON")
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
    assert c.twin["torch"]["confirmed_state"] == "OFF"


async def test_state_mismatch_is_failure_not_success():
    c, _ = make()
    c.sim.fault_state_mismatch = True
    res = await c.execute(cmd("torch", "ON"))
    assert res.status == CommandStatus.FAILED
    assert c.twin["torch"]["confirmed_state"] == "OFF"
    assert c.twin["torch"]["error"]


async def test_simulated_link_failure_reports_disconnected_and_failsafe():
    c, _ = make()
    await c.execute(cmd("torch", "ON"))
    c.set_simulated_fault(True)
    res = await c.execute(cmd("screen", "ON"))
    assert res.status == CommandStatus.DISCONNECTED and not res.acknowledged
    assert c.twin["screen"]["connection"] == "disconnected"
    assert c.twin["torch"]["confirmed_state"] == "UNKNOWN"
    c.set_simulated_fault(False)
    assert await c.refresh()
    assert c.twin["torch"]["confirmed_state"] == "OFF"      # simulated failsafe applied
    assert (await c.execute(cmd("torch", "ON"))).status == CommandStatus.CONFIRMED


# -------------------------------------------------------------------- hardware
async def test_phone_health_reports_model_and_capabilities():
    fake = FakeAdb()
    node = fake_node(fake)
    health = await node.health()
    assert health["model"] == "Pixel 6" and health["android"] == "14"
    assert health["capabilities"]["torch"] is True and health["capabilities"]["vibration"] is True


async def test_screen_command_confirmed_by_brightness_read_back():
    fake = FakeAdb()
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware", min_confidence=0.75)
    assert await c.refresh()
    assert c.twin["screen"]["connection"] == "connected"
    res = await c.execute(cmd("screen", "ON"))
    assert res.status == CommandStatus.CONFIRMED and res.verified is True
    assert fake.brightness == 255
    assert c.twin["screen"]["confirmed_state"] == "ON"
    assert c.twin["screen"]["state_source"] == "device_readback"
    off = await c.execute(cmd("screen", "OFF"))
    assert off.status == CommandStatus.CONFIRMED and fake.brightness == 128


async def test_torch_is_acknowledged_but_never_claimed_as_verified():
    fake = FakeAdb()
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware", min_confidence=0.75)
    assert await c.refresh()
    res = await c.execute(cmd("torch", "ON"))
    assert fake.torch_on is True
    assert res.status == CommandStatus.ACKNOWLEDGED
    assert res.verified is False and res.acknowledged is True
    assert "no independent read-back" in res.detail.lower() or "cannot report" in res.detail.lower()
    assert c.twin["torch"]["confirmed_state"] == "ON"
    assert c.twin["torch"]["state_source"] == "node_ack"


async def test_torch_falls_back_to_screen_flash_and_then_it_is_verifiable():
    fake = FakeAdb(torch=False)
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware", min_confidence=0.75)
    assert await c.refresh()
    assert c.hw.capabilities["torch"] is False
    res = await c.execute(cmd("torch", "ON"))
    assert res.status == CommandStatus.CONFIRMED          # screen brightness is readable
    assert res.verified is True
    assert "screen flash" in res.detail
    assert fake.brightness == 255


async def test_vibration_pulses_while_on_and_stops_on_off():
    fake = FakeAdb()
    node = fake_node(fake)
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware", min_confidence=0.75)
    await c.refresh()
    on = await c.execute(cmd("vibration", "ON"))
    assert on.status == CommandStatus.ACKNOWLEDGED
    assert on.confirmed_state == "ON"
    for _ in range(40):
        await asyncio.sleep(0.01)
        if fake.pulses >= 2:
            break
    assert fake.pulses >= 1
    off = await c.execute(cmd("vibration", "OFF"))
    assert off.status == CommandStatus.ACKNOWLEDGED
    assert "pulse" in off.detail
    pulses_after_off = fake.pulses
    await asyncio.sleep(0.05)
    assert fake.pulses == pulses_after_off or fake.pulses <= pulses_after_off + 1
    assert node._buzzing is False


async def test_vibration_not_supported_is_rejected_not_faked():
    fake = FakeAdb(vibrator=False)
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware", min_confidence=0.75)
    await c.refresh()
    res = await c.execute(cmd("vibration", "ON"))
    assert res.status == CommandStatus.FAILED and "does not expose the vibration" in res.detail
    assert res.acknowledged is True


async def test_unauthorised_phone_reports_actionable_disconnect():
    fake = FakeAdb()
    fake.phones = []
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware")
    assert await c.refresh() is False
    assert c.twin["torch"]["connection"] == "disconnected"
    assert "USB debugging" in c.twin["torch"]["error"]
    res = await c.execute(cmd("torch", "ON"))
    assert res.status == CommandStatus.DISCONNECTED and res.acknowledged is False
    assert res.executed_on == "phone-adb"


async def test_baseline_commands_never_reach_the_phone():
    fake = FakeAdb()
    c = DeviceController(sim=SimulatedNode(0.0), hw=fake_node(fake), mode="hardware")
    res = await c.execute(cmd("vibration", "ON", source="baseline_gesture", confidence=1.0))
    assert res.executed_on == "simulation"
    assert fake.pulses == 0
    assert c.twin["vibration"]["confirmed_state"] == "UNKNOWN"


async def test_shutdown_stops_buzzing_and_restores_screen():
    fake = FakeAdb()
    node = fake_node(fake)
    c = DeviceController(sim=SimulatedNode(0.0), hw=node, mode="hardware", min_confidence=0.75)
    await c.refresh()
    await c.execute(cmd("vibration", "ON"))
    await c.execute(cmd("screen", "ON"))
    assert fake.brightness == 255
    await c.shutdown()
    assert node._buzzing is False
    assert fake.brightness != 255


def test_node_without_adb_explains_how_to_install_it(monkeypatch):
    import backend.hardware.phone as phone

    monkeypatch.delenv("CONDUIT_ADB", raising=False)
    monkeypatch.setattr(phone, "_COMMON_ADB", [])
    monkeypatch.setattr(phone.shutil, "which", lambda _name: None)
    node = PhoneAdbNode(adb_path="")
    with pytest.raises(NodeError) as err:
        asyncio.run(node.health())
    assert "platform-tools" in str(err.value)


def test_adb_inventory_reports_hint_when_no_phone(monkeypatch):
    import backend.hardware.phone as phone

    fake = FakeAdb(phones=[])
    monkeypatch.setattr(phone, "find_adb", lambda configured="": "adb")
    monkeypatch.setattr(phone, "AdbRunner", lambda adb, serial, timeout_s: fake)
    info = adb_inventory("")
    assert info["devices"] == [] and "USB debugging" in info["hint"]


def test_pulse_length_setting_reaches_the_phone_node():
    fake = FakeAdb()
    node = fake_node(fake)
    c, _ = make(mode="hardware", hw=node)
    c.configure_hardware("adb", "SERIAL", 8, 1200)
    assert node.pulse_ms == 1200 and node.serial == "SERIAL" and node.timeout_s == 8
    # values are clamped to the range the settings schema allows
    c.configure_hardware("adb", "SERIAL", 8, 99999)
    assert node.pulse_ms == 5000


async def test_vibration_detail_uses_the_configured_pulse():
    fake = FakeAdb()
    node = fake_node(fake)
    node.configure("adb", "", 8, 1200)
    await node.health()   # capabilities are probed, never assumed
    ack = await node.send(cmd(device="vibration", action="ON"))
    assert ack.status == "ACKNOWLEDGED" and "1200 ms" in ack.detail
    await node.send(cmd(device="vibration", action="OFF"))
