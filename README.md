# CONDUIT — *From Human Intent to Physical Action*

Conduit turns an ordinary webcam into an **intent-aware, contactless interaction layer** for low-voltage hardware.
It does not just recognise a hand pose; an **Intent Engine** decides whether the person actually *meant* to operate a
particular control before anything physical happens.

```
Traditional:  gesture detected  ──────────────────────────────────────▶ command executed
Conduit:      hand tracked → movement analysed → context established → intent evaluated
              → command validated → device controlled → acknowledgement → state verified
```

Target settings (concept): healthcare workstations, food preparation, laboratories, industrial workstations and
accessibility-oriented environments — anywhere touching a control surface is inconvenient or undesirable.

> **Prototype, not a certified system.** Conduit drives isolated low-voltage demo electronics only (LED, small DC fan,
> SG90 servo with a model latch). It must not be connected to mains, real door locks, medical or industrial equipment, and
> it makes **no claims** about preventing infection or guaranteeing sterility.

---

## What is in the box

| Pillar | Implementation |
|---|---|
| **Spatial perception** | OpenCV + MediaPipe Hand Landmarker (Python) → 21 landmarks, palm centre, finger extension, pinch distance, openness, orientation, smoothing, movement history. Same pipeline in the browser (MediaPipe WASM). |
| **Intent intelligence** | `backend/intent/` — trajectory analyser + deterministic 12-state machine + interpretable weighted score + temporal validation, cooldown, duplicate and repeat-selection prevention. Independent of MediaPipe. |
| **Physical execution** | `backend/hardware/` — one controller for **simulation** and **ESP32** (HTTP/JSON): validation, command ids, acknowledgement, state read-back, timeouts, idempotency, failsafe. Firmware in `firmware/`. |
| **Impact verification** | Digital twin updated *only* after ack + read-back; SQLite event/command log; Baseline-vs-Conduit trial analytics with CSV export (`docs/TEST_PROTOCOL.md`). |

Interaction protocol (all gestures configurable in Settings):

1. **Open palm**, held still → activate interaction mode (still palm outside a zone for 2 s deactivates).
2. **Move steadily into a control zone** (Lighting / Ventilation / Access) and hold → *select* (never by gesture alone).
3. **Pinch** (a *new* pinch after selection) → confirm → validated → executed.
4. **Closed fist** → cancel; held ~1 s with nothing selected = emergency stop.

Every decision — accepted or rejected — is stored with a reason (`TRANSIT`, `LOW_CONFIDENCE`, `UNSTABLE`,
`CONFIRM_TIMEOUT`, `COOLDOWN`, `DUPLICATE`, `PINCH_NO_SELECTION`, `NO_HAND_TIMEOUT`, …).

### Intent scoring (interpretable, configurable)

```
confidence = Σ wᵢ·cᵢ / Σ wᵢ     (weights in Settings → Score weights)
cᵢ ∈ { trajectory consistency, direction toward control, hand stability (EMA),
       dwell ratio, landmark tracking quality, interaction activated, gesture confirmation (pinch strength) }
```

Selection requires dwell ≥ `min_dwell_s`, stability ≥ `stability_threshold` **and** confidence ≥ `min_confidence`.
Execution additionally requires a separate pinch, a confidence re-check, no cooldown and no duplicate command.
No machine-learning model is used: a transparent rule/score system is easier to audit and demonstrate.

---

## Two ways to run (both are first-class)

### A. Full system — Python backend + ESP32 (Windows)

Requirements: **Python 3.11+**, **Node 20+**, a webcam. (Optional: ESP32 + parts, see `docs/HARDWARE.md`.)

```powershell
git clone <repo> conduit; cd conduit
scripts\setup.bat        # venv, pip install -r requirements.txt, npm install, npm run build
scripts\run.bat          # http://127.0.0.1:8000  (API + WebSocket + built UI on one port)
```

Manual equivalent:

