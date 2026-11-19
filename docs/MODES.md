# Conduit — operational environments (multi-mode)

Conduit is one platform with one interaction intelligence and five **operational environments**.
A mode is configuration, workflow and presentation — never a second Intent Engine.

```
                              ┌─────────────────────────────────────────────┐
                              │                CONDUIT CORE                 │
  webcam ─▶ spatial perception ─▶ trajectory analysis ─▶ INTENT ENGINE ─▶ validation          │
                              │        (dwell · stability · direction · confidence)         │
                              │                          │                                  │
                              │            Interaction controller / command validation      │
                              │                │                        │                   │
                              │       shared device node          mode digital layer        │
                              │       (Arduino Uno / simulation)        (UI workflows)           │
                              │                │                        │                   │
                              │        ACK + state read-back      mode_action event         │
                              │                          │                                  │
                              │           Digital Twin · SQLite · analytics (workspace)     │
                              └───────────────────────────┬─────────────────────────────────┘
                                                          │
                                                 MODE MANAGER
                    ┌────────────┬────────────┬───────────┴───────┬────────────────┐
                 Hospital    Semiconductor  Industrial    Food processing   Accessibility
```

Each environment provides: zone geometry, virtual controls, workflow/checklist copy, fictional demo
data, a demo script, digital-twin mappings, analytics categories and a dashboard. The reducer only
interprets an action **after** the shared pipeline authorised it.

---

## 1. Shared interaction contract

Every environment uses the same six steps:

1. **Activate** — still open palm (configurable in Accessibility).
2. **Approach** — move up the central corridor, then deliberately toward a control.
3. **Select** — dwell ≥ `min_dwell_s`, stability ≥ threshold, confidence ≥ `min_confidence`.
4. **Confirm** — a *separate* confirmation gesture (pinch by default).
5. **Execute** — either a physical device command or a labelled digital mode action.
6. **Verify** — physical: node ACK + independent state read-back; digital: acknowledged by the mode layer.

Accidental movement (a sweep, a hand crossing the rails) produces `TRANSIT` / `LEFT_ZONE`
rejections and no action. Cooldowns, duplicate prevention, confirmation timeout, cancel (fist) and
no-hand timeout are unchanged from the original Conduit engine.

### Zone extensions (backwards compatible)

`Zone` (backend and TypeScript) gained three optional fields:

| field | meaning |
|---|---|
| `action` | explicit command action (e.g. `OPEN_RECORD`). Omitted = classic toggle behaviour. |
| `kind` | `physical` (shared Arduino Uno output: `lighting` LED / `access` servo) or `digital` (mode-layer UI control). |
| `hint` | short helper copy for the mode dashboard. |

The Intent Engine passes `zone.action` into the existing action resolution. Existing configs with
no `action` behave exactly as before (all original tests still pass).

### View-only signature interactions

Each environment adds a **Signature screen** on top of the unchanged pipeline. It consumes the primary
hand plus an optional second hand and drives *view state only*: hospital selects fictional images, while
semiconductor, industrial, food and accessibility show **two camera panes**. CAM 1 is the gesture camera
(the exact stream MediaPipe tracks, drawn with landmarks); CAM 2 is a separately selected physical camera
pointed at the object, and only CAM 2 is zoomed, panned, rotated or magnified. CAM 1 is the larger pane
(~60%); the CAM 2 **camera index** is chosen under **Settings → Camera → Signature object camera** and
persists (`Camera 0 · label`, `Camera 1 · label`, …); its header shows the active index. Food keeps both panes visible with a timer HUD. If a second camera cannot be opened, CAM 2 mirrors
CAM 1 and is labelled `same camera`.
A small chip names the active gesture. It never emits a command and is paused while the Intent Engine is
selecting, confirming or executing. The Python worker and browser runtime request up to two hands; the
Intent Engine still consumes only the first (primary) hand.

### Digital controls are not physical execution

* Digital device ids (e.g. `hospital.timer`) are **not** in `DEVICE_SPECS` and never reach the device controller.
* The backend confirms them as `executed_on = "mode_ui"`, `digital = true`, `simulated = true`, and publishes a `mode_action` event consumed by the UI.
* The Digital Twin shows `UI` entries separately from `node` entries. A digital action never updates a physical twin.
* Unknown device ids are rejected and the engine is told execution failed.

Trade-off (documented, not hidden): the backend confirms that the *intent pipeline authorised the
action*; the mode layer may still find the workflow step not applicable (e.g. confirming an
inspection before opening it). The interaction history shows `not applicable` for those, and
analytics reflect the command that was authorised.

---

## 2. The five environments

