/*
 * CONDUIT Arduino Uno node  -  firmware 1.0
 * ============================================================================
 * Two isolated low-voltage outputs, nothing else:
 *
 *   lighting  -> LED on D3   (D3 -> 220R -> LED -> GND)
 *   access    -> SG90 servo on D9, model latch: 0 deg = LOCKED, 90 deg = UNLOCKED
 *
 * There is no motor, fan or other actuator in this build. Do NOT drive a motor
 * from an Uno pin, and power the servo from a separate 5 V supply with a common
 * ground. Never connect this to mains, real locks, medical or industrial gear.
 *
 * ---------------------------------------------------------------------------
 * Serial protocol (9600 baud, one ASCII command per line, "\n" terminated)
 *
 * Host -> node
 *   PING                                  heartbeat + liveness probe
 *   INFO                                  device registration
 *   STATE?                                independent state read-back
 *   CMD <id> <device> <action> <source>   execute a validated command
 *
 * Node -> host
 *   READY conduit-uno-1.0                 printed once after reset
 *   PONG conduit-uno-1.0 <uptime_ms>
 *   INFO lighting,access
 *   STATE lighting=ON access=LOCKED servo=0
 *   ACK <id> <device> ACKNOWLEDGED|REJECTED <state> [detail]
 *   ERR <detail>
 *
 * Manual bench commands (usable from the Arduino Serial Monitor):
 *   LED_ON | LED_OFF | STATUS
 *   SERVO      toggle 0 <-> 90
 *   SERVO <d>  move to 0..180 (bench use; CMD always uses 0 or 90)
 *
 * Safety behaviour
 *   - Commands are idempotent: a repeated command_id returns the stored answer
 *     and never actuates twice.
 *   - Only "conduit_intent_engine" and "manual_test" may drive outputs; the
 *     experimental "baseline_gesture" source is refused here as defence in depth.
 *   - FAILSAFE: if the host is silent for FAILSAFE_MS the LED is switched off
 *     and the servo returns to 0 deg (LOCKED). The host sends PING every ~2 s.
 *   - There is no autonomous blink: the LED only ever reflects a command.
 *
 * Board: "Arduino Uno". Library: Servo (bundled with the Arduino IDE).
 * Serial Monitor baud: 9600. Close the Serial Monitor before starting Conduit,
 * because a COM port can only be open in one program.
 * ============================================================================
 */

#include <Servo.h>

// ------------------------------- configuration ------------------------------
const uint8_t PIN_LED = 3;
const uint8_t PIN_SERVO = 9;

const int SERVO_LOCKED_DEG = 0;
const int SERVO_UNLOCKED_DEG = 90;
const unsigned long SERVO_SETTLE_MS = 350;

const unsigned long FAILSAFE_MS = 5000;   // host heartbeat is ~2 s
const char *FIRMWARE_VERSION = "conduit-uno-1.0";

// -------------------------------- state -------------------------------------
Servo latchServo;

String stateLighting = "OFF";    // ON | OFF
String stateAccess = "LOCKED";   // LOCKED | UNLOCKED
int servoDeg = SERVO_LOCKED_DEG;

unsigned long lastHostMs = 0;
bool failsafeActive = false;

String line;

// Small idempotency history: an identical command_id is never applied twice.
struct AckRecord {
  String id;
  String reply;
};
const uint8_t HISTORY = 8;
AckRecord history[HISTORY];
uint8_t historyHead = 0;

// ------------------------------- outputs ------------------------------------
void applyOutputs() {
  digitalWrite(PIN_LED, stateLighting == "ON" ? HIGH : LOW);
  servoDeg = stateAccess == "UNLOCKED" ? SERVO_UNLOCKED_DEG : SERVO_LOCKED_DEG;
  latchServo.write(servoDeg);
}

void enterSafeState() {
  stateLighting = "OFF";
  stateAccess = "LOCKED";
  applyOutputs();
  failsafeActive = true;
  Serial.println("EVENT failsafe-safe-state");
}

void touchHost() {
  lastHostMs = millis();
  failsafeActive = false;
}

// ------------------------------- protocol -----------------------------------
String *stateRef(const String &device) {
  if (device == "lighting") return &stateLighting;
  if (device == "access") return &stateAccess;
  return nullptr;
}

String targetState(const String &device, const String &action) {
  if (device == "lighting") {
    if (action == "ON") return "ON";
    if (action == "OFF") return "OFF";
  } else if (device == "access") {
    if (action == "LOCK") return "LOCKED";
    if (action == "UNLOCK") return "UNLOCKED";
  }
  return "";
}

int findHistory(const String &id) {
  for (uint8_t i = 0; i < HISTORY; i++) {
    if (history[i].id.length() && history[i].id == id) return i;
  }
  return -1;
}

void remember(const String &id, const String &reply) {
  history[historyHead].id = id;
  history[historyHead].reply = reply;
  historyHead = (historyHead + 1) % HISTORY;
}

