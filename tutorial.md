# Conduit — Gesture & Capability Tutorial

This is the practical, everything-in-one-place guide to what Conduit can do with gestures.
For installation, phone-node setup (USB + `adb`) and the architecture, see [`README.md`](README.md),
[`docs/MODES.md`](docs/MODES.md) and [`docs/HARDWARE.md`](docs/HARDWARE.md).

> **Current gesture model:** Conduit uses **poses** — pinch, open palm, fist and point. Distance between
> two hands is not a control. This replaced the older two-hand spread/zoom interaction.

> **Prototype only.** Conduit's hardware node is a **mobile phone driven over USB with `adb`**: the rear
> torch, the screen backlight and the vibration motor. There is no motor, fan or relay. It is not a medical,
> industrial or safety-certified system. Digital panels are clearly labelled as simulated; physical states
> are only shown after a real node ACK, and only marked confirmed when the phone can read them back.


## Contents

1. [The two gesture layers](#1-the-two-gesture-layers)
2. [Quick start](#2-quick-start)
3. [Core Intent Engine gestures](#3-core-intent-engine-gestures)
4. [Signature-screen gestures](#4-signature-screen-gestures)
5. [Per-environment gestures and controls](#5-per-environment-gestures-and-controls)
6. [System Settings reference](#6-system-settings-reference)
7. [Digital controls, physical controls and the Digital Twin](#7-digital-controls-physical-controls-and-the-digital-twin)
8. [Demonstration and analytics capabilities](#8-demonstration-and-analytics-capabilities)
9. [Troubleshooting gestures](#9-troubleshooting-gestures)
10. [One-page cheat sheet](#10-one-page-cheat-sheet)
11. [Scope and safety](#11-scope-and-safety)

---

## 1. The two gesture layers

Conduit deliberately separates two kinds of gesture input.

| Layer | Purpose | What a gesture can do |
|---|---|---|
| **Intent Engine gestures** | Operate a mode's actual controls | Activate, select by dwell, confirm, cancel. A gesture alone never selects a control. |
| **Signature-screen gestures** | Look at something: zoom, pan, rotate, page steps, set a timer | View/navigation only. They never bypass the Intent Engine and never command a device. |

The same Intent Engine, calibration and decision rules are shared by all five environments. Entering a
different environment changes zones, controls and demo data — not the engine.

---

## 2. Quick start

1. Run the app (`scripts\run.bat` on Windows, or the browser-only runtime).
2. Open **Environments** and choose one of the five environments.
3. On **Workspace**, start the camera. The camera-first workspace shows the live feed, current step and
   recent action rail.
4. Hold a still **open palm** in the lower area until the activation ring fills.
5. Move steadily into one of the control zones on the left or right rail and hold still.
6. When the target shows as selected/ready, **pinch thumb and index** to confirm.
7. Open **Signature screen** from the toolbar to practise the view gestures (zoom, pan, rotate, swipe, finger-count pages).
8. Open **Hardware** to exercise the three phone outputs individually, or **Digital Twin** to watch the
   full ACK → read-back lifecycle. `docs/HARDWARE.md` covers USB debugging, `adb` and what can be verified.

**Pointer simulator:** on **Live Interaction**, switch the input source to **Pointer simulator**. Move
the mouse over the stage to move a synthetic 21-point hand; hold the mouse button to pinch. Use the
Open palm / Point / Fist buttons to change the synthetic pose. It runs through the same feature
extraction and Intent Engine as a camera, so it is useful for learning timing and thresholds.

---

## 3. Core Intent Engine gestures

These are the gestures that can operate real mode controls.

| Gesture | Default behaviour | Important detail |
|---|---|---|
| **Open palm, held still** | Activate interaction mode | Held for about **0.7 s** by default. Holding a still palm outside every zone for about **2 s** deactivates. |
| **Move into a control zone** | Select | Selection is **always** by movement + dwell, never by pose alone. |
| **Pinch** (thumb + index) | Confirm the selected control | A **new** pinch after selection; held about **0.2 s**. |
| **Closed fist** | Cancel | Cancels a selection/confirmation. Held for about **0.8 s** with nothing selected = emergency stop/deactivate. |
| **Point** | Neutral/optional mapped gesture | Can be assigned as an activation or confirmation alternative. |

Selection requires all of the following (defaults, adjustable):

- Dwell inside the zone: **0.6 s**
- Movement stability: **0.6** (1 = perfectly still)
- Confidence: **0.75**
- A valid approach direction/trajectory
- No blocking cooldown, duplicate or ambiguity condition

Confirmation requires a separate pinch (or the configured confirmation gesture). Execution then
requires a confidence re-check, no cooldown, no duplicate and no unsafe state.

A typical deliberate interaction is:

```
still open palm  →  move into zone  →  hold still (dwell + stability)
                 →  target selected  →  new pinch  →  validated
                 →  command sent  →  ACK  →  read-back  →  twin updated
```

Rejected attempts are also recorded with a reason, for example `TRANSIT`, `LOW_CONFIDENCE`,
`UNSTABLE`, `CONFIRM_TIMEOUT`, `COOLDOWN`, `DUPLICATE`, `PINCH_NO_SELECTION` or `NO_HAND_TIMEOUT`.

### Configurable gesture mapping

**System Settings → Gesture mapping** lets you assign:

- **Activate / deactivate** — open palm, pinch, fist or point
- **Confirm selection** — open palm, pinch, fist or point
- **Cancel** — open palm, pinch, fist or point

Conduit prevents an invalid mapping where activate and confirm are the same gesture. The cancellation
gesture remains the emergency/cancel path. An Accessibility mode can additionally switch activation to
**Point** and confirmation to **Point** as an alternative motor pattern.

---

## 4. Signature-screen gestures

Signature screens are for examining something without touching it. Hospital uses local X-ray images you supply
viewer; the other four environments show **two cameras**:

- **CAM 1 · gesture** — the tracked camera with hand landmarks. This is the larger pane (~60%).
- **CAM 2 · object** — a second camera pointed at the object. Only this pane is transformed.

Choose CAM 2 in **System Settings → Camera → Signature object camera (CAM 2)**. The list follows the
browser's camera order. Use **Refresh** to re-request camera permission and re-scan; a second camera
that is busy in another app will not appear. With one camera, CAM 2 falls back to the gesture feed and
is labelled **same camera**.

### 4.1 The signature gesture dictionary

| Pose / movement | Action | Notes |
|---|---|---|
| **Pinch** (thumb + index touching) | **Zoom in** | Hold the pinch to keep zooming. Rate-based. |
| **Open palm, held still** | **Zoom out** | The palm must be still for about 0.22 s. A moving open palm is treated as a swipe. |
| **Fist, rotated** | **Rotate** the object camera | Used where rotation is available (industrial). Also rotates the industrial dashboard diagram. |
| **Point + drag** | **Pan** | Move the index-pointing hand. |
| **Open-palm horizontal swipe** | Change image / page repair or preparation steps (camera modes) | Movement must exceed the swipe threshold; a still open hand is zoom-out instead. Hospital pages use finger counts instead. |
| **Hold up 1, 2 or 3 fingers** | Hospital X-ray pages | Hold still for about 0.55 s: 1 = `first.jpg`, 2 = `second.jpg`, 3 = `third.jpg`. Pinch, fist and open palm are ignored. |

### 4.2 The pinch / open-hand clutch

A pinch naturally ends by opening the hand. If open-palm zoom-out armed immediately, releasing a
pinch would undo the zoom-in. Conduit therefore uses a clutch:

1. Pinch → zoom in. The open-palm zoom-out is now **disarmed**.
2. Open the hand. No zoom change happens; the HUD says `FIST OR POINT · RE-ARM ZOOM OUT`.
3. Briefly make a **fist** or a **point**, then open the hand again.
4. Hold the open palm still → zoom out.

Making a fist also arms rotation, so the reset fits the existing vocabulary. A point is the easier
alternative if a fist is uncomfortable.

### 4.3 Feedback you will see

- **Pose guide chips:** `pinch · zoom in`, `open · zoom out`, `fist · rotate`, `point · pan`.
- **Live hint:** e.g. `PINCH · ZOOM IN`, `OPEN HAND · ZOOM OUT`, `POINT-DRAG · PAN`,
  `FIST ROTATE · LIVE CAMERA`, `SWIPE → NEXT STEP`.
- **Zoom badge:** current magnification (and rotation where applicable).
- **Transform hint:** only CAM 2 is zoomed/panned/rotated.
- **Camera pills:** `live`, `starting`, `same camera` or `no camera`.
- **Reset view** button restores 1×, centre and 0°.

Zoom is limited to **1–5×** on the camera signature views (**3.6×** on the hospital X-ray images,
**1–4×** in Accessibility), with pan clamped so the image cannot be lost. Rotation is clamped to about **±60°** on the camera (the dashboard model is
**±70°**).

### 4.4 What signature gestures cannot do

- They cannot activate, select, confirm or execute a mode control.
- They cannot turn a physical device on or off.
- The local runtime pauses its Intent Engine while the signature overlay is open, so a held fist used for
  rotation is not interpreted as cancel/emergency-stop. Closing the overlay resets and resumes the engine.
- They do not alter demo data, analytics or device state.

---

## 5. Per-environment gestures and controls

### Hospital / clinical workstation

- **Digital controls:** Patient overview, Clinical records, Imaging viewer, Task checklist, Procedure
  step, Workstation timer, Request assistance.
- **Physical:** Call torch (phone torch).
- **Signature:** local X-ray viewer (`public/assets/xray/first.jpg`, `second.jpg`, `third.jpg`) — hold up **1 / 2 / 3 fingers** to jump to the matching image, point-drag pans, pinch zooms
  in, still open hand zooms out. The image is explicitly fictional and not diagnostic.
- No real patient record, medical device or hospital system is connected.

### Semiconductor / cleanroom workstation

- **Digital controls:** Process stage, Wafer inspection, Defect category, Confirm inspection,
  Manufacturing checklist.
- **Physical:** Equipment torch, Access flash (screen backlight).
- **Signature:** CAM 1 + CAM 2; pinch zooms CAM 2 in, still open hand zooms out, point-drag pans.
  Defect labels and the wafer map sharpen with zoom.

### Industrial maintenance

- **Digital controls:** Maintenance manual, Next repair step, Mark step complete, Report fault,
  Maintenance timer, Request assistance.
- **Physical:** Equipment torch, Service access buzz (vibration).
- **Signature:** CAM 1 + CAM 2; **fist rotation** turns CAM 2, pinch zooms in, still open hand zooms out,
  point-drag pans, horizontal open-palm swipe pages repair steps.
- Holding a tool while using the other hand is the intended demonstration.

### Food processing

- **Digital controls:** Recipe selector, Preparation step, Ingredient quantities, Cooking timer,
  QC checklist, Order status, Request assistance.
- **Physical:** Pass torch.
- **Signature timer gestures:**
  - Move an **open palm in a circle** around the timer dial to set duration (clockwise adds,
    anticlockwise reduces).
  - **Pinch** starts the timer; a new pinch pauses/resumes it.
  - **Lower-edge horizontal swipe** pages preparation steps.
- The timer, recipes, orders and QC checks are demonstration data; no kitchen equipment is connected.

### Accessibility / adaptive interaction

- **Digital controls:** Next panel, Select panel, Read panel, Back.
- **Physical:** optional Desk torch.
- **Signature:** pinch magnifies CAM 2, a still open hand reduces it, point-drag pans, plus large −/+
  buttons and a reset button.
- **Live configuration** on the dashboard:
  - Dwell time
  - Minimum confidence
  - Hand stability required
  - Gesture sensitivity (approach threshold)
  - Activation gesture: **Open palm** or **Point**
  - Alternative confirmation: **Pinch** or **Point**
  - Cancellation remains **closed fist**
  - **Large controls** expands the zone rail width without changing engine logic
- The configuration applies to the shared running engine; the camera is not restarted.
- Gesture input is not suitable for everyone. These controls demonstrate configurability, not a
  validated accessibility assessment.

---

## 6. System Settings reference

### Intent thresholds

| Setting | Default | Effect |
|---|---|---|
| Minimum confidence | 0.75 | Commands below this are never executed. |
| Minimum dwell duration | 0.6 s | Time the hand must stay in a zone before selection. |
| Movement stability threshold | 0.6 | Higher rejects shakier hands. |
| Confirmation timeout | 6 s | Selection is cancelled if no confirmation pinch arrives. |
| Cooldown after execution | 2 s | Blocks new selections after a command. |
| Score weights | normalised | Relative influence of trajectory, direction, stability, dwell, tracking quality, activation and gesture confidence. |

### Gesture mapping

Assign activation, confirmation and cancellation to open palm / pinch / fist / point. Selection itself
is always movement into a zone and cannot be replaced by a pose.

### Device mappings

Each zone has a label and a target device: **Torch**, **Screen flash** or **Vibration**. Mode geometry
controls where the rails sit; a physical zone and a digital mode control both pass through the same
selection and confirmation pipeline.

### Camera

- **Camera device** — backend index or browser camera.
- **Resolution** — 640×480, 800×600 or 1024×768; 4:3 keeps the landmark overlay aligned.
- **Landmark smoothing** — lower is smoother but laggier; 1 is no smoothing.
- **Signature object camera (CAM 2)** — separate browser camera for the object pane, remembered per
  browser. **Refresh** re-scans and briefly probes permission.

### Privacy

- Camera preview can be disabled in backend mode; landmarks only.
- Video storage is locked off. No code path records or uploads frames.
- Processing is local. Only structured events (state, confidence, reason) are logged — not images.
- A **CAMERA ACTIVE** indicator is shown while the camera is on.

### Simulation & phone node

- **Simulation mode** is always available and goes through the same validation, ACK and read-back path.
- **Real hardware** is a phone on a USB cable driven with `adb`. Settings hold the *adb path*, the phone
  *serial* (blank = first ready device), a command *timeout* and the *vibration pulse* length.
  **Find phones** lists what `adb devices` reports.
- USB debugging must be enabled and the *Allow USB debugging* prompt accepted. A browser cannot run
  `adb`, so real hardware needs the Python backend on the same machine as the phone.
- Only the phone's own outputs are used: rear torch, screen backlight and vibration motor.

### Connection

- Auto-detects the FastAPI backend; without it, the same engine, simulation and analytics run in the
  browser tab.
- **Reconnect** changes the backend URL.
- **Use browser runtime** forces the offline fallback.

---

## 7. Digital controls, physical controls and the Digital Twin

- **Digital** controls are mode-layer panels (records, recipes, wafer maps, checklists, timers). They
  pass the same Intent Engine pipeline and are labelled digital/simulated.
- **Physical** controls are exactly three outputs on the phone:
  - **Torch** — rear camera LED (`ON`/`OFF`, screen-flash fallback when the phone hides it)
  - **Screen flash** — backlight at maximum (`ON`/`OFF`, brightness restored afterwards)
  - **Vibration** — repeating haptic pulse (`ON`/`OFF`)
- Nothing else is actuated; there is no motor, fan or relay.
- Physical state changes only after a real node **ACK**. It is marked **CONFIRMED** only when an
  independent **read-back** agrees — in practice only the screen brightness. Torch and vibration are
  labelled *ack only*, with `verified: false`.
- If the link fails, the twin shows **DISCONNECTED/UNKNOWN** — never a fake success.
- **Hardware** in the navigation is the bench: one card per output with *Torch on / Torch off*,
  *Flash on / Restore* and *Buzz / Silence*, plus the last ACK, whether it was verified, the command id
  and any error. Every press is a `manual_test` command through the normal validate → ACK → read-back
  path. The Digital Twin device cards also keep their manual buttons. Mode control surfaces have no
  manual/rehearsal shortcut.

---

## 8. Demonstration and analytics capabilities

- Every environment has a guided demonstration script that advances as authorised actions occur.
- **Reset demo** restores the mode's fictional state.
- Per-environment interaction history records every accepted and rejected decision with its reason.
- **Baseline** is a deliberate comparison mode: gestures map directly to devices with no intent
  evaluation. It exists to demonstrate why Conduit's gating matters; normal operation uses **Conduit**.
- **Analytics** compares Baseline against Conduit trials. Nothing is prefilled or fabricated: an empty
  dataset shows an empty state.
- Start/stop a session and record intended/unintended trials; export CSV. The CSV includes the
  workspace/mode column.
- Session and trial data are stored locally (SQLite in the backend, browser storage in offline mode).

---

## 9. Troubleshooting gestures

| Symptom | Checks |
|---|---|
| *Camera could not start* and the log says `MediaPipe Tasks failed … Unable to open zip archive` | The hand model file is corrupt (a cut-off or HTML-fetched download). Run `scripts\fetch_model.bat` — it validates the shipped model at `public/mediapipe/hand_landmarker.task` and restores it; or delete `backend\vision\assets\hand_landmarker.task` and retry. |
| Browser mode: *Hand model could not be loaded* | The message lists every URL tried and what each returned. Run `scripts\fetch_model.bat` so `/mediapipe/hand_landmarker.task` and `/mediapipe/wasm/` are local, or use the pointer simulator. |
| Nothing activates | Camera running? Hand fully visible? Hold open palm still for the activation hold; check the activation gesture in Settings. |
| Zone highlights but does not select | Increase stillness, stay in the zone for the full dwell, lower the stability threshold slightly, or check confidence. |
| Pinch does not confirm | Make a **new** pinch after selection; hold about 0.2 s; check confirmation timeout and gesture mapping. |
| Fist cancels unexpectedly | A closed fist is the cancel gesture. Keep fingers relaxed/open outside the deliberate cancel. |
| Signature zoom-out will not start | Open-palm zoom-out is disarmed after a pinch. Make a brief fist or point, then hold the open palm still. |
| Open-palm swipe zooms instead of paging | Zoom-out requires a still palm; swipe decisively with horizontal movement. In the hospital X-ray view, swipe is disabled — use 1, 2 or 3 fingers or the ‹ › buttons. |
| Fingers do not change the hospital image | Hold the pose still for ~0.55 s with the hand fully visible, keep the palm stable, and make sure the count is 1–3 (thumb is ignored). A pinch (two fingers touching) is a zoom, not a page. |
| Pinch zoom is too slow/fast | Zoom is rate-based; hold longer or shorter. There is no distance threshold to fight. |
| Fist rotation seems dead | Show a clear closed fist and rotate the wrist; open-hand wrist twist no longer rotates. |
| Signature gestures pause | They pause during an in-flight Intent Engine selection/confirmation/execution. The signature overlay's local runtime also pauses the engine while open. |
| CAM 2 shows "same camera" | Only one browser video device is exposed. Connect/close apps using the second camera, then refresh in Settings. |
| Gesture flips around | Improve lighting/background, keep one hand in frame, reduce landmark smoothing lag, and use the pose hold rather than quick flashes. |
| Torch/vibration do nothing | Hardware page → check `adb devices` shows `device`, press *Find phones* and *Test link*. `unauthorized` means the debugging prompt was not accepted; *ack only* states are expected where the phone has no readable value. `UNKNOWN` means the phone is not answering — never a fake success. |
| Hospital X-ray panel asks for an image | Add `first.jpg`, `second.jpg` and `third.jpg` to `public/assets/xray/`, then reload. Swipe or use the ‹ › buttons to move between them. |

---

## 10. One-page cheat sheet

```
CORE INTENT
  Open palm, still            activate
  Move into zone + hold       select
  Pinch (new, ~0.2 s)         confirm
  Closed fist                 cancel
  Closed fist ~0.8 s idle     emergency stop / deactivate
  Still palm outside 2 s      deactivate

SIGNATURE
  Pinch, hold                 zoom in
  Open palm, still            zoom out
  Fist or point, then open    re-arm zoom-out after a pinch
  Fist, rotate                rotate object camera
  Point, drag                 pan object camera
  Open-palm horizontal swipe  change image / page steps (camera modes)
  1 / 2 / 3 fingers, held     hospital X-ray page (first/second/third.jpg)
  Reset view                  restore 1x, centre, 0 degrees

FOOD SIGNATURE
  Open palm circle            set timer duration
  Pinch                       start / pause timer
  Lower-edge swipe            page preparation steps

ACCESSIBILITY
  Pinch / open hand           magnify / reduce CAM 2
  Point drag                  pan
  Large buttons               alternative zoom controls
  Dashboard sliders           dwell, confidence, stability, sensitivity, gestures
```

---

## 11. Scope and safety

- Conduit is a prototype, not a certified medical, cleanroom, kitchen or industrial controller.
- It drives only your own phone's torch, screen and vibration motor. Never point it at mains, real locks,
  medical equipment, machinery, PLCs or safety interlocks.
- No environment connects to a real hospital, MES/fab, CMMS, kitchen or building system.
- Fictional demo data is labelled; physical success is only claimed after ACK + read-back, and the
  outputs that cannot be read back are explicitly marked as acknowledged only.
- Gesture recognition is rule-based, not a trained ML model; unusual hand shapes or poor lighting may
  classify as `other`. Use supported poses and steady lighting for reliable operation.
