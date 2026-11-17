# CONDUIT — *From Human Intent to Physical Action*

Conduit turns an ordinary webcam into an **intent-aware, contactless interaction layer** for low-voltage hardware.
It does not just recognise a hand pose; an **Intent Engine** decides whether the person actually *meant* to operate a
particular control before anything physical happens.

```
Traditional:  gesture detected  ──────────────────────────────────────▶ command executed
Conduit:      hand tracked → movement analysed → context established → intent evaluated
              → command validated → device controlled → acknowledgement → state verified
```

Conduit is a **multi-environment platform**: one shared Intent Engine drives five explicitly different
operational environments — hospital workstation, semiconductor cleanroom workstation, industrial
maintenance, commercial kitchen and accessibility/adaptive interaction. Each environment has its own
dashboard, virtual controls, workflows, demo data, digital-twin mapping and analytics, but **no environment
gets its own intent logic**. See [`docs/MODES.md`](docs/MODES.md).

Target settings: healthcare workstations, cleanroom manufacturing, food preparation, industrial service
bays and accessibility-oriented environments — anywhere touching a control surface is inconvenient or undesirable.

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

## Operational environments

The application opens on a mode-selection screen. Entering an environment loads its dashboard, virtual
controls (camera zones), workflows, demo data and device mappings into the **same** Intent Engine — the
camera is not restarted and no second engine is created.

| Environment | Problem it demonstrates | Highlights | Hardware |
|---|---|---|---|
| **Hospital / clinical** | Accessing information while hands are occupied, without repeatedly touching a shared screen | Fictional patient overview / records, sample imaging viewer with gesture zoom, checklist + procedure navigation, timer, simulated assistance request | shared LED |
| **Semiconductor / cleanroom** | Following process instructions and inspection data with gloved hands | 5-stage simulated wafer flow, fictional wafer map + zoom, defect category selection, simulated inspection records, equipment dashboard | LED status, ventilation fan, servo model access |
| **Industrial maintenance** | Reading procedures and recording findings while holding tools | Equipment readings, digital manual, repair-step navigation, inspection checklist, maintenance timer, simulated fault report + assistance | LED indicator, servo service latch |
| **Food processing** | Following recipes and timers without touching a shared screen | Three fictional recipes, ingredient quantities, preparation steps, cooking timer, QC checklist, simulated order board | shared LED |
| **Accessibility / adaptive** | A single fixed input method excludes people | Live dwell / confidence / stability / gesture configuration, large-control preset, large demo panels, reading view | shared LED |

Every environment includes a guided demonstration script (auto-advancing as authorised actions occur),
a **Reset demo** action, per-environment interaction history and explicit safety/scope statements.

### Digital vs physical execution

Zones may be `physical` (shared ESP32 nodes) or `digital` (mode-layer UI controls). Both must pass the
full interaction-authorisation pipeline. Digital actions are acknowledged by the mode layer and labelled
`digital / simulated` — they never reach the device controller and never update a physical twin. Physical
states are still only confirmed after node ACK **and** independent read-back. Analytics record the active
environment with every session and trial, and the CSV gains a `workspace` column.

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

## Demo script (≈ 6 minutes, multi-mode)

