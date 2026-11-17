"""Camera capture + hand tracking worker thread.

Pipeline per frame:  capture -> mirror -> MediaPipe -> landmark features -> smoothing ->
movement history -> structured ``VisionFrame`` dict handed to ``on_frame``.

Frames are held in memory only (the latest JPEG for the optional local preview). Nothing is
written to disk and nothing leaves the machine.
"""
from __future__ import annotations

import sys
import threading
import time
from typing import Callable, List, Optional

from backend.intent.trajectory import TrajectoryAnalyzer
from backend.vision.landmarks import PositionSmoother, extract_features

FrameCb = Callable[[dict], None]
StatusCb = Callable[[dict], None]


def list_cameras(max_index: int = 5) -> List[dict]:
    """Probe the first few camera indices. Opening a camera briefly is the only portable way to test it."""
    import cv2

    found = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW) if sys.platform.startswith("win") else cv2.VideoCapture(i)
        if cap is not None and cap.isOpened():
            found.append({"index": i, "label": f"Camera {i}"})
        if cap is not None:
            cap.release()
    return found


class VisionWorker(threading.Thread):
    def __init__(self, camera_index: int, width: int, height: int, smoothing_alpha: float,
                 on_frame: FrameCb, on_status: StatusCb, preview: bool = True) -> None:
        super().__init__(daemon=True, name="conduit-vision")
        self.camera_index, self.width, self.height = camera_index, width, height
        self.on_frame, self.on_status = on_frame, on_status
        self.preview = preview
        self._alpha = smoothing_alpha
        self._halt = threading.Event()
        self._jpeg: Optional[bytes] = None
        self._lock = threading.Lock()
        self.fps = 0.0

    # --------------------------------------------------------------- control
    def stop(self) -> None:
        self._halt.set()

    def latest_jpeg(self) -> Optional[bytes]:
        with self._lock:
            return self._jpeg

    def _status(self, state: str, **kw) -> None:
        self.on_status({"state": state, "camera_index": self.camera_index, "active": state == "running", **kw})

    # ------------------------------------------------------------------- run
    def run(self) -> None:  # pragma: no cover - needs a camera
        try:
            import cv2
            from backend.vision.hand_tracker import HandTracker, TrackerUnavailable
        except Exception as e:
            self._status("error", error=f"OpenCV/MediaPipe import failed: {e}")
            return

        self._status("starting")
        try:
            tracker = HandTracker()
        except Exception as e:
            self._status("error", error=str(e), available=False)
            return

        cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW) if sys.platform.startswith("win") else cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            self._status("error", error=f"Camera {self.camera_index} could not be opened (in use or unavailable)", available=False)
            tracker.close()
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._status("running", tracker=tracker.backend, available=True)

        smoother = PositionSmoother(self._alpha)
        second_smoother = PositionSmoother(self._alpha)
        history = TrajectoryAnalyzer()
        fails, last_t, last_status = 0, time.monotonic(), 0.0
        missed = 0.0
        last_primary: Optional[tuple[float, float]] = None

        try:
            while not self._halt.is_set():
                ok, frame = cap.read()
                if not ok:
                    fails += 1
                    if fails > 30:
                        self._status("disconnected", error="Camera stopped delivering frames (unplugged or taken by another app)", available=False)
                        break
                    time.sleep(0.02)
                    continue
                fails = 0
                frame = cv2.flip(frame, 1)  # selfie view: all coordinates are in the mirrored image
                now = time.monotonic()
                dets = tracker.process(frame, now)
                # Keep the same physical hand as primary while two hands are visible so the
                # Intent Engine never inherits a left/right identity swap.
                if len(dets) > 1 and last_primary is not None:
                    def _palm_distance(d):
                        p = d.points[9]
                        return (p[0] - last_primary[0]) ** 2 + (p[1] - last_primary[1]) ** 2
                    dets = sorted(dets, key=_palm_distance)
                det = dets[0] if dets else None
                det2 = dets[1] if len(dets) > 1 else None
                dt = max(now - last_t, 1e-3)
                last_t = now
                self.fps += 0.1 * ((1.0 / dt) - self.fps)  # actual processing FPS

                if det is None:
                    smoother.reset()
                    second_smoother.reset()
                    last_primary = None
                    missed = min(1.0, missed + 0.2)
                    out = {"timestamp": now, "hand_detected": False, "handedness": None, "position": None, "gesture": "none",
                           "pinch_distance": None, "velocity": 0.0, "stability": 0.0, "fps": round(self.fps, 1),
                           "tracking_quality": 0.0, "features": None, "second_hand": None}
                else:
                    missed = max(0.0, missed - 0.1)
                    f = extract_features(det.points, det.handedness, det.score, 1.0 - missed)
                    last_primary = (f.palm_center[0], f.palm_center[1])
                    sx, sy = smoother.update(*f.palm_center)
                    history.add(now, sx, sy)
                    m = history.metrics()
                    second = None
                    if det2 is not None:
                        f2 = extract_features(det2.points, det2.handedness, det2.score, 1.0 - missed)
                        s2x, s2y = second_smoother.update(*f2.palm_center)
                        second = {
                            "hand_detected": True, "handedness": det2.handedness,
                            "position": {"x": s2x, "y": s2y}, "gesture": f2.gesture,
                            "pinch_distance": f2.pinch_distance, "orientation_deg": f2.orientation_deg,
                            "features": f2.to_dict(),
                        }
                    else:
                        second_smoother.reset()
                    out = {"timestamp": now, "hand_detected": True, "handedness": det.handedness,
                           "position": {"x": sx, "y": sy}, "gesture": f.gesture, "pinch_distance": f.pinch_distance,
                           "velocity": round(m.speed, 4), "stability": round(m.stability, 3), "fps": round(self.fps, 1),
                           "tracking_quality": f.tracking_confidence, "features": f.to_dict(), "second_hand": second}
                if det is None:
                    history.reset()
                if self.preview:
                    ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    if ok2:
                        with self._lock:
                            self._jpeg = buf.tobytes()
                self.on_frame(out)
                if now - last_status > 1.0:  # periodic heartbeat so the UI always shows live FPS
                    last_status = now
                    self._status("running", fps=round(self.fps, 1), tracker=tracker.backend, available=True)
        finally:
            cap.release()
            tracker.close()
            with self._lock:
                self._jpeg = None
            if self._halt.is_set():
                self._status("stopped", available=True)
