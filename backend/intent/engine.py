"""CONDUIT Intent Engine.

Hand tracked -> movement analysed -> context established -> intent evaluated ->
action validated -> (device controller) -> execution verified.

The engine is a deterministic, interpretable state machine. It consumes
``InteractionInput`` records (normalised position + gesture label + quality) and has
NO dependency on MediaPipe, OpenCV or any I/O. It never talks to hardware: when an
interaction is accepted it emits a ``command_request`` event and then waits for the
caller to report the outcome through ``notify_command_result``.

Every state transition, acceptance and rejection carries a human-readable reason.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Callable, Dict, List, Optional

from .config import IntentConfig, Zone, toggle_action
from .trajectory import TrajectoryAnalyzer, TrajectoryMetrics


class IntentState(str, Enum):
    IDLE = "IDLE"
    ACTIVATING = "ACTIVATING"
    READY = "READY"
    APPROACHING_CONTROL = "APPROACHING_CONTROL"
    SELECTING = "SELECTING"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    CONFIRMING = "CONFIRMING"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    ERROR = "ERROR"


TERMINAL = {IntentState.COMPLETED, IntentState.CANCELLED, IntentState.REJECTED, IntentState.ERROR}
CANCELLABLE = {
    IntentState.APPROACHING_CONTROL,
    IntentState.SELECTING,
    IntentState.AWAITING_CONFIRMATION,
    IntentState.CONFIRMING,
}

INTENT_LABEL = {
    IntentState.IDLE: "NONE",
    IntentState.ACTIVATING: "ACTIVATE_INTERACTION",
    IntentState.READY: "AWAIT_TARGET",
    IntentState.APPROACHING_CONTROL: "APPROACH_CONTROL",
    IntentState.SELECTING: "SELECT_DEVICE",
    IntentState.AWAITING_CONFIRMATION: "SELECT_DEVICE",
    IntentState.CONFIRMING: "CONFIRM_ACTION",
    IntentState.EXECUTING: "EXECUTE_COMMAND",
    IntentState.COMPLETED: "EXECUTE_COMMAND",
    IntentState.CANCELLED: "CANCEL",
    IntentState.REJECTED: "REJECT_MOVEMENT",
    IntentState.ERROR: "EXECUTE_COMMAND",
}

IDLE_HINT = "Show a still open palm to activate interaction mode"
READY_HINT = "Interaction active — move deliberately toward a control"


@dataclass
class InteractionInput:
    """Structured movement data. Produced by the vision module (or any other modality)."""

    timestamp: float
    hand_detected: bool
    x: float = 0.0
    y: float = 0.0
    gesture: str = "none"
    pinch_distance: float = 1.0
    tracking_quality: float = 1.0


@dataclass
class CommandRequest:
    command_id: str
    device: str
    action: str
    confidence: float
    timestamp: float
    source: str = "conduit_intent_engine"


@dataclass
class IntentEvent:
    kind: str
    intent: str
    target: Optional[str]
    confidence: float
    state: str
    accepted: bool
    reason: str
    reason_code: str
    timestamp: float
    action: Optional[str] = None
    command: Optional[CommandRequest] = None
    components: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["confidence"] = round(self.confidence, 3)
        return d


@dataclass
class StepResult:
    snapshot: dict
    events: List[IntentEvent]

    @property
    def commands(self) -> List[CommandRequest]:
        return [e.command for e in self.events if e.command is not None]


class IntentEngine:
    def __init__(
        self,
        config: Optional[IntentConfig] = None,
        device_states: Optional[Callable[[], Dict[str, str]]] = None,
    ) -> None:
        self.cfg = config or IntentConfig()
        self._device_states = device_states or (lambda: {})
        self.traj = TrajectoryAnalyzer()
        self.reset()

    # ------------------------------------------------------------------ setup
    def set_config(self, cfg: IntentConfig) -> None:
        self.cfg = cfg

    def reset(self) -> None:
        self.state = IntentState.IDLE
        self.active = False
        self.target: Optional[str] = None
        self.action: Optional[str] = None
        self.confidence = 0.0
        self.selection_confidence = 0.0
        self.components: Dict[str, float] = {}
        self.reason = IDLE_HINT
        self.reason_code = "IDLE"
        self.accepted = False
        self.traj.reset()
        self.metrics = TrajectoryMetrics()
        self._t = 0.0
        self._events: List[IntentEvent] = []
        self._holds: Dict[str, List[float]] = {}  # gesture -> [first_seen, last_seen]
        self._last_hand_t: Optional[float] = None
        self._quality = 1.0
        self._cooldown_until = 0.0
        self._last_exec: Dict[tuple, float] = {}
        self._state_t0 = 0.0
        self._act_t0 = 0.0
        self._act_unstable_since: Optional[float] = None
        self._needs_exit_zone = False
        self._palm_rearm = False
        self._palm_still_t0: Optional[float] = None
        self._pinch_reported = False
        self._approach_peak: Dict[str, float] = {}
        self._approach_cons: Dict[str, float] = {}
        self._approach_low_since: Optional[float] = None
        self._sel_t0 = 0.0
        self._sel_dir = 0.0
        self._sel_cons = 0.0
        self._stab_ema = 0.0
        self._left_since: Optional[float] = None
        self._confirm_deadline = 0.0
        self._exec_deadline = 0.0
        self._pending_cmd: Optional[CommandRequest] = None
        self._last_activity = 0.0
        self._hovered: Optional[str] = None
        self._dwell = 0.0
        self._pos = (0.0, 0.0)

    # ------------------------------------------------------------ public API
    def update(self, inp: InteractionInput) -> StepResult:
        self._events = []
        t = inp.timestamp
        self._t = t
        self._tick(t)

        if inp.hand_detected:
            self._last_hand_t = t
            self._pos = (inp.x, inp.y)
            self._quality += 0.3 * (max(0.0, min(1.0, inp.tracking_quality)) - self._quality)
            self.traj.add(t, inp.x, inp.y)
            self.metrics = self.traj.metrics()
            self._update_holds(t, inp.gesture)
            self._hovered = self._zone_id_at(inp.x, inp.y)
            self.traj.update_zone(self._hovered, t)
            self._step_hand(inp)
        else:
            self._step_no_hand(t)
        return StepResult(self.snapshot(), self._events)

    def activate(self, t: float, reason: str = "Interaction mode activated manually") -> List[IntentEvent]:
        self._events = []
        self._t = t
        if not self.active and self.state in (IntentState.IDLE, IntentState.ACTIVATING):
            self._activate(t, reason, "MANUAL_ACTIVATE")
        return self._events

    def deactivate(self, t: float, reason: str = "Interaction mode deactivated", code: str = "DEACTIVATED") -> List[IntentEvent]:
        self._events = []
        self._t = t
        if self.state == IntentState.EXECUTING:
            # a command is already in flight; it cannot be recalled by the engine
            self._emit("rejected", False, "Deactivation deferred: command already dispatched", "EXEC_IN_FLIGHT")
            return self._events
        if self.active or self.state != IntentState.IDLE:
            self._deactivate(t, reason, code)
        return self._events

    def cancel(self, t: float, reason: str = "Cancelled by operator") -> List[IntentEvent]:
        """Cancel the current interaction (API / UI / emergency button)."""
        self._events = []
        self._t = t
        if self.state in CANCELLABLE:
            self._finish(IntentState.CANCELLED, t, reason, "CANCELLED_MANUAL", accepted=False)
        elif self.state == IntentState.EXECUTING:
            self._emit("rejected", False, "Cancel ignored: command already dispatched to device", "EXEC_IN_FLIGHT")
        elif self.active:
            self._deactivate(t, reason, "CANCELLED_MANUAL")
        return self._events

    def notify_command_result(self, success: bool, reason: str, t: float) -> List[IntentEvent]:
        self._events = []
        self._t = t
        if self.state != IntentState.EXECUTING:
            return self._events
        self._cooldown_until = t + self.cfg.cooldown_s
        self._pending_cmd = None
        if success:
            self._finish(IntentState.COMPLETED, t, reason, "EXEC_CONFIRMED", accepted=True, kind="completed")
        else:
            self._finish(IntentState.ERROR, t, reason, "EXEC_FAILED", accepted=False, kind="error")
        return self._events

    # ------------------------------------------------------------- snapshot
    def snapshot(self) -> dict:
        t = self._t
        cooldown_rem = max(0.0, self._cooldown_until - t)
        awaiting = self.state in (IntentState.AWAITING_CONFIRMATION, IntentState.CONFIRMING)
        zone = self.cfg.zone_by_id(self.target)
        min_dwell = max(self.cfg.min_dwell_s, 1e-6)
        if self.state == IntentState.ACTIVATING:
            progress_act = min(1.0, (t - self._act_t0) / max(self.cfg.activation_hold_s, 1e-6))
        else:
            progress_act = 1.0 if self.active else 0.0
        return {
            "state": self.state.value,
            "intent": INTENT_LABEL[self.state],
            "active": self.active,
            "target": self.target,
            "target_label": zone.label if zone else None,
            "action": self.action,
            "confidence": round(self.selection_confidence if self.state != IntentState.CONFIRMING else self.confidence, 3),
            "final_confidence": round(self.confidence, 3),
            "components": {k: round(v, 3) for k, v in self.components.items()},
            "accepted": self.accepted,
            "reason": self.reason,
            "reason_code": self.reason_code,
            "confirmation_required": awaiting,
            "hovered_zone": self._hovered,
            "in_cooldown": cooldown_rem > 0 and self.state in (IntentState.READY, IntentState.COMPLETED, IntentState.IDLE),
            "cooldown_remaining": round(cooldown_rem, 2),
            "progress": {
                "activation": round(progress_act, 3),
                "dwell": round(min(1.0, self._dwell / min_dwell), 3),
                "dwell_s": round(self._dwell, 3),
                "confirmation_remaining_s": round(max(0.0, self._confirm_deadline - t), 2) if awaiting else 0.0,
                "confirmation_timeout_s": self.cfg.confirmation_timeout_s,
            },
            "tracking_quality": round(self._quality, 3),
            "timestamp": t,
        }

    # ================================================================ internals
    # ---- helpers
    def _emit(self, kind: str, accepted: bool, reason: str, code: str,
              command: Optional[CommandRequest] = None, confidence: Optional[float] = None) -> IntentEvent:
        self.reason, self.reason_code, self.accepted = reason, code, accepted
        ev = IntentEvent(
            kind=kind,
            intent=INTENT_LABEL[self.state],
            target=self.target,
            confidence=self.confidence if confidence is None else confidence,
            state=self.state.value,
            accepted=accepted,
            reason=reason,
            reason_code=code,
            timestamp=self._t,
            action=self.action,
            command=command,
            components=dict(self.components),
        )
        self._events.append(ev)
        return ev

    def _set_state(self, new: IntentState, reason: str, code: str, accepted: bool = False) -> None:
        if new == self.state:
            return
        self.state = new
        self._state_t0 = self._t
        self._emit("state_changed", accepted, reason, code)

    def _update_holds(self, t: float, gesture: str) -> None:
        h = self._holds.get(gesture)
        if h is None or t - h[1] > self.cfg.gesture_grace_s:
            self._holds[gesture] = [t, t]
        else:
            h[1] = t

    def _hold(self, gesture: str) -> float:
        h = self._holds.get(gesture)
        if not h or self._t - h[1] > self.cfg.gesture_grace_s:
            return 0.0
        return self._t - h[0]

    def _zone_id_at(self, x: float, y: float) -> Optional[str]:
        # hysteresis: keep the current target zone while within margin
        tz = self.cfg.zone_by_id(self.target)
        if tz and self.state in (IntentState.SELECTING, IntentState.AWAITING_CONFIRMATION, IntentState.CONFIRMING):
            if tz.contains(x, y, self.cfg.zone_margin):
                return tz.id
        for z in self.cfg.zones:
            if z.contains(x, y):
                return z.id
        return None

    def _score(self, with_gesture: bool, pinch_distance: float = 1.0) -> tuple[float, Dict[str, float]]:
        w = self.cfg.weights
        comps = {
            "consistency": self._sel_cons,
            "direction": min(1.0, self._sel_dir / max(self.cfg.approach_full_score, 1e-6)),
            "stability": self._stab_ema,
            "dwell": min(1.0, self._dwell / max(self.cfg.min_dwell_s, 1e-6)),
            "tracking": self._quality,
            "activation": 1.0 if self.active else 0.0,
        }
        if with_gesture:
            comps["gesture"] = max(0.0, min(1.0, (0.45 - pinch_distance) / 0.2))
        total = sum(w.get(k, 0.0) for k in comps)
        score = sum(w.get(k, 0.0) * v for k, v in comps.items()) / total if total > 0 else 0.0
        return max(0.0, min(1.0, score)), comps

    def _in_any_zone(self) -> bool:
        return self._hovered is not None

    # ---- lifecycle
    def _activate(self, t: float, reason: str, code: str) -> None:
        self.active = True
        self._palm_rearm = False
        self._palm_still_t0 = None
        self._last_activity = t
        self._needs_exit_zone = self._in_any_zone()
        self.target = None
        self.action = None
        self.confidence = self.selection_confidence = 0.0
        self.components = {}
        self._dwell = 0.0
        self.state = IntentState.READY
        self._state_t0 = t
        self._emit("activated", True, reason, code)
        self._emit("state_changed", True, READY_HINT, code)
        self.reason = READY_HINT

    def _deactivate(self, t: float, reason: str, code: str) -> None:
        was_active = self.active
        self.active = False
        self.target = None
        self.action = None
        self._dwell = 0.0
        self.confidence = self.selection_confidence = 0.0
        self.components = {}
        self._pending_cmd = None
        self.state = IntentState.IDLE
        self._state_t0 = t
        self._emit("deactivated" if was_active else "state_changed", False, reason, code)
        self.reason, self.reason_code = reason, code
        self.accepted = False

    def _finish(self, new: IntentState, t: float, reason: str, code: str, accepted: bool, kind: Optional[str] = None) -> None:
        self.state = new
        self._state_t0 = t
        k = kind or {IntentState.CANCELLED: "cancelled", IntentState.REJECTED: "rejected"}.get(new, "state_changed")
        self._emit(k, accepted, reason, code)
        self._needs_exit_zone = self._in_any_zone() or self._needs_exit_zone
        self._pinch_reported = True  # a pinch that caused this outcome must not be re-reported
        self._left_since = None

    def _reject(self, t: float, reason: str, code: str) -> None:
        self._finish(IntentState.REJECTED, t, reason, code, accepted=False)

    # ---- timers (run on every update, with or without a hand)
    def _tick(self, t: float) -> None:
        cfg = self.cfg
        if self.state in TERMINAL and t - self._state_t0 >= cfg.result_hold_s:
            self.target = None
            self.action = None
            self._dwell = 0.0
            self._approach_peak.clear()
            self._approach_cons.clear()
            self.state = IntentState.READY if self.active else IntentState.IDLE
            self._state_t0 = t
            self._last_activity = t
            self._emit("state_changed", False, READY_HINT if self.active else IDLE_HINT, "RESULT_CLEARED")
            self.reason = READY_HINT if self.active else IDLE_HINT
        elif self.state == IntentState.EXECUTING and t >= self._exec_deadline:
            self._cooldown_until = t + cfg.cooldown_s
            self._pending_cmd = None
            self._finish(IntentState.ERROR, t, "No device result before timeout — command state unknown", "EXEC_TIMEOUT", False, "error")
        elif self.state == IntentState.AWAITING_CONFIRMATION and t >= self._confirm_deadline:
            self._finish(IntentState.CANCELLED, t, f"Confirmation timeout ({cfg.confirmation_timeout_s:.0f}s) — nothing executed", "CONFIRM_TIMEOUT", False)
        elif self.active and self.state == IntentState.READY and t - self._last_activity >= cfg.interaction_timeout_s:
            self._deactivate(t, f"Interaction timeout ({cfg.interaction_timeout_s:.0f}s without activity)", "INTERACTION_TIMEOUT")

    # ---- no hand
    def _step_no_hand(self, t: float) -> None:
        gap = t - self._last_hand_t if self._last_hand_t is not None else 0.0
        if gap > 0.3:
            self.traj.reset()
            self.traj.update_zone(None, t)
            self.metrics = TrajectoryMetrics()
            self._holds.clear()
            self._hovered = None
            self._pinch_reported = False
            self._palm_still_t0 = None
        if self.state == IntentState.ACTIVATING and gap > 0.3:
            self._abort_activation(t, "Hand lost during activation", "ACTIVATION_ABORTED")
        elif self.state in (IntentState.APPROACHING_CONTROL, IntentState.SELECTING) and gap > 0.5:
            self._reject(t, "Tracking lost while selecting — selection discarded", "TRACKING_LOST")
        elif self.state == IntentState.AWAITING_CONFIRMATION and gap > self.cfg.no_hand_timeout_s:
            self._finish(IntentState.CANCELLED, t, "Hand lost — confirmation cancelled", "NO_HAND_TIMEOUT", False)
        elif self.active and self.state == IntentState.READY and gap > self.cfg.no_hand_timeout_s:
            self._deactivate(t, f"No hand detected for {self.cfg.no_hand_timeout_s:.0f}s — interaction deactivated", "NO_HAND_TIMEOUT")

    def _abort_activation(self, t: float, reason: str, code: str) -> None:
        elapsed = t - self._act_t0
        self.state = IntentState.IDLE
        self._state_t0 = t
        self._emit("state_changed", False, reason, code)
        if elapsed >= 0.25:
            self._emit("rejected", False, reason, code)
        self.reason = IDLE_HINT

    # ---- hand present
    def _step_hand(self, inp: InteractionInput) -> None:
        t, cfg, gm = inp.timestamp, self.cfg, self.cfg.gestures
        st = self.state

        # keep hover/clear exit-zone gate
        if self._needs_exit_zone and not self._in_any_zone():
            self._needs_exit_zone = False

        # a pinch that is not part of a valid confirmation is itself logged (once per pinch)
        if self._hold(gm.confirm) == 0.0 and inp.gesture != gm.confirm:
            self._pinch_reported = False

        # global cancel: a deliberate closed fist cancels any cancellable interaction
        if st in CANCELLABLE and self._hold(gm.cancel) >= cfg.cancel_hold_s:
            self._finish(IntentState.CANCELLED, t, "Closed fist — interaction cancelled", "CANCELLED_FIST", False)
            return

        if st == IntentState.IDLE:
            self._step_idle(inp)
        elif st == IntentState.ACTIVATING:
            self._step_activating(inp)
        elif st == IntentState.READY:
            self._step_ready(inp)
        elif st == IntentState.APPROACHING_CONTROL:
            self._step_approaching(inp)
        elif st == IntentState.SELECTING:
            self._step_selecting(inp)
        elif st == IntentState.AWAITING_CONFIRMATION:
            self._step_awaiting(inp)
        # EXECUTING / terminal states: waiting for result / hold timer

    def _step_idle(self, inp: InteractionInput) -> None:
        gm = self.cfg.gestures
        if inp.gesture == gm.activate and self.metrics.stability >= self.cfg.activation_stability:
            self._act_t0 = inp.timestamp
            self._act_unstable_since = None
            self.state = IntentState.ACTIVATING
            self._state_t0 = inp.timestamp
            self._emit("state_changed", False, "Open palm detected — hold still to activate", "ACTIVATING")

    def _step_activating(self, inp: InteractionInput) -> None:
        t, gm, cfg = inp.timestamp, self.cfg.gestures, self.cfg
        if inp.gesture != gm.activate and self._hold(gm.activate) == 0.0:
            self._abort_activation(t, "Activation gesture not held", "ACTIVATION_ABORTED")
            return
        if self.metrics.stability < cfg.activation_stability:
            if self._act_unstable_since is None:
                self._act_unstable_since = t
            elif t - self._act_unstable_since > 0.35:
                self._abort_activation(t, f"Hand moving during activation (stability {self.metrics.stability:.2f})", "ACTIVATION_UNSTABLE")
                return
        else:
            self._act_unstable_since = None
        if t - self._act_t0 >= cfg.activation_hold_s:
            self._activate(t, "Interaction mode activated by open palm", "ACTIVATED")

    def _step_ready(self, inp: InteractionInput) -> None:
        t, cfg, gm = inp.timestamp, self.cfg, self.cfg.gestures
        m = self.metrics

        # emergency stop: sustained fist while ready
        if self._hold(gm.cancel) >= cfg.emergency_hold_s:
            self._deactivate(t, "Closed fist held — interaction deactivated (emergency stop)", "EMERGENCY_STOP")
            return

        # deactivate: still open palm outside any zone (needs re-arming after activation)
        if inp.gesture != gm.activate or m.speed > 0.15:
            self._palm_rearm = True
        if inp.gesture == gm.activate and m.stability >= 0.85 and not self._in_any_zone() and self._palm_rearm:
            if self._palm_still_t0 is None:
                self._palm_still_t0 = t
            elif t - self._palm_still_t0 >= cfg.deactivation_hold_s:
                self._deactivate(t, "Still open palm held — interaction deactivated", "PALM_DEACTIVATE")
                return
        else:
            self._palm_still_t0 = None

        self._maybe_report_stray_pinch(inp, "Pinch ignored: no device selected")

        in_cooldown = t < self._cooldown_until
        if in_cooldown or self._needs_exit_zone:
            self.reason = (f"Cooldown ({self._cooldown_until - t:.1f}s) — selections blocked" if in_cooldown
                           else "Move out of the control zone to re-arm selection")
            self.reason_code = "COOLDOWN" if in_cooldown else "REARM"
            return
        self.reason, self.reason_code = READY_HINT, "READY"

        if self._hovered:
            self._begin_selection(self.cfg.zone_by_id(self._hovered), t)
            return

        best_id, best = None, 0.0
        for z in cfg.zones:
            s = self.traj.approach_score(z.center)
            if s > best:
                best_id, best = z.id, s
        if best_id and best >= cfg.approach_threshold:
            self.target = best_id
            self._approach_peak = {best_id: best}
            self._approach_cons = {best_id: m.consistency}
            self._approach_low_since = None
            self._last_activity = t
            z = cfg.zone_by_id(best_id)
            self.state = IntentState.APPROACHING_CONTROL
            self._state_t0 = t
            self._emit("state_changed", False, f"Deliberate movement toward {z.label} (approach {best:.2f})", "APPROACHING")

    def _step_approaching(self, inp: InteractionInput) -> None:
        t, cfg = inp.timestamp, self.cfg
        self._last_activity = t
        self._maybe_report_stray_pinch(inp, "Pinch ignored: no device selected yet")
        if self._hovered:
            self._begin_selection(cfg.zone_by_id(self._hovered), t)
            return
        z = cfg.zone_by_id(self.target)
        s = self.traj.approach_score(z.center)
        if s > self._approach_peak.get(z.id, 0.0):
            self._approach_peak[z.id] = s
            self._approach_cons[z.id] = self.metrics.consistency
        if s < cfg.approach_threshold * 0.6:
            if self._approach_low_since is None:
                self._approach_low_since = t
            elif t - self._approach_low_since > 0.5:
                self.target = None
                self.state = IntentState.READY
                self._state_t0 = t
                self._emit("state_changed", False, "Approach abandoned — movement no longer directed at a control", "APPROACH_LOST")
        else:
            self._approach_low_since = None

    def _begin_selection(self, zone: Zone, t: float) -> None:
        self.target = zone.id
        self._sel_t0 = t
        direction = max(self._approach_peak.get(zone.id, 0.0), self.traj.approach_score(zone.center))
        self._sel_dir = direction
        if direction > 0.0:
            self._sel_cons = max(self._approach_cons.get(zone.id, 0.0), self.metrics.consistency)
        else:  # no directed approach: only credit consistency if the hand is genuinely still
            self._sel_cons = 0.0 if self.metrics.speed > 0.15 else self.metrics.consistency
        self._stab_ema = self.metrics.stability
        self._dwell = 0.0
        self._last_activity = t
        self.state = IntentState.SELECTING
        self._state_t0 = t
        self.action = toggle_action(zone.device, self._device_states().get(zone.device))
        self.confidence, self.components = self._score(False)
        self.selection_confidence = self.confidence
        self._emit("state_changed", False, f"Hand entered {zone.label} zone — evaluating dwell and stability", "SELECTING")

    def _step_selecting(self, inp: InteractionInput) -> None:
        t, cfg = inp.timestamp, self.cfg
        zone = cfg.zone_by_id(self.target)
        self._last_activity = t
        self._maybe_report_stray_pinch(inp, "Pinch ignored: selection not yet established")

        if self._hovered != self.target:
            if self._dwell < cfg.min_dwell_s:
                self._reject(t, f"Passed through {zone.label} without dwelling ({self._dwell:.2f}s < {cfg.min_dwell_s:.2f}s) — treated as transit movement", "TRANSIT")
            else:
                self._reject(t, f"Left {zone.label} before selection was established (confidence {self.selection_confidence:.2f})", "LEFT_ZONE")
            return

        self._dwell = self.traj.dwell(zone.id, t)
        self._stab_ema += 0.25 * (self.metrics.stability - self._stab_ema)
        self.selection_confidence, self.components = self._score(False)
        self.confidence = self.selection_confidence
        self.action = toggle_action(zone.device, self._device_states().get(zone.device))

        if self._dwell >= cfg.min_dwell_s:
            if self.metrics.stability < cfg.stability_threshold:
                self.reason, self.reason_code = f"Hand not stable enough ({self.metrics.stability:.2f} < {cfg.stability_threshold:.2f})", "UNSTABLE"
            elif self.selection_confidence < cfg.min_confidence:
                self.reason, self.reason_code = f"Confidence {self.selection_confidence:.2f} below minimum {cfg.min_confidence:.2f}", "LOW_CONFIDENCE"
            else:
                self.state = IntentState.AWAITING_CONFIRMATION
                self._state_t0 = t
                self._confirm_deadline = t + cfg.confirmation_timeout_s
                self._left_since = None
                self._emit("device_selected", False, f"{zone.label} selected", "SELECTED")
                self._emit("confirmation_required", False,
                           f"{zone.label}: pinch to confirm {self.action} (confidence {self.selection_confidence:.2f})", "AWAITING_CONFIRMATION")
                self._emit("state_changed", False, f"Awaiting deliberate confirmation: pinch to {self.action}", "AWAITING_CONFIRMATION")
                return
            if self._dwell >= cfg.min_dwell_s + cfg.ambiguity_window_s:
                self._reject(t, f"Selection ambiguous: {self.reason}", self.reason_code)
        else:
            self.reason, self.reason_code = f"Dwelling in {zone.label}: {self._dwell:.1f}s / {cfg.min_dwell_s:.1f}s", "DWELLING"

    def _step_awaiting(self, inp: InteractionInput) -> None:
        t, cfg, gm = inp.timestamp, self.cfg, self.cfg.gestures
        zone = cfg.zone_by_id(self.target)
        self._last_activity = t
        self._dwell = self.traj.dwell(zone.id, t) if self._hovered == self.target else self._dwell
        self._stab_ema += 0.1 * (self.metrics.stability - self._stab_ema)
        self.action = toggle_action(zone.device, self._device_states().get(zone.device))

        if self._hovered != self.target:
            if self._left_since is None:
                self._left_since = t
            elif t - self._left_since > cfg.leave_grace_s:
                self._finish(IntentState.CANCELLED, t, f"Selection abandoned — hand left {zone.label} zone", "SELECTION_ABANDONED", False)
                return
        else:
            self._left_since = None

        # the confirming pinch must BEGIN after the selection was established (no select+confirm in one gesture)
        h = self._holds.get(gm.confirm)
        pinching = bool(h) and self._hold(gm.confirm) >= cfg.confirm_pinch_hold_s and h[0] >= self._state_t0
        self.selection_confidence, self.components = self._score(False)
        if not pinching:
            self.confidence = self.selection_confidence
            return
        if self._hovered != self.target:
            if not self._pinch_reported:
                self._pinch_reported = True
                self._emit("rejected", False, f"Pinch ignored: hand is outside {zone.label} zone", "PINCH_OUTSIDE_ZONE")
            return

        # ---- CONFIRMING
        self.confidence, self.components = self._score(True, inp.pinch_distance)
        self.state = IntentState.CONFIRMING
        self._state_t0 = t
        self._emit("state_changed", False, "Pinch detected — validating command", "CONFIRMING")
        self._validate_and_dispatch(t, zone)

    def _validate_and_dispatch(self, t: float, zone: Zone) -> None:
        cfg = self.cfg
        if not self.active:
            return self._reject(t, "Interaction mode is not active", "NOT_ACTIVE")
        if self.confidence < cfg.min_confidence:
            return self._reject(t, f"Confirmation confidence {self.confidence:.2f} below minimum {cfg.min_confidence:.2f}", "LOW_CONFIDENCE")
        if t < self._cooldown_until:
            return self._reject(t, f"Cooldown active ({self._cooldown_until - t:.1f}s remaining)", "COOLDOWN")
        key = (zone.device, self.action)
        last = self._last_exec.get(key)
        if last is not None and t - last < cfg.duplicate_window_s:
            return self._reject(t, f"Duplicate command {zone.device}:{self.action} within {cfg.duplicate_window_s:.0f}s", "DUPLICATE")
        cmd = CommandRequest(
            command_id=str(uuid.uuid4()), device=zone.device, action=self.action or "",
            confidence=round(self.confidence, 4), timestamp=t,
        )
        self._pending_cmd = cmd
        self._last_exec[key] = t
        self._exec_deadline = t + cfg.execution_timeout_s
        self.state = IntentState.EXECUTING
        self._state_t0 = t
        self.accepted = True
        self._emit("command_request", True,
                   f"Intent validated (confidence {self.confidence:.2f}) — dispatching {zone.device}:{self.action}", "VALIDATED", command=cmd)
        self._emit("state_changed", True, "Awaiting device acknowledgement", "EXECUTING")

    def _maybe_report_stray_pinch(self, inp: InteractionInput, reason: str) -> None:
        gm = self.cfg.gestures
        if inp.gesture == gm.confirm and self._hold(gm.confirm) >= self.cfg.confirm_pinch_hold_s and not self._pinch_reported:
            self._pinch_reported = True
            self._emit("rejected", False, reason, "PINCH_NO_SELECTION")
