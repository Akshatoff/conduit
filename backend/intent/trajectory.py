"""Trajectory analysis over a rolling time window.

This module is deliberately free of any vision / MediaPipe dependency: it consumes
(timestamp, x, y) samples in normalised space and can therefore be fed by any input
modality (camera, pointer, replayed recording, synthetic test sequences).
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, Optional, Tuple


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


@dataclass
class TrajectoryMetrics:
    n: int = 0
    duration: float = 0.0          # seconds covered by the window
    path_length: float = 0.0       # total distance travelled (normalised units)
    displacement: float = 0.0      # straight-line start->end distance
    consistency: float = 1.0       # displacement / path_length (1 = perfectly straight)
    speed: float = 0.0             # units / second over the velocity window
    direction: Tuple[float, float] = (0.0, 0.0)  # unit vector of recent motion
    stability: float = 0.0         # 1 = still, 0 = moving/jittery

    def to_dict(self) -> dict:
        d = asdict(self)
        d["direction"] = [round(self.direction[0], 4), round(self.direction[1], 4)]
        return d


class TrajectoryAnalyzer:
    def __init__(
        self,
        window_s: float = 1.5,
        stability_window_s: float = 0.4,
        velocity_window_s: float = 0.25,
        approach_window_s: float = 0.8,
        jitter_ref: float = 0.03,
    ) -> None:
        self.window_s = window_s
        self.stability_window_s = stability_window_s
        self.velocity_window_s = velocity_window_s
        self.approach_window_s = approach_window_s
        self.jitter_ref = jitter_ref
        self.samples: Deque[Tuple[float, float, float]] = deque()
        self._zone: Optional[str] = None
        self._zone_since: float = 0.0

    # ------------------------------------------------------------------ input
    def add(self, t: float, x: float, y: float) -> None:
        if self.samples and t <= self.samples[-1][0]:
            return  # ignore out-of-order / duplicate timestamps
        self.samples.append((t, x, y))
        while self.samples and t - self.samples[0][0] > self.window_s:
            self.samples.popleft()

    def reset(self) -> None:
        self.samples.clear()
        self._zone = None

    # --------------------------------------------------------------- analysis
    def _since(self, seconds: float):
        if not self.samples:
            return []
        t_end = self.samples[-1][0]
        return [s for s in self.samples if t_end - s[0] <= seconds]

    def metrics(self) -> TrajectoryMetrics:
        pts = list(self.samples)
        if len(pts) < 2:
            return TrajectoryMetrics(n=len(pts))
        path = 0.0
        for a, b in zip(pts, pts[1:]):
            path += math.hypot(b[1] - a[1], b[2] - a[2])
        disp = math.hypot(pts[-1][1] - pts[0][1], pts[-1][2] - pts[0][2])
        consistency = 1.0 if path < 0.02 else _clamp(disp / path)

        vw = self._since(self.velocity_window_s)
        speed = 0.0
        if len(vw) >= 2 and vw[-1][0] > vw[0][0]:
            d = sum(math.hypot(b[1] - a[1], b[2] - a[2]) for a, b in zip(vw, vw[1:]))
            speed = d / (vw[-1][0] - vw[0][0])

        dw = self._since(0.4)
        direction = (0.0, 0.0)
        if len(dw) >= 2:
            dx, dy = dw[-1][1] - dw[0][1], dw[-1][2] - dw[0][2]
            m = math.hypot(dx, dy)
            if m > 0.01:
                direction = (dx / m, dy / m)

        sw = self._since(self.stability_window_s)
        stability = 0.0
        if len(sw) >= 3:
            mx = sum(s[1] for s in sw) / len(sw)
            my = sum(s[2] for s in sw) / len(sw)
            rms = math.sqrt(sum((s[1] - mx) ** 2 + (s[2] - my) ** 2 for s in sw) / len(sw))
            stability = _clamp(1.0 - rms / self.jitter_ref)

        return TrajectoryMetrics(
            n=len(pts),
            duration=pts[-1][0] - pts[0][0],
            path_length=path,
            displacement=disp,
            consistency=consistency,
            speed=speed,
            direction=direction,
            stability=stability,
        )

    def approach_score(self, target: Tuple[float, float], min_move: float = 0.04) -> float:
        """How strongly recent movement is heading *towards* ``target`` (0..1).

        = max(0, cos(angle between motion and target vector)) * path straightness,
        and 0 unless the hand is actually closing the distance.
        """
        w = self._since(self.approach_window_s)
        if len(w) < 3:
            return 0.0
        first, last = w[0], w[-1]
        dx, dy = last[1] - first[1], last[2] - first[2]
        move = math.hypot(dx, dy)
        if move < min_move:
            return 0.0
        vx, vy = target[0] - first[1], target[1] - first[2]
        vm = math.hypot(vx, vy)
        if vm < 1e-6:
            return 0.0
        cos = (dx * vx + dy * vy) / (move * vm)
        closing = vm - math.hypot(target[0] - last[1], target[1] - last[2])
        if closing <= 0:
            return 0.0
        path = sum(math.hypot(b[1] - a[1], b[2] - a[2]) for a, b in zip(w, w[1:]))
        straight = _clamp(move / path) if path > 1e-6 else 1.0
        return _clamp(max(0.0, cos) * straight)

    # ------------------------------------------------------------- zone dwell
    def update_zone(self, zone_id: Optional[str], t: float) -> None:
        if zone_id != self._zone:
            self._zone = zone_id
            self._zone_since = t

    def dwell(self, zone_id: str, t: float) -> float:
        return max(0.0, t - self._zone_since) if self._zone == zone_id else 0.0

    @property
    def current_zone(self) -> Optional[str]:
        return self._zone
