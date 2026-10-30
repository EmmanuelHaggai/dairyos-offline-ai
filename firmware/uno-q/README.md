# DairyOS BLE on Arduino UNO Q

This implementation matches the **online DairyOS** sensor names `temperature` (°C), `humidity` (%) and outputs `bulb_1`, `bulb_2`. The production source was inspected read-only on 30 October 2026 (`docs/farm-iot.md`, `examples/arduino-dairyos`). The existing online example is **ESP32 + DHT22**, not an UNO Q sketch. Its initial 25°C/60% database values are placeholders, not physical measurements. No server credentials or farm data were copied.

## Recommended topology

```
iPhone CoreBluetooth central <-- BLE GATT --> UNO Q Linux / BlueZ
                                                 |
                                        Arduino Router RPC
                                                 |
                                       UNO Q STM32 sketch
                                        /              \
                                temperature/RH      two outputs
```

UNO Q has a Debian Linux MPU and a real-time STM32 MCU. Run the BLE peripheral on **Linux**, then use Arduino Router Bridge for MCU operations. Do not assume the standard ArduinoBLE library directly drives UNO Q's Linux radio. The phone needs Bluetooth enabled, but no Wi-Fi, cellular, internet, website, NTP, or cloud token at runtime. Provision dependencies before taking the kit offline.

Files:

- `main.py`: Linux Bluezero GATT peripheral using BlueZ's system D-Bus.
- `protocol.py`: strict binary codec, boot session and replay prevention.
- `sketch/sketch.ino`: MCU sensor acquisition, GPIO state report, physical interlock and bounded output timer.
- `test_protocol.py`: host-only unit tests; no actual radio or board is needed.

**Validation boundary:** protocol tests run on the development computer. This firmware has not yet been compiled for or flashed onto an UNO Q, and authenticated pairing, actual radio notifications, sensor accuracy and electrical outputs require commissioning on the board. Do not call the code hardware validated. The Python reference uses current upstream Arduino Router Bridge APIs; record installed versions on your board and verify compatibility before deployment.

## 1. Prepare and wire the MCU

Use Arduino App Lab or an UNO Q-capable Arduino toolchain to create an app/sketch and install **Arduino_RouterBridge**. Put `sketch/sketch.ino` into its sketch component.

The reference uses an **SHT31 I²C temperature/humidity module at 0x44** to avoid assuming ESP32 DHT timing code works on Zephyr. Wire the module to the UNO Q's documented SDA/SCL, GND and an appropriate **3.3V-safe** supply. Verify module voltage and pull-ups against the official UNO Q pinout; don't copy ESP32 pin numbers. The sketch checks both sensor CRCs; failed reads make both measurements unknown. For an existing DHT22, replace only `readSensors()` with a driver actually verified on UNO Q/Zephyr; preserve range/error handling. No fabricated readings are emitted.

Reference configuration (change to match actual wiring):

| Function | MCU pin / setting |
| --- | --- |
| bulb_1 relay logic | D5 |
| bulb_2 relay logic | D6 |
| Enable contact | D7, INPUT_PULLUP; normally-open switch closes to GND |
| Relay polarity | independently configured by `ACTIVE_LOW[2]` |
| Actuation | `ACTUATION_ENABLED=false` initially |

Start with low-voltage test LEDs or a disconnected relay board. Confirm both outputs are OFF at startup, MCU reset and when the enable contact opens. Then set `ACTUATION_ENABLED=true`, flash again, and verify each GPIO with a meter. Relay drivers need compatible logic, an appropriate separate supply where required, and the correct grounding/isolation arrangement. GPIO pins must not power relay coils or bulbs directly. Mains wiring requires a properly rated enclosed relay/contactor installation.