| Mode | Environment | Primary problem | Gesture controls | Physical outputs |
|---|---|---|---|---|
| **Hospital** | Ward workstation / shared clinical display | Check information while hands are occupied, without touching a shared screen | overview, records, imaging zoom, checklist, procedure step, timer, assistance, lamp | shared LED |
| **Semiconductor** | Simulated cleanroom workstation | Navigate process instructions and inspection data with gloved hands | next stage, inspect/zoom, defect category, confirm record, checklist, equipment LED, model access | LED + servo |
| **Industrial** | Equipment service bay | Read instructions and record findings while holding tools | manual, next step, complete step, fault report, timer, assistance, equipment LED, service latch | LED + servo |
| **Food processing** | Commercial kitchen prep line | Follow a recipe/timer without touching a shared screen | recipe, next step, ingredients, timer, QC check, order, assistance, pass lamp | shared LED |
| **Accessibility** | Adaptive desktop | One fixed interaction method excludes people | next, select, read, back, desk lamp + live settings | shared LED |

Each mode ships a fictional demonstration workflow, a guided demo script that auto-advances as
actions are authorised, per-mode interaction history and a **Reset demo** action.

### Mode A — Hospital / clinical workstation
* Fictional patients (`DEMO-0001…`), clearly labelled demo vitals and records.
* Sample imaging panel: horizontal swipe changes the fictional image, point-drag pans, pinch zooms in, open hand zooms out.
* Checklist + procedure navigation, non-clinical timer, simulated assistance request.
* **No** real patient records, diagnosis, medical-device control or certified healthcare claim.

### Mode B — Semiconductor / cleanroom workstation
* Five simulated stages (lithography → etch → deposition → planarisation → inspection).
* Dashboard wafer map (deterministic). **Signature screen:** CAM 1 tracks the hands; pinch zooms **CAM 2** in, a still open hand zooms out, point-drag pans.
* Equipment status dashboard; LED equipment indicator and SG90 model access.
* **No** fab/MES connection, cleanliness certification, contamination-prevention claim or process validation.

### Mode C — Industrial maintenance / field operations
* Simulated pump readings, digital manual, inspection checklist, maintenance timer.
* Dashboard machine diagram. **Signature screen:** fist rotation turns **CAM 2**, pinch zooms in, a still open hand zooms out, point-drag pans, horizontal swipe pages repair steps; CAM 1 stays raw.
* Simulated fault report and assistance request; LED indicator and model access latch.
* **No** machinery, PLC, interlock or safety-system connection.

### Mode D — Food processing / commercial kitchen
* Three fictional recipes, quantities, preparation steps, cooking timer, QC checklist, order board.
* Gesture timer: a circular hand motion near the dial adjusts duration, pinch starts/pauses, a lower-edge swipe pages preparation steps.
* **No** food-safety, allergen or contamination-prevention claim; no kitchen equipment connection.

### Mode E — Accessibility / adaptive interaction
* Live controls for dwell time, minimum confidence, stability threshold, gesture sensitivity,
  activation/confirmation gestures and a large-control preset (zone geometry expands, same engine).
* Dashboard adaptive panels with a hand-focus dwell preview. **Signature screen:** pinch magnifies **CAM 2**, a still open hand reduces it, plus large −/+ alternative buttons; CAM 1 shows the hands.
* Explicit textual feedback for every state; four large demo panels + reading view.
* **No** claim that gesture input suits all users or disabilities; not co-designed with disabled users.

---

## 3. Mode selection and switching

* The application opens on **Environments** (mode selection).
* Entering a mode sets `workspace_mode` + that mode’s zones in the shared settings and navigates to
  **Workspace**.
* The camera is **not** restarted and the Intent Engine instance is **not** recreated. The engine
  receives the new zone configuration and resets its selection state (`apply_settings`).
* Per-mode dashboard state is kept in the frontend store, so switching back preserves the demo.
* The active environment is shown in the header and recorded with every analytics session/trial.

Backend API used: `PUT /api/settings` (`workspace_mode`, `intent.zones`) — the existing settings
endpoint, no parallel control path. `GET /api/system/status` now also reports `workspace_mode` and
`zone_controls`. Digital results are published as the new WebSocket event `mode_action`.

---

## 4. Digital Twin

* Shared physical outputs (LED on D3 / servo latch on D9) keep the original ACK + read-back lifecycle.
* The Twin page adds a **mode indicators** panel with explicit `node` vs `ui` labels.
* Simulation is always labelled SIMULATED; hardware without a configured serial port shows UNKNOWN and never fakes an ACK.
* No mode claims that a physical device responded when only the simulation did.

## 5. Analytics

The workspace is camera-first: the stage takes ~80% of the viewport width/height, while a narrow rail
shows the current workflow step, timer and the two most recent actions. Dashboard, controls, history and
demo guide are collapsed behind **Details** tabs and are not rendered until requested. The **Signature
screen** toggle overlays a gesture view on the stage (the camera keeps running underneath); its buttons
remain clickable while the rest of the surface passes pointer input through to the camera simulator.

Every session and trial now stores `workspace` (the active environment).

* New metric slice `by_workspace` in the summary; Environment comparison table in the UI.
* Derived metrics added: confirmation success rate (confirmed trials that executed / trials that asked
  for confirmation) and mean operator task duration (trial end − trial start). Both stay empty until
  trials exist; neither is estimated.
