"""Synthetic hand-landmark generator.

Builds anatomically plausible 21-point hands for each supported gesture. Used by the
automated tests (no camera required) and mirrored in the browser's pointer simulator.
Local frame: wrist at (0,0), x right, y forward ("up the hand"), palm size ~= 1.
"""
from __future__ import annotations

import math
from typing import List, Tuple

MCP = {"index": (-0.30, 0.95), "middle": (0.0, 1.0), "ring": (0.28, 0.95), "pinky": (0.52, 0.85)}
EXTENDED = [(0.0, 0.45), (0.0, 0.72), (0.0, 0.94)]    # pip, dip, tip offsets from MCP
CURLED = [(0.0, 0.35), (0.0, 0.20), (0.0, -0.05)]
POINT_IDX = EXTENDED

# Explicit finger counts, used to test the hospital "hold up 1/2/3 fingers" paging without a camera.
FINGER_POSES = {
    "two_fingers": ("index", "middle"),
    "three_fingers": ("index", "middle", "ring"),
}

THUMB_OPEN = [(-0.30, 0.20), (-0.50, 0.45), (-0.70, 0.65), (-0.88, 0.82)]
THUMB_FIST = [(-0.30, 0.20), (-0.40, 0.40), (-0.30, 0.60), (-0.10, 0.70)]
THUMB_PINCH = [(-0.30, 0.20), (-0.50, 0.50), (-0.65, 0.90), (-0.60, 1.40)]
INDEX_PINCH = [(-0.33, 1.40), (-0.42, 1.62), (-0.50, 1.55)]  # absolute pip, dip, tip


def _local_hand(gesture: str) -> List[Tuple[float, float]]:
    pts: List[Tuple[float, float]] = [(0.0, 0.0)]
    thumb = {"open_palm": THUMB_OPEN, "pinch": THUMB_PINCH, "fist": THUMB_FIST, "point": THUMB_FIST}.get(gesture, THUMB_FIST if gesture in FINGER_POSES else THUMB_OPEN)
    pts += thumb
    for name in ("index", "middle", "ring", "pinky"):
        mx, my = MCP[name]
        if gesture == "pinch" and name == "index":
            seq = [(mx, my)] + INDEX_PINCH
        else:
            ext = {
                "open_palm": True,
                "pinch": True,
                "fist": False,
                "point": name == "index",
            }.get(gesture, name in FINGER_POSES.get(gesture, ()))
            offs = EXTENDED if ext else CURLED
            seq = [(mx, my)] + [(mx + dx, my + dy) for dx, dy in offs]
        pts += seq
    return pts


def make_hand(gesture: str, cx: float, cy: float, scale: float = 0.22, angle_deg: float = 0.0) -> List[List[float]]:
    """Return 21 [x, y] landmarks whose *palm centre* sits at (cx, cy) in image space."""
    local = _local_hand(gesture)
    palm = [local[i] for i in (0, 5, 9, 13, 17)]
    pcx = sum(p[0] for p in palm) / 5
    pcy = sum(p[1] for p in palm) / 5
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for lx, ly in local:
        lx, ly = lx - pcx, ly - pcy
        rx, ry = lx * ca + ly * sa, -lx * sa + ly * ca  # rotate in local frame
        out.append([cx + rx * scale, cy - ry * scale])   # image y points down
    return out