The full staged sequence is in [`docs/MODES.md`](docs/MODES.md#recommended-judge-demonstration-6-minutes).

1. **Environments** → show the five cards, the shared pipeline ribbon and the prototype/safety labels.
   Enter **Hospital**; note the fictional-data banner, the two control rails and the central approach corridor.
2. **Activate + deliberate selection** → *Start camera* (or pointer simulator). Hold a still open palm →
   activation ring fills → move up the corridor and toward **OVERVIEW**, hold → dwell/confidence clear the
   thresholds → **pinch** → the panel opens with a digital acknowledgement.
3. **Accident:** sweep a hand across both rails → nothing executes; the history/log shows a `TRANSIT`
   rejection with its reason. This is the heart of the project: gesture ≠ intent.
4. **Digital Twin:** select **LAMP** (shared LED) and show the lifecycle `Sent → Acknowledged → State
   confirmed`; badge *SIMULATED STATE* (or real ESP32). Click *Simulate link failure*, repeat → `DISCONNECTED`,
   no ack, twin shows `UNKNOWN` (never a fake success).
5. **Semiconductor:** change environment (camera keeps running). Advance a process stage, open the fictional
   wafer inspection, cycle zoom/defect, confirm a simulated record, then toggle **EQUIP LED**, **VENT FAN** and
   **ACCESS**; show the mode indicators on the Twin page (`node` vs `ui`).
6. **Industrial / Food:** briefly show one workflow each (manual → step → checklist → simulated fault; or
   recipe → quantities → timer → QC/order). **Accessibility:** change dwell/confidence and the confirmation
   gesture live, toggle large controls, and show the same engine becoming stricter/looser without a restart.
7. **Analytics:** point out that nothing is pre-filled. Run the scripted scenarios (`docs/TEST_PROTOCOL.md`),
   start a session in each environment you want to compare, show false-activation vs deliberate-success
   charts and the environment table; export the CSV with its `workspace` column.
8. **Settings:** raise *Minimum confidence* live and show the engine becoming stricter. **Reset demo** restores
   a mode's dashboard, timer and interaction history.

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
                 ┌────────┴─────────┐                         (digital devices never reach here)
        SimulatedNode          ESP32Node (HTTP) ─▶ firmware/conduit_node.ino ─▶ LED / fan / servo
                          ▼
   digital twin state + SQLite (devices, commands, intent_events, test_sessions, trials + workspace)
                          ▼
   services/event_bus.py ─▶ api/ws.py (WebSocket) ─▶ React UI        api/routes.py (REST)
                          ▲
                 mode layer (src/modes): configuration, virtual controls, workflows, demo data,
                 dashboards and reducers. It consumes authorised commands and publishes nothing
                 back into the intent pipeline.
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
  modes/     mode registry + hospital/ semiconductor/ industrial/ food/ accessibility
             (config, demoData, reducer, Dashboard) + mode state/actions
  runtime/   backendRuntime.ts (REST+WS)   localRuntime.ts (in-browser)
  pages/ components/ store.ts
             pages: ModeSelectPage, WorkspacePage, LivePage, TwinPage, AnalyticsPage, SettingsPage
firmware/conduit_node.ino    ESP32 firmware      docs/  HARDWARE.md TEST_PROTOCOL.md
tests/                       pytest (Python)     tests_ts/  parity + UI smoke tests (TypeScript)
```

The Vite app lives at the repository root (`src/`), not in a `frontend/` folder, because the project template builds
from the root; responsibilities are otherwise separated as specified.

### REST API

`GET /api/health` · `GET /api/system/status` (incl. `workspace_mode`, `zones`, `zone_controls`) · `POST /api/vision/start|stop` · `GET /api/vision/cameras` ·
`GET /api/vision/stream` (local MJPEG preview) · `GET /api/devices` · `GET /api/devices/{id}` ·
`POST /api/devices/{id}/test` (**manual test**, flagged `manual_test`) · `POST /api/interaction/activate|deactivate|cancel|mode` ·
`GET /api/intent/status|events` · `GET /api/commands` · `GET /api/analytics/summary` ·
`POST /api/analytics/session/start|stop` · `POST /api/analytics/trial/start|end` · `GET /api/analytics/export` (CSV) ·
`GET|PUT /api/settings` (`workspace_mode`, per-mode `intent.zones`) · `POST /api/hardware/mode|connect|simulate_fault`.
OpenAPI docs at `/docs`.

### WebSocket `/ws`

Envelope `{type, timestamp, data}`. Server → UI: `snapshot`, `camera_status`, `hand_landmarks`, `trajectory_update`
(trail + intent snapshot), `gesture_detected`, `intent_state_changed`, `device_selected`, `confirmation_required`,
`command_sent`, `command_acknowledged`, `command_rejected`, `device_state_changed`, `analytics_updated`,
`settings_changed`, `system_error`, **`mode_action`** (a digital mode-layer action was authorised and
executed), **`workspace_changed`**. UI → server (validated by Pydantic): `ping | activate | deactivate | cancel | snapshot`;
malformed messages return a `system_error` and never crash the socket.

### Safety & privacy behaviour

* Video is processed locally, held in memory only, never written to disk or uploaded; preview can be disabled.
* Camera-active indicator always visible; interaction must be explicitly activated; fist/emergency cancel at any time.
* No command executes below `min_confidence`, without a separate pinch, during cooldown, or as a repeat.
* **Baseline gesture commands are routed to the simulation only**, never to hardware, and the firmware refuses them too.
* Hardware mode never fabricates an acknowledgement; on loss of the node the twin shows `UNKNOWN` and the firmware
  falls back to safe outputs (LED off, fan off, latch locked) after 8 s without host contact.
* *Manual test* buttons only exist on the Digital Twin device cards; they are clearly labelled and logged with
  source `manual_test`. The mode control surface has **no manual shortcut** — every mode action must be authorised
  by the Intent Engine.

---

## Tests

```powershell
scripts\test.bat
```

| Suite | Command | Covers |
|---|---|---|
| Python (113 tests) | `python -m pytest -q` | landmark features & gestures (rotation/scale invariance), trajectory maths, **intent state transitions**, confidence threshold, accidental-movement rejection, confirmation/cancel/timeouts, cooldown & duplicate prevention, command validation, simulation acks, ESP32 failure/mocked HTTP, analytics definitions, SQLite, REST + WebSocket, full pipeline (synthetic landmarks → engine → controller → twin → DB → analytics), **mode zones with explicit actions, digital execution never touching the twin, workspace analytics, API workspace round-trip** |
| TS parity | `npm run test:parity` | TypeScript engine makes the same decisions as the Python engine |
| TS modes | `npm run test:modes` | five environments, registry/workflow/zone integrity, one shared engine authorises each mode, accidental sweep rejected, mode history/reset |
| UI smoke (optional) | `npm i --no-save jsdom ws`, bundle `tests_ts/ui-smoke.tsx` / `backend-smoke.tsx` with esbuild (`--loader:.css=empty --jsx=automatic --platform=node`), run with `node tests_ts/jsdom-harness.cjs <bundle> [url]` | all screens render incl. the environment screen; browser runtime pipeline end-to-end; entering a mode loads its dashboard/zones without restarting the camera; a digital control is confirmed in the mode layer and leaves physical twins untouched; frontend ↔ live FastAPI over REST+WS incl. failure paths and workspace persistence |

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
* **Mode-layer limitations:** workflow preconditions (e.g. confirm an inspection only after opening it) are
  evaluated in the UI; the backend validates intent authorisation and digital-vs-physical routing, not every
  business rule. A digitally authorised action that is not applicable is clearly shown as such in the history.
* Modes are demonstration scenarios only. The accessibility mode has not been co-designed with disabled users
  and gesture interaction is not suitable for everyone.
* Mode zone layouts are two rails with a central corridor; real-camera rehearsals may still need threshold
  tuning or the accessibility large-control preset.
* Workflow completion is shown live per environment (steps and percentage) but is not persisted as a trial
  metric; the analytics summary records session/trial outcomes, latency, ACK rate and environment.
* The browser runtime talks to an ESP32 directly over plain HTTP, so it needs a non-https page.

## License / use

Hackathon prototype. Use only with isolated low-voltage demonstration hardware.