The app's names identify **logical outputs**. Map their physical ON/OFF polarity here once; website relay inversion is not downloaded automatically. Use normally-open load contacts for a de-energized OFF behavior. Physical OFF must be provided by circuitry during reset before firmware takes over. The firmware's `digitalRead()` confirms GPIO only; use current/contact feedback if actual lamp output must be verified.

The MCU enforces a maximum **30-second ON** window per output and OFF when the physical interlock opens. Timers use wrap-safe `millis()` comparisons. Linux disconnect handling attempts an early OFF; if Linux crashes or the phone leaves range, the MCU deadline still ends the run. Disconnect is **not guaranteed immediate OFF**. This is a foreground manual-control pilot, with no automatic extension, rules, schedules or unattended operation. Do not use for pumps, milking equipment or other uncommissioned machinery. MCU hangs require a hardware watchdog/independent cutoff before any deployment relying on a guaranteed deadline.

## 2. Install the Linux peripheral

Use the UNO Q Debian **host** initially, where BlueZ and `/var/run/arduino-router.sock` are directly available. An ordinary App Lab container may lack the system bus/adapter; do not assume running a Python brick automatically grants Bluetooth access.

During connected setup, install the board-supported packages for BlueZ, `python3-dbus`, `python3-gi`, `python3-venv`, and create a dedicated virtual environment with system site packages. Install `bluezero` and `arduino-router-bridge` into it, then record/freeze the working versions. Example commands on the UNO Q:

```sh
sudo apt update
sudo apt install bluez python3-dbus python3-gi python3-venv
python3 -m venv --system-site-packages ~/dairyos-ble-venv
~/dairyos-ble-venv/bin/pip install bluezero arduino-router-bridge
~/dairyos-ble-venv/bin/pip freeze > ~/dairyos-ble-requirements.lock
systemctl status bluetooth arduino-router
bluetoothctl show
```

Confirm the adapter supports LE peripheral advertising and GATT application registration on the installed image. Follow Bluezero's documented D-Bus policy for a dedicated service user and grant that user access to the existing Arduino Router Unix socket. Avoid opening the Router TCP socket. Copy the three Python files into a directory readable by the service user. For first host diagnostics you may need administrative privileges to configure the adapter; retain narrowly scoped permissions for normal operation.

Run `main.py` with the prepared interpreter after the MCU is flashed and its RPC endpoints are available. `Controller.telemetry()` stops producing frames on an RPC failure; the phone then labels old readings stale. It never sends a fresh zero to disguise a failed sensor or Bridge.

### Pairing and access control are required

The telemetry characteristic requires authenticated encrypted reads and the control characteristic requires **authenticated encrypted writes**. Leave these flags enabled. Configure a BlueZ **DisplayYesNo or KeyboardDisplay agent**, use the attached UNO Q console/display to compare the pairing number with the iPhone, and open pairing only during a physically supervised commissioning window. `bluetoothctl` provides an interactive agent for bench commissioning; its terminal must remain available while pairing is requested. Use `agent KeyboardDisplay`, `default-agent`, `pairable on` and `power on`, then confirm the matching number on both devices. Turn `pairable off` after bonding and inspect/remove unknown bonds. Exact prompts depend on the image/agent. Verify a second, unbonded phone cannot write.

Do **not** fall back to NoInputNoOutput / Just Works to bypass an authentication error. An advertisement name, service UUID or proximity alone does not authorize an operator. This pilot uses the paired handset and physical interlock as local access control; it does not import the website's farm accounts or owner/manager/viewer permissions. Multiple farm users need explicit local authorization before wider rollout. Protect the host, agent, bond store, service files and Router socket.

Notification confidentiality depends on the negotiated encrypted link and BlueZ behavior; verify with the chosen image. The app's initial encrypted read initiates authentication. No commands can be sent from the UI before a valid frame arrives.

