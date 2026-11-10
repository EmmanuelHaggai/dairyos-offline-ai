# Persistent Bluetooth control and online coordination — 0.6.4 / build 19

This supersedes the default-10-second policy and the commissioning note that the cloud always overwrites BLE. The existing commissioned board must be upgraded by its connected computer. Server/API and phone changes alone cannot remove the MCU timer or prevent the old cloud loop from writing GPIOs.

## Requested behavior

- “Turn bulb 1 off”, “Turn it back on”, “Please illuminate the second bulb”: maintain that state until another explicit command, a newer server revision, or the physical interlock changes it. No invented duration and no inherited timer from conversation.
- An explicit supported timer, such as “Turn bulb 1 off for 5 seconds”, still expires. Timed relay energization remains 1–30 seconds. Timed Bulb 1 ON / Bulb 2 OFF remain unsupported and require clarification rather than silently dropping the timer.
- Bulb 1 is normally ON (`invert_display=1`): displayed OFF means raw relay ON. Bulb 2 is normally OFF: displayed ON means raw relay ON. Apply inversion once on the phone/UI; the sync API and board exchange RAW relay states.
- Persistent output does not reset on BLE disconnect. Physical interlock release always de-energizes relays. Power loss/reboot does not promise restoration of energized outputs; do not replay uncertain hardware commands.
- A phone with no internet still controls the board. A remote database cannot update without a network path: the board queues events durably and sends them when its own internet returns. No cloud credentials or phone internet are needed for BLE control.

## Why the old behavior occurred

The local intent prompt defaulted missing durations to 10 seconds. BLE v1 encoded relay ON only as a timed action, and the MCU capped it at 30 seconds. Separately, the commissioned HTTPS loop polled every five seconds and reapplied the database desired state regardless of a newer BLE action. Both writers controlled the same relay without shared ordering.

## Board update: use the COMMISSIONED DHT11 app

Current board app: `/home/arduino/ArduinoApps/dairyos-farm-iot`. Preserve its existing DHT11 transaction, tested GPIO polarity/pins, RouterBridge initialization, camera/AI services, physical enable interlock, and current BLE pairing/authentication policy. Do **not** reflash the original SHT31 reference sketch. `firmware/uno-q/coordination/mcu-persistent-fragment.h` is a merge guide, not a complete replacement sketch.

1. Back up the current app, BLE host files, service units and credentials. Record their paths. Stop the BLE service and the existing output-poll writer during the switch. Do not leave both old and new cloud output writers active.
2. Merge the fragment into the commissioned MCU: add a latch flag for each output, add `dairyos_latch(target, bool on)`, and keep `dairyos_set(target, seconds)` for the existing OFF/timed actions. Register the new callback with **`Bridge.provide`**; `provide_safe` previously failed to dispatch on this board image. All MCU output functions and snapshots must use the commissioned sketch's serialization/critical-section discipline. Interlock removal must clear latch flags as well as GPIOs. The timer check must exclude latched outputs, but retain the 30-second cap for explicit timed commands.
3. Install `coordinator.py`, `daemon.py`, `client.py` into `/opt/dairyos-output`. Use the board's Python interpreter/virtualenv that already imports `arduino.router_bridge`. Adapt `ExecStart` in the supplied unit if necessary; do not install a second incompatible RouterBridge package.
4. Create `/etc/dairyos-output/settings.json`, owned by `arduino:arduino`, mode 0600. Reuse the **existing gateway token** on the board; never put it into docs, shell history, the phone or URLs:

   ```json
   {"api_base":"https://dairyos.co.ke/api/v1/iot","token":"<existing 64-character gateway token>"}
   ```

5. Install `dairyos-output.service` to `/etc/systemd/system/`. It uses `/var/lib/dairyos-output/state.sqlite3` (WAL + FULL durability) and `/run/dairyos-output/control.sock` (0660). Verify the actual board account/group can access RouterBridge and that the BLE service runs in the socket's group. Restrict local socket access to trusted board services. Add a BLE unit drop-in with `Requires=dairyos-output.service` and `After=dairyos-output.service`.
6. Remove/disable **only output polling/application/acknowledgment** in the original HTTPS loop. Keep its measured sensor upload and other commissioned functions running. All cloud and BLE output writes must now go through the coordinator. Search the deployed app for every `dairyos_set`, relay/pin write and output polling path, including reconnect/startup callbacks. No alternate writer may reapply cached desired state.
7. Update the commissioned BLE host to the supplied `firmware/uno-q/protocol.py` and construct `Controller(bridge, coordinator=OutputClient())` as shown in `ble-integration.py`. Keep the existing tested BlueZ advertisement and telemetry callbacks. Remove old startup/disconnect/finally callbacks that release both outputs: a radio disconnect must not cancel a persistent lamp command. Do not remove the hardware interlock.
8. Start the coordinator and verify its MCU RPC and API reachability. Only then restart BLE with v2 telemetry. Merely changing the advertised name/version without coordinating all writers is incorrect. No UUID changes are needed.

