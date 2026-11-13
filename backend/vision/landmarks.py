"""Landmark processing: turns 21 MediaPipe-style hand landmarks into interaction features.

Pure NumPy. Works on normalised image coordinates (x, y in 0..1). The optional ``z``
value is MediaPipe's *relative* depth estimate (wrist = 0); it is NOT a measured physical
distance and is only reported as ``relative_depth_estimate``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np

WRIST = 0
THUMB = (1, 2, 3, 4)
FINGERS: Dict[str, tuple] = {
    "index": (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring": (13, 14, 15, 16),
    "pinky": (17, 18, 19, 20),
}
PALM_POINTS = (0, 5, 9, 13, 17)

EXT_RATIO = 1.15       # tip-to-wrist must exceed pip-to-wrist by this ratio
THUMB_EXT_RATIO = 1.10
PINCH_THRESHOLD = 0.30  # thumb-tip to index-tip distance / palm size
FIST_OPENNESS = 0.45


@dataclass
class HandFeatures:
    landmarks: List[List[float]]
    handedness: str
    wrist: List[float]
    palm_center: List[float]
    fingertips: Dict[str, List[float]]
    fingers_extended: Dict[str, bool]
    palm_size: float
    pinch_distance: float
    openness: float
    orientation_deg: float
    relative_depth_estimate: float
    tracking_confidence: float
    gesture: str

    def to_dict(self) -> dict:
        return {
            "handedness": self.handedness,
            "wrist": self.wrist,
            "palm_center": self.palm_center,
            "fingertips": self.fingertips,
            "fingers_extended": self.fingers_extended,
            "palm_size": round(self.palm_size, 4),
            "pinch_distance": round(self.pinch_distance, 4),
            "openness": round(self.openness, 4),
            "orientation_deg": round(self.orientation_deg, 1),
            "relative_depth_estimate": round(self.relative_depth_estimate, 4),
            "tracking_confidence": round(self.tracking_confidence, 3),
            "gesture": self.gesture,
        }


def _d(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def classify_gesture(fingers_ext: Dict[str, bool], pinch_distance: float, openness: float, index_ratio: float) -> str:
    if pinch_distance < PINCH_THRESHOLD and index_ratio > 1.2:
        return "pinch"
    n_ext = sum(fingers_ext[f] for f in FINGERS)
    if n_ext == 4 and openness > 0.6:
        return "open_palm"
    if n_ext == 0 and openness < FIST_OPENNESS:
        return "fist"
    if fingers_ext["index"] and n_ext == 1:
        return "point"
    return "other"


def extract_features(
    points: Sequence[Sequence[float]],
    handedness: str = "Unknown",
    handedness_score: float = 1.0,
    presence: float = 1.0,
) -> HandFeatures:
    pts = np.asarray(points, dtype=float)
    if pts.shape[0] != 21 or pts.shape[1] < 2:
        raise ValueError("expected 21 landmarks with at least (x, y)")
    xy = pts[:, :2]
    z = pts[:, 2] if pts.shape[1] > 2 else np.zeros(21)

    wrist = xy[WRIST]
    palm_center = xy[list(PALM_POINTS)].mean(axis=0)
    palm_size = max(_d(wrist, xy[9]), 1e-6)  # wrist -> middle MCP

    ext: Dict[str, bool] = {}
    ratios = []
    for name, (mcp, pip, dip, tip) in FINGERS.items():
        tip_d, pip_d = _d(xy[tip], wrist), _d(xy[pip], wrist)
        ext[name] = tip_d > pip_d * EXT_RATIO
        ratios.append(tip_d / palm_size)
    thumb_ext = _d(xy[4], xy[5]) > _d(xy[3], xy[5]) * THUMB_EXT_RATIO
    ext["thumb"] = bool(thumb_ext)

    openness = float(np.clip((np.mean(ratios) - 1.0) / 0.9, 0.0, 1.0))
    pinch = _d(xy[4], xy[8]) / palm_size
    index_ratio = _d(xy[8], wrist) / palm_size

    v = xy[9] - wrist  # wrist -> middle MCP; angle from "up" (image -y), clockwise positive
    orientation = float(np.degrees(np.arctan2(v[0], -v[1])))

    conf = float(np.clip(handedness_score * presence, 0.0, 1.0))
    return HandFeatures(
        landmarks=[[round(float(p[0]), 5), round(float(p[1]), 5)] for p in xy],
        handedness=handedness,
        wrist=[float(wrist[0]), float(wrist[1])],
        palm_center=[float(palm_center[0]), float(palm_center[1])],
        fingertips={n: [float(xy[t][0]), float(xy[t][1])] for n, t in (("thumb", 4), ("index", 8), ("middle", 12), ("ring", 16), ("pinky", 20))},
        fingers_extended=ext,
        palm_size=palm_size,
        pinch_distance=float(pinch),
        openness=openness,
        orientation_deg=orientation,
        relative_depth_estimate=float(np.mean(z[[4, 8, 12, 16, 20]] - z[WRIST])),
        tracking_confidence=conf,
        gesture=classify_gesture(ext, float(pinch), openness, float(index_ratio)),
    )


class PositionSmoother:
    """Exponential moving average to reduce landmark jitter (alpha closer to 1 = less smoothing)."""

    def __init__(self, alpha: float = 0.5) -> None:
        self.alpha = alpha
        self._p: Optional[np.ndarray] = None

    def reset(self) -> None:
        self._p = None

    def update(self, x: float, y: float) -> tuple[float, float]:
        p = np.array([x, y], dtype=float)
        self._p = p if self._p is None else self._p + self.alpha * (p - self._p)
        return float(self._p[0]), float(self._p[1])