```powershell
py -3.11 -m venv .venv ; .venv\Scripts\activate
pip install -r requirements.txt
npm install ; npm run build
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Development with hot reload: `scripts\dev.bat` (backend :8000 + Vite :5173).
First camera start downloads the ~8 MB MediaPipe `hand_landmarker.task` once (to `backend/vision/assets/`);
afterwards everything is offline. For an air-gapped machine put the file there manually.

macOS/Linux: same commands with `source .venv/bin/activate`.

### B. Offline demonstration fallback — browser only

Open `dist/index.html` (after `npm run build`) or `npm run dev`. If no backend answers, the UI automatically switches
to the **browser runtime**: MediaPipe runs in WebAssembly in the tab, and the *same* Intent Engine, device simulation
and analytics run locally (settings/trials kept in `localStorage`). If the camera or the model CDN is unavailable, use
the **Pointer simulator**: the mouse drives a *synthetic* 21-point hand (hold the button to pinch) through the
identical landmark → trajectory → intent pipeline. It is clearly labelled and exists so a demo never depends on a
camera, a server or Wi-Fi.

---

## Demo script (≈ 4 minutes)

1. **Live Interaction** → *Start camera*. Point out the red *CAMERA ACTIVE · LOCAL PROCESSING* badge.
2. Show an open palm, hold still → ring fills → *Interaction activated*.
3. **Accident:** wave/swipe across all three zones → nothing executes; log shows `TRANSIT — passed through … without dwelling`.
4. **Deliberate:** move steadily into *Ventilation*, hold → zone turns amber *PINCH TO ON*, confidence bar clears the
   threshold marker → **pinch** → *Awaiting device ACK…* → *CONFIRMED*.
5. **Digital Twin:** fan spins, lifecycle bar `Sent → Acknowledged → State confirmed`, badge *SIMULATED STATE* (or real ESP32 hardware).
6. Click *Simulate link failure*, repeat a command → `DISCONNECTED`, no ack, twin shows `UNKNOWN` (never a fake success).
7. **Analytics:** run a Baseline session and a Conduit session with the scripted scenarios (`docs/TEST_PROTOCOL.md`),
   show false-activation vs deliberate-success charts; export CSV.
8. **Settings:** raise *Minimum confidence* live and show the engine becoming stricter.

---

## Architecture

```
 WEBCAM ─▶ vision/worker.py ─▶ hand_tracker.py (MediaPipe) ─▶ landmarks.py (features, smoothing)
                                                                  │  structured VisionFrame
                                                                  ▼
   intent/trajectory.py ◀──────────── intent/engine.py  (state machine + scoring, no vision deps)
                                                                  │  CommandRequest (only after validation)
                                                                  ▼
                       hardware/controller.py  ── validation.py
                          │ SENT → ACK → read-back → CONFIRMED / FAILED / DISCONNECTED
                 ┌────────┴─────────┐
        SimulatedNode          ESP32Node (HTTP) ─▶ firmware/conduit_node.ino ─▶ LED / fan / servo
                          ▼
   digital twin state + SQLite (devices, commands, intent_events, test_sessions, trials)
                          ▼
   services/event_bus.py ─▶ api/ws.py (WebSocket) ─▶ React UI        api/routes.py (REST)
```

```
backend/
  main.py                    FastAPI app factory (+ serves ./dist)
  api/        routes.py ws.py
  vision/     landmarks.py synthetic.py hand_tracker.py worker.py
  intent/     config.py trajectory.py engine.py baseline.py
  hardware/   models.py validation.py nodes.py controller.py
  models/     schemas.py (Pydantic)  db_models.py (SQLAlchemy)
  database/   db.py repository.py
  services/   runtime.py analytics.py event_bus.py settings_store.py
src/                         React + Vite + TS + Tailwind UI (the "frontend/")
  core/      TypeScript twins of the engine/controller/analytics (browser runtime)
  runtime/   backendRuntime.ts (REST+WS)   localRuntime.ts (in-browser)
  pages/ components/ store.ts
