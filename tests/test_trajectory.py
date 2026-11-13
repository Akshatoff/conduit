import pytest

from backend.intent.trajectory import TrajectoryAnalyzer


def feed(traj, pts, dt=1 / 30, t0=0.0):
    for i, (x, y) in enumerate(pts):
        traj.add(t0 + i * dt, x, y)


def line(p0, p1, n):
    return [(p0[0] + (p1[0] - p0[0]) * i / (n - 1), p0[1] + (p1[1] - p0[1]) * i / (n - 1)) for i in range(n)]


def test_distance_and_straight_line_consistency():
    t = TrajectoryAnalyzer()
    feed(t, line((0.1, 0.5), (0.6, 0.5), 30))
    m = t.metrics()
    assert m.path_length == pytest.approx(0.5, abs=1e-6)
    assert m.consistency == pytest.approx(1.0, abs=1e-6)
    assert m.direction[0] == pytest.approx(1.0, abs=1e-6)


def test_zigzag_has_low_consistency():
    t = TrajectoryAnalyzer()
    pts = [(0.3 + (0.2 if i % 2 else 0.0), 0.5) for i in range(30)]
    feed(t, pts)
    assert t.metrics().consistency < 0.2


def test_speed_estimate():
    t = TrajectoryAnalyzer()
    feed(t, line((0.0, 0.5), (0.3, 0.5), 31), dt=1 / 30)  # 0.3 units in 1 s
    assert t.metrics().speed == pytest.approx(0.3, rel=0.05)


def test_stability_still_vs_moving():
    still, moving = TrajectoryAnalyzer(), TrajectoryAnalyzer()
    feed(still, [(0.5 + 0.001 * (i % 2), 0.5) for i in range(30)])
    feed(moving, line((0.2, 0.5), (0.8, 0.5), 30))
    assert still.metrics().stability > 0.9
    assert moving.metrics().stability < 0.1


def test_approach_score_towards_and_away():
    t = TrajectoryAnalyzer()
    feed(t, line((0.5, 0.9), (0.5, 0.6), 20))
    assert t.approach_score((0.5, 0.3)) > 0.9
    assert t.approach_score((0.5, 1.0)) == 0.0          # moving away
    assert t.approach_score((0.95, 0.9)) < 0.3          # lateral target


def test_approach_requires_real_movement():
    t = TrajectoryAnalyzer()
    feed(t, [(0.5, 0.8)] * 20)
    assert t.approach_score((0.5, 0.3)) == 0.0


def test_zone_dwell_resets_when_leaving():
    t = TrajectoryAnalyzer()
    t.update_zone("a", 1.0)
    assert t.dwell("a", 1.7) == pytest.approx(0.7)
    t.update_zone(None, 1.8)
    t.update_zone("a", 2.0)
    assert t.dwell("a", 2.1) == pytest.approx(0.1)


def test_rolling_window_discards_old_samples():
    t = TrajectoryAnalyzer(window_s=1.0)
    feed(t, [(0.1, 0.1)] * 90)
    assert t.metrics().duration <= 1.0 + 1e-6


def test_out_of_order_samples_ignored():
    t = TrajectoryAnalyzer()
    t.add(1.0, 0.1, 0.1)
    t.add(0.5, 0.9, 0.9)
    assert len(t.samples) == 1
