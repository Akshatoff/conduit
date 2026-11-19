"""Persist application settings as JSON (no secrets, no personal data)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from backend.models.schemas import AppSettings


def settings_path() -> Path:
    return Path(os.getenv("CONDUIT_SETTINGS", "data/settings.json"))


def load_settings(path: Path | None = None) -> AppSettings:
    path = path or settings_path()
    s = AppSettings()
    if path.exists():
        try:
            s = AppSettings.model_validate(json.loads(path.read_text()))
        except Exception:
            s = AppSettings()  # corrupt file -> defaults
    # environment overrides (see .env.example)
    if os.getenv("CONDUIT_SERIAL_PORT"):
        s.arduino.port = os.environ["CONDUIT_SERIAL_PORT"]
    if os.getenv("CONDUIT_SERIAL_BAUD"):
        s.arduino.baud = int(os.environ["CONDUIT_SERIAL_BAUD"])
    if os.getenv("CONDUIT_CAMERA_INDEX"):
        s.camera.index = int(os.environ["CONDUIT_CAMERA_INDEX"])
    if os.getenv("CONDUIT_MODE") in ("simulation", "hardware"):
        s.hardware_mode = os.environ["CONDUIT_MODE"]  # type: ignore[assignment]
    s.privacy.store_video = False
    return s


def save_settings(s: AppSettings, path: Path | None = None) -> None:
    path = path or settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(s.model_dump_json(indent=2))
