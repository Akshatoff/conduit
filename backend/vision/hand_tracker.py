"""MediaPipe hand tracking wrapper.

Uses the MediaPipe *Tasks* HandLandmarker (downloads the ~8 MB ``hand_landmarker.task`` model once,
then runs fully offline). Falls back to the legacy ``mp.solutions.hands`` API if the Tasks model is
unavailable and the installed MediaPipe still ships it. All inference is local.
"""
from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/"
             "hand_landmarker.task")
MODEL_PATH = Path(os.getenv("CONDUIT_HAND_MODEL", Path(__file__).parent / "assets" / "hand_landmarker.task"))


@dataclass
class Detection:
    points: List[List[float]]   # 21 x [x, y, z] normalised
    handedness: str
    score: float


class TrackerUnavailable(RuntimeError):
    pass


def ensure_model(path: Path = MODEL_PATH) -> Path:
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(MODEL_URL, str(path))
    except Exception as e:  # pragma: no cover - network dependent
        raise TrackerUnavailable(
            f"Could not download the hand model ({e}). Download it manually from {MODEL_URL} to {path}"
        ) from e
    return path


class HandTracker:
    def __init__(self, min_detection: float = 0.6, min_tracking: float = 0.5) -> None:
        try:
            import mediapipe as mp
        except ImportError as e:  # pragma: no cover
            raise TrackerUnavailable("mediapipe is not installed (pip install -r requirements.txt)") from e
        self._mp = mp
        self._ts_ms = 0
        self._landmarker = None
        self._hands = None
        self.backend = ""
        try:
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision

            opts = mp_vision.HandLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(ensure_model())),
                running_mode=mp_vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=min_detection,
                min_hand_presence_confidence=min_tracking,
                min_tracking_confidence=min_tracking,
            )
            self._landmarker = mp_vision.HandLandmarker.create_from_options(opts)
            self.backend = "mediapipe-tasks"
        except Exception as tasks_err:
            if not hasattr(mp, "solutions"):
                raise TrackerUnavailable(f"MediaPipe Tasks failed: {tasks_err}") from tasks_err
            self._hands = mp.solutions.hands.Hands(max_num_hands=2, model_complexity=1,
                                                   min_detection_confidence=min_detection,
                                                   min_tracking_confidence=min_tracking)
            self.backend = "mediapipe-solutions"

    def process(self, bgr_frame, timestamp_s: float) -> List[Detection]:
        """Return up to two detected hands.

        The caller decides which detection is primary and keeps that choice stable across frames;
        the second hand is optional and used only by mode-layer signature interactions.
        """
        import cv2

        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        if self._landmarker is not None:
            self._ts_ms = max(self._ts_ms + 1, int(timestamp_s * 1000))  # must be strictly increasing
            img = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
            res = self._landmarker.detect_for_video(img, self._ts_ms)
            if not res.hand_landmarks:
                return []
            out: List[Detection] = []
            for i, lm in enumerate(res.hand_landmarks[:2]):
                cat = res.handedness[i][0] if res.handedness and i < len(res.handedness) else None
                out.append(Detection([[p.x, p.y, p.z] for p in lm], cat.category_name if cat else "Unknown",
                                      float(cat.score) if cat else 1.0))
            return out
        rgb.flags.writeable = False
        res = self._hands.process(rgb)
        if not res.multi_hand_landmarks:
            return []
        out = []
        for i, hand in enumerate(res.multi_hand_landmarks[:2]):
            h = res.multi_handedness[i].classification[0] if res.multi_handedness and i < len(res.multi_handedness) else None
            out.append(Detection([[p.x, p.y, p.z] for p in hand.landmark], h.label if h else "Unknown",
                                 float(h.score) if h else 1.0))
        return out

    def close(self) -> None:
        try:
            if self._landmarker is not None:
                self._landmarker.close()
            if self._hands is not None:
                self._hands.close()
        except Exception:
            pass
