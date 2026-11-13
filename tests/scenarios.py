"""Repeatable synthetic interaction scenarios (the automated half of the test protocol).

Frames are generated from synthetic landmarks, pushed through the real landmark feature
extractor and then into the Intent Engine - no camera or hardware involved.
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

from backend.intent.engine import IntentEngine, IntentEvent, InteractionInput
from backend.intent.config import IntentConfig
from backend.vision.landmarks import extract_features
from backend.vision.synthetic import make_hand

FPS = 30


class Driver:
    def __init__(self, engine: Optional[IntentEngine] = None, config: Optional[IntentConfig] = None,
                 device_states=None, jitter: float = 0.002, start_t: float = 100.0, runtime=None):
        self.states = device_states if device_states is not None else {}
        self.runtime = runtime
        if runtime is not None:
            engine = runtime.engine
            runtime.clock = lambda: self.t
        self.engine = engine or IntentEngine(config or IntentConfig(), device_states=lambda: self.states)
        self.t = start_t
        self.dt = 1.0 / FPS
        self.i = 0
        self.jitter = jitter
        self.events: List[IntentEvent] = []
        self.commands = []
        self.last = None

    # ---------------------------------------------------------------- frames
    def step(self, gesture: str, x: float, y: float, hand: bool = True):
        self.i += 1
        self.t += self.dt
        if not hand:
            inp = InteractionInput(timestamp=self.t, hand_detected=False)
        else:
            jx = self.jitter * math.sin(self.i * 1.7)
            jy = self.jitter * math.cos(self.i * 2.3)
            f = extract_features(make_hand(gesture, x + jx, y + jy), "Right", 0.97, 1.0)
            inp = InteractionInput(
                timestamp=self.t, hand_detected=True,
                x=f.palm_center[0], y=f.palm_center[1],
                gesture=f.gesture, pinch_distance=f.pinch_distance,
                tracking_quality=f.tracking_confidence,
            )
        if self.runtime is not None:
            self.runtime.process_input(inp)
            return None
        res = self.engine.update(inp)
        self.events += res.events
        self.commands += res.commands
        self.last = res
        return res

    def hold(self, gesture: str, x: float, y: float, secs: float):
        for _ in range(int(secs * FPS)):
            self.step(gesture, x, y)

    def move(self, gesture: str, p0: Tuple[float, float], p1: Tuple[float, float], secs: float):
        n = max(1, int(secs * FPS))
        for k in range(1, n + 1):
            a = k / n
            self.step(gesture, p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a)

    def gone(self, secs: float):
        for _ in range(int(secs * FPS)):
            self.step("none", 0, 0, hand=False)

    # -------------------------------------------------------------- helpers
    @property
    def state(self) -> str:
        return self.engine.state.value

    def codes(self) -> List[str]:
        return [e.reason_code for e in self.events]

    def activate(self, at=(0.5, 0.82)):
        self.hold("open_palm", at[0], at[1], 1.1)
        assert self.engine.active, f"activation failed: {self.engine.reason}"

    def deliberate_select(self, zone_x: float, start=(0.5, 0.82)):
        """Smooth, purposeful movement into a zone followed by a still dwell."""
        self.move("open_palm", start, (zone_x, 0.33), 0.7)
        self.hold("open_palm", zone_x, 0.33, 1.2)

    def pinch(self, x: float, y: float, secs: float = 0.5):
        self.hold("pinch", x, y, secs)