void sendState() {
  Serial.print("STATE lighting=");
  Serial.print(stateLighting);
  Serial.print(" access=");
  Serial.print(stateAccess);
  Serial.print(" servo=");
  Serial.println(servoDeg);
}

void sendAck(const String &id, const String &device, const char *status,
             const String &actual, const String &detail) {
  String reply = "ACK ";
  reply += id.length() ? id : "-";
  reply += ' ';
  reply += device.length() ? device : "-";
  reply += ' ';
  reply += status;
  reply += ' ';
  reply += actual.length() ? actual : "-";
  if (detail.length()) {
    reply += ' ';
    reply += detail;
  }
  Serial.println(reply);
  if (id.length()) remember(id, reply);
}

void handleCommand(const String &rest) {
  // rest = "<id> <device> <action> <source>"
  String part[4];
  int start = 0;
  for (uint8_t i = 0; i < 4; i++) {
    if (i == 3) {
      part[i] = rest.substring(start);
      break;
    }
    int space = rest.indexOf(' ', start);
    if (space < 0) {
      sendAck("", "", "REJECTED", "", "malformed command");
      return;
    }
    part[i] = rest.substring(start, space);
    start = space + 1;
  }

  const String &id = part[0];
  const String &device = part[1];
  const String &action = part[2];
  const String &source = part[3];

  if (!id.length()) {
    sendAck(id, device, "REJECTED", "", "missing command_id");
    return;
  }

  int seen = findHistory(id);
  if (seen >= 0) {  // idempotent replay
    Serial.println(history[seen].reply);
    return;
  }

  String *ref = stateRef(device);
  if (ref == nullptr) {
    sendAck(id, device, "REJECTED", "", "unknown device");
    return;
  }
  if (source != "conduit_intent_engine" && source != "manual_test") {
    sendAck(id, device, "REJECTED", *ref, "source not permitted");
    return;
  }

  String target = targetState(device, action);
  if (!target.length()) {
    sendAck(id, device, "REJECTED", *ref, "invalid action for device");
    return;
  }

  *ref = target;
  applyOutputs();
  if (device == "access") delay(SERVO_SETTLE_MS);  // let the servo arrive before acknowledging

  sendAck(id, device, "ACKNOWLEDGED", target, "");
}

// Manual bench helpers (Serial Monitor only; never used by the host).
void handleBench(const String &cmd) {
  if (cmd == "LED_ON") {
    stateLighting = "ON";
    applyOutputs();
    Serial.println("ACK: LED ON");
    return;
  }
  if (cmd == "LED_OFF") {
    stateLighting = "OFF";
    applyOutputs();
    Serial.println("ACK: LED OFF");
    return;
  }
  if (cmd == "SERVO") {
    stateAccess = stateAccess == "UNLOCKED" ? "LOCKED" : "UNLOCKED";
    applyOutputs();
    Serial.print("ACK: SERVO ");
    Serial.println(servoDeg);
    return;
  }
  if (cmd.startsWith("SERVO ")) {
    int deg = cmd.substring(6).toInt();
    deg = constrain(deg, 0, 180);
    stateAccess = (deg <= 45) ? "LOCKED" : "UNLOCKED";  // bench angles > 45 deg report UNLOCKED
    latchServo.write(deg);
    servoDeg = deg;
    Serial.print("ACK: SERVO ");
    Serial.print(servoDeg);
    Serial.print(" (");
    Serial.print(stateAccess);
    Serial.println(")");
    return;
  }
  if (cmd == "STATUS") {
    sendState();
    return;
  }
  Serial.println("ERR unknown command");
}

// --------------------------------- main -------------------------------------
void handleLine(String incoming) {
  incoming.trim();
  if (!incoming.length()) return;

  touchHost();

  if (incoming == "PING") {
    Serial.print("PONG ");
    Serial.print(FIRMWARE_VERSION);
    Serial.print(' ');
    Serial.println(millis());
    return;
  }
  if (incoming == "INFO") {
    Serial.println("INFO lighting,access");
    return;
  }
  if (incoming == "STATE?" || incoming == "STATUS") {
    sendState();
    return;
  }
  if (incoming.startsWith("CMD ")) {
    handleCommand(incoming.substring(4));
    return;
  }
  handleBench(incoming);
}

void setup() {
  Serial.begin(9600);

  pinMode(PIN_LED, OUTPUT);
  latchServo.attach(PIN_SERVO);

  stateLighting = "OFF";
  stateAccess = "LOCKED";
  applyOutputs();

  lastHostMs = millis();
  Serial.print("READY ");
  Serial.println(FIRMWARE_VERSION);
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      handleLine(line);
      line = "";
    } else if (c != '\r' && line.length() < 160) {
      line += c;
    }
  }

  if (!failsafeActive && millis() - lastHostMs >= FAILSAFE_MS) {
    enterSafeState();
  }
}
