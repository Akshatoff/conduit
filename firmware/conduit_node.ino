/*
 * CONDUIT demonstration node  -  ESP32 firmware
 * ------------------------------------------------------------------
 * Drives three ISOLATED LOW-VOLTAGE demonstration outputs:
 *   lighting     -> LED (+220R resistor)               GPIO 25
 *   ventilation  -> small 5V DC fan via NPN/MOSFET     GPIO 26  (flyback diode across fan!)
 *   access       -> SG90 servo moving a MODEL latch    GPIO 27
 *
 * NEVER connect this to mains power, real door locks, medical or industrial equipment.
 *
 * Protocol (HTTP + JSON), see README "ESP32 protocol":
 *   GET  /health   -> {"status":"ok", ...}                      (also the host heartbeat)
 *   GET  /info     -> node + device registration
 *   GET  /state    -> {"devices":{"lighting":"ON",...}}          (independent read-back)
 *   POST /command  -> {"command_id","device","action","source"}  => acknowledgement JSON
 *
 * Safety behaviour
 *   - Commands are idempotent: a repeated command_id returns the stored acknowledgement and does
 *     NOT actuate again.
 *   - Only the sources "conduit_intent_engine" and "manual_test" may drive outputs. The experimental
 *     "baseline_gesture" source is refused here as defence in depth.
 *   - FAILSAFE: if no HTTP request has been received for FAILSAFE_MS the node returns every output
 *     to its safe state (LED off, fan off, latch LOCKED).
 *
 * Libraries (Arduino Library Manager): ArduinoJson (v7), ESP32Servo.
 * Board: "ESP32 Dev Module". Fill in WIFI_SSID / WIFI_PASS below.
 */
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ----------------------------- configuration -----------------------------
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASS = "YOUR_WIFI_PASSWORD";

const int PIN_LED = 25;
const int PIN_FAN = 26;
const int PIN_SERVO = 27;

const int SERVO_LOCKED_DEG = 10;
const int SERVO_UNLOCKED_DEG = 100;
const unsigned long SERVO_SETTLE_MS = 450;

const unsigned long FAILSAFE_MS = 8000;  // host sends /health roughly every 2 s
const char *FIRMWARE_VERSION = "conduit-node-1.0";

// ------------------------------- state ----------------------------------
WebServer server(80);
Servo latchServo;

String stateLighting = "OFF";
String stateVentilation = "OFF";
String stateAccess = "LOCKED";

unsigned long lastContact = 0;
bool failsafeActive = false;

struct AckRecord {
  String id;
  String body;
};
const int HISTORY = 16;
AckRecord history[HISTORY];
int historyHead = 0;

// ------------------------------ outputs ---------------------------------
void applyOutputs() {
  digitalWrite(PIN_LED, stateLighting == "ON" ? HIGH : LOW);
  digitalWrite(PIN_FAN, stateVentilation == "ON" ? HIGH : LOW);
  latchServo.write(stateAccess == "UNLOCKED" ? SERVO_UNLOCKED_DEG : SERVO_LOCKED_DEG);
}

void enterSafeState() {
  stateLighting = "OFF";
  stateVentilation = "OFF";
  stateAccess = "LOCKED";
  applyOutputs();
  failsafeActive = true;
  Serial.println("[failsafe] no host contact - outputs returned to safe state");
}

void touch() {
  lastContact = millis();
  failsafeActive = false;
}

// ------------------------------ helpers ---------------------------------
String *stateRef(const String &device) {
  if (device == "lighting") return &stateLighting;
  if (device == "ventilation") return &stateVentilation;
  if (device == "access") return &stateAccess;
  return nullptr;
}

// Maps an action to the resulting state for a device; returns "" if the action is invalid.
String targetState(const String &device, const String &action) {
  if (device == "access") {
    if (action == "LOCK") return "LOCKED";
    if (action == "UNLOCK") return "UNLOCKED";
    return "";
  }
  if (action == "ON") return "ON";
  if (action == "OFF") return "OFF";
  return "";
}

