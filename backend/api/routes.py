"""REST API."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from backend.hardware.models import DEVICE_SPECS
from backend.models.schemas import (AppSettings, DeviceTestRequest, FaultRequest, HardwareModeRequest,
                                    InteractionModeRequest, SessionStartRequest, TrialStartRequest, VisionStartRequest)
from backend.services.runtime import ConduitRuntime

router = APIRouter(prefix="/api")


def rt(request: Request) -> ConduitRuntime:
    return request.app.state.runtime


# ------------------------------------------------------------------ system
@router.get("/health")
async def health():
    return {"status": "ok", "service": "conduit-backend", "version": "1.0.0"}


@router.get("/system/status")
async def system_status(request: Request):
    return rt(request).status()


# ------------------------------------------------------------------ vision
@router.post("/vision/start")
async def vision_start(request: Request, body: VisionStartRequest | None = None):
    r = rt(request)
    try:
        r.start_vision(body.camera_index if body else None)
    except ImportError as e:
        raise HTTPException(500, f"Vision dependencies missing: {e}")
    return {"started": True, "camera": r.camera_status}


@router.post("/vision/stop")
async def vision_stop(request: Request):
    r = rt(request)
    r.stop_vision()
    return {"stopped": True}


@router.get("/vision/cameras")
async def vision_cameras(request: Request):
    try:
        from backend.vision.worker import list_cameras
        cams = await asyncio.get_running_loop().run_in_executor(None, list_cameras)
    except Exception as e:
        return {"cameras": [], "error": str(e)}
    return {"cameras": cams}


@router.get("/vision/stream")
async def vision_stream(request: Request):
    """Local MJPEG preview of the processed (mirrored) camera frames. Never stored."""
    r = rt(request)
    if not r.settings.privacy.preview_stream:
        raise HTTPException(403, "Preview stream disabled in privacy settings")

    async def gen():
        last = None
        while r.worker is not None and r.worker.is_alive():
            if await request.is_disconnected():
                break
            jpg = r.worker.latest_jpeg()
            if jpg is not None and jpg is not last:
                last = jpg
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n"
            await asyncio.sleep(0.02)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


# ------------------------------------------------------------------ devices
@router.get("/devices")
async def devices(request: Request):
    return rt(request).controller.snapshot()


@router.get("/devices/{device_id}")
async def device(device_id: str, request: Request):
    d = rt(request).controller.twin.get(device_id)
    if not d:
        raise HTTPException(404, f"Unknown device '{device_id}'")
    return d


@router.post("/devices/{device_id}/test")
async def device_test(device_id: str, body: DeviceTestRequest, request: Request):
    """Manual test: sends a command through the same controller, flagged as ``manual_test``."""
    if device_id not in DEVICE_SPECS:
        raise HTTPException(404, f"Unknown device '{device_id}'")
    res = await rt(request).manual_device_test(device_id, body.action.upper())
    return res.model_dump(mode="json")


@router.get("/commands")
async def commands(request: Request, limit: int = 50):
    return {"commands": rt(request).repo.recent_commands(min(limit, 500))}


# --------------------------------------------------------- hardware / mode
@router.post("/hardware/mode")
async def hardware_mode(body: HardwareModeRequest, request: Request):
    r = rt(request)
    s = r.settings.model_copy(deep=True)
    s.hardware_mode = body.mode
    await r.apply_settings(s)
    return r.controller.snapshot()


@router.post("/hardware/connect")
async def hardware_connect(request: Request):
    r = rt(request)
    ok = await r.controller.refresh()
    return {"connected": ok, **r.controller.snapshot()}


@router.post("/hardware/simulate_fault")
async def simulate_fault(body: FaultRequest, request: Request):
    r = rt(request)
    if r.controller.mode != "simulation":
        raise HTTPException(409, "Fault injection is only available in simulation mode")
    r.controller.set_simulated_fault(body.offline)
    if not body.offline:
        await r.controller.refresh()
    return r.controller.snapshot()


# -------------------------------------------------------------- interaction
@router.post("/interaction/activate")
async def interaction_activate(request: Request):
    r = rt(request)
    r.interaction_activate()
    return r.engine.snapshot()


@router.post("/interaction/deactivate")
async def interaction_deactivate(request: Request):
    r = rt(request)
    r.interaction_deactivate()
    return r.engine.snapshot()


@router.post("/interaction/cancel")
async def interaction_cancel(request: Request):
    r = rt(request)
    r.interaction_cancel()
    return r.engine.snapshot()


@router.post("/interaction/mode")
async def interaction_mode(body: InteractionModeRequest, request: Request):
    try:
        rt(request).set_interaction_mode(body.mode)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"interaction_mode": body.mode}


@router.get("/intent/status")
async def intent_status(request: Request):
    r = rt(request)
    return {"mode": r.interaction_mode, "intent": r.engine.snapshot(), "config": r.engine.cfg.model_dump()}


@router.get("/intent/events")
async def intent_events(request: Request, limit: int = 100):
    return {"events": rt(request).repo.recent_intent_events(min(limit, 1000))}


# ---------------------------------------------------------------- analytics
@router.get("/analytics/summary")
async def analytics_summary(request: Request):
    return rt(request).analytics.summary()


@router.post("/analytics/session/start")
async def session_start(body: SessionStartRequest, request: Request):
    r = rt(request)
    try:
        if r.interaction_mode != body.mode:
            r.set_interaction_mode(body.mode)  # a session always runs in the mode it is labelled with
        sid = r.analytics.start_session(body.mode, body.note)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(409, str(e))
    r.bus.publish("analytics_updated", r.analytics.status())
    return {"session_id": sid, "mode": body.mode}


@router.post("/analytics/session/stop")
async def session_stop(request: Request):
    r = rt(request)
    out = r.analytics.stop_session()
    if out is None:
        raise HTTPException(409, "No test session is running")
    r.bus.publish("analytics_updated", r.analytics.status())
    return out


@router.post("/analytics/trial/start")
async def trial_start(body: TrialStartRequest, request: Request):
    r = rt(request)
    try:
        r.analytics.start_trial(body.label, body.target, body.scenario)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(409, str(e))
    r.bus.publish("analytics_updated", r.analytics.status())
    return r.analytics.status()


@router.post("/analytics/trial/end")
async def trial_end(request: Request):
    r = rt(request)
    out = r.analytics.end_trial()
    if out is None:
        raise HTTPException(409, "No trial is running")
    r.bus.publish("analytics_updated", r.analytics.status())
    return out


@router.get("/analytics/export")
async def analytics_export(request: Request):
    csv_text = rt(request).analytics.export_csv()
    return Response(csv_text, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=conduit_trials.csv"})


# ----------------------------------------------------------------- settings
@router.get("/settings")
async def get_settings(request: Request):
    return rt(request).settings.model_dump(mode="json")


@router.put("/settings")
async def put_settings(body: AppSettings, request: Request):
    r = rt(request)
    try:
        await r.apply_settings(body)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return r.settings.model_dump(mode="json")
