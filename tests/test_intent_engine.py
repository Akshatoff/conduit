import pytest

from backend.intent.config import IntentConfig
from backend.intent.engine import IntentEngine, IntentState
from backend.intent.baseline import BaselineController
from backend.intent.engine import InteractionInput

from .scenarios import Driver

LIGHT_X, ACCESS_X = 0.25, 0.81


def select_and_await(d: Driver, zone_x=LIGHT_X):
    d.activate()
    d.deliberate_select(zone_x)
    assert d.state == "AWAITING_CONFIRMATION", (d.state, d.engine.reason, d.codes()[-5:])


# ------------------------------------------------------------------ activation
def test_open_palm_activates_after_hold():
    d = Driver()
    d.hold("open_palm", 0.5, 0.82, 0.3)
    assert d.state == "ACTIVATING" and not d.engine.active
    d.hold("open_palm", 0.5, 0.82, 0.8)
    assert d.engine.active and d.state == "READY"


def test_moving_open_palm_does_not_activate():
    d = Driver()
    for _ in range(3):  # waving the hand through the frame
        d.move("open_palm", (0.1, 0.8), (0.9, 0.8), 0.5)
        d.move("open_palm", (0.9, 0.8), (0.1, 0.8), 0.5)
    assert not d.engine.active
    assert d.state in ("IDLE", "ACTIVATING")
    assert d.commands == []


def test_brief_palm_flash_is_not_activation():
    d = Driver()
    d.hold("open_palm", 0.5, 0.82, 0.3)
    d.hold("fist", 0.5, 0.82, 0.5)
    assert not d.engine.active and d.state == "IDLE"


def test_fist_does_not_activate():
    d = Driver()
    d.hold("fist", 0.5, 0.82, 2.0)
    assert not d.engine.active


# ---------------------------------------------------------- deliberate success
def test_full_deliberate_interaction_executes_after_confirmation():
    d = Driver()
    select_and_await(d)
    assert d.engine.target == "lighting" and d.engine.action == "ON"
    assert d.commands == []                      # selection alone never executes
    sel = d.engine.selection_confidence
    assert sel >= d.engine.cfg.min_confidence
    d.pinch(LIGHT_X, 0.33)
    assert d.state == "EXECUTING"
    assert len(d.commands) == 1
    cmd = d.commands[0]
    assert (cmd.device, cmd.action, cmd.source) == ("lighting", "ON", "conduit_intent_engine")
    assert cmd.confidence >= d.engine.cfg.min_confidence
    d.engine.notify_command_result(True, "Device confirmed ON", d.t)
    assert d.state == "COMPLETED"


def test_each_zone_selects_its_device():
    for x, dev in ((LIGHT_X, "lighting"), (ACCESS_X, "access")):
        d = Driver()
        select_and_await(d, x)
        assert d.engine.target == dev


def test_action_is_toggle_of_confirmed_device_state():
    d = Driver(device_states={"lighting": "ON", "access": "LOCKED"})
    select_and_await(d, LIGHT_X)
    assert d.engine.action == "OFF"
    d2 = Driver(device_states={"access": "LOCKED"})
    select_and_await(d2, ACCESS_X)
    assert d2.engine.action == "UNLOCK"


def test_every_event_has_a_reason():
    d = Driver()
    select_and_await(d)
    d.pinch(LIGHT_X, 0.33)
    d.engine.notify_command_result(True, "ok", d.t)
    assert d.events and all(e.reason and e.reason_code for e in d.events)


# ------------------------------------------------------- accidental movement
def test_swipe_across_zones_is_rejected_as_transit():
    d = Driver()
    d.activate()
    d.move("open_palm", (0.02, 0.32), (0.98, 0.32), 0.7)
    d.hold("open_palm", 0.98, 0.32, 0.3)
    assert d.commands == []
    assert "TRANSIT" in d.codes()


def test_fast_pass_then_pinch_never_executes():
    d = Driver()
    d.activate()
    d.move("open_palm", (0.5, 0.85), (0.5, 0.2), 0.3)
    d.pinch(0.5, 0.2, 0.6)
    assert d.commands == []


def test_pinch_without_selection_is_ignored_and_logged():
    d = Driver()
    d.activate()
    d.pinch(0.5, 0.85, 0.8)
    assert d.commands == []
    assert "PINCH_NO_SELECTION" in d.codes()


