"""Device command / acknowledgement models and static device specifications.

The "physical node" is now an **Android phone on a USB cable**, driven from the computer with
ADB (Android Debug Bridge). The project's physical outputs are three things the phone can really
do — torch, vibration and a full-brightness screen flash — and nothing else: no motors, no locks,
no mains switching, and no phone rooting.

Two of the three outputs cannot be queried back through ADB (see ``independently_readable``), so a
command to them stops at ACKNOWLEDGED with ``verified=False`` instead of pretending to be
CONFIRMED. The screen brightness *can* be read back, and that one is confirmed from the device.
"""
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class CommandStatus(str, Enum):
    PENDING = "PENDING"
    REJECTED = "REJECTED"            # failed validation, never sent
    SENT = "SENT"                    # command sent, no acknowledgement yet
    ACKNOWLEDGED = "ACKNOWLEDGED"    # node acknowledged execution (no independent read-back available)
    CONFIRMED = "CONFIRMED"          # device state independently read back and matches
    FAILED = "FAILED"
    DISCONNECTED = "DISCONNECTED"


class DeviceSpec(BaseModel):
    id: str
    name: str
    type: str
    hardware: str
    actions: List[str]
    states: List[str]
    safe_state: str
    #: ADB shell command the node uses (documented in docs/HARDWARE.md and shown in the UI).
    adb_command: str
    #: True when the phone lets us query the output back, so a command can reach CONFIRMED.
    independently_readable: bool = False
    #: Shown in the twin when a command can only be acknowledged.
    readback_note: str = ""


# Exactly three outputs, all of them real phone hardware. Removing one here removes it from
# validation, the twin, the control zones, analytics targets and the node in one place.
DEVICE_SPECS: Dict[str, DeviceSpec] = {
    "torch": DeviceSpec(
        id="torch", name="Phone torch", type="flashlight",
        hardware="Rear camera torch (LED) via ADB",
        actions=["ON", "OFF"], states=["ON", "OFF"], safe_state="OFF",
        adb_command="adb shell cmd torch set on|off",
        readback_note="ADB on most phones cannot report torch state; falls back to a screen flash when the torch is not exposed.",
    ),
    "screen": DeviceSpec(
        id="screen", name="Screen flash", type="display",
        hardware="Display backlight at full brightness + wake",
        actions=["ON", "OFF"], states=["ON", "OFF"], safe_state="OFF",
        adb_command="adb shell settings put system screen_brightness 255",
        independently_readable=True,
    ),
    "vibration": DeviceSpec(
        id="vibration", name="Vibration", type="haptic",
        hardware="Phone vibration motor (repeating pulse)",
        actions=["ON", "OFF"], states=["ON", "OFF"], safe_state="OFF",
        adb_command="adb shell cmd vibrator vibrate 700",
        readback_note="The vibration motor has no readable state over ADB; the node reports how many pulses it sent.",
    ),
}

ACTION_TO_STATE = {"ON": "ON", "OFF": "OFF"}

# Sources that may reach physical hardware. Everything else is simulation-only.
HARDWARE_SOURCES = {"conduit_intent_engine", "manual_test"}


class DeviceCommand(BaseModel):
    command_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device: str
    action: str
    source: str = "conduit_intent_engine"
    confidence: Optional[float] = None
    created_at: float = Field(default_factory=time.time)

    def wire(self) -> dict:
        """The structured message actually sent to a node."""
        return {"command_id": self.command_id, "device": self.device, "action": self.action, "source": self.source}


class DeviceAck(BaseModel):
    command_id: str
    device: str
    status: str                       # "ACKNOWLEDGED" | "REJECTED" | "FAILED"
    actual_state: Optional[str] = None
    detail: Optional[str] = None
    simulated: bool = False
    verified: bool = False            # the node could read this output back independently


class CommandResult(BaseModel):
    command_id: str
    device: str
    action: str
    source: str
    status: CommandStatus
    detail: str
    confirmed_state: Optional[str] = None
    simulated: bool = False
    latency_ms: Optional[float] = None       # command issued -> state confirmed (or failure)
    ack_latency_ms: Optional[float] = None   # command sent -> ack received
    acknowledged: bool = False
    verified: bool = False                   # independent read-back agreed (else ACK only)
    executed_on: str = "simulation"
    digital: bool = False                    # digital mode-layer action (never physical hardware)
