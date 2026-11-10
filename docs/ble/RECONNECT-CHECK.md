# Immediate reconnection check — DairyOS Local0.3.3 build10

The operator deferred the longer spontaneous-disconnect/headphones investigation. This test only exercises connecting, disconnecting and immediately reconnecting while the headphones are OFF and DairyOS remains in the foreground. No actuator writes are part of the test.

## Reconnect correction

CoreBluetooth cancellation is asynchronous. The old implementation cleared its peripheral reference immediately after requesting cancellation, so a rapid new connection to the same cached peripheral could overlap the old cancellation callback. A cancellation gate now waits for `didDisconnect` / `didFailToConnect` completion and queues a requested connection until that old link is released. Native tests cover duplicate cancellation callbacks, multiple pending cancellations, stale timeout tokens and Bluetooth reset.

Initial radio connection gets30 seconds; service discovery, characteristic discovery and notification subscription each have a separate15-second stage timeout. A stage's expired timer cannot cancel a newer stage. The existing unexpected-loss recovery grace remains15 seconds, and the sensor stale label remains5 minutes. Equipment commands are never replayed.

Diagnostics now record the exact CoreBluetooth error domain/code/message, the connection stage, signal measurements while connected and the time since the last packet. Logs retain120 events across launches so restarting the app does not erase recent failure evidence. Diagnostic events do not replace user-facing status messages.

## Physical test

An explicit development launch with `DAIRYOS_RECONNECT_TEST=1` runs `native/iphone/reconnect-test.js`. It scans for the commissioned UNO Q, establishes telemetry, then performs3 cycles. Each cycle awaits the disconnect command result and immediately issues the connect command, with no intentional delay or rescan. It waits for the new connection plus a new telemetry frame, records elapsed time, and writes `Documents/reconnect-validation.json`.

This is a real native BLE transport test, not a simulated radio test. It does not validate sustained operation, radio range, headphone coexistence, pairing or physical bulb output. Those checks are separate. Ordinary launches do not execute the test. Afterward the app is reopened with the test flag OFF and a read-only Devices reconnect.

## Earlier observations, not a completed cause diagnosis

An earlier scan reported approximately−84…−86dBm. After the phone was moved near the board, a scan reported−56dBm and213 frames were received before the app entered the background. Earlier packet session/uptime remained continuous across one recovered drop, so that event did not demonstrate a full BLE service restart. Other disconnect events explicitly said App paused, caused by this foreground-only pilot's background cleanup. The precise cause of every spontaneous drop, including any headphone interaction, remains unproven and was deferred by the operator.

References: [Apple connection API](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/connect(_:options:)), [nonblocking cancellation](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/cancelperipheralconnection(_:)), [connected signal measurement](https://developer.apple.com/documentation/corebluetooth/cbperipheraldelegate/peripheral(_:didreadrssi:error:)).

## Completed live result —20:42 UTC,30 October2026

All3 immediate reconnect cycles passed. Gaps after disconnect completion were0ms (no intentional wait); reconnection plus a fresh telemetry frame took482ms,528ms and581ms. Report `error=null`, `finalConnected=true`, `writesSent=0`. The automatic cycle test was then disabled and the app reopened in Devices with read-only reconnect. This result validates rapid local reconnect, not the deferred spontaneous-loss/headphone investigation.
