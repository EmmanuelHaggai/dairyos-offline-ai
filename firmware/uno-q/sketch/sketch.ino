// UNO Q MCU. Commission using LEDs before relay loads. See ../README.md.
#include <Arduino_RouterBridge.h>
#include <Wire.h>
#include <math.h>

constexpr bool ACTUATION_ENABLED = false; // Explicitly enable after pin/polarity commissioning.
constexpr int OUTPUTS[2] = {5, 6};
constexpr int ENABLE_PIN = 7; // Physical normally-open enable contact to GND.
constexpr bool ACTIVE_LOW[2] = {true, true};
constexpr uint8_t SHT31_ADDRESS = 0x44;
bool applied[2] = {false, false};
uint32_t deadlines[2] = {0, 0}, lastSensor = 0;
int temperature100 = 0, humidity100 = 0;
bool valid = false;

bool armed() { return ACTUATION_ENABLED && digitalRead(ENABLE_PIN) == LOW; }
void output(int index, bool on) {
  digitalWrite(OUTPUTS[index], ACTIVE_LOW[index] ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
  applied[index] = digitalRead(OUTPUTS[index]) == (ACTIVE_LOW[index] ? LOW : HIGH);
}
void enforceLimits() {
  for (int i = 0; i < 2; i++) {
    if (!armed() || (applied[i] && (int32_t)(millis() - deadlines[i]) >= 0)) output(i, false);
  }
}
bool setOutput(int target, int seconds) {
  enforceLimits();
  if (target < 1 || target > 2 || seconds < 0 || seconds > 30 || (seconds && !armed())) return false;
  int i = target - 1;
  deadlines[i] = millis() + (uint32_t)seconds * 1000;
  output(i, seconds > 0);
  return applied[i] == (seconds > 0);
}
uint8_t crc(const uint8_t *p) {
  uint8_t c = 0xff;
  for (int j = 0; j < 2; j++) { c ^= p[j]; for (int i = 0; i < 8; i++) c = (c & 0x80) ? (c << 1) ^ 0x31 : c << 1; }
  return c;
}
void readSensors() {
  valid = false;
  Wire.beginTransmission(SHT31_ADDRESS); Wire.write(0x24); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return;
  delay(16); // SHT31 high-repeatability conversion, bounded wait.
  if (Wire.requestFrom(SHT31_ADDRESS, (uint8_t)6) != 6) return;
  uint8_t b[6]; for (int i = 0; i < 6; i++) b[i] = Wire.read();
  if (crc(b) != b[2] || crc(b + 3) != b[5]) return;
  temperature100 = (int)lround((-45.0 + 175.0 * ((b[0] << 8) | b[1]) / 65535.0) * 100);
  humidity100 = (int)lround(10000.0 * ((b[3] << 8) | b[4]) / 65535.0);
  valid = temperature100 >= -5000 && temperature100 <= 10000 && humidity100 >= 0 && humidity100 <= 10000;
}
String snapshot() {
  enforceLimits();
  return String(temperature100) + "," + humidity100 + "," + (valid ? 1 : 0) + "," + (applied[0] ? 1 : 0) + "," + (applied[1] ? 1 : 0) + "," + (armed() ? 1 : 0);
}
void setup() {
  for (int i = 0; i < 2; i++) { digitalWrite(OUTPUTS[i], ACTIVE_LOW[i] ? HIGH : LOW); pinMode(OUTPUTS[i], OUTPUT); output(i, false); }
  pinMode(ENABLE_PIN, INPUT_PULLUP);
  Wire.begin();
  Bridge.begin();
  // Safe callbacks run in the sketch loop context: no shared-state races.
  Bridge.provide_safe("dairyos_set", setOutput);
  Bridge.provide_safe("dairyos_snapshot", snapshot);
}
void loop() {
  enforceLimits();
  if ((uint32_t)(millis() - lastSensor) >= 2000) { lastSensor = millis(); readSensors(); }
  delay(5);
}