Example installation commands after the reviewed MCU/HTTPS/BLE integrations are complete:

```sh
sudo install -d -o arduino -g arduino -m 0750 /opt/dairyos-output
sudo install -m 0644 coordination/coordinator.py coordination/daemon.py coordination/client.py /opt/dairyos-output/
sudo install -m 0644 coordination/dairyos-output.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dairyos-output.service
sudo systemctl restart dairyos-ble.service
sudo journalctl -u dairyos-output.service -u dairyos-ble.service -n 80 --no-pager
```

The MCU fragment uses reference identifiers (`applied`, `deadlines`, `output`, `armed`, `enforceLimits`): adapt them to the commissioned sketch. This is deliberate to avoid overwriting the tested DHT11 implementation. Never enable protocol v2 until the persistent RPC has been verified physically.

## Ordering and recovery

The coordinator is the single output writer. It commits local intent before hardware access, records a successful action in a durable outbox, and only then acknowledges the BLE control through telemetry. SQLite failure or uncertain MCU result means no success and no automatic hardware resend.

Cloud network I/O occurs outside the output lock. Local events are flushed before polling. A poll captures the local generation and is discarded if a BLE action arrived while the HTTP request was in flight. Equal or older server revisions are never reapplied. A later deliberate website/WhatsApp/automation revision can change the output after synchronization; existing automation rules are not silently disabled.

Offline local events are synchronized in order and take priority over cloud state existing before reconciliation. There is no reliable global chronological ordering between disconnected clocks; this is an explicit **local-wins-on-reconciliation** policy, not a promise of timestamp-based last-write-wins. Once reconciled, newer server revisions are authoritative until the next local command. Missing/lost HTTP replies retry only the same event ID, never GPIO writes. Pending local changes block cloud application.

An explicit timer is enforced on the MCU independently of Linux/phone availability. The coordinator also queues its expiry as a new raw OFF event, so the database cannot reapply an expired ON. Removing the physical enable contact always releases GPIOs; the app reports actual telemetry, not a guaranteed electrical lamp state.

A crash during hardware application leaves an `uncertain` intent and blocks cloud writes. Do not delete the SQLite file or blindly replay. Inspect the MCU snapshot/interlock, then send a fresh explicit safe command (relay OFF clears a fault) or reconcile under operator control. Reboot may release GPIOs; persistent means no invented expiry during normal operation, not guaranteed restoration after power failure.

## BLE v2: same endpoints, 20-byte frames

Service `d8a10000-7c36-4f19-aef4-76b80a0d1000`
Telemetry `d8a10001-7c36-4f19-aef4-76b80a0d1000`: read/notify.
Control `d8a10002-7c36-4f19-aef4-76b80a0d1000`: write with response.

Telemetry remains `<BBIIhHIH>` with byte0=2. Original flags are unchanged; flag 0x20 means local changes pending database sync or an uncertain local intent. Reserved bytes18–19 stay zero. Sequence/session/state matching remains mandatory; a GATT write response alone never means successful actuation. A cleared pending flag reports the board queue, not the phone having internet.

Control remains `<BBIIHB7x>`:

| Byte(s) | Meaning |
|---|---|
|0|version 2|
|1|opcode 0 raw relay OFF; 1 timed raw relay ON; 2 persistent raw relay ON|
|2–5|strictly increasing command sequence|
|6–9|exact nonzero current BLE session|
|10–11|0 for opcode0/2; 1–30 for opcode1|
|12|target1 or2|
|13–19|zero|

Persistent displayed Bulb1 OFF: `02027b0000002a00000000000100000000000000` (session42, sequence123). Persistent displayed Bulb1 ON: opcode0, target1. Persistent Bulb2 ON: opcode2, target2. Timed Bulb1 OFF5s: opcode1, seconds5, target1. Never encode persistent relay ON as the old opcode0/seconds0 stop.

The phone accepts v1 measurements for compatibility but refuses untimed controls on a v1 board, with an upgrade message. It never substitutes a timed action. Existing v1 timed clients remain supported by the updated controller and are routed through the same coordinator.

