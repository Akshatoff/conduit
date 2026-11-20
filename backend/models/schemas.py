"""Pydantic models for API requests and WebSocket events."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from backend.intent.config import IntentConfig

EVENT_TYPES = [
    "snapshot", "camera_status", "hand_landmarks", "trajectory_update", "gesture_detected", "intent_state_changed",
    "device_selected", "confirmation_required", "command_sent", "command_acknowledged", "command_rejected",
    "device_state_changed", "analytics_updated", "settings_changed", "system_error",
    "mode_action", "workspace_changed",
]


class Envelope(BaseModel):
    type: str
    timestamp: float = Field(default_factory=time.time)
    data: Dict[str, Any] = Field(default_factory=dict)


class Point(BaseModel):
    x: float
    y: float


class VisionFrame(BaseModel):
    """Structured output of the Spatial Perception Engine (one per processed camera frame)."""
    timestamp: float
    hand_detected: bool
    handedness: Optional[str] = None
    position: Optional[Point] = None
    gesture: str = "none"
    pinch_distance: Optional[float] = None
    velocity: float = 0.0
    stability: float = 0.0
    fps: float = 0.0
    tracking_quality: float = 0.0
    features: Optional[Dict[str, Any]] = None
    # Optional second hand for view-only mode signatures; never consumed by the Intent Engine.
    second_hand: Optional[Dict[str, Any]] = None


# ------------------------------------------------------------------ requests
class ClientMessage(BaseModel):
    """Messages the browser may send over the WebSocket."""
    type: Literal["ping", "activate", "deactivate", "cancel", "snapshot"]


class DeviceTestRequest(BaseModel):
    action: str


class SessionStartRequest(BaseModel):
    mode: Literal["baseline", "conduit"]
    note: str = ""
    workspace: Optional[str] = Field(None, max_length=40)


class TrialStartRequest(BaseModel):
    label: Literal["intended", "unintended"]
    target: Optional[str] = None
    scenario: str = ""


class InteractionModeRequest(BaseModel):
    mode: Literal["baseline", "conduit"]


class VisionStartRequest(BaseModel):
    camera_index: Optional[int] = None


class HardwareModeRequest(BaseModel):
    mode: Literal["simulation", "hardware"]


class FaultRequest(BaseModel):
    offline: bool


# ------------------------------------------------------------------ settings
class PhoneSettings(BaseModel):
    """USB link to the Android phone node (adb + optional device serial).

    Leave ``adb_path`` blank to use ``adb`` from PATH (or the usual Android SDK locations).
    Leave ``serial`` blank to use the first phone that adb reports as ready.
    """

    adb_path: str = Field("", max_length=400)
    serial: str = Field("", max_length=120)
    timeout_s: float = Field(8.0, ge=0.5, le=30.0)
    pulse_ms: int = Field(700, ge=50, le=5000)


class CameraSettings(BaseModel):
    index: int = 0
    width: int = 640
    height: int = 480
    smoothing_alpha: float = Field(0.5, ge=0.1, le=1.0)


class PrivacySettings(BaseModel):
    preview_stream: bool = True           # MJPEG preview to the local UI (never stored)
    store_video: bool = False             # always False; no code path writes frames to disk
    log_landmarks: bool = False


class AppSettings(BaseModel):
    workspace_mode: str = Field("hospital", max_length=40)   # active operational environment
    hardware_mode: Literal["simulation", "hardware"] = "simulation"
    interaction_mode: Literal["baseline", "conduit"] = "conduit"
    phone: PhoneSettings = Field(default_factory=PhoneSettings)
    camera: CameraSettings = Field(default_factory=CameraSettings)
    privacy: PrivacySettings = Field(default_factory=PrivacySettings)
    intent: IntentConfig = Field(default_factory=IntentConfig)