def test_no_command_when_interaction_not_activated():
    d = Driver()
    d.move("point", (0.5, 0.85), (LIGHT_X, 0.33), 0.7)   # pointing hand: never activates the mode
    d.hold("point", LIGHT_X, 0.33, 1.2)
    d.pinch(LIGHT_X, 0.33)
    assert d.commands == [] and not d.engine.active


def test_resting_hand_placed_inside_zone_is_ambiguous_and_rejected():
    """Hand appears inside a zone without any directed approach -> low confidence."""
    d = Driver()
    d.hold("open_palm", 0.5, 0.82, 1.1)           # activate in the neutral area
    d.step("open_palm", 0.5, 0.82, hand=False)
    d.gone(0.4)
    d.hold("open_palm", LIGHT_X, 0.33, 3.5)            # reappears inside the zone
    assert d.commands == []
    assert d.state != "AWAITING_CONFIRMATION"


def test_jittery_hand_in_zone_does_not_progress():
    d = Driver()
    d.activate()
    d.jitter = 0.03                      # hand starts shaking after activation
    d.move("open_palm", (0.5, 0.82), (LIGHT_X, 0.33), 0.7)
    d.hold("open_palm", 0.5, 0.33, 1.5)
    assert d.state != "AWAITING_CONFIRMATION"
    assert d.commands == []


# ------------------------------------------------------------------ confirmation
def test_low_confidence_confirmation_is_rejected():
    cfg = IntentConfig(min_confidence=0.75)
    d = Driver(config=cfg)
    select_and_await(d)
    d.engine.cfg.min_confidence = 0.999   # tighten after selection
    d.pinch(LIGHT_X, 0.33)
    assert d.commands == []
    assert "LOW_CONFIDENCE" in d.codes()


def test_confirmation_timeout_cancels_without_executing():
    d = Driver()
    select_and_await(d)
    d.hold("open_palm", LIGHT_X, 0.33, d.engine.cfg.confirmation_timeout_s + 0.5)
    assert d.commands == []
    assert "CONFIRM_TIMEOUT" in d.codes()


def test_fist_cancels_pending_selection():
    d = Driver()
    select_and_await(d)
    d.hold("fist", LIGHT_X, 0.33, 0.6)
    assert "CANCELLED_FIST" in d.codes()
    d.pinch(LIGHT_X, 0.33)
    assert d.commands == []


def test_hand_leaving_zone_abandons_selection():
    d = Driver()
    select_and_await(d)
    d.move("open_palm", (LIGHT_X, 0.33), (LIGHT_X, 0.9), 0.3)
    d.hold("open_palm", LIGHT_X, 0.9, 1.5)
    assert "SELECTION_ABANDONED" in d.codes()
    assert d.commands == []


def test_pinch_outside_selected_zone_is_ignored():
    d = Driver()
    select_and_await(d)
    d.move("open_palm", (LIGHT_X, 0.33), (LIGHT_X, 0.72), 0.2)
    d.pinch(LIGHT_X, 0.72, 0.5)
    assert d.commands == []


def test_manual_cancel_api():
    d = Driver()
    select_and_await(d)
    d.events += d.engine.cancel(d.t)
    assert d.state == "CANCELLED" and d.commands == []


# ---------------------------------------------- cooldown / duplicate prevention
def complete_one(d: Driver, x=LIGHT_X):
    select_and_await(d, x)
    d.pinch(x, 0.33)
    assert d.state == "EXECUTING"
    d.engine.notify_command_result(True, "ok", d.t)


def test_cooldown_blocks_immediate_second_command():
    d = Driver()
    complete_one(d)
    n = len(d.commands)
    d.hold("open_palm", LIGHT_X, 0.33, 1.2)   # stays in zone: must exit to re-arm
    d.pinch(LIGHT_X, 0.33, 0.6)
    assert len(d.commands) == n


def test_no_repeated_selection_while_hand_stays_in_zone():
    d = Driver()
    complete_one(d)
    d.hold("open_palm", LIGHT_X, 0.33, 4.0)
    assert d.state in ("READY", "COMPLETED")
    assert len(d.commands) == 1


def test_duplicate_command_rejected_inside_window():
    cfg = IntentConfig(cooldown_s=0.1, duplicate_window_s=30.0)
    d = Driver(config=cfg)
    complete_one(d)
    d.states["lighting"] = "OFF"          # state not confirmed ON (e.g. device unchanged) -> same action again
    d.move("open_palm", (LIGHT_X, 0.33), (0.5, 0.82), 0.5)   # leave and re-arm
    d.hold("open_palm", 0.5, 0.82, 1.5)
    d.deliberate_select(LIGHT_X, start=(0.5, 0.82))
    if d.state == "AWAITING_CONFIRMATION":
        d.pinch(LIGHT_X, 0.33)
    assert len(d.commands) == 1
    assert "DUPLICATE" in d.codes()


