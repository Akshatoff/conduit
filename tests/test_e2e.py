"""End-to-end: synthetic landmarks -> Intent Engine -> controller -> twin -> DB -> analytics -> API/WebSocket."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.database.db import make_engine, make_session_factory
from backend.main import create_app
from backend.models.schemas import AppSettings
from backend.services.runtime import ConduitRuntime

from .scenarios import Driver

LIGHT_X = 0.25


@pytest.fixture
async def rt():
    sf = make_session_factory(make_engine("sqlite:///:memory:"))
    r = ConduitRuntime(AppSettings(), sf, persist_settings=False)
    r.controller.sim.ack_delay_s = 0.0
    await r.start()
    yield r
    await r.shutdown()


async def settle():
    for _ in range(5):
        await asyncio.sleep(0.02)


async def test_full_pipeline_confirms_twin_and_persists(rt):
    q = rt.bus.subscribe(maxsize=100000)
    d = Driver(runtime=rt)
    d.activate = lambda: d.hold("open_palm", 0.5, 0.82, 1.1)
    d.activate()
    d.deliberate_select(LIGHT_X)
    assert rt.engine.state.value == "AWAITING_CONFIRMATION"
    assert rt.controller.twin["torch"]["confirmed_state"] == "OFF"
    d.pinch(LIGHT_X, 0.33, 0.4)
    await settle()
    d.hold("pinch", LIGHT_X, 0.33, 0.1)
    assert rt.controller.twin["torch"]["confirmed_state"] == "ON"
    assert rt.controller.twin["torch"]["simulated"] is True
    assert rt.engine.state.value in ("COMPLETED", "READY")

    types = []
    while not q.empty():
        types.append(q.get_nowait()["type"])
    for needed in ("hand_landmarks", "trajectory_update", "device_selected", "confirmation_required", "command_sent",
                   "command_acknowledged", "device_state_changed", "intent_state_changed"):
        assert needed in types, needed
    assert types.index("confirmation_required") < types.index("command_sent") < types.index("device_state_changed")

    cmds = rt.repo.recent_commands()
    assert len(cmds) == 1 and cmds[0]["execution_status"] == "CONFIRMED" and cmds[0]["source"] == "conduit_intent_engine"
    events = rt.repo.recent_intent_events()
    assert any(e["kind"] == "command_request" and e["accepted"] for e in events)
    assert all(e["reason"] for e in events)


async def test_accidental_swipe_executes_nothing_through_runtime(rt):
    d = Driver(runtime=rt)
    d.hold("open_palm", 0.5, 0.82, 1.1)
    d.move("open_palm", (0.02, 0.32), (0.98, 0.32), 0.6)
    await settle()
    assert rt.repo.recent_commands() == []
    assert all(v["confirmed_state"] in ("OFF", "LOCKED") for v in rt.controller.twin.values())
    assert any(e["reason_code"] == "TRANSIT" for e in rt.repo.recent_intent_events())


async def test_comparative_session_baseline_vs_conduit(rt):
    # ---- Conduit: accidental open-palm flash must not execute; deliberate must.
    rt.analytics.start_session("conduit")
    rt.analytics.start_trial("unintended", None, "palm flash")
    d = Driver(runtime=rt)
    d.hold("open_palm", 0.5, 0.82, 0.3)
    d.hold("fist", 0.5, 0.82, 0.3)
    d.gone(0.5)
    await settle()
    rt.analytics.end_trial()
    rt.analytics.start_trial("intended", "torch", "deliberate")
    d.hold("open_palm", 0.5, 0.82, 1.1)
    d.deliberate_select(LIGHT_X)
    d.pinch(LIGHT_X, 0.33, 0.4)
    await settle()
    d.hold("pinch", LIGHT_X, 0.33, 0.1)
    rt.analytics.end_trial()
    c = rt.analytics.stop_session()["metrics"]
    assert c["false_activation_rate"] == 0.0 and c["successful_deliberate"] == 1

    # ---- Baseline: the same accidental gesture sequence DOES trigger commands.
    rt.set_interaction_mode("baseline")
    rt.analytics.start_session("baseline")
    rt.analytics.start_trial("unintended", None, "palm flash")
    d2 = Driver(runtime=rt, start_t=500.0)
    d2.hold("open_palm", 0.5, 0.82, 0.3)
    d2.gone(0.3)
    await settle()
    rt.analytics.end_trial()
    b = rt.analytics.stop_session()["metrics"]
    assert b["false_activation_rate"] == 1.0
    # Baseline fired again through the controller; it toggles the LED from ON back to OFF.
    assert rt.controller.twin["torch"]["confirmed_state"] == "OFF"


async def test_mode_switch_blocked_during_session(rt):
    rt.analytics.start_session("conduit")
    with pytest.raises(RuntimeError):
        rt.set_interaction_mode("baseline")


async def test_simulated_link_failure_surfaces_in_intent_engine(rt):
    d = Driver(runtime=rt)
    d.hold("open_palm", 0.5, 0.82, 1.1)
    d.deliberate_select(LIGHT_X)
    rt.controller.set_simulated_fault(True)
    d.pinch(LIGHT_X, 0.33, 0.4)
    await settle()
    d.hold("pinch", LIGHT_X, 0.33, 0.1)
    assert rt.engine.state.value in ("ERROR", "READY")
    assert rt.controller.twin["torch"]["connection"] == "disconnected"
    assert rt.repo.recent_commands()[0]["execution_status"] == "DISCONNECTED"


# --------------------------------------------------------------------- API
@pytest.fixture
def client():
    app = create_app(AppSettings(), db_url="sqlite:///:memory:", persist_settings=False)
    with TestClient(app) as c:
        c.app.state.runtime.controller.sim.ack_delay_s = 0.0
        yield c


def test_api_health_status_and_devices(client):
    assert client.get("/api/health").json()["status"] == "ok"
    s = client.get("/api/system/status").json()
    assert s["hardware_mode"] == "simulation" and s["privacy"]["video_stored"] is False
    devs = client.get("/api/devices").json()
    assert {d["id"] for d in devs["devices"]} == {"torch", "screen", "vibration"} and devs["simulated"] is True
    assert client.get("/api/devices/torch").status_code == 200
    assert client.get("/api/devices/nope").status_code == 404


def test_api_manual_test_is_flagged_and_confirmed(client):
    r = client.post("/api/devices/torch/test", json={"action": "on"}).json()
    assert r["status"] == "CONFIRMED" and r["source"] == "manual_test" and r["simulated"] is True
    assert client.get("/api/devices/torch").json()["confirmed_state"] == "ON"
    bad = client.post("/api/devices/torch/test", json={"action": "LOCK"}).json()
    assert bad["status"] == "REJECTED"
    assert client.get("/api/commands").json()["commands"][0]["source"] in ("manual_test",)


def test_api_analytics_empty_state_session_and_export(client):
    s = client.get("/api/analytics/summary").json()
    assert s["has_data"] is False and s["sessions"] == []
    assert client.post("/api/analytics/trial/start", json={"label": "unintended"}).status_code == 409
    assert client.post("/api/analytics/session/start", json={"mode": "conduit"}).status_code == 200
    assert client.post("/api/analytics/trial/start", json={"label": "unintended", "scenario": "wave"}).status_code == 200
    assert client.post("/api/analytics/trial/end").status_code == 200
    out = client.post("/api/analytics/session/stop").json()
    assert out["attempts"] == 1
    csv_resp = client.get("/api/analytics/export")
    assert csv_resp.headers["content-type"].startswith("text/csv") and "wave" in csv_resp.text


def test_api_interaction_controls_and_mode(client):
    assert client.post("/api/interaction/activate").json()["active"] is True
    assert client.post("/api/interaction/cancel").json()["active"] is False
    assert client.post("/api/interaction/mode", json={"mode": "baseline"}).status_code == 200
    assert client.get("/api/intent/status").json()["mode"] == "baseline"


def test_api_phone_listing(client):
    r = client.get("/api/hardware/phone").json()
    assert isinstance(r["devices"], list)        # nothing plugged into this machine
    assert "adb" in r and (r["error"] or r["hint"] or r["devices"])


def test_api_settings_roundtrip_and_hardware_mode_without_serial_port(client):
    s = client.get("/api/settings").json()
    assert s["phone"]["adb_path"] == "" and s["phone"]["serial"] == ""
    s["intent"]["min_confidence"] = 0.8
    assert client.put("/api/settings", json=s).json()["intent"]["min_confidence"] == 0.8
    assert client.get("/api/intent/status").json()["config"]["min_confidence"] == 0.8
    r = client.post("/api/hardware/mode", json={"mode": "hardware"}).json()
    assert r["mode"] == "hardware" and "adb" in r["hardware"] and "capabilities" in r["hardware"]
    assert all(d["connection"] == "disconnected" and d["confirmed_state"] == "UNKNOWN" for d in r["devices"])
    res = client.post("/api/devices/torch/test", json={"action": "ON"}).json()
    assert res["status"] == "DISCONNECTED" and res["acknowledged"] is False
    assert client.post("/api/hardware/mode", json={"mode": "simulation"}).json()["mode"] == "simulation"


def test_websocket_snapshot_ping_and_malformed_message(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        ws.send_text("not json at all")
        assert ws.receive_json()["type"] == "system_error"
        ws.send_text('{"type": "launch_missiles"}')
        assert ws.receive_json()["type"] == "system_error"
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"
        ws.send_json({"type": "activate"})
        seen = [ws.receive_json()["type"] for _ in range(2)]
        assert "intent_state_changed" in seen


def test_vision_start_reports_error_when_no_camera_stack(client):
    class FakeWorker:
        def __init__(self, *a):
            self.on_status = a[5]
            self._alive = False

        def start(self):
            self.on_status({"state": "error", "error": "no camera", "available": False})

        def is_alive(self):
            return self._alive

        def stop(self):
            pass

    client.app.state.runtime._worker_factory = FakeWorker
    assert client.post("/api/vision/start").status_code == 200
    import time
    time.sleep(0.1)
    cam = client.get("/api/system/status").json()["camera"]
    assert cam["state"] == "error" and cam["available"] is False
