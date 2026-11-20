"""Mode-layer tests: shared Intent Engine, digital controls, workspace analytics.

The UI owns the five complete mode configurations (TypeScript). These tests exercise the
*backend contract* those modes rely on: explicit zone actions, digital execution that can never
reach hardware, and analytics that keep environments separate.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.database.db import make_engine, make_session_factory
from backend.intent.config import IntentConfig, Zone, toggle_action
from backend.main import create_app
from backend.models.schemas import AppSettings
from backend.services.analytics import AnalyticsService
from backend.services.runtime import ConduitRuntime

from .scenarios import Driver

DIGITAL_ZONE = Zone(id="semi.stage", label="Process stage", device="semi.stage",
                    x0=0.58, y0=0.42, x1=0.97, y1=0.56, action="ADVANCE_STAGE", kind="digital",
                    hint="Advance the simulated process stage")
PHYSICAL_ZONE = Zone(id="semi.equipment", label="Equipment status light", device="torch",
                     x0=0.03, y0=0.055, x1=0.42, y1=0.20, kind="physical")

CX = (DIGITAL_ZONE.x0 + DIGITAL_ZONE.x1) / 2
CY = (DIGITAL_ZONE.y0 + DIGITAL_ZONE.y1) / 2


def settings_with_mode(workspace: str = "semiconductor") -> AppSettings:
    return AppSettings(workspace_mode=workspace,
                       intent=IntentConfig(zones=[PHYSICAL_ZONE, DIGITAL_ZONE]))


def approach(d: Driver, x: float, y: float) -> None:
    """Travel up the central corridor, then sideways into a control rail."""
    d.hold("open_palm", 0.5, 0.82, 1.1)
    d.move("open_palm", (0.5, 0.82), (0.5, y), 0.6)
    d.move("open_palm", (0.5, y), (x, y), 0.5)
    d.hold("open_palm", x, y, 1.2)


async def settle(n: int = 10) -> None:
    for _ in range(n):
        await asyncio.sleep(0.02)


def drain(q) -> list:
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


@pytest.fixture
async def mode_rt():
    sf = make_session_factory(make_engine("sqlite:///:memory:"))
    r = ConduitRuntime(settings_with_mode(), sf, persist_settings=False)
    r.controller.sim.ack_delay_s = 0.0
    await r.start()
    yield r
    await r.shutdown()


@pytest.fixture
def mode_client():
    app = create_app(settings_with_mode(), db_url="sqlite:///:memory:", persist_settings=False)
    with TestClient(app) as c:
        c.app.state.runtime.controller.sim.ack_delay_s = 0.0
        yield c


# ------------------------------------------------------------------ config
def test_explicit_zone_action_overrides_toggle():
    assert toggle_action("semi.stage", None, "ADVANCE_STAGE") == "ADVANCE_STAGE"
    assert toggle_action("torch", "OFF") == "ON"
    assert toggle_action("screen", "ON") == "OFF"


def test_engine_with_mode_zones_uses_explicit_action():
    d = Driver(config=IntentConfig(zones=[PHYSICAL_ZONE, DIGITAL_ZONE]))
    approach(d, CX, CY)
    assert d.engine.state.value == "AWAITING_CONFIRMATION", d.engine.reason
    d.pinch(CX, CY, 0.5)
    assert len(d.commands) == 1
    cmd = d.commands[0]
    assert cmd.device == "semi.stage" and cmd.action == "ADVANCE_STAGE" and cmd.source == "conduit_intent_engine"


def test_mode_zones_still_reject_accidental_sweep():
    d = Driver(config=IntentConfig(zones=[PHYSICAL_ZONE, DIGITAL_ZONE]))
    d.hold("open_palm", 0.5, 0.82, 1.1)
    d.move("open_palm", (0.02, 0.12), (0.98, 0.12), 0.5)
    d.hold("open_palm", 0.98, 0.12, 0.3)
    assert d.commands == [] and "TRANSIT" in d.codes()


# ------------------------------------------------------------- runtime/UI layer
async def test_digital_command_is_confirmed_without_touching_hardware(mode_rt):
    q = mode_rt.bus.subscribe(maxsize=100000)
    d = Driver(runtime=mode_rt)
    approach(d, CX, CY)
    assert mode_rt.engine.state.value == "AWAITING_CONFIRMATION"
    d.pinch(CX, CY, 0.5)
    await settle()
    d.hold("pinch", CX, CY, 0.1)

    assert mode_rt.engine.state.value in ("COMPLETED", "READY")
    assert all(v["confirmed_state"] in ("OFF", "LOCKED") for v in mode_rt.controller.twin.values()), \
        "a digital mode action must never change a physical twin"
    cmds = mode_rt.repo.recent_commands()
    assert len(cmds) == 1 and cmds[0]["device"] == "semi.stage" and cmds[0]["execution_status"] == "CONFIRMED"
    assert cmds[0]["executed_on"] == "mode_ui"

    events = drain(q)
    actions = [e for e in events if e["type"] == "mode_action"]
    assert len(actions) == 1
    payload = actions[0]["data"]
    assert payload["workspace"] == "semiconductor" and payload["digital"] is True and payload["action"] == "ADVANCE_STAGE"
    assert payload["simulated"] is True
    assert not any(e["type"] == "device_state_changed" and not e["data"].get("sandbox") for e in events)


async def test_unknown_device_command_is_rejected_safely(mode_rt):
    from backend.intent.engine import CommandRequest

    q = mode_rt.bus.subscribe(maxsize=10000)
    # forge a request that the engine would never emit for these zones
    mode_rt.engine.active = True
    await mode_rt._dispatch(CommandRequest(command_id="test-unknown", device="hospital.secret", action="OPEN",
                                           confidence=0.99, timestamp=1.0))
    await settle()
    assert mode_rt.repo.recent_commands() == []
    rejected = [e for e in drain(q) if e["type"] == "command_rejected"]
    assert rejected and rejected[0]["data"]["status"] == "REJECTED"
    assert all(v["confirmed_state"] in ("OFF", "LOCKED") for v in mode_rt.controller.twin.values())


async def test_workspace_change_keeps_engine_instance_and_resets_selection(mode_rt):
    engine = mode_rt.engine
    d = Driver(runtime=mode_rt)
    d.hold("open_palm", 0.5, 0.82, 1.1)
    assert mode_rt.engine.active
    new = settings_with_mode("hospital")
    new.intent.zones = [Zone(id="hospital.overview", label="Overview", device="hospital.overview",
                             x0=0.03, y0=0.055, x1=0.42, y1=0.2, action="OPEN_OVERVIEW", kind="digital")]
    await mode_rt.apply_settings(new)
    assert mode_rt.engine is engine, "mode switching must not create a second Intent Engine"
    assert mode_rt.engine.active is False and mode_rt.engine.state.value == "IDLE"
    assert mode_rt.workspace_mode == "hospital"


# ---------------------------------------------------------------- analytics
def test_analytics_group_trials_by_workspace(tmp_path):
    import os
    url = f"sqlite:///{tmp_path/'modes.db'}"
    sf = make_session_factory(make_engine(url))
    svc = AnalyticsService(sf)
    svc.start_session("conduit", "hospital run", workspace="hospital")
    svc.start_trial("intended", "hospital.overview", "panel")
    svc.record_command({"status": "CONFIRMED", "device": "hospital.overview", "action": "OPEN_OVERVIEW",
                        "acknowledged": True, "latency_ms": 30.0})
    svc.end_trial()
    svc.stop_session()

    svc.start_session("conduit", "fab run", workspace="semiconductor")
    svc.start_trial("intended", "semi.stage", "stage")
    svc.record_command({"status": "CONFIRMED", "device": "semi.stage", "action": "ADVANCE_STAGE",
                        "acknowledged": True, "latency_ms": 20.0})
    svc.end_trial()
    svc.stop_session()

    s = svc.summary()
    assert set(s["by_workspace"]) == {"hospital", "semiconductor"}
    assert s["by_workspace"]["hospital"]["attempts"] == 1
    assert s["by_workspace"]["semiconductor"]["successful_deliberate"] == 1
    assert {x["workspace"] for x in s["sessions"]} == {"hospital", "semiconductor"}
    header = svc.export_csv().splitlines()[0]
    assert header.startswith("session_id,mode,workspace,trial_id")
    assert "semiconductor" in svc.export_csv()
    os.environ.pop("CONDUIT_DB_URL", None)


# ---------------------------------------------------------------------- API
def test_api_workspace_roundtrip_and_mode_zones(mode_client):
    status = mode_client.get("/api/system/status").json()
    assert status["workspace_mode"] == "semiconductor"
    assert any(z["device"] == "semi.stage" and z["kind"] == "digital" for z in status["zones"])

    s = mode_client.get("/api/settings").json()
    s["workspace_mode"] = "industrial"
    s["intent"]["zones"].append({
        "id": "industrial.step", "label": "Next step", "device": "industrial.step",
        "x0": 0.58, "y0": 0.055, "x1": 0.97, "y1": 0.2,
        "action": "NEXT_STEP", "kind": "digital", "hint": "advance",
    })
    out = mode_client.put("/api/settings", json=s).json()
    assert out["workspace_mode"] == "industrial"
    assert len(out["intent"]["zones"]) == 3
    assert mode_client.get("/api/intent/status").json()["config"]["zones"][-1]["action"] == "NEXT_STEP"


def test_api_session_records_workspace_and_csv(mode_client):
    r = mode_client.post("/api/analytics/session/start", json={"mode": "conduit", "workspace": "semiconductor", "note": "fab"})
    assert r.status_code == 200
    mode_client.post("/api/analytics/trial/start", json={"label": "intended", "target": "semi.stage", "scenario": "stage"})
    mode_client.post("/api/analytics/trial/end")
    mode_client.post("/api/analytics/session/stop")
    summary = mode_client.get("/api/analytics/summary").json()
    assert summary["sessions"][0]["workspace"] == "semiconductor"
    assert summary["by_workspace"]["semiconductor"]["attempts"] == 1
    csv_text = mode_client.get("/api/analytics/export").text
    assert csv_text.splitlines()[0].startswith("session_id,mode,workspace")
    assert "semiconductor" in csv_text
