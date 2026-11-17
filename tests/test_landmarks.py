import pytest

from backend.vision.landmarks import PositionSmoother, extract_features
from backend.vision.synthetic import make_hand


@pytest.mark.parametrize("gesture", ["open_palm", "pinch", "fist", "point"])
def test_gesture_classification_on_synthetic_hands(gesture):
    f = extract_features(make_hand(gesture, 0.5, 0.5))
    assert f.gesture == gesture


@pytest.mark.parametrize("angle", [-40, -15, 0, 20, 45])
@pytest.mark.parametrize("scale", [0.12, 0.22, 0.32])
def test_gesture_is_rotation_and_scale_invariant(angle, scale):
    for g in ("open_palm", "pinch", "fist"):
        assert extract_features(make_hand(g, 0.4, 0.6, scale=scale, angle_deg=angle)).gesture == g


def test_palm_centre_matches_requested_position():
    f = extract_features(make_hand("open_palm", 0.31, 0.77))
    assert f.palm_center == pytest.approx([0.31, 0.77], abs=1e-6)
    assert len(f.landmarks) == 21


def test_finger_extension_state():
    open_f = extract_features(make_hand("open_palm", 0.5, 0.5))
    fist_f = extract_features(make_hand("fist", 0.5, 0.5))
    assert all(open_f.fingers_extended[k] for k in ("index", "middle", "ring", "pinky"))
    assert not any(fist_f.fingers_extended[k] for k in ("index", "middle", "ring", "pinky"))


def test_pinch_distance_and_openness_ordering():
    pinch = extract_features(make_hand("pinch", 0.5, 0.5))
    open_ = extract_features(make_hand("open_palm", 0.5, 0.5))
    fist = extract_features(make_hand("fist", 0.5, 0.5))
    assert pinch.pinch_distance < 0.3 < open_.pinch_distance
    assert open_.openness > 0.8 > 0.3 > fist.openness


def test_orientation_estimate_follows_rotation():
    up = extract_features(make_hand("open_palm", 0.5, 0.5, angle_deg=0))
    tilted = extract_features(make_hand("open_palm", 0.5, 0.5, angle_deg=30))
    assert abs(up.orientation_deg) < 1
    assert tilted.orientation_deg == pytest.approx(30, abs=2) or tilted.orientation_deg == pytest.approx(-30, abs=2)


def test_invalid_landmark_shape_rejected():
    with pytest.raises(ValueError):
        extract_features([[0.1, 0.2]] * 10)


def test_smoother_reduces_jitter():
    s = PositionSmoother(alpha=0.4)
    outs = [s.update(0.5 + (0.02 if i % 2 else -0.02), 0.5)[0] for i in range(30)]
    assert max(outs[10:]) - min(outs[10:]) < 0.02


def test_feature_dict_exposes_landmarks_for_the_optional_second_hand():
    """Signature screens draw the second hand; the Intent Engine still uses only the primary one."""
    f = extract_features(make_hand("open_palm", 0.62, 0.44), "Left", 0.93, 1.0)
    d = f.to_dict()
    assert len(d["landmarks"]) == 21
    assert d["landmarks"][0] == f.landmarks[0]
    assert d["handedness"] == "Left"
