# Hardware — Arduino Uno node (USB serial)

Conduit has one physical build: an **Arduino Uno** connected to the machine running the Conduit
backend by **USB serial**. There is **no motor, fan or other actuator** — two isolated low-voltage
outputs only:

| Device id | Function | Output | Meaning |
|---|---|---|---|
| `lighting` | Lighting | LED on **D3** | `ON` / `OFF` |
| `access` | Access control | SG90 servo on **D9** | `LOCKED` = 0°, `UNLOCKED` = 90° |

Everything else in the app (devices, zones, analytics, validation) uses these two ids. There is no
`ventilation` device: the earlier fan/motor has been removed from the firmware, backend, UI, tests
and docs.

> **Safety.** Isolated low-voltage demonstration only. Never connect this to mains power, real door
> locks, medical devices, machinery or anything safety-critical. Power the servo from its own 5 V
> supply with a common ground. A fan/motor, if you ever add one, needs a transistor/MOSFET driver —
> never an Arduino pin.

---

## 1. Bill of materials

| Part | Role |
|---|---|
| Arduino Uno (or Uno-compatible) + USB cable | the node |
| 1 × LED + 220 Ω resistor | `lighting` |
| 1 × SG90 (or similar 5 V hobby servo) | `access` model latch |
| Breadboard, jumper wires | wiring |
| 5 V supply (≥ 500 mA) for the servo | avoids brown-outs/resets |

## 2. Wiring

| Function | Uno pin | Circuit |
|---|---|---|
| LED | **D3** | D3 → 220 Ω → LED anode; LED cathode → GND |
| Servo signal | **D9** | servo signal → D9 |
| Servo power | — | servo V+ → external 5 V; servo GND → **common ground with the Uno** |

Do not power the servo from the Uno's 5 V pin if the board resets when it moves. The servo draws
current spikes; the external rail plus a shared ground fixes it.

## 3. Flash the firmware

Sketch: [`firmware/conduit_uno/conduit_uno.ino`](../firmware/conduit_uno/conduit_uno.ino)

1. Arduino IDE → *Tools → Board → **Arduino Uno*** and the correct port.
2. No external libraries beyond the bundled **Servo** library.
3. Upload.
4. The board prints `READY conduit-uno-1.0` at **9600 baud**.
5. **Close the Arduino Serial Monitor** before starting Conduit — a serial port can only be open in
   one program at a time.

### Manual bench test (Serial Monitor, 9600 baud)

```
PING           -> PONG conduit-uno-1.0 <uptime_ms>
STATE?         -> STATE lighting=OFF access=LOCKED servo=0
LED_ON         -> ACK: LED ON
LED_OFF        -> ACK: LED OFF
SERVO          -> ACK: SERVO 90          (toggles 0 <-> 90)
SERVO 0        -> ACK: SERVO 0 (LOCKED)
```

These short commands are for the Serial Monitor only. Conduit itself uses the structured protocol
below, which carries a command id so a repeated message is never actuated twice.

## 4. Serial protocol (9600 baud, one line per command)

Host → node:

```
PING
INFO
STATE?
CMD <command_id> <device> <action> <source>
```

Node → host:

```
READY conduit-uno-1.0
PONG conduit-uno-1.0 <uptime_ms>
INFO lighting,access
STATE lighting=ON access=LOCKED servo=0
ACK <command_id> <device> ACKNOWLEDGED|REJECTED <state> [detail]
ERR <detail>
```

* Devices: `lighting` (`ON`/`OFF`), `access` (`LOCK`/`UNLOCK`).
* Sources that may drive outputs: `conduit_intent_engine`, `manual_test`. A `baseline_gesture`
  command is refused by the firmware as defence in depth.
* The controller verifies that the echoed `command_id` matches the command it sent.
* After the acknowledgement the controller sends `STATE?` and only marks the twin `CONFIRMED` when
  the read-back agrees with the requested state.

### Safety behaviour in the firmware

* **Idempotent:** the last 8 command ids are remembered; a repeated id replays the stored answer and
  never actuates again.
* **Failsafe:** if the host is silent for **5 s** (heartbeat every ~2 s) the LED switches off and the
  servo returns to 0° (`LOCKED`).
* **No autonomous blink**: the LED only reflects a command or the failsafe.
* **Validation:** unknown device, invalid action or a forbidden source is answered `REJECTED` and the
  outputs are left untouched.

## 5. Configure Conduit

1. Start the backend (`scripts\run.bat` on Windows) — the browser alone cannot open a serial port.
2. *System Settings → Simulation & Arduino Uno*:
   * **Serial port**: `COM3` (Windows), `/dev/ttyACM0` (Linux) or `/dev/cu.usbmodem…` (macOS).
     Use *Find ports* to list what the backend can see.
   * **Baud**: `9600` (must match the sketch).
   * **Timeout**: 2 s is fine; servo moves add ~350 ms.
3. Save → switch **Simulation mode** off → *Test connection*.
4. Open **Hardware** in the navigation: LED and servo bench, or **Digital Twin** for the full
   ACK + read-back lifecycle.

Environment overrides: `CONDUIT_SERIAL_PORT`, `CONDUIT_SERIAL_BAUD` (see `.env.example`).

## 6. The Hardware page (bench)

`Hardware` in the top navigation is the one place to exercise each physical output individually:

* **LED · D3** — *LED ON* / *LED OFF*.
* **Servo · D9** — *Rotate to 90°* (`UNLOCK`) / *Rotate to 0°* (`LOCK`), with an arm graphic showing
  the confirmed angle.
* Each press is a `manual_test` command through the normal controller: validate → `SENT` → `ACK` →
  `STATE?` read-back → `CONFIRMED`. The card shows the last ACK, the command id and any error.
* Simulation/hardware toggle and *Test link* live on the same page.
* Mode screens never use this page — they go through the Intent Engine only.

## 7. What each environment calls the outputs

| Environment | LED (`lighting`) | Servo (`access`) |
|---|---|---|
| Hospital | room-status indicator | supply-cabinet latch |
| Semiconductor | equipment status indicator | model access mechanism |
| Industrial | line-status lamp | demo access barrier |
| Food processing | station-status lamp | sample-hatch latch |
| Accessibility | adaptive indicator | adaptive latch |

Nothing here is a real interlock, indicator of clinical state or safety device.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot open serial port 'COM3'` | port in use (Serial Monitor, another app) or wrong name; replug the board |
| `No reply to PING` | sketch not running / wrong baud; close the Serial Monitor and re-flash |
| Twin stuck `DISCONNECTED` / `UNKNOWN` | cable, port, baud; then *Test link*. No acknowledgement is ever invented |
| UNO resets when the servo moves | power the servo from a separate 5 V supply, common ground |
| Servo jitters but does not hold | insufficient supply current; add a capacitor across the servo supply |
| LED never lights | polarity, 220 Ω resistor, correct pin D3 |
| Browser runtime shows hardware as unavailable | start the Python backend; browsers cannot open a serial port |
| Every command is `REJECTED` | device/action mismatch — check the `detail` field in the log |

## 9. Automated tests without hardware

`python -m pytest -q` exercises the full controller against a fake serial transport that speaks the
real line protocol (acknowledgement, wrong command id, silence, rejection, state mismatch). No board
is required, and a missing port can only ever produce `DISCONNECTED` — never a fabricated ACK.