* CSV adds a `workspace` column: `session_id,mode,workspace,trial_id,…`.
* Nothing is pre-seeded. The empty state remains explicit; small samples are flagged in the UI.
* Existing baseline-vs-conduit comparison is unchanged.

SQLite upgrade is additive: `ALTER TABLE … ADD COLUMN workspace` runs automatically for existing
local databases.

---

## 6. Recommended judge demonstration (≈ 6 minutes)

1. **Environments** — show the five cards, the shared pipeline ribbon and the prototype/safety labels (30 s).
2. **Hospital** — enter; point out the fictional-data banner, the two control rails and the central approach corridor.
   * Start camera (or pointer simulator).
   * Hold open palm → activation ring; select **OVERVIEW** (dwell + confidence), pinch → panel opens (digital ACK).
   * Select **IMAGING**, pinch → the imaging panel opens. Toggle **Signature screen**; swipe to change the
     fictional image, point-drag to pan, pinch to zoom in, hold an open hand still to zoom out. Every action still requires the engine.
   * **Accident:** sweep a hand across both rails → `TRANSIT` rejection, no change; show the interaction history.
   * Start the **timer** by gesture; show the Digital Twin `hospital.timer` UI state.
3. **Semiconductor** — switch environment (camera keeps running).
   * Advance stage, then use **Signature screen**: CAM 1 shows the tracked hands, CAM 2 the object camera.
     Pinch to zoom CAM 2 in, hold an open hand still to zoom out (fist/point reset after a pinch), point-drag to pan. Choose CAM 2 in **Settings → Camera** if more than one camera is connected.
   * Toggle **EQUIP LED** / **ACCESS**; show the ACK → read-back lifecycle on the Twin page.
   * Optional: *Simulate link failure* and repeat → DISCONNECTED / UNKNOWN, no fake success.
4. **Industrial** — open manual, advance step, complete checklist, raise simulated fault; show history.
   In **Signature screen**, rotate a fist to turn CAM 2, pinch to zoom in, hold an open hand still to zoom out, swipe to browse steps;
   CAM 1 remains the raw gesture view.
   **Food** — open the signature timer: circle to set duration, pinch to start/pause, swipe the lower edge.
5. **Accessibility** — increase dwell/confidence/sensitivity live, switch confirmation gesture, toggle large
   controls; show the same engine becoming stricter/looser without a camera restart. The signature screen
   magnifies CAM 2 with two hands or large buttons while CAM 1 shows the hands — it is a view, not a selection.
6. **Analytics** — show that the empty state is empty, run a trial per environment if time permits,
   export CSV with the `workspace` column. Explain that results are recorded, not fabricated.
7. **Reset demo** in any environment restores the dashboard and history.

---

## 7. Adding another environment

1. Create `src/modes/<name>/config.ts` exporting a `ModeDefinition` (metadata, controls, `railZones(controls)`, workflow, checklist, demo, twin, analytics, safety).
2. Add `demoData.ts` (fictional only) and `reducer.ts` (what an authorised action means).
3. Add `Dashboard.tsx` using the primitives in `components/mode/DashboardKit.tsx`.
4. Register it in `src/modes/registry.ts` (and, if desired, add art in `components/mode/ModeArt.tsx`).
5. Digital controls need no backend change: they are zones with `kind: "digital"` + `action`.
6. Add it to `MODES` and run `npm run test:modes` — registry integrity and the shared-engine check run automatically.

---

## 8. Known limitations

* Mode dashboards and workflow rules live in the frontend; the backend validates intent authorisation and
  digital-vs-physical routing, not each workflow precondition.
* Modes are demonstration scenarios, not validated clinical/industrial/food/accessibility products.
* Zone layouts are limited to two rails with a central corridor; very large hands or close camera positions
  may need the Accessibility large-control preset or Settings threshold tuning.
* Analytics comparison across environments is only meaningful with the same operator, scenarios and ≥ 20 trials each.
* Real-camera behaviour must be rehearsed and tuned as described in the main README.
* Two-camera signature views need a second physical camera for a distinct object image. With one webcam,
  CAM 2 falls back to the gesture feed, is labelled `same camera`, and still demonstrates the transform.
  The selected CAM 2 device is stored per browser; camera permissions apply to both devices. If the
  Settings list contains only one camera, the browser is exposing one device — connect the other camera,
  close apps using it, and press **Refresh** (which briefly probes camera permission).
* Signature gestures are pose-based and one-handed: **pinch** = zoom in, **still open palm** = zoom out,
  **fist rotation** = rotate, **point-drag** = pan, **open-palm swipe** = change image/page. Food remains
  usable one-handed; accessibility also exposes large buttons.
* Open-palm zoom-out disarms after a pinch until the hand passes through a fist/point reset. This prevents
  releasing a pinch from immediately reversing it; the HUD hint shows `FIST OR POINT · RE-ARM ZOOM OUT`.
  A still open palm is required, so horizontal swipes (which move the hand) do not zoom.
* Hospital signature images are fictional and deterministic. Other signature screens show the operator's
  own camera feeds and load no wafer metrology, machine telemetry or kitchen data.