For restart automation, create a systemd service after commissioning: run as the dedicated Bluetooth/Router-authorized user, `WorkingDirectory` at this folder, `ExecStart` using the venv Python and `main.py`, `After=bluetooth.service arduino-router.service`, and `Restart=on-failure`. Verify it starts with all network interfaces disabled. Never run the old cloud polling example in parallel: there must be only one GPIO authority. Service restart gets a new session; it never restores an old ON state.

## Alternative implementation paths

1. **UNO Q Linux BlueZ + MCU Bridge (included):** uses the onboard radio, all runtime operation local. Requires Linux permissions and authenticated pairing setup. Recommended first target.
2. **A BLE-capable companion such as ESP32 or nRF52:** host this same GATT protocol there and connect it to UNO Q using a framed UART/I²C link. Enforce timers/interlock on the MCU that actually owns the output. Useful if the UNO Q image's peripheral mode/BlueZ setup blocks progress; requires additional firmware. The existing DairyOS ESP32 example is Wi-Fi/HTTPS and must be adapted, not reused unchanged.
3. **App Lab container deployment:** use the same host BlueZ via a narrowly scoped D-Bus interface and the Router Unix socket. Validate access explicitly; do not enable a blanket privileged container as a shortcut. Host deployment is simpler to commission first.

HC-05/HC-06 Bluetooth Classic serial modules are not a generic iPhone BLE GATT replacement.

## Offline bench acceptance

1. Leave loads disconnected. Build/flash MCU with actuation disabled; confirm unknown sensors without a sensor attached, then valid measured temperature/RH with the SHT31 attached. Compare with a reference meter.
2. Start Linux service; open DairyOS **Devices**, allow iOS Bluetooth access, scan and explicitly select the board. Compare pairing identity/numbers. Require a bonded authenticated link before control.
3. Enable the physical interlock only after pin/polarity checks. Request Bulb 1 ON for 10 seconds, review and confirm. Verify requested → acknowledged GPIO state and physical LED change. Repeat for Bulb 2, then OFF.
4. Verify duration 31, unknown output, wrong session, old sequence and duplicate frames never energize/re-extend an output. Run `python3 -m unittest discover -s firmware/uno-q -p 'test_*.py'` from the project root for host codec checks.
5. Release interlock, leave BLE range, force-quit/background the phone app, stop Linux, and reset the MCU in separate trials. Confirm GPIO OFF on interlock/reset, and no later than the run deadline on radio/Linux loss. Check the phone reports stale/unknown, not confirmed OFF merely from disconnect.
6. Disable Wi-Fi/cellular on phone and Wi-Fi/network on UNO Q, leaving Bluetooth ON. Repeat readings and both controls. No cloud token or online website must be needed.
7. Confirm no website output request can race with BLE; the online state is separate and may be stale. Document the actual board/image/library versions, pins, polarity, paired-phone identity, measurements and failure trial results before attaching real loads.

## Sources checked 30 October 2026

- [Arduino UNO Q user manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/): Linux/MCU architecture and communications.
- [Arduino RouterBridge C++ source and API](https://github.com/arduino-libraries/Arduino_RouterBridge): safe callbacks and MCU loop execution.
- [Official Python Router Bridge](https://github.com/arduino/arduino-router-bridge-py): host-side Unix socket and bounded RPC calls.
- [Bluezero peripheral example](https://github.com/ukBaz/python-bluezero/blob/main/examples/cpu_temperature.py) and [UART example](https://github.com/ukBaz/python-bluezero/blob/main/examples/ble_uart.py): notification and write callback APIs.
- [BlueZ GATT API](https://github.com/bluez/bluez/blob/master/doc/org.bluez.GattCharacteristic.rst): characteristic permissions; verify against installed BlueZ.
- [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth): native central and privacy requirement.

Sensor implementation reference: [Sensirion Arduino SHT driver](https://github.com/Sensirion/arduino-sht/blob/master/SHTSensor.cpp). Confirm the exact module and its datasheet before wiring; the production website's DHT22 example does not establish which sensor is physically installed on an UNO Q.
