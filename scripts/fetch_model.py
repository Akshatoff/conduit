"""Prepare the local MediaPipe assets used by both runtimes.

    python scripts/fetch_model.py            # check + repair (model, WASM runtime)
    python scripts/fetch_model.py --check    # report only, non-zero exit if the model is unusable
    python scripts/fetch_model.py --from D:\\downloads\\hand_landmarker.task

The repo ships ``public/mediapipe/hand_landmarker.task`` so a clone works offline. This script
validates it, copies the MediaPipe WASM runtime out of ``node_modules`` (so the browser runtime does
not need a CDN) and, only if the model is missing, restores it from ``backend/vision/assets`` or the
MediaPipe model bucket.

Why this exists: a partial or HTML-fetched ``hand_landmarker.task`` makes MediaPipe fail with
"Unable to open zip archive", which the app used to surface as a bare "Camera could not start".
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.vision.hand_tracker import (  # noqa: E402  (path set up above)
    DOWNLOAD_PATH,
    MODEL_URL,
    PROJECT_ROOT,
    TrackerUnavailable,
    ensure_model,
    is_task_model,
)

PUBLIC_DIR = PROJECT_ROOT / "public" / "mediapipe"
PUBLIC_MODEL = PUBLIC_DIR / "hand_landmarker.task"
WASM_SRC = ROOT / "node_modules" / "@mediapipe" / "tasks-vision" / "wasm"
WASM_DST = PUBLIC_DIR / "wasm"


def size_mb(path: Path) -> str:
    return f"{path.stat().st_size / (1024 * 1024):.1f} MB"


def report_model() -> bool:
    print(f"  model: {PUBLIC_MODEL} — " + (f"OK ({size_mb(PUBLIC_MODEL)})" if is_task_model(PUBLIC_MODEL) else "MISSING or invalid"))
    fallback = DOWNLOAD_PATH
    if fallback != PUBLIC_MODEL:
        print(f"  backup: {fallback} — " + (f"OK ({size_mb(fallback)})" if is_task_model(fallback) else "not present"))
    wasm_ok = (WASM_DST / "vision_wasm_internal.js").exists() and (WASM_DST / "vision_wasm_internal.wasm").exists()
    print(f"  wasm:  {WASM_DST} — " + ("OK" if wasm_ok else "missing (browser runtime will fall back to a CDN)"))
    return is_task_model(PUBLIC_MODEL)


def copy_wasm() -> None:
    if not WASM_SRC.exists():
        print("  wasm:  node_modules/@mediapipe/tasks-vision/wasm not found — run npm install");
        return
    WASM_DST.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src in sorted(WASM_SRC.glob("vision_wasm*")):
        dst = WASM_DST / src.name
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)
            copied += 1
    print(f"  wasm:  {WASM_DST} — {'copied ' + str(copied) + ' file(s)' if copied else 'up to date'}")


def install_model(source: Path) -> None:
    if not is_task_model(source):
        raise SystemExit(f"{source} is not a valid MediaPipe .task file (expected a ~7.8 MB ZIP archive).")
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, PUBLIC_MODEL)
    print(f"  model: installed {PUBLIC_MODEL} ({size_mb(PUBLIC_MODEL)})")


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate/repair the local MediaPipe hand model and WASM runtime.")
    ap.add_argument("--check", action="store_true", help="report status only, change nothing")
    ap.add_argument("--from", dest="source", type=Path, help="install a hand_landmarker.task you downloaded yourself")
    ap.add_argument("--wasm-only", action="store_true", help="only copy the WASM runtime files")
    args = ap.parse_args()

    print("CONDUIT — MediaPipe assets")
    if args.check:
        ok = report_model()
        print("  ready" if ok else f"  repair with: python scripts/fetch_model.py  (or download {MODEL_URL})")
        return 0 if ok else 1

    if not args.wasm_only:
        if args.source:
            install_model(args.source)
        elif not is_task_model(PUBLIC_MODEL):
            restored = False
            for candidate in (DOWNLOAD_PATH,):
                if candidate != PUBLIC_MODEL and is_task_model(candidate):
                    install_model(candidate)
                    restored = True
                    break
            if not restored:
                try:
                    downloaded = ensure_model()
                except TrackerUnavailable as e:
                    print(f"  model: {e}")
                    print(f"  fix:   download {MODEL_URL} in a browser and save it as {PUBLIC_MODEL}")
                    print(f"         then rerun: python scripts/fetch_model.py --check")
                    return 1
                install_model(downloaded)
    copy_wasm()
    ok = report_model()
    print("  ready" if ok else "  model still unusable — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
