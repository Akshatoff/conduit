# CONDUIT — Hardware demonstration setup

> **Isolated, low-voltage demonstration electronics only.** Never connect Conduit to mains power, real door
> locks / security systems, medical equipment or industrial machinery. This is a prototype, not a certified system.

## Bill of materials

| Item | Notes |
|---|---|
| ESP32 dev board (ESP32-WROOM-32 "DevKit") | USB powered |
| 1 × LED + 220 Ω resistor | *Lighting* |
| 1 × small 5 V DC fan (≤ 200 mA) | *Ventilation* |
| 1 × NPN transistor (2N2222 / BC337) + 1 kΩ base resistor **or** logic-level N-MOSFET (2N7000 / IRLZ44N) | fan driver |
| 1 × 1N4007 / 1N5819 diode | flyback diode across the fan — **required** |
| 1 × SG90 micro servo | *Access control*; moves a small **model** latch (cardboard / 3D print) |
| Breadboard, jumper wires, 5 V supply capable of ≥ 1 A for fan + servo (common GND with ESP32) | |

## Wiring

| Function | ESP32 pin | Circuit |
|---|---|---|
| Lighting | GPIO 25 | GPIO → 220 Ω → LED anode; LED cathode → GND |
| Ventilation | GPIO 26 | GPIO → 1 kΩ → NPN base; emitter → GND; fan(−) → collector; fan(+) → 5 V; 1N4007 across fan (cathode to +5 V) |
| Access (servo) | GPIO 27 | servo signal ← GPIO 27; servo V+ ← 5 V; servo GND ← GND (shared) |

Power the fan and servo from the external 5 V rail rather than the ESP32 3V3 pin. Join all grounds. Do not drive the
fan directly from a GPIO.

Servo positions: `SERVO_LOCKED_DEG = 10`, `SERVO_UNLOCKED_DEG = 100` in the sketch — adjust to your model latch.

## Flashing

1. Arduino IDE → install the **ESP32** board package.
2. Library Manager → install **ArduinoJson (v7)** and **ESP32Servo**.
3. Open `firmware/conduit_node.ino`, set `WIFI_SSID` / `WIFI_PASS`.
4. Board: *ESP32 Dev Module* → Upload. Open Serial Monitor at 115200 baud; note the printed **IP address**.
5. In Conduit → *System Settings → Simulation & ESP32*: enter the IP, switch Simulation off, Save, *Test connection*.

## Protocol (HTTP + JSON)

```
GET  /health    -> {"status":"ok","firmware":"conduit-node-1.0","uptime_s":123,"failsafe_ms":8000}
GET  /info      -> {"node":"conduit-esp32","devices":["lighting","ventilation","access"]}
GET  /state     -> {"devices":{"lighting":"ON","ventilation":"OFF","access":"LOCKED"}}
POST /command   <- {"command_id":"…","device":"lighting","action":"ON","source":"conduit_intent_engine"}
                -> {"command_id":"…","device":"lighting","status":"ACKNOWLEDGED","actual_state":"ON"}
```

* Actions: `ON`/`OFF` (lighting, ventilation), `LOCK`/`UNLOCK` (access).
* **Idempotent:** the node keeps the last 16 `command_id`s; a repeat returns the stored acknowledgement without moving anything.
* **Source filter:** only `conduit_intent_engine` and `manual_test` may drive outputs; `baseline_gesture` is refused on the node too.
* **Acknowledgement is sent after the output was applied** (the servo waits for its settle time).
* The host additionally **reads `/state` back** and only then marks the digital-twin state `CONFIRMED`.
* **Failsafe:** the host polls `/health` every ~2 s. If the node sees no request for 8 s it returns LED off, fan off,
  latch **LOCKED** and keeps that state until the next command.
* Command lifecycle shown in the UI: `SENT → ACKNOWLEDGED → CONFIRMED` (or `FAILED` / `DISCONNECTED`). In hardware
  mode a missing acknowledgement is *never* simulated.

## Quick checks without the UI

```powershell
curl http://<ESP32-IP>/health
curl http://<ESP32-IP>/state
curl -X POST http://<ESP32-IP>/command -d "{\"command_id\":\"t1\",\"device\":\"lighting\",\"action\":\"ON\",\"source\":\"manual_test\"}"
```

## Troubleshooting hardware

| Symptom | Check |
|---|---|
| UI says *Disconnected* / states `UNKNOWN` | IP correct? Same Wi-Fi network? PC firewall? `curl /health` works? |
| Fan does not spin | transistor orientation, shared GND, fan current, 5 V rail |
| ESP32 resets when servo moves | servo powered from the ESP32 — use an external 5 V supply |
| Servo jitters | brown-out; add a 470 µF capacitor across the servo supply |
| Browser runtime can't reach ESP32 | page is served over **https** (mixed content). Use the Python backend or open over http |