String ackBody(const String &id, const String &device, const char *status, const String &actual, const char *detail) {
  JsonDocument doc;
  doc["command_id"] = id;
  doc["device"] = device;
  doc["status"] = status;
  doc["actual_state"] = actual;
  if (detail && detail[0]) doc["detail"] = detail;
  String out;
  serializeJson(doc, out);
  return out;
}

void sendJson(int code, const String &body) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(code, "application/json", body);
}

// ------------------------------ handlers --------------------------------
void handleHealth() {
  touch();
  JsonDocument doc;
  doc["status"] = "ok";
  doc["firmware"] = FIRMWARE_VERSION;
  doc["uptime_s"] = millis() / 1000;
  doc["failsafe_ms"] = FAILSAFE_MS;
  String out;
  serializeJson(doc, out);
  sendJson(200, out);
}

void handleInfo() {
  touch();
  JsonDocument doc;
  doc["node"] = "conduit-esp32";
  doc["firmware"] = FIRMWARE_VERSION;
  JsonArray devs = doc["devices"].to<JsonArray>();
  const char *ids[] = {"lighting", "ventilation", "access"};
  for (auto id : ids) devs.add(id);
  String out;
  serializeJson(doc, out);
  sendJson(200, out);
}

void handleState() {
  touch();
  JsonDocument doc;
  doc["devices"]["lighting"] = stateLighting;
  doc["devices"]["ventilation"] = stateVentilation;
  doc["devices"]["access"] = stateAccess;
  doc["failsafe_was_active"] = failsafeActive;
  String out;
  serializeJson(doc, out);
  sendJson(200, out);
}

void handleCommand() {
  touch();
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    sendJson(400, ackBody("", "", "REJECTED", "", "malformed JSON"));
    return;
  }
  String id = doc["command_id"] | "";
  String device = doc["device"] | "";
  String action = doc["action"] | "";
  String source = doc["source"] | "";

  // idempotency: same command_id => same acknowledgement, no re-actuation
  for (int i = 0; i < HISTORY; i++) {
    if (history[i].id.length() && history[i].id == id) {
      sendJson(200, history[i].body);
      return;
    }
  }

  String *ref = stateRef(device);
  String reply;
  if (id.length() == 0) {
    reply = ackBody(id, device, "REJECTED", "", "missing command_id");
  } else if (ref == nullptr) {
    reply = ackBody(id, device, "REJECTED", "", "unknown device");
  } else if (source != "conduit_intent_engine" && source != "manual_test") {
    reply = ackBody(id, device, "REJECTED", *ref, "source not permitted to drive outputs");
  } else {
    String target = targetState(device, action);
    if (target.length() == 0) {
      reply = ackBody(id, device, "REJECTED", *ref, "invalid action for device");
    } else {
      *ref = target;
      applyOutputs();
      if (device == "access") delay(SERVO_SETTLE_MS);  // let the servo reach position before acknowledging
      reply = ackBody(id, device, "ACKNOWLEDGED", *ref, "");
      Serial.printf("[cmd] %s %s -> %s (%s)\n", device.c_str(), action.c_str(), ref->c_str(), source.c_str());
    }
  }
  history[historyHead] = {id, reply};
  historyHead = (historyHead + 1) % HISTORY;
  sendJson(200, reply);
}

void handleNotFound() { sendJson(404, "{\"error\":\"not found\"}"); }

// -------------------------------- setup ---------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  latchServo.setPeriodHertz(50);
  latchServo.attach(PIN_SERVO, 500, 2400);
  applyOutputs();  // safe state on boot

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.print("\nConnected. IP address: ");
  Serial.println(WiFi.localIP());  // enter this in CONDUIT -> Settings -> ESP32 host

  server.on("/health", HTTP_GET, handleHealth);
  server.on("/info", HTTP_GET, handleInfo);
  server.on("/state", HTTP_GET, handleState);
  server.on("/command", HTTP_POST, handleCommand);
  server.onNotFound(handleNotFound);
  server.begin();
  lastContact = millis();
}

void loop() {
  server.handleClient();
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(500);
  }
  if (!failsafeActive && millis() - lastContact > FAILSAFE_MS) {
    enterSafeState();
  }
}
