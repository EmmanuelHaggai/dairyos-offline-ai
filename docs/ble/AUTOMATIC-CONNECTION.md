# Automatic Bluetooth connection — 0.6.1 / build 16

Bluetooth discovery, connection and presence reporting run independently of QVAC. Opening DairyOS Local starts the BLE subscription and a service-filtered scan, even on Ask. No language-model request or output command is needed.

The app remembers the selected board's iOS peripheral identifier in native UserDefaults. A complete scan must find that board before auto-connecting. With no remembered board, exactly one nearby DairyOS board is selected automatically; several unknown boards require selection in Devices. An absent remembered board never causes an automatic switch to another farm's board.

After an unsuccessful attempt, the foreground manager waits at least 20 seconds before retrying; a scan lasts up to 12 seconds. Native failure ends the attempt immediately instead of waiting the remainder of a 50-second client deadline. AI device requests share the same connection operation. Native short-interruption recovery retains its existing 15-second deadline. Reconnection never repeats an actuator command.

Manual Disconnect/Cancel/Stop pauses automatic connection for the current app session. Resume auto-connect enables it again. App backgrounding cancels active work and disconnects the native BLE link; returning to the foreground restarts housekeeping when enabled. This version does not promise background or locked-phone BLE operation.

The header shows connection/presence on every screen and opens Devices when tapped. Devices additionally shows discovery status, signal strength, manual selection and automatic-connection controls.

- Connected means the GATT telemetry subscription is established. Controls require fresh telemetry. In 0.6.2, a clear AI request authorizes direct execution; manual Devices controls retain review.
- Nearby means a service-filtered advertisement was received within 30 seconds. Stale entries require rediscovery before selection.
- Connected RSSI refreshes about every 10 seconds. It is approximate, not a distance measurement.
- Not detected means the board may be off, out of range, or not advertising. A missing advertisement cannot distinguish those cases.
- Invalid or delayed sensor readings do not erase the last valid sample or imply a disconnected radio. Sensor staleness remains five minutes.

No UNO Q firmware, GATT UUID or 20-byte payload change is required.

## Reconnection investigation

Initial physical runs passed startup connection and manual pause, but reconnecting reached a radio link without completing service discovery. Client failure handling was shortened so automatic retries start after the intended backoff. Cache reuse and native-session recreation experiments did not resolve the observed issue and were removed.

The current native implementation sets the peripheral delegate again inside every successful didConnect callback, then discovers GATT services/characteristics afresh. It validates UUIDs/capabilities, enables notifications, and waits for new telemetry before enabling controls. Invalidated services trigger disconnection and rediscovery. Old-central callbacks are ignored.

Apple documents setting the peripheral delegate in [didConnect](https://developer.apple.com/documentation/corebluetooth/cbcentralmanagerdelegate/centralmanager%28_%3Adidconnect%3A%29), and states that services/characteristics are invalidated after [disconnect](https://developer.apple.com/documentation/corebluetooth/cbcentralmanagerdelegate/centralmanager%28_%3Adiddisconnectperipheral%3Aerror%3A%29). Do not reuse disconnected GATT objects as a workaround.

## Validation

44 automated tests, ten mocked automatic-transport browser checks, and six existing mocked AI/confirmation checks passed. The transport fixtures verify startup, multiple unknown boards, manual pause/resume, unexpected loss, absent-board reporting, native discovery failure, later recovery, background cancellation and foreground restart, with zero AI calls or output writes.

Actual iPhone results are recorded separately in automatic-ble-validation.json. The operator test connects automatically from startup, disconnects and verifies manual pause, then resumes automatic discovery/connection. Native counters require zero model requests and zero control writes. Auto-Lock is disabled only for this explicit operator test. Do not count a previous attempt's report as evidence for a changed native build.

A scan-completion/background race was also fixed: generation cancellation is checked even when the wait predicate has just become true. A background transition can no longer turn a cancelled scan into a new connection. The operator test pauses its timeout while hidden; it still requires real connections in the foreground and zero model/control counters.

Latest physical evidence: the installed build connected automatically at 2026-11-01T21:19:58Z, then respected manual pause. During resume, the radio connected at 21:20:14Z but the app entered the background before discovery completed. The foreground-aware test remains pending; no final reconnect acceptance is claimed. Opening the app in normal use still starts automatic connection. Operator flags are disabled before handover. See automatic-connection-validation-0.6.1.json.

Update after the user restarted the UNO Q BLE service: 0.6.2 recovered service discovery and fresh telemetry. Its actual direct-command suite successfully obtained a new ON acknowledgment after deliberate disconnection and automatic reconnection. This resolves that specific pending reconnection check; prolonged dropout/headphone testing remains deferred. See direct-ai-validation-0.6.2.json.
