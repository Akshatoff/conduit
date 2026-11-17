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
                              │       (ESP32 / simulation)        (UI workflows)           │
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
| `kind` | `physical` (shared ESP32 device) or `digital` (mode-layer UI control). |
| `hint` | short helper copy for the mode dashboard. |

The Intent Engine passes `zone.action` into the existing action resolution. Existing configs with
no `action` behave exactly as before (all original tests still pass).

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
| **Semiconductor** | Simulated cleanroom workstation | Navigate process instructions and inspection data with gloved hands | next stage, inspect/zoom, defect category, confirm record, checklist, equipment LED, ventilation, model access | LED + fan + servo |
| **Industrial** | Equipment service bay | Read instructions and record findings while holding tools | manual, next step, complete step, fault report, timer, assistance, equipment LED, service latch | LED + servo |
| **Food processing** | Commercial kitchen prep line | Follow a recipe/timer without touching a shared screen | recipe, next step, ingredients, timer, QC check, order, assistance, pass lamp | shared LED |
| **Accessibility** | Adaptive desktop | One fixed interaction method excludes people | next, select, read, back, desk lamp + live settings | shared LED |

Each mode ships a fictional demonstration workflow, a guided demo script that auto-advances as
actions are authorised, per-mode interaction history and a **Reset demo** action.

### Mode A — Hospital / clinical workstation
* Fictional patients (`DEMO-0001…`), clearly labelled demo vitals and records.
* Sample imaging panel with placeholder SVG and gesture-cycled zoom.
* Checklist + procedure navigation, non-clinical timer, simulated assistance request.
* **No** real patient records, diagnosis, medical-device control or certified healthcare claim.

### Mode B — Semiconductor / cleanroom workstation
* Five simulated stages (lithography → etch → deposition → planarisation → inspection).
* Fictional wafer map (deterministic), sample defect categories, simulated inspection records.
* Equipment status dashboard; LED equipment indicator, DC fan ventilation indicator, SG90 model access.
* **No** fab/MES connection, cleanliness certification, contamination-prevention claim or process validation.

### Mode C — Industrial maintenance / field operations
* Simulated pump readings, digital manual, inspection checklist, maintenance timer.
* Simulated fault report and assistance request; LED indicator and model access latch.
* **No** machinery, PLC, interlock or safety-system connection.

### Mode D — Food processing / commercial kitchen
* Three fictional recipes, quantities, preparation steps, cooking timer, QC checklist, order board.
* **No** food-safety, allergen or contamination-prevention claim; no kitchen equipment connection.

### Mode E — Accessibility / adaptive interaction
* Live controls for dwell time, minimum confidence, stability threshold, activation/confirmation
  gestures and a large-control preset (zone geometry expands, same engine).
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

* Shared physical devices (LED / fan / servo latch) keep the original ACK + read-back lifecycle.
* The Twin page adds a **mode indicators** panel with explicit `node` vs `ui` labels.
* Simulation is always labelled SIMULATED; hardware without an ESP32 shows UNKNOWN and never fakes an ACK.
* No mode claims that a physical device responded when only the simulation did.

## 5. Analytics

The workspace is camera-first: the stage takes ~80% of the viewport width/height, while a narrow rail
shows the current workflow step, timer and the two most recent actions. Dashboard, controls, history and
demo guide are collapsed behind **Details** tabs and are not rendered until requested.

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
   * Select **IMAGING**, pinch, then select it again with a fresh pinch → zoom cycles.
   * **Accident:** sweep a hand across both rails → `TRANSIT` rejection, no change; show the interaction history.
   * Start the **timer** by gesture; show the Digital Twin `hospital.timer` UI state.
3. **Semiconductor** — switch environment (camera keeps running).
   * Advance stage, open wafer inspection, cycle defect, confirm a simulated record.
   * Toggle **EQUIP LED** / **VENT FAN** / **ACCESS**; show the ACK → read-back lifecycle on the Twin page.
   * Optional: *Simulate link failure* and repeat → DISCONNECTED / UNKNOWN, no fake success.
4. **Industrial** — open manual, advance step, complete checklist, raise simulated fault; show history.
5. **Accessibility** — increase dwell/confidence live, switch confirmation gesture, toggle large controls;
   show the same engine becoming stricter/looser without a camera restart.
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
