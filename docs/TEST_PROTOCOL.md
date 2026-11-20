# CONDUIT — Controlled test protocol

The comparison between **Mode A (conventional gesture control)** and **Mode B (Conduit intent control)** is only
meaningful if both modes are tested on the same scripted scenarios. Conduit never generates, pre-fills or estimates
results: every number on the Analytics screen comes from trials you run with this protocol.

## 1. Definitions

A **trial** is one interaction attempt that the operator declares *before* performing it:

| Label | Meaning | Ground truth |
|---|---|---|
| `intended` | Operator deliberately wants a specific device toggled | target device is recorded |
| `unintended` | Movement that must **not** operate anything | no device should change |

Metrics (identical in the Python backend and the browser runtime):

| Metric | Definition |
|---|---|
| Attempts | number of trials |
| Accepted / Rejected | trials with / without ≥ 1 command dispatched to a device |
| Successful deliberate | intended trials whose command reached the **intended** device and ended `CONFIRMED` |
| **False activation rate** | unintended trials with a command dispatched ÷ unintended trials |
| Accidental rejection rate | unintended trials with **no** command dispatched ÷ unintended trials |
| Deliberate success rate | successful deliberate ÷ intended trials |
| Avg intent latency | mean wall time of one Intent Engine `update()` call (per-frame processing cost) |
| Avg end-to-end latency | validated command → device state `CONFIRMED` (ack + read-back included) |
| Device ack rate | commands acknowledged ÷ commands sent |
| Confirmation request rate | trials where an explicit confirmation was requested ÷ attempts |

> Rejections are **not** proof of accuracy. A system that rejects everything has a perfect accidental-rejection rate
> and a deliberate success rate of 0 %. Always read both.

## 2. Setup

* Same operator, camera position, lighting and background for both modes; camera ~60 cm away, hand and forearm visible.
* Simulation mode (default) is fine for the comparison. Baseline commands are **never** routed to physical hardware.
* Start the camera on *Live Interaction*, then go to *Analytics*.
* Use ≥ 20 trials per mode (≥ 10 intended, ≥ 10 unintended). Fewer trials are shown as "indicative only".

## 3. Scripted scenarios

Perform the *same list* in both modes. Randomise the order once and keep it.

**Intended (deliberate)**

| ID | Scenario | Mode B procedure |
|---|---|---|
| D1 | Toggle the torch | open palm (hold still) → move steadily into *Torch* → hold → pinch |
| D2 | Trigger the screen flash | same, *Screen flash* zone |
| D3 | Toggle vibration | same, *Vibration* zone |
| D4 | Toggle a device, then change mind | enter zone, hold, **fist** → expect cancel (record as *unintended*: nothing should change) |

Mode A procedure for D1–D3: show the mapped gesture (open palm = torch, fist = vibration). There are three physical outputs on the phone: torch, screen flash and vibration.

**Unintended (accidental)**

| ID | Scenario |
|---|---|
| A1 | Wave a hand across the whole frame |
| A2 | Quick swipe through the control zones |
| A3 | Reach past the controls to pick up an object |
| A4 | Scratch face / adjust glasses with the hand in view |
| A5 | Rest the hand inside a zone for ~3 s without intending anything |
| A6 | Make a casual pinch or fist while talking |

## 4. Procedure per trial (Analytics screen)

1. *Start session* → choose the mode under test (Mode A or B). A session always runs in the mode it is labelled with.
2. Choose *Ground-truth label* (+ target for intended) and the scenario text → **Start trial**.
3. Perform the scenario once.
4. **End trial.** The trial is stored with: command dispatched?, device/action, acknowledged?, confirmed?, number of
   rejections and their reason codes, whether confirmation was requested, latencies.
5. Repeat; **Stop session** when done. Run the other mode with the same scenario list.
6. **Export CSV** for the report (`conduit_trials.csv`, one row per trial, includes rejection reason codes).

## 5. Reading the result

* Report **false activation rate** and **deliberate success rate** together, with the number of trials.
* Mention the cost: Conduit adds deliberate dwell + pinch time before an action; the latency figures exclude it.
* State limits: single operator, single camera, small sample, simulation devices. No claim of clinical or industrial
  suitability is made.

## 6. Automated (camera-free) counterpart

`tests/test_intent_engine.py` replays the same scenario families with synthetic landmark sequences (swipe, wave,
pass-through then pinch, resting hand, jitter, stray pinch, timeouts, cancellation, cooldown, duplicates) and asserts
that none of the accidental ones executes while the deliberate one does. `tests/test_e2e.py` runs a baseline-vs-Conduit
session through the whole runtime and asserts false-activation 100 % vs 0 % on the *palm flash* scenario — a regression
test of the mechanism, not a performance claim.
