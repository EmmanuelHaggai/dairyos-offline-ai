# Start here — DairyOS Local BLE / Arduino UNO Q handoff

Version: iPhone app 0.3.0 build 4; BLE wire protocol v1. Prepared 30 October 2026.

This package gives the computer connected to the UNO Q everything needed to implement the board side of the installed iPhone app. Start with `firmware/uno-q/README.md`, then `docs/ble/PROTOCOL.md`. All links are relative to the package root. This package does not require the iPhone app source tree or DairyOS server credentials to run the board.

## Package map

- `firmware/uno-q/README.md`: wiring, sensors, Linux dependencies, authenticated pairing, service deployment, alternatives and physical acceptance tests.
- `firmware/uno-q/sketch/sketch.ino`: MCU sketch; actuation deliberately disabled until commissioning.
- `firmware/uno-q/main.py`: Linux BLE GATT peripheral.
- `firmware/uno-q/protocol.py`: binary wire codec and replay protection.
- `firmware/uno-q/test_protocol.py`: computer-only protocol tests.
- `docs/ble/PROTOCOL.md`: exact UUIDs, byte offsets, state flags and acknowledgment rules.
- `docs/ble/ui-validation.json`: computer UI test results; not hardware evidence.
- `reference/`: matching iPhone CoreBluetooth and TypeScript client source for integration troubleshooting. These are reference excerpts, not a standalone app build.
- `SHA256SUMS`: file-integrity manifest. From the package root run `sha256sum -c SHA256SUMS` on Linux or `shasum -a 256 -c SHA256SUMS` on macOS.

## Endpoints and requests

**The offline interface is Bluetooth GATT, not HTTP.** Do not call the website APIs from the phone/board for this phase. Do not copy gateway tokens, Wi-Fi credentials or cloud polling logic into this implementation.

| Endpoint | Identifier | Operation |
| --- | --- | --- |
| BLE service | `d8a10000-7c36-4f19-aef4-76b80a0d1000` | advertise / discover |
| Telemetry characteristic | `d8a10001-7c36-4f19-aef4-76b80a0d1000` | authenticated encrypted read and notifications |
| Control characteristic | `d8a10002-7c36-4f19-aef4-76b80a0d1000` | authenticated encrypted write with response |
| Linux → MCU RPC | `dairyos_snapshot()` | returns CSV `temperature100,humidity100,valid,on1,on2,armed` |
| Linux → MCU RPC | `dairyos_set(target,seconds)` | target1/2; 0 seconds OFF, 1–30 seconds timed ON; bool applied result |

The Linux Bridge uses the local Arduino Router Unix socket, not a network endpoint. MCU function names, argument order and snapshot CSV order must match exactly.

Example snapshot: `2534,6025,1,0,1,1` means measured25.34°C,60.25%RH, valid sensors, bulb1 GPIO OFF, bulb2 GPIO ON, enable interlock armed. These numbers are an encoding example, **not farm measurements**. Invalid sensor reads set valid=0; failed Bridge calls must not create fresh frames.

### Request construction example — no radio write

```python
import struct

# Replace with the session and last consumed sequence from fresh telemetry.
# These literals are a test fixture only; do not hardcode them into live firmware.
session = 42
sequence = 123
bulb = 2
seconds = 10
request = struct.pack('<BBIIHB7x', 1, 1, sequence, session, seconds, bulb)
assert request.hex() == '01017b0000002a0000000a000200000000000000'

# OFF example: same session, a newer sequence, opcode0 and duration0.
off = struct.pack('<BBIIHB7x', 1, 0, sequence + 1, session, 0, bulb)
```

Never send the fixture blindly: obtain the current board session and choose a strictly greater sequence from fresh telemetry. Writes must go over an authenticated encrypted bond. GATT write success is delivery only; success requires telemetry echoing the exact session/sequence, no fault, and the requested target GPIO state. No ACK within5 seconds means unknown; never automatically retry or extend ON. See PROTOCOL.md for every byte and error rule.

## Fastest implementation sequence on the other computer

1. Copy/extract this entire package, preserving directories; verify `SHA256SUMS`.
2. Run `python3 -m unittest discover -s firmware/uno-q -p 'test_*.py'` from its root. These tests need only standard-library Python and do not access hardware.
3. Read the hardware guide. Confirm actual UNO Q, sensor type, pinout, relay polarity and physical enable contact. The reference uses SHT31 I²C; the existing online DairyOS example uses ESP32/DHT22 and is not an UNO Q firmware build.
4. In Arduino App Lab / an UNO Q-capable toolchain, compile and flash `sketch/sketch.ino`. Keep loads disconnected and `ACTUATION_ENABLED=false` initially.
5. Set up the Linux host BlueZ/Bluezero/Arduino Router environment and authenticated pairing agent described in README. Run the Python service from the directory containing main.py/protocol.py. Do not run a cloud GPIO controller in parallel.
6. On the iPhone open DairyOS Local → Devices, permit Bluetooth, scan and select the board. Verify pairing numbers on both devices. Verify measured readings first, then commission low-voltage output tests before enabling actuation.
7. Complete all offline/disconnect/interlock/timer/reset acceptance trials. Record the exact board image, dependency versions, wiring and results. Only then attach commissioned loads.

## Current validation and limits

The iPhone app is built and installed. Its application regression and persistence checks passed. Computer tests passed:30 TypeScript tests,5 Python protocol tests,15 BLE UI checks. This is **not a completed hardware integration**: UNO Q sketch compilation/flashing, authenticated pairing with the physical board, actual notifications, sensor calibration, relay polarity, interlock behavior and physical timeout tests remain to be done on the connected-board computer.

No board was accessed or flashed from the Mac that prepared this package. Actuation in the reference sketch defaults to disabled. GPIO reports do not prove a bulb is electrically lit. MCU timers depend on a functioning MCU; use appropriate independent cutoff/watchdog measures where required. Cloud farm accounts/roles, online commands, conditional automation, sync, sensor history and durable equipment audit logging are not implemented in this BLE phase.

The server copy is a handoff artifact only. Uploading it does not start a BLE service on the server, change website settings, or modify production IoT behavior.