firmware/conduit_node.ino    ESP32 firmware      docs/  HARDWARE.md TEST_PROTOCOL.md
tests/                       pytest (Python)     tests_ts/  parity + UI smoke tests (TypeScript)
```

The Vite app lives at the repository root (`src/`), not in a `frontend/` folder, because the project template builds
from the root; responsibilities are otherwise separated as specified.

### REST API

`GET /api/health` · `GET /api/system/status` · `POST /api/vision/start|stop` · `GET /api/vision/cameras` ·
`GET /api/vision/stream` (local MJPEG preview) · `GET /api/devices` · `GET /api/devices/{id}` ·
`POST /api/devices/{id}/test` (**manual test**, flagged `manual_test`) · `POST /api/interaction/activate|deactivate|cancel|mode` ·
`GET /api/intent/status|events` · `GET /api/commands` · `GET /api/analytics/summary` ·
`POST /api/analytics/session/start|stop` · `POST /api/analytics/trial/start|end` · `GET /api/analytics/export` (CSV) ·
`GET|PUT /api/settings` · `POST /api/hardware/mode|connect|simulate_fault`. OpenAPI docs at `/docs`.

### WebSocket `/ws`

Envelope `{type, timestamp, data}`. Server → UI: `snapshot`, `camera_status`, `hand_landmarks`, `trajectory_update`
(trail + intent snapshot), `gesture_detected`, `intent_state_changed`, `device_selected`, `confirmation_required`,
`command_sent`, `command_acknowledged`, `command_rejected`, `device_state_changed`, `analytics_updated`,
`settings_changed`, `system_error`. UI → server (validated by Pydantic): `ping | activate | deactivate | cancel | snapshot`;
malformed messages return a `system_error` and never crash the socket.

### Safety & privacy behaviour

* Video is processed locally, held in memory only, never written to disk or uploaded; preview can be disabled.
* Camera-active indicator always visible; interaction must be explicitly activated; fist/emergency cancel at any time.
* No command executes below `min_confidence`, without a separate pinch, during cooldown, or as a repeat.
* **Baseline gesture commands are routed to the simulation only**, never to hardware, and the firmware refuses them too.
* Hardware mode never fabricates an acknowledgement; on loss of the node the twin shows `UNKNOWN` and the firmware
  falls back to safe outputs (LED off, fan off, latch locked) after 8 s without host contact.
* *Manual test* buttons are clearly labelled and logged with source `manual_test`.

---

## Tests

```powershell
scripts\test.bat
```

| Suite | Command | Covers |
|---|---|---|
| Python (103 tests) | `python -m pytest -q` | landmark features & gestures (rotation/scale invariance), trajectory maths, **intent state transitions**, confidence threshold, accidental-movement rejection, confirmation/cancel/timeouts, cooldown & duplicate prevention, command validation, simulation acks, ESP32 failure/mocked HTTP, analytics definitions, SQLite, REST + WebSocket, full pipeline (synthetic landmarks → engine → controller → twin → DB → analytics) |
| TS parity | `npx esbuild tests_ts/parity.ts --bundle --platform=node --outfile=.parity.cjs && node .parity.cjs` | TypeScript engine makes the same decisions as the Python engine |
| UI smoke (optional) | `npm i --no-save jsdom ws`, bundle `tests_ts/ui-smoke.tsx` / `backend-smoke.tsx` with esbuild (`--loader:.css=empty --jsx=automatic --platform=node`), run with `node tests_ts/jsdom-harness.cjs <bundle> [url]` | all four screens render; browser runtime pipeline end-to-end; frontend ↔ live FastAPI over REST+WS incl. failure paths |

None of the automated tests needs a camera or an ESP32.

## Troubleshooting

| Problem | Fix |
|---|---|
| *Camera could not start / in use* | Close Teams/Zoom/other apps; try another index in Settings; Windows: Settings → Privacy → Camera → allow desktop apps. |
| Backend: `Could not download the hand model` | Download `hand_landmarker.task` from the URL printed in the error to `backend/vision/assets/`. |
| `pip install mediapipe` fails | Use Python 3.11 or 3.12 (64-bit). Check `python --version`. |
| UI shows *Browser runtime* though backend is running | Open the UI from `http://127.0.0.1:8000` (or set the URL in Settings → Connection). |
| Browser camera blocked | Camera needs `https://` or `http://localhost`/`127.0.0.1`; `file://` works in most browsers but may prompt each time. |
| Browser: *Hand model could not be loaded* | The WASM/model are fetched once from a CDN — connect once, or use the pointer simulator / Python backend. |
| Hand not detected / flickers | Face a lit scene, keep the palm ≥ 40 cm from the lens, avoid a busy skin-coloured background. |
| Activation never completes | Hold the palm *still* (stability ≥ 0.5) for 0.7 s; lower *Landmark smoothing* alpha if jittery. |
| Selection stays in *SELECTING* | See the reason line: `UNSTABLE` → steadier hand or lower stability threshold; `LOW_CONFIDENCE` → approach in a straight line, or lower the minimum confidence. |
| Hand mirrored / wrong side | Coordinates are in selfie (mirrored) space; zones are drawn in the same space. |
| ESP32 *Disconnected* | `docs/HARDWARE.md` → troubleshooting. Hardware mode never simulates an ack. |
| Port 8000 busy | `uvicorn … --port 8001`, then set the URL in Settings → Connection. |

## Known limitations (honest status)

* **Real-camera tracking was not exercised in the automated build environment** (no webcam / GL libraries there). The
  vision path is verified against the MediaPipe API surface and with synthetic landmark hands; expect to tune the
  default thresholds (stability, dwell, smoothing) to your camera and distance during the first rehearsal.
* **Firmware has not been compiled/flashed in CI**; it follows the documented protocol and the host side of the protocol
  is tested against a mocked ESP32.
* Single hand, normalised 2D interaction on one RGB camera. MediaPipe's `z` is only a *relative* depth estimate
  (reported as `relative_depth_estimate`), never a measured distance.
* Gesture heuristics are rule-based (extension ratios, pinch distance); unusual hand shapes may classify as `other`.
* Analytics are only as meaningful as the number of trials run (≥ 20 per mode recommended); small samples are flagged.
* The browser runtime talks to an ESP32 directly over plain HTTP, so it needs a non-https page.

## License / use

Hackathon prototype. Use only with isolated low-voltage demonstration hardware.
