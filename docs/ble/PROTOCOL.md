> **0.6.4 update:** persistent controls and coordinated database sync use BLE v2. See [Persistent control and sync](PERSISTENT-CONTROL-AND-SYNC.md). The v1 timer-only behavior below remains historical/reference compatibility; the app no longer invents a 10-second duration.

# DairyOS BLE protocol v1

One explicitly selected peripheral at a time. All integer fields are little endian; each frame is exactly 20 bytes, so application fragmentation is unnecessary at ATT MTU 23. UUIDs:

| Item | UUID | Access |
| --- | --- | --- |
| Service | d8a10000-7c36-4f19-aef4-76b80a0d1000 | advertised |
| Telemetry | d8a10001-7c36-4f19-aef4-76b80a0d1000 | authenticated encrypted read, notify |
| Control | d8a10002-7c36-4f19-aef4-76b80a0d1000 | authenticated encrypted write, with response |

Telemetry, Python struct `<BBIIhHIH`:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | u8 | version=1 |
| 1 | u8 | flags: 0x01 bulb1 GPIO ON; 0x02 both sensors valid; 0x04 command fault; 0x08 physical interlock armed; 0x10 bulb2 GPIO ON; others zero |
| 2 | u32 | last consumed command sequence (0 before first command) |
| 6 | u32 | nonzero random Linux service session |
| 10 | i16 | temperature ×100 °C; meaningful only if sensor-valid |
| 12 | u16 | humidity ×100%; meaningful only if sensor-valid |
| 14 | u32 | monotonic seconds since service start |
| 18 | u16 | reserved=0 |

App accepts valid temperature -50…100°C and humidity 0…100%. Invalid sensors show unknown only if no earlier measurement exists; otherwise the last measured values and their timestamp remain visible. No frame for a failed MCU RPC. Notifications about once per second; after six seconds without a valid frame, controls are disabled. Last measured values stay visible with their original timestamp; the sensor stale label begins only after five minutes without a valid measurement. Earlier uptime within the same session is rejected; a new session clears pending confirmation. UTC is not needed. Phone receipt time is displayed rather than invented board wall time.

Command, Python struct `<BBIIHB7x`:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | u8 | version=1 |
| 1 | u8 | opcode 0 OFF, 1 timed ON |
| 2 | u32 | strictly increasing command sequence, starting at 1 |
| 6 | u32 | exact current telemetry session |
| 10 | u16 | duration 0 for OFF, 1…30 seconds for ON |
| 12 | u8 | explicit target 1 or 2 |
| 13 | 7 bytes | reserved=0 |

Golden command: `01017b0000002a0000000a000200000000000000` means session42, sequence123, bulb2 ON10s. JS and Python tests assert the same bytes.

No raw pin numbers, toggle operations, text instructions or model output are accepted. Replayed/older sequences are rejected before hardware access and cannot extend ON. Sequence is consumed before a hardware call to prevent retries after an uncertain result. The app never automatically retries a command. Sequence exhaustion requires a service restart/new session.

A CoreBluetooth write response only confirms GATT delivery. App waits up to five seconds for a telemetry frame with the **same session and sequence**, no fault, and the requested target GPIO state. Missing ACK means unknown, not success. Last command confirmation is historical; latest telemetry controls the current-state label and can show OFF after the timer expires. A fault can be cleared by an acknowledged OFF. Reconnection requires fresh telemetry and a new explicit command.

ON requires the user to review target/duration and confirm. OFF is immediate from its explicit button, but is still acknowledged. Ask handles sensor/state lookup and supported bulb requests locally. Commands from Ask and Devices share explicit confirmation and exact session/sequence/state acknowledgment. Only the user question is parsed for intent; model-generated text and photo analysis cannot send hardware commands. Photo/model inference never writes controls. Conditional rules, website sync, account-role sync, pumps, arbitrary commands and background BLE are outside this phase.

The connected phone and board's authenticated bond plus physical enable contact form this pilot's access boundary. See [UNO Q setup](../../firmware/uno-q/README.md) for pairing and hardware commissioning requirements.

Readings and command confirmations in this phase are live in-memory state. They are not a sensor history or a durable equipment audit log. A disconnected or delayed board retains the last measured values in memory with their original receipt timestamp; only a new valid sensor sample replaces them. Failed packets and invalid sensor samples do not advance that timestamp. A process restart requires a fresh board connection. Retained values cannot authorize controls.

Unexpected radio disconnects get a bounded15-second reconnection attempt before a connection-lost message. Manual disconnect, Bluetooth OFF and app backgrounding still stop the connection immediately. No equipment command is replayed after reconnection.
