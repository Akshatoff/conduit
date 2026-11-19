"""Mode A — conventional gesture control (experimental baseline).

Gesture detected -> command issued. No activation, no trajectory analysis, no dwell, no
confirmation. It exists only so Conduit can be compared against the naive approach in a
controlled test protocol. Commands produced here are flagged ``source="baseline_gesture"``
and the device controller refuses to route them to physical hardware.
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from .config import toggle_action
from .engine import CommandRequest, InteractionInput

DEFAULT_MAPPING = {"open_palm": "lighting", "fist": "access"}


class BaselineController:
    def __init__(self, mapping: Optional[Dict[str, str]] = None, min_interval_s: float = 1.0, device_states=None) -> None:
        self.mapping = mapping or dict(DEFAULT_MAPPING)
        self.min_interval_s = min_interval_s  # only to avoid per-frame spam; no intent logic
        self._device_states = device_states or (lambda: {})
        self._prev: str = "none"
        self._last_fire: float = -1e9

    def reset(self) -> None:
        self._prev = "none"
        self._last_fire = -1e9

    def update(self, inp: InteractionInput) -> List[CommandRequest]:
        out: List[CommandRequest] = []
        g = inp.gesture if inp.hand_detected else "none"
        if g != self._prev and g in self.mapping and inp.timestamp - self._last_fire >= self.min_interval_s:
            device = self.mapping[g]
            action = toggle_action(device, self._device_states().get(device))
            out.append(CommandRequest(
                command_id=str(uuid.uuid4()), device=device, action=action,
                confidence=1.0, timestamp=inp.timestamp, source="baseline_gesture",
            ))
            self._last_fire = inp.timestamp
        self._prev = g
        return out