## Online endpoint (implemented on Contabo)

`POST https://dairyos.co.ke/api/v1/iot/local-command`

Header: `Authorization: Bearer <existing gateway token>`, `Content-Type: application/json`.

```json
{"event_id":"7b955ee277fb4a08a1c8578cf796946f","output_key":"bulb_1","state":"ON"}
```

State is **raw relay state**, so this example means displayed Bulb1 OFF. Event IDs are 32 lowercase hex digits, generated once on the board and persisted before retries. Scope is limited to enabled outputs belonging to the authenticated gateway/farm. No user/farm IDs are accepted from the caller.

```json
{"ok":true,"output_key":"bulb_1","state":"ON","revision":42,"duplicate":false}
```

A new event atomically increments the existing `farm_iot_output.revision`, updates `desired_state/desired_at`, and inserts `farm_iot_command(source='bluetooth',user_id=0)`. It does not invent a human identity or a hardware acknowledgment. The same event/state returns its original revision; reusing that event with a different state is rejected. A delayed duplicate never rolls desired state back. No schema migration is required.

After reading a current MCU snapshot, report its actual state (even if an interlock changed it) using the existing `POST /api/v1/iot/acknowledge` with the exact returned revision. A differing actual state remains pending and must not be represented as confirmed. `GET /api/v1/iot/outputs` supplies later cloud revisions. Existing website/WhatsApp controls continue using the same database revision stream. The supplied client sets `User-Agent: DairyOS-UNO-Q/2.0`; the public edge rejected Python’s default user agent during verification. Keep the explicit agent. Bearer token failures return401, wrong HTTP method405, invalid payload422; a storage/network failure is not successful synchronization.

## Acceptance on the board-connected computer (required before claiming hardware completion)

1. Run the supplied protocol/coordinator tests. Confirm no old writer remains and MCU latching/interlock tests pass with the commissioned wiring.
2. Send “Turn bulb1 off” without duration. Verify the phone emits v2 opcode2, Bulb1 physically goes OFF and stays OFF beyond30s and at least six cloud polls. Repeat ON and Bulb2. Do not accept GPIO-only proof of the lamp.
3. Verify `farm_iot_command.source=bluetooth`, raw desired state, incremented revision, exact reported revision/state, and `pending=false`. Bulb1 display inversion must still match the lamp.
4. Switch only the board's internet off; keep BLE on. Send untimed OFF then ON. Confirm persistent state, pending-sync flag, durable outbox. Restart only the Linux coordinator (not MCU) and verify no unintended GPIO replay/reset.
5. Restore internet. Confirm ordered idempotent sync and no stale poll resets. Force a lost HTTP response; the audit must contain one event, with no repeated physical command.
6. Inject a delayed poll while sending a BLE command. Its old response must not touch outputs. Then make a new online command after sync and confirm exactly one application of the newer revision.
7. Verify explicit OFF5s expires correctly and its expiry synchronizes. Disconnect/reconnect Bluetooth during an untimed command; state persists. Remove the physical enable contact; both relays release regardless of latch.
8. Test duplicate sequence, wrong session, unknown opcode, invalid timer, MCU timeout, daemon crash and disabled output/token. No false success, no silent timed fallback, no automatic hardware retry.

Save actual outcomes (service paths/versions, frame hex, audit IDs/revisions, physical observations, failure cases) beside `/var/www/DairyOS/docs/uno-q-ble-test-results.md`. Do not include gateway tokens. The phone/server test results alone do not certify this board integration.

## Validation recorded 2 November 2026

49 app unit tests, 10 mocked direct-command UI checks, 7 protocol tests, 11 coordinator/race tests and 11 rollback-only real-database tests passed. Typecheck and lint passed. The new public route returned405 for GET and401 for an unauthenticated POST. The API was deployed with rollback copies at `/var/backups/dairyos-ble-sync/20261102T134938Z`.

The real iPhone model passed all four duration checks with zero control writes: untimed Bulb1 OFF, contextual back-ON after an earlier timer, untimed Bulb2 ON, and explicit Bulb1 OFF5s. A first immediate back-to-back attempt had a model initialization failure; the final sequential run with a two-second pause passed. This validates meaning/duration, not physical persistent output. The app is installed and normal operator flags are off. Actual MCU/daemon integration and physical/cloud reconciliation acceptance remain for the board-connected computer. See `persistent-control-validation-0.6.4.json`.