def test_second_command_allowed_after_cooldown_and_rearm():
    cfg = IntentConfig(cooldown_s=1.0, duplicate_window_s=0.5)
    d = Driver(config=cfg)
    complete_one(d)
    d.states["lighting"] = "ON"
    d.move("open_palm", (LIGHT_X, 0.33), (0.5, 0.82), 0.5)
    d.hold("open_palm", 0.5, 0.82, 1.5)
    d.deliberate_select(LIGHT_X, start=(0.5, 0.82))
    assert d.state == "AWAITING_CONFIRMATION", (d.state, d.engine.reason)
    d.pinch(LIGHT_X, 0.33)
    assert len(d.commands) == 2 and d.commands[1].action == "OFF"


def test_device_failure_results_in_error_state():
    d = Driver()
    select_and_await(d)
    d.pinch(LIGHT_X, 0.33)
    d.engine.notify_command_result(False, "Device disconnected", d.t)
    assert d.state == "ERROR"


def test_execution_timeout_goes_to_error():
    d = Driver()
    select_and_await(d)
    d.pinch(LIGHT_X, 0.33)
    d.hold("pinch", LIGHT_X, 0.33, d.engine.cfg.execution_timeout_s + 0.5)
    assert "EXEC_TIMEOUT" in d.codes()


# ------------------------------------------------------- timeouts / emergency
def test_no_hand_timeout_deactivates():
    d = Driver()
    d.activate()
    d.gone(d.engine.cfg.no_hand_timeout_s + 0.5)
    assert not d.engine.active and d.state == "IDLE"
    assert "NO_HAND_TIMEOUT" in d.codes()


def test_tracking_loss_while_selecting_discards_selection():
    d = Driver()
    d.activate()
    d.move("open_palm", (0.5, 0.82), (LIGHT_X, 0.33), 0.5)
    d.gone(0.8)
    assert d.commands == []
    assert "TRACKING_LOST" in d.codes()


def test_interaction_timeout_deactivates():
    cfg = IntentConfig(interaction_timeout_s=3.0)
    d = Driver(config=cfg)
    d.activate()
    d.hold("point", 0.5, 0.85, 4.0)
    assert not d.engine.active
    assert "INTERACTION_TIMEOUT" in d.codes()


def test_sustained_fist_is_emergency_stop():
    d = Driver()
    d.activate()
    d.hold("fist", 0.5, 0.85, 1.2)
    assert not d.engine.active
    assert "EMERGENCY_STOP" in d.codes()


def test_still_open_palm_deactivates_after_rearm():
    d = Driver()
    d.activate()
    d.move("open_palm", (0.5, 0.82), (0.55, 0.88), 0.4)     # movement re-arms
    d.hold("open_palm", 0.55, 0.88, 2.6)
    assert not d.engine.active
    assert "PALM_DEACTIVATE" in d.codes()


def test_api_deactivate_and_activate():
    d = Driver()
    d.events += d.engine.activate(d.t)
    assert d.engine.active
    d.events += d.engine.deactivate(d.t)
    assert not d.engine.active and d.state == "IDLE"


# --------------------------------------------------------------- configurable
def test_gesture_mapping_is_configurable():
    cfg = IntentConfig()
    cfg.gestures.cancel = "point"
    d = Driver(config=cfg)
    select_and_await(d)
    d.hold("point", LIGHT_X, 0.33, 0.6)
    assert "CANCELLED_FIST" in d.codes()    # code kept, gesture is whatever is mapped


def test_engine_is_independent_of_vision():
    """The engine can be driven directly with structured data (no landmarks)."""
    e = IntentEngine()
    t = 0.0
    for _ in range(40):
        t += 1 / 30
        e.update(InteractionInput(timestamp=t, hand_detected=True, x=0.5, y=0.8, gesture="open_palm"))
    assert e.active


# ------------------------------------------------------------------ baseline
def test_baseline_maps_gestures_directly_without_intent():
    b = BaselineController()
    cmds = []
    for i, g in enumerate(["none", "open_palm", "open_palm", "fist"]):
        cmds += b.update(InteractionInput(timestamp=i * 1.5, hand_detected=g != "none", gesture=g))
    assert [c.device for c in cmds] == ["lighting", "access"]
    assert all(c.source == "baseline_gesture" for c in cmds)
