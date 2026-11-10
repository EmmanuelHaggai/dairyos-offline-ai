// MERGE into the COMMISSIONED DHT11 sketch. Do not replace sensors, pins,
// polarity, physical interlock or existing dairyos_set/snapshot RPCs.
// Adapt names to the commissioned sketch; all accesses use its existing lock.
bool latched[2] = {false, false};

bool latchOutput(int target, bool on) {
  enforceLimits();
  if (target < 1 || target > 2 || (on && !armed())) return false;
  int i = target - 1;
  latched[i] = on;
  deadlines[i] = 0;
  output(i, on);
  return applied[i] == on;
}
// Add to setup(), using Bridge.provide (NOT provide_safe on this board image):
// Bridge.provide("dairyos_latch", latchOutput);
//
// In existing setOutput(), BEFORE setting its deadline/output:
// latched[i] = false;
//
// Replace the per-output expiry condition in enforceLimits() with:
// if (!armed() || (applied[i] && !latched[i] &&
//                  (int32_t)(millis() - deadlines[i]) >= 0)) {
//   latched[i] = false;
//   output(i, false);
// }
// Initialize latched[] false on boot. Interlock loss always releases outputs.
// Keep timed relay energization capped at 30 seconds in dairyos_set.
// Do not use seconds=0 as the latch opcode: existing zero means relay OFF.
