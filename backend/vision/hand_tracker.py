"""MediaPipe hand tracking wrapper.

Uses the MediaPipe *Tasks* HandLandmarker. The ~7.8 MB ``hand_landmarker.task`` model ships in
``public/mediapipe/`` (the same file the browser runtime uses) so a fresh clone runs offline; if it
is missing the backend falls back to ``backend/vision/assets/`` and finally to a one-time download
from the MediaPipe model bucket. Falls back to the legacy ``mp.solutions.hands`` API if the Tasks
model is unavailable and the installed MediaPipe still ships it. All inference is local.

The model file is validated before MediaPipe sees it: a truncated or HTML download makes MediaPipe
fail with the cryptic "Unable to open zip archive", so we check the ZIP structure ourselves and
replace a bad file instead of crashing.
"""
from __future__ import annotations

import os
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/"
             "hand_landmarker.task")
MODEL_MIN_BYTES = 7_000_000  # the real file is ~7.8 MB; anything much smaller is not the model

PROJECT_ROOT = Path(__file__).resolve().parents[2]
# Shipped with the repo, served to the browser at /mediapipe/hand_landmarker.task.
PUBLIC_MODEL_PATH = PROJECT_ROOT / "public" / "mediapipe" / "hand_landmarker.task"
# Where a previous version downloaded the model (kept for backwards compatibility / env override).
DOWNLOAD_PATH = Path(os.getenv("CONDUIT_HAND_MODEL", Path(__file__).parent / "assets" / "hand_landmarker.task"))
MODEL_PATH = PUBLIC_MODEL_PATH if PUBLIC_MODEL_PATH.exists() else DOWNLOAD_PATH


@dataclass
class Detection:
    points: List[List[float]]   # 21 x [x, y, z] normalised
    handedness: str
    score: float


class TrackerUnavailable(RuntimeError):
    pass


def model_candidates() -> List[Path]:
    """Places the model may already be, best first."""
    out: List[Path] = []
    env = os.getenv("CONDUIT_HAND_MODEL")
    if env:
        out.append(Path(env))
    out += [PUBLIC_MODEL_PATH, DOWNLOAD_PATH]
    seen = set()
    return [p for p in out if not (str(p) in seen or seen.add(str(p)))]


def is_task_model(path: Path) -> bool:
    """True when *path* is a complete MediaPipe ``.task`` bundle (a ZIP of ~7.8 MB)."""
    try:
        if path.stat().st_size < MODEL_MIN_BYTES:
            return False
        return zipfile.is_zipfile(str(path))
    except OSError:
        return False


def _describe(path: Path) -> str:
    try:
        size = path.stat().st_size
    except OSError:
        return f"{path} does not exist"
    try:
        head = path.open("rb").read(64)
    except OSError as e:  # pragma: no cover - filesystem dependent
        return f"{path} could not be read ({e})"
    kind = "HTML/text page" if head.lstrip()[:1] in (b"<", b"{") else "not a ZIP archive"
    return f"{path} is {size / (1024 * 1024):.1f} MB and {kind}"


def _download(dest: Path) -> Path:
    """Download the model to *dest* atomically and validate it."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        urllib.request.urlretrieve(MODEL_URL, str(part))
        if not is_task_model(part):
            raise TrackerUnavailable(
                f"The downloaded hand model is not valid ({_describe(part)}). The URL returned "
                f"something other than the model — a blocked network or captive portal does this. "
                f"Download {MODEL_URL} manually and save it as {dest}."
            )
        os.replace(part, dest)
    except TrackerUnavailable:
        part.unlink(missing_ok=True)
        raise
    except Exception as e:  # pragma: no cover - network dependent
        part.unlink(missing_ok=True)
        raise TrackerUnavailable(
            f"Could not download the hand model ({e}). The repo ships it at {PUBLIC_MODEL_PATH}; "
            f"restore that file or download {MODEL_URL} manually."
        ) from e
    return dest


def ensure_model(path: Optional[Path] = None) -> Path:
    """Return a valid model file, repairing a corrupt one rather than letting MediaPipe crash."""
    candidates = [path] if path else []
    candidates += model_candidates()
    for candidate in candidates:
        if is_task_model(candidate):
            return candidate
    # Nothing usable: repair the preferred location (the shipped public copy by default) so the
    # browser is served a good file too, not just the Python side.
    target = path or candidates[0]
    # An invalid file at the download location is a failed/aborted download: remove it and retry.
    if target.exists() and not is_task_model(target):
        try:
            target.unlink()
        except OSError:  # pragma: no cover - filesystem dependent
            pass
    return _download(target)


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
        self.model_path = None
        model_error: Optional[TrackerUnavailable] = None
        model: Optional[Path] = None
        try:
            model = ensure_model()
        except TrackerUnavailable as e:
            model_error = e
        try:
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision

            if model is None:
                raise model_error or TrackerUnavailable("No hand model available")
            opts = mp_vision.HandLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(model)),
                running_mode=mp_vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=min_detection,
                min_hand_presence_confidence=min_tracking,
                min_tracking_confidence=min_tracking,
            )
            self._landmarker = mp_vision.HandLandmarker.create_from_options(opts)
            self.backend = "mediapipe-tasks"
            self.model_path = str(model)
        except Exception as tasks_err:
            if not hasattr(mp, "solutions"):
                raise TrackerUnavailable(
                    f"MediaPipe Tasks failed: {tasks_err}. The hand model ships at {PUBLIC_MODEL_PATH}; "
                    f"restore it (scripts/fetch_model.py) or delete {DOWNLOAD_PATH} and retry."
                ) from tasks_err
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


if __name__ == "__main__":  # pragma: no cover - manual helper
    path = ensure_model()
    print(f"Hand model ready: {path} ({path.stat().st_size / (1024 * 1024):.1f} MB)")
