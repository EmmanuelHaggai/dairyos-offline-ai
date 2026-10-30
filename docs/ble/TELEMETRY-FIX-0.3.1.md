# iPhone telemetry handling and retained last measurements — 0.3.1 build 6

The UNO Q commissioning report is on the DairyOS server at `docs/uno-q-ble-test-results.md`. It records a commissioned DHT11 implementation and a board/core-specific switch from `Bridge.provide_safe()` to `Bridge.provide()`. **Keep that commissioned board sketch. Do not reflash the original SHT31/reference sketch as part of this phone update.** The deployed firmware differs from the initial handoff package.

## Phone changes

The original CoreBluetooth receiver collapsed every error from `didUpdateValueFor` into “Invalid telemetry received.” That message did not establish a codec mismatch: it was also shown for GATT authentication errors, RPC-backed read failures, empty startup values and wrong packet lengths.

The receiver now distinguishes:

- Authentication, encryption or authorization errors: request authenticated pairing on iPhone and UNO Q; no downgrade to unencrypted controls.
- Read not permitted: continue waiting for notifications rather than claiming malformed data.
- Empty initial characteristic: wait for the first board update; do not fabricate a measurement or erase the previous one.
- Other read errors: display the underlying error and allow **Retry reading** without a reconnect.
- Wrong packet length: display actual byte length and expected20; keep strict wire validation.
- Valid20-byte frame: decode v1 normally; new valid data clears the prior error status.

**Retry reading** invokes a native CoreBluetooth read of the telemetry characteristic. It never sends an actuator command. There is no new HTTP endpoint or wire-format change. UUIDs and command/ACK frames remain exactly as described in PROTOCOL.md.

## Last-reading behavior

Last successful sensor measurements and their original receipt time remain visible through delayed notifications, invalid packets, sensor-invalid frames, disconnects and rescans. Invalid/empty packets never advance the timestamp. Sensor-valid=false updates may still report current GPIO/interlock state, but cannot overwrite the last temperature/humidity measurement with null/zero.

The UI shows the last-updated date/time, source and a stale label only after five minutes without a valid sensor measurement. Retained values are never treated as fresh for control authorization. A newly connected board must send its own valid telemetry before controls are enabled; a sample from a different board/session cannot become current on reconnect. Simulator provenance remains visible after disconnect.

Readings are retained in the app's running session, not added to a durable sensor-history database. A full process restart still needs a board connection to receive readings.

## On-device diagnostics

`Documents/ble-diagnostics.json` contains the most recent BLE events, exact native error domain/code, actual packet bytes when available, packet counts, connection state and UTC timestamps. It stays in the app container; no automatic server upload is performed. Successful telemetry is sampled for logging once per10 seconds; latest40 events are kept. Treat it as farm data and share only for authorized debugging.

An explicitly launched development test with `DAIRYOS_BLE_TEST=1` opens Devices, scans and connects only if exactly one nearby peripheral is named DairyOS UNO Q. It performs no output writes, inference or farm-record mutations. Normal launches do not auto-connect. The peripheral firmware's own connection/disconnection hooks still apply.

## Validation

34 TypeScript tests pass, including retention, unchanged timestamps, stale control gating, invalid sensor frames, cross-board freshness and out-of-order packets. Native Swift tests cover empty/startup data, valid/wrong lengths, authentication/encryption/authorization errors, read denial and transport failures.18 browser checks pass, including retained measurements after disconnect and disabled stale controls. Build/typecheck/lint pass. Clock-controlled browser checks verify the five-minute stale label without waiting five real minutes.

Actual phone/board diagnostics must establish the underlying GATT error or frame before claiming hardware recovery. An app message change alone is not proof of BLE delivery success. Keep the commissioned board unchanged while checking the phone path.

## Captured on the actual iPhone and commissioned UNO Q

At11:28:33 UTC on30 October2026, the initial characteristic read returned `CBATTErrorDomain15: Encryption is insufficient.` At11:28:34, valid20-byte notifications followed, including27.6°C and64%RH. A later valid-format packet had the sensor-valid bit unset. The failure was not a wire-format mismatch. The phone previously left the initial generic error on screen and replaced failed sensor values with unknown. The update clears a transient read error on accepted telemetry and keeps the most recent valid sensor sample through sensor-invalid frames. The user confirmed measured values and the last-updated time are visible.

These observations verify sensor reception only. They do not establish an authenticated read/write bond or confirm physical actuation. Protected controls still require pairing. No output writes were sent during this diagnosis.

## Final requested timing

- Sensor label: stale only after **5 minutes** without a valid measurement. Brief missed or invalid updates do not immediately show stale. Date/time and last values stay visible.
- Unexpected connection interruption: native CoreBluetooth attempts reconnection for **15 seconds** before showing connection lost. A failed attempt can retry within that same bounded window; it cannot restart the deadline.
- Explicit Disconnect, Bluetooth OFF and app backgrounding take effect immediately because they are intentional transport changes.
- Output commands still require current-connection telemetry less than6 seconds old. Sensor display age does not extend actuation authorization. Lost connections cancel pending confirmation and no actuator command is automatically retried.
- The15-second recovery implementation compiles in the iPhone build; physical radio-loss/recovery acceptance remains separate from the successful live sensor-reception check.
