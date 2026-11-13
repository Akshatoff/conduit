import pytest

from backend.database.db import make_engine, make_session_factory
from backend.services.analytics import AnalyticsService, compute_metrics


def trial(label, executed=False, correct=False, ack=False, confirm=False, lat_n=0, lat_sum=0.0, e2e=None, sent=0, acked=0):
    return dict(label=label, executed=executed, correct=correct, ack_confirmed=ack, confirmation_requested=confirm,
                intent_latency_n=lat_n, intent_latency_sum_ms=lat_sum, e2e_latency_ms=e2e, commands_sent=sent, commands_acked=acked)


def test_empty_trials_give_undefined_not_fabricated_metrics():
    m = compute_metrics([])
    assert m["attempts"] == 0
    assert m["false_activation_rate"] is None and m["accidental_rejection_rate"] is None
    assert m["avg_intent_latency_ms"] is None and m["device_ack_rate"] is None


def test_metric_definitions_on_known_data():
    trials = [
        trial("intended", True, True, True, True, 10, 5.0, 300.0, 1, 1),     # success
        trial("intended", True, False, True, True, 10, 5.0, 100.0, 1, 1),    # wrong device
        trial("intended", False),                                              # missed
        trial("unintended", True, sent=1, acked=0),                           # false activation
        trial("unintended"), trial("unintended"), trial("unintended"),         # rejected accidental
    ]
    m = compute_metrics(trials)
    assert m["attempts"] == 7 and m["intended_trials"] == 3 and m["unintended_trials"] == 4
    assert m["accepted"] == 3 and m["rejected"] == 4
    assert m["successful_deliberate"] == 1 and m["deliberate_success_rate"] == pytest.approx(1 / 3)
    assert m["false_activations"] == 1 and m["false_activation_rate"] == pytest.approx(0.25)
    assert m["accidental_rejection_rate"] == pytest.approx(0.75)
    assert m["avg_intent_latency_ms"] == pytest.approx(10.0 / 20)
    assert m["avg_e2e_latency_ms"] == pytest.approx(200.0)
    assert m["device_ack_rate"] == pytest.approx(2 / 3)
    assert m["confirmation_request_rate"] == pytest.approx(2 / 7)


def test_rejecting_everything_does_not_look_accurate():
    m = compute_metrics([trial("intended"), trial("intended"), trial("unintended"), trial("unintended")])
    assert m["accidental_rejection_rate"] == 1.0
    assert m["deliberate_success_rate"] == 0.0   # the honest counter-metric


@pytest.fixture
def svc():
    return AnalyticsService(make_session_factory(make_engine("sqlite:///:memory:")))


def test_session_requires_start_and_valid_labels(svc):
    with pytest.raises(RuntimeError):
        svc.start_trial("intended", "lighting")
    svc.start_session("conduit")
    with pytest.raises(ValueError):
        svc.start_trial("intended", None)
    with pytest.raises(ValueError):
        svc.start_trial("bogus", "x")
    with pytest.raises(RuntimeError):
        svc.start_session("baseline")


def test_trial_recording_and_summary_and_csv(svc):
    svc.start_session("conduit")
    svc.start_trial("intended", "lighting", "deliberate")
    svc.record_engine_latency(2.0)
    svc.record_intent_event({"kind": "confirmation_required", "reason_code": "AWAITING_CONFIRMATION"})
    svc.record_command({"status": "CONFIRMED", "device": "lighting", "action": "ON", "acknowledged": True, "latency_ms": 120.0})
    svc.end_trial()
    svc.start_trial("unintended", None, "swipe")
    svc.record_intent_event({"kind": "rejected", "reason_code": "TRANSIT"})
    svc.end_trial()
    out = svc.stop_session()
    assert out["attempts"] == 2 and out["successes"] == 1 and out["unintended"] == 1
    s = svc.summary()
    assert s["has_data"] and s["by_mode"]["conduit"]["false_activation_rate"] == 0.0
    assert s["by_mode"]["baseline"]["attempts"] == 0
    csv_text = svc.export_csv()
    lines = csv_text.strip().splitlines()
    assert lines[0].startswith("session_id,mode,trial_id,label") and len(lines) == 3
    assert "TRANSIT" in csv_text


def test_summary_empty_state_has_no_data(svc):
    assert svc.summary()["has_data"] is False


def test_wrong_device_is_not_counted_correct(svc):
    svc.start_session("baseline")
    svc.start_trial("intended", "lighting")
    svc.record_command({"status": "CONFIRMED", "device": "access", "action": "UNLOCK", "acknowledged": True, "latency_ms": 50.0})
    svc.end_trial()
    m = svc.stop_session()["metrics"]
    assert m["accepted"] == 1 and m["successful_deliberate"] == 0
