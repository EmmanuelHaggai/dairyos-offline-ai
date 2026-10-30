# Bulb 1 normally-ON profile and live test

The FARM004 server was read on30 October2026. `bulb_1.invert_display=1`; `bulb_2.invert_display=0`. The matching iPhone installation profile is in `src/ble/output-policy.ts`. This is a local commissioned profile, not a live server sync.

| Output | Logical bulb request | Raw relay request / telemetry |
| --- | --- | --- |
| Bulb 1, normally ON | ON | relay OFF |
| Bulb 1, normally ON | OFF | relay ON |
| Bulb 2, normally OFF | ON | relay ON |
| Bulb 2, normally OFF | OFF | relay OFF |

Relay energization and GPIO active-low are different concepts. Firmware already maps relay state to electrical pin level; the app must apply only the load/contact inversion above. Do not invert both layers twice.

## iPhone behavior (0.3.2 build7)

The original UI showed raw GPIO/relay state beside the bulb name. It now shows logical bulb state and a separate relay report. Requests and matching-session/sequence acknowledgments use the same mapping. The BLE wire format remains v1.

For normally-ON Bulb 1:

- ON sends opcode0, duration0: release the relay. There is no timed ON pulse; the normal/de-energized bulb state is ON.
- OFF sends opcode1 with the selected relay hold time (1–30seconds). When that hold expires and the relay releases, the bulb returns ON. This hold requires the physical interlock and a fault-free board.
- Disconnect/interlock release/relay timer expiry do not mean this lamp is OFF. They release the relay and can return the normally-ON lamp to ON.

For normally-OFF Bulb 2 the same protocol gives bounded ON and immediate OFF. UI confirmations describe the intended logical state and the corresponding relay state. Neither GPIO nor relay telemetry proves the actual lamp is lit; physical feedback requires an observer or a suitable sensor.

## Actual server/Arduino test

Operator explicitly requested real Bulb 1 ON/OFF testing. Initial logical state: ON, raw relay OFF, revision31. Commands were sent through `Farm_iot_service::setOutputs()` with source `ble-validation`, scoped to FARM004 and using its authorized owner. No database output states were forced directly.

-11:43:19 UTC: logical ON / raw OFF acknowledged at revision32.
-11:43:24 UTC: logical OFF / raw ON acknowledged at revision33.
-Original logical ON / raw OFF restored and acknowledged at revision34.
-Bulb 2 remained at revision3 and its request state was unchanged.

Report on server: `/tmp/dairyos-bulb1-test-20261030T114318Z-e43964.json`. This establishes real gateway acknowledgments for both mappings, not visual proof of light output.

## BLE test and controller ownership

The phone's encrypted writes require authenticated pairing. The earlier live sensor check received notifications but its initial encrypted read returned `CBATTErrorDomain15: Encryption is insufficient`; sensor reception does not prove write authorization. Complete the comparison/approval on both the iPhone and an active UNO Q KeyboardDisplay pairing agent. Do not remove the authenticated-write requirement to make tests pass.

An explicit operator test launch with `DAIRYOS_BULB1_TEST=1` runs through the actual Devices UI: logical ON, short OFF, then restoration to ON. It waits for exact board acknowledgments, records failures rather than inventing success, and writes `Documents/bulb1-validation.json`. Ordinary app launches do not run this test.

The deployed cloud poll and BLE service share the relays. The five-second cloud poll can reapply server desired state during a BLE hold. A phone BLE test must distinguish exact command ACKs from server revisions and note any override. Do not claim the full OFF hold was independently verified while the cloud controller was also writing. Cloud loss/offline operation, timer expiry, contact polarity and physical lamp response are separate commissioning checks. This phone update does not change the board firmware, server inversion, cloud rules or camera services.
