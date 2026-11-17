"""Configuration for the Conduit Intent Engine.

Everything that influences whether a movement is accepted or rejected lives here so
it can be tuned from the Settings screen and documented in one place.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Zone(BaseModel):
    """A rectangular virtual control zone in normalised (0..1) mirrored-camera space."""

    id: str
    label: str
    device: str
    x0: float
    y0: float
    x1: float
    y1: float
    # Optional mode-layer metadata (ignored by the intent maths, used by the UI).
    action: Optional[str] = None      # explicit command action; None = toggle the device state
    kind: str = "physical"            # "physical" (ESP32 node) or "digital" (mode UI control)
    hint: str = ""                    # short helper text for the mode dashboard

    def contains(self, x: float, y: float, margin: float = 0.0) -> bool:
        return (self.x0 - margin) <= x <= (self.x1 + margin) and (self.y0 - margin) <= y <= (self.y1 + margin)

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x0 + self.x1) / 2.0, (self.y0 + self.y1) / 2.0)


def default_zones() -> List[Zone]:
    return [
        Zone(id="lighting", label="Lighting", device="lighting", x0=0.05, y0=0.10, x1=0.33, y1=0.55),
        Zone(id="ventilation", label="Ventilation", device="ventilation", x0=0.36, y0=0.10, x1=0.64, y1=0.55),
        Zone(id="access", label="Access control", device="access", x0=0.67, y0=0.10, x1=0.95, y1=0.55),
    ]


def default_weights() -> Dict[str, float]:
    return {
        "consistency": 0.15,
        "direction": 0.25,
        "stability": 0.20,
        "dwell": 0.15,
        "tracking": 0.10,
        "activation": 0.05,
        "gesture": 0.10,
    }


class GestureMap(BaseModel):
    """Configurable mapping of the four primary interactions to gesture labels."""

    activate: str = "open_palm"  # also toggles interaction mode off (when held still outside a zone)
    confirm: str = "pinch"
    cancel: str = "fist"


class IntentConfig(BaseModel):
    # --- headline thresholds (exposed in the UI) ---
    min_confidence: float = Field(0.75, ge=0.0, le=1.0)
    min_dwell_s: float = Field(0.6, ge=0.05, le=5.0)
    stability_threshold: float = Field(0.6, ge=0.0, le=1.0)
    confirmation_timeout_s: float = Field(6.0, ge=1.0, le=60.0)
    cooldown_s: float = Field(2.0, ge=0.0, le=30.0)

    # --- temporal validation ---
    activation_hold_s: float = 0.7
    deactivation_hold_s: float = 2.0
    cancel_hold_s: float = 0.35
    emergency_hold_s: float = 0.8
    confirm_pinch_hold_s: float = 0.2
    gesture_grace_s: float = 0.15
    no_hand_timeout_s: float = 3.0
    interaction_timeout_s: float = 30.0
    execution_timeout_s: float = 6.0
    result_hold_s: float = 1.0
    leave_grace_s: float = 0.8
    ambiguity_window_s: float = 2.0
    duplicate_window_s: float = 4.0

    # --- spatial ---
    zone_margin: float = 0.03
    approach_threshold: float = 0.5
    approach_full_score: float = 0.8
    activation_stability: float = 0.5

    weights: Dict[str, float] = Field(default_factory=default_weights)
    gestures: GestureMap = Field(default_factory=GestureMap)
    zones: List[Zone] = Field(default_factory=default_zones)

    def zone_by_id(self, zone_id: Optional[str]) -> Optional[Zone]:
        for z in self.zones:
            if z.id == zone_id:
                return z
        return None


# Toggle actions per device given its confirmed state.
def toggle_action(device: str, current_state: Optional[str], action: Optional[str] = None) -> str:
    """Resolve the command action for a control.

    A zone may declare an explicit action (needed for digital mode controls such as
    ``OPEN_RECORD``); otherwise the historical toggle behaviour is used. Existing callers
    that pass only (device, state) keep working unchanged.
    """
    if action:
        return action
    if device == "access":
        return "LOCK" if current_state == "UNLOCKED" else "UNLOCK"
    return "OFF" if current_state == "ON" else "ON"
