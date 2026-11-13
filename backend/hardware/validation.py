"""Command validation applied identically in simulation and hardware mode."""
from __future__ import annotations

from typing import Optional, Tuple

from .models import DEVICE_SPECS, DeviceCommand

KNOWN_SOURCES = {"conduit_intent_engine", "baseline_gesture", "manual_test"}


def validate_command(cmd: DeviceCommand, min_confidence: float = 0.0) -> Tuple[bool, Optional[str]]:
    spec = DEVICE_SPECS.get(cmd.device)
    if spec is None:
        return False, f"Unknown device '{cmd.device}'"
    if cmd.action not in spec.actions:
        return False, f"Action '{cmd.action}' is not valid for {spec.name} (allowed: {', '.join(spec.actions)})"
    if cmd.source not in KNOWN_SOURCES:
        return False, f"Unknown command source '{cmd.source}'"
    if not cmd.command_id:
        return False, "Missing command_id"
    if cmd.source == "conduit_intent_engine":
        # commands from the Intent Engine must carry an intent confidence that clears the threshold
        if cmd.confidence is None:
            return False, "Intent command carries no confidence value"
        if cmd.confidence < min_confidence:
            return False, f"Intent confidence {cmd.confidence:.2f} below minimum {min_confidence:.2f}"
    return True, None
