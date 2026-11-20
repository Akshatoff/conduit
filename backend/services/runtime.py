"""ConduitRuntime: wires vision -> intent -> device control -> twin/analytics/event log.

All mutable state is touched only from the asyncio event-loop thread. The vision thread hands
frames over with ``loop.call_soon_threadsafe``; commands are executed as asyncio tasks.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Callable, Dict, Optional

from backend.database.repository import Repository
from backend.hardware.controller import DeviceController
from backend.hardware.models import DEVICE_SPECS, CommandResult, CommandStatus, DeviceCommand
from backend.intent.baseline import BaselineController
from backend.intent.engine import CommandRequest, IntentEngine, IntentEvent, InteractionInput
from backend.models.schemas import AppSettings
from backend.services.analytics import AnalyticsService
from backend.services.event_bus import EventBus
from backend.services.settings_store import save_settings


class ConduitRuntime:
    def __init__(self, settings: AppSettings, session_factory, bus: Optional[EventBus] = None,
                 worker_factory: Optional[Callable] = None, persist_settings: bool = True) -> None:
        self.settings = settings
        self.bus = bus or EventBus()
        self.repo = Repository(session_factory)
        self.analytics = AnalyticsService(session_factory)
        self.controller = DeviceController(mode=settings.hardware_mode, emit=self._on_device_event,
                                           min_confidence=settings.intent.min_confidence)
        self.controller.configure_hardware(settings.phone.adb_path, settings.phone.serial, settings.phone.timeout_s,
                                          settings.phone.pulse_ms)
        self.engine = IntentEngine(settings.intent, device_states=self.controller.device_states)
        self.baseline = BaselineController(device_states=self.controller.device_states)
        self.interaction_mode = settings.interaction_mode
        self.workspace_mode = settings.workspace_mode
        self.clock: Callable[[], float] = time.monotonic
        self._worker_factory = worker_factory
        self.worker = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.camera_status: dict = {"state": "stopped", "active": False, "available": None, "fps": 0.0, "error": None,
                                    "camera_index": settings.camera.index}
        self.trail: deque = deque(maxlen=30)
        self.last_frame: Optional[dict] = None
        self._last_ts = 0.0
        self._last_gesture = "none"
        self._tasks: set = set()
        self._health_task: Optional[asyncio.Task] = None
        self._persist = persist_settings
        self.baseline_reason = "Baseline mode: gestures map directly to commands (no intent evaluation)"

    # ------------------------------------------------------------- lifecycle
    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        if self.controller.mode == "hardware":
            await self.controller.refresh()
        self._health_task = asyncio.create_task(self._health_loop())

    async def shutdown(self) -> None:
        self.stop_vision()
        if self._health_task:
            self._health_task.cancel()
        await self.controller.shutdown()   # stops the phone buzzer and restores the screen

    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(2.0)
            try:
                if self.controller.mode == "hardware":
                    await self.controller.refresh()  # phone heartbeat: re-probes the adb link
            except Exception as e:  # never let the heartbeat die
                self.bus.publish("system_error", {"where": "health_loop", "message": str(e)})

    # ---------------------------------------------------------------- vision
    def start_vision(self, camera_index: Optional[int] = None) -> None:
        if self.worker and self.worker.is_alive():
            halt = getattr(self.worker, "_halt", None)
            if halt is not None and halt.is_set():
                self.worker.join(timeout=2.0)  # previous run is still shutting down (camera release)
            if self.worker.is_alive():
                return
        if self.loop is None:
            self.loop = asyncio.get_running_loop()
        cam = self.settings.camera
        if camera_index is not None:
            cam.index = camera_index
        factory = self._worker_factory
        if factory is None:
            from backend.vision.worker import VisionWorker as factory  # lazy: needs OpenCV
        loop = self.loop
        self.worker = factory(cam.index, cam.width, cam.height, cam.smoothing_alpha,
                              lambda f: loop.call_soon_threadsafe(self.on_vision_frame, f),
                              lambda s: loop.call_soon_threadsafe(self._on_camera_status, s),
                              self.settings.privacy.preview_stream)
        self.worker.start()

    def stop_vision(self) -> None:
        if self.worker:
            self.worker.stop()
        self.engine.reset()
        self.baseline.reset()
        self.trail.clear()

    def _on_camera_status(self, st: dict) -> None:
        self.camera_status = {**self.camera_status, **st}
        if st.get("state") in ("stopped", "error", "disconnected"):
            self.camera_status["fps"] = 0.0
            self.engine.reset()
            self.last_frame = None
            self.bus.publish("intent_state_changed", {"kind": "state_changed", **self._snapshot_for_ui(), "reason": f"Camera {st['state']}"})
        if st.get("state") in ("error", "disconnected"):
            self.bus.publish("system_error", {"where": "camera", "message": st.get("error") or st["state"]})
        self.bus.publish("camera_status", {**self.camera_status, "preview_stream": self.settings.privacy.preview_stream})

    def on_vision_frame(self, f: dict) -> None:
        pos = f.get("position")
        inp = InteractionInput(
            timestamp=f["timestamp"], hand_detected=bool(f["hand_detected"]),
            x=pos["x"] if pos else 0.0, y=pos["y"] if pos else 0.0, gesture=f.get("gesture", "none"),
            pinch_distance=f.get("pinch_distance") if f.get("pinch_distance") is not None else 1.0,
            tracking_quality=f.get("tracking_quality", 0.0),
        )
        self.camera_status["fps"] = f.get("fps", 0.0)
        self.process_input(inp, f)

    # ---------------------------------------------------------- core pipeline
    def process_input(self, inp: InteractionInput, frame: Optional[dict] = None) -> None:
        """Feed one structured interaction sample through the active controller. Camera-independent."""
        self._last_ts = inp.timestamp
        frame = frame or {"timestamp": inp.timestamp, "hand_detected": inp.hand_detected, "gesture": inp.gesture,
                          "position": {"x": inp.x, "y": inp.y} if inp.hand_detected else None,
                          "pinch_distance": inp.pinch_distance, "velocity": 0.0, "stability": 0.0, "fps": 0.0,
                          "tracking_quality": inp.tracking_quality, "handedness": None, "features": None}
        self.last_frame = frame
        if inp.hand_detected:
            self.trail.append([round(inp.x, 4), round(inp.y, 4)])
        elif len(self.trail) and not inp.hand_detected:
            self.trail.clear()

        t0 = time.perf_counter()
        if self.interaction_mode == "conduit":
            result = self.engine.update(inp)
            events, snapshot = result.events, result.snapshot
        else:
            events, snapshot = self._baseline_step(inp), self._baseline_snapshot(inp)
        self.analytics.record_engine_latency((time.perf_counter() - t0) * 1000)

        if frame["gesture"] != self._last_gesture:
            self._last_gesture = frame["gesture"]
            self.bus.publish("gesture_detected", {"gesture": frame["gesture"], "hand_detected": inp.hand_detected})
        self.bus.publish("hand_landmarks", frame)
        m = self.engine.metrics
        self.bus.publish("trajectory_update", {
            "trail": list(self.trail), "speed": round(m.speed, 4), "stability": round(m.stability, 3),
            "consistency": round(m.consistency, 3), "direction": list(m.direction), "path_length": round(m.path_length, 4),
            "intent": snapshot, "interaction_mode": self.interaction_mode,
        })
        for ev in events:
            self._handle_intent_event(ev)

    def _baseline_step(self, inp: InteractionInput) -> list:
        events = []
        for req in self.baseline.update(inp):
            reason = f"Gesture '{inp.gesture}' mapped directly to {req.device}:{req.action} — no intent evaluation"
            self.baseline_reason = reason
            events.append(IntentEvent(kind="command_request", intent="BASELINE_GESTURE", target=req.device, confidence=1.0,
                                      state="BASELINE", accepted=True, reason=reason, reason_code="BASELINE_DIRECT",
                                      timestamp=inp.timestamp, action=req.action, command=req))
        return events

    def _baseline_snapshot(self, inp: InteractionInput) -> dict:
        return {"state": "BASELINE", "intent": "BASELINE_GESTURE", "active": True, "target": None, "target_label": None,
                "action": None, "confidence": 1.0 if inp.hand_detected else 0.0, "final_confidence": 1.0, "components": {},
                "accepted": True, "reason": self.baseline_reason, "reason_code": "BASELINE", "confirmation_required": False,
                "hovered_zone": self.engine._zone_id_at(inp.x, inp.y) if inp.hand_detected else None, "in_cooldown": False,
                "cooldown_remaining": 0.0,
                "progress": {"activation": 1.0, "dwell": 0.0, "dwell_s": 0.0, "confirmation_remaining_s": 0.0,
                             "confirmation_timeout_s": 0.0}, "tracking_quality": inp.tracking_quality, "timestamp": inp.timestamp}

    def _snapshot_for_ui(self) -> dict:
        s = self.engine.snapshot()
        return {k: s[k] for k in ("state", "intent", "target", "confidence", "accepted", "reason", "reason_code")}

    # --------------------------------------------------------- intent events
    def _handle_intent_event(self, ev: IntentEvent) -> None:
        d = ev.to_dict()
        d.pop("command", None)
        d["wall_time"] = time.time()
        d["mode"] = self.interaction_mode
        try:
            self.repo.log_intent_event(d, self.interaction_mode)
        except Exception as e:  # persistence must never stop the control loop
            self.bus.publish("system_error", {"where": "database", "message": str(e)})
        self.analytics.record_intent_event(d)
        self.bus.publish("intent_state_changed", d)
        if ev.kind == "device_selected":
            self.bus.publish("device_selected", d)
        elif ev.kind == "confirmation_required":
            self.bus.publish("confirmation_required", d)
        elif ev.kind == "rejected":
            self.bus.publish("command_rejected", {**d, "scope": "intent"})
        if ev.command is not None:
            self._spawn(self._dispatch(ev.command))

    def _spawn(self, coro) -> None:
        t = asyncio.ensure_future(coro)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)

    # -------------------------------------------------- mode-layer execution
    def _digital_zone(self, req: CommandRequest):
        """A zone that belongs to the active mode's *digital* control surface.

        Digital controls are still authorised by the Intent Engine (selection, dwell,
        confidence, pinch confirmation, cooldown, duplicate prevention) but they never reach
        the device controller and are never reported as physical hardware execution.
        """
        for z in self.settings.intent.zones:
            if z.device == req.device and z.kind == "digital":
                return z
        return None

    async def _dispatch_digital(self, req: CommandRequest, zone) -> None:
        t0 = time.perf_counter()
        valid = req.action == (zone.action or req.action)
        self.repo.log_command(req.command_id, req.device, req.action, req.source, "SENT", "mode_ui", req.confidence)
        res = CommandResult(
            command_id=req.command_id, device=req.device, action=req.action, source=req.source,
            status=CommandStatus.CONFIRMED if valid else CommandStatus.REJECTED,
            detail=(f"Digital control '{zone.label}' executed in the mode layer (no physical device)"
                    if valid else f"Action '{req.action}' is not the configured action for '{zone.label}'"),
            acknowledged=valid, simulated=True, executed_on="mode_ui", digital=True,
            confirmed_state=req.action if valid else None,
            latency_ms=(time.perf_counter() - t0) * 1000,
        )
        ack = res.model_dump(mode="json")
        self.repo.update_command(req.command_id, res.status.value, ack, res.latency_ms)
        self.analytics.record_command(ack)
        self.bus.publish("command_sent", {"command_id": req.command_id, "device": req.device, "action": req.action,
                                          "source": req.source, "status": "SENT", "executed_on": "mode_ui",
                                          "simulated": True, "digital": True, "sandbox": True,
                                          "confidence": req.confidence})
        if valid:
            self.bus.publish("command_acknowledged", {**ack, "ack_latency_ms": res.latency_ms, "workspace": self.workspace_mode})
            self.bus.publish("mode_action", {
                "command_id": req.command_id, "device": req.device, "action": req.action, "source": req.source,
                "workspace": self.workspace_mode, "status": res.status.value, "digital": True, "simulated": True,
                "detail": res.detail, "latency_ms": res.latency_ms, "label": zone.label,
            })
        else:
            self.bus.publish("command_rejected", ack)
        if req.source == "conduit_intent_engine" and self.interaction_mode == "conduit":
            ok = res.status == CommandStatus.CONFIRMED
            for ev in self.engine.notify_command_result(ok, res.detail, self.clock()):
                self._handle_intent_event(ev)

    async def _dispatch(self, req: CommandRequest) -> None:
        if req.device not in DEVICE_SPECS:
            zone = self._digital_zone(req)
            if zone is not None:
                await self._dispatch_digital(req, zone)
                return
            # Unknown device: never forwarded anywhere, the engine is told the execution failed.
            self.bus.publish("command_rejected", {"command_id": req.command_id, "device": req.device,
                                                  "action": req.action, "status": "REJECTED", "digital": False,
                                                  "detail": f"Device '{req.device}' is not part of the active mode"})
            if req.source == "conduit_intent_engine" and self.interaction_mode == "conduit":
                for ev in self.engine.notify_command_result(False, f"Unknown device '{req.device}'", self.clock()):
                    self._handle_intent_event(ev)
            return
        cmd = DeviceCommand(command_id=req.command_id, device=req.device, action=req.action, source=req.source,
                            confidence=req.confidence)
        node = self.controller._node_for(cmd)
        self.repo.log_command(cmd.command_id, cmd.device, cmd.action, cmd.source, "SENT", node.name, cmd.confidence)
        res = await self.controller.execute(cmd)
        ack = res.model_dump(mode="json")
        self.repo.update_command(cmd.command_id, res.status.value, ack, res.latency_ms)
        self.analytics.record_command(ack)
        if req.source == "conduit_intent_engine" and self.interaction_mode == "conduit":
            ok = res.status == CommandStatus.CONFIRMED
            for ev in self.engine.notify_command_result(ok, res.detail, self.clock()):
                self._handle_intent_event(ev)

    def _on_device_event(self, type_: str, data: dict) -> None:
        self.bus.publish(type_, data)
        if type_ == "device_state_changed" and not data.get("sandbox") and data.get("id"):
            try:
                self.repo.upsert_device(data)
            except Exception:
                pass

    # -------------------------------------------------------- operator actions
    def interaction_activate(self) -> None:
        for ev in self.engine.activate(self.clock()):
            self._handle_intent_event(ev)

    def interaction_deactivate(self) -> None:
        for ev in self.engine.deactivate(self.clock(), "Deactivated by operator", "MANUAL_DEACTIVATE"):
            self._handle_intent_event(ev)

    def interaction_cancel(self) -> None:
        for ev in self.engine.cancel(self.clock(), "Cancelled by operator (emergency cancel)"):
            self._handle_intent_event(ev)

    def set_interaction_mode(self, mode: str) -> None:
        if self.analytics.active and mode != self.interaction_mode:
            raise RuntimeError("Stop the running test session before switching interaction mode")
        self.interaction_mode = mode
        self.settings.interaction_mode = mode  # type: ignore[assignment]
        self.engine.reset()
        self.baseline.reset()
        self._save()
        self.bus.publish("settings_changed", {"interaction_mode": mode})

    async def manual_device_test(self, device: str, action: str):
        """Operator-initiated test: clearly flagged ``manual_test``; does not pass through intent evaluation."""
        cmd = DeviceCommand(device=device, action=action, source="manual_test", confidence=None)
        node = self.controller._node_for(cmd)
        self.repo.log_command(cmd.command_id, cmd.device, cmd.action, cmd.source, "SENT", node.name, None)
        res = await self.controller.execute(cmd)
        self.repo.update_command(cmd.command_id, res.status.value, res.model_dump(mode="json"), res.latency_ms)
        return res

    async def apply_settings(self, new: AppSettings) -> None:
        old = self.settings
        new.privacy.store_video = False
        zones_changed = old.intent.zones != new.intent.zones
        workspace_changed = old.workspace_mode != new.workspace_mode
        self.settings = new
        self.workspace_mode = new.workspace_mode
        self.engine.set_config(new.intent)
        self.controller.min_confidence = new.intent.min_confidence
        self.controller.configure_hardware(new.phone.adb_path, new.phone.serial, new.phone.timeout_s, new.phone.pulse_ms)
        if self.interaction_mode != new.interaction_mode:
            self.set_interaction_mode(new.interaction_mode)
        if old.hardware_mode != new.hardware_mode or self.controller.mode != new.hardware_mode:
            await self.controller.set_mode(new.hardware_mode)
        elif new.hardware_mode == "hardware":
            await self.controller.refresh()
        if zones_changed or workspace_changed:
            # Changing mode configures the *same* engine instance and never restarts vision.
            self.engine.reset()
            self.baseline.reset()
            self.bus.publish("workspace_changed", {"workspace_mode": new.workspace_mode,
                                                   "zones": [z.model_dump() for z in new.intent.zones]})
        self._save()
        self.bus.publish("settings_changed", {"settings": new.model_dump(mode="json")})

    def _save(self) -> None:
        if self._persist:
            save_settings(self.settings)

    # ------------------------------------------------------------------ status
    def status(self) -> dict:
        w = self.worker
        return {
            "camera": {**self.camera_status, "preview_stream": self.settings.privacy.preview_stream},
            "vision_running": bool(w and w.is_alive()),
            "interaction_mode": self.interaction_mode,
            "workspace_mode": self.workspace_mode,
            "hardware_mode": self.controller.mode,
            "intent": self.engine.snapshot() if self.interaction_mode == "conduit" else None,
            "devices": self.controller.snapshot(),
            "analytics": self.analytics.status(),
            "privacy": {"video_stored": False, "cloud_upload": False, "processing": "local",
                        "camera_active": bool(self.camera_status.get("active"))},
            "zones": [z.model_dump() for z in self.settings.intent.zones],
            "zone_controls": [{"id": z.id, "label": z.label, "device": z.device, "kind": z.kind,
                               "action": z.action or None, "hint": z.hint} for z in self.settings.intent.zones],
            "clients": self.bus.subscriber_count,
            "disclaimer": "Prototype for isolated low-voltage demonstration only; not a certified medical, industrial or safety-critical system.",
        }
