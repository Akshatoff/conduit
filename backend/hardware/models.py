"""Device command / acknowledgement models and static device specifications."""
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
    ACKNOWLEDGED = "ACKNOWLEDGED"    # node acknowledged receipt/execution
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
    pin: int


# The Arduino Uno node drives exactly two isolated low-voltage outputs. There is no motor,
# fan or other actuator: removing a device here removes it from validation, the twin, the
# control zones, analytics targets and the firmware protocol in one place.
DEVICE_SPECS: Dict[str, DeviceSpec] = {
    "lighting": DeviceSpec(id="lighting", name="Lighting", type="led", hardware="LED on D3 (+220R)",
                           actions=["ON", "OFF"], states=["ON", "OFF"], safe_state="OFF", pin=3),
    "access": DeviceSpec(id="access", name="Access control", type="servo_latch",
                         hardware="SG90 servo on D9 (0 deg locked / 90 deg unlocked)",
                         actions=["LOCK", "UNLOCK"], states=["LOCKED", "UNLOCKED"], safe_state="LOCKED", pin=9),
}

ACTION_TO_STATE = {"ON": "ON", "OFF": "OFF", "LOCK": "LOCKED", "UNLOCK": "UNLOCKED"}

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
    executed_on: str = "simulation"
    digital: bool = False                    # digital mode-layer action (never physical hardware)
