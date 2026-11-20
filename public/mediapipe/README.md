# MediaPipe assets (served at `/mediapipe/`)

| File | Purpose |
|---|---|
| `hand_landmarker.task` | The MediaPipe hand-tracking model (~7.8 MB), used by **both** runtimes: the Python backend reads it from this folder, and the browser runtime fetches `/mediapipe/hand_landmarker.task`. |
| `wasm/` | The MediaPipe Tasks WASM runtime, copied from `node_modules/@mediapipe/tasks-vision/wasm` by `scripts/fetch_model.py`. Not committed — generated locally. |

The model is the official Google MediaPipe `hand_landmarker` bundle (`float16/1`), unmodified, from
`https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
— Apache-2.0, see [`LICENSE`](LICENSE).

## Why it is committed

Downloading the model on first camera start fails on filtered networks: the "download" can return an
HTML block page, and MediaPipe then reports the cryptic `Unable to open zip archive`, which the app
showed as "Camera could not start". Shipping the file makes a fresh clone run offline.

## Repairing / verifying

```
python scripts/fetch_model.py --check    # are the model and WASM runtime usable?
python scripts/fetch_model.py            # validate, copy the WASM runtime, restore the model if missing
python scripts/fetch_model.py --from D:\downloads\hand_landmarker.task   # install a manual download
```

A valid model is a ~7.8 MB ZIP archive (it may carry a 2-byte prefix before `PK\x03\x04`). If the file
is truncated or is an HTML page, the app now says so by name instead of failing inside MediaPipe.
