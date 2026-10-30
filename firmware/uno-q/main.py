"""Run on UNO Q Debian host, with system BlueZ/D-Bus and Arduino Router access.
Requires a commissioned authenticated Bluetooth pairing agent; see README.
"""
from bluezero import adapter, peripheral, async_tools
from arduino.router_bridge import Bridge
from protocol import Controller, SERVICE, TELEMETRY, CONTROL

bridge = Bridge()
if not bridge.connect(timeout=5):
    raise RuntimeError('Arduino Router unavailable')
controller = Controller(bridge)
radio = list(adapter.Adapter.available())
if not radio:
    raise RuntimeError('No Bluetooth adapter')
board = peripheral.Peripheral(radio[0].address, local_name='DairyOS UNO Q')
board.add_service(srv_id=1, uuid=SERVICE, primary=True)


def read():
    value = controller.telemetry()
    if value is None:
        raise RuntimeError('MCU telemetry unavailable')
    return value


def notify(active, characteristic):
    def tick():
        if not characteristic.is_notifying:
            return False
        value = controller.telemetry()
        if value is not None:
            characteristic.set_value(value)
        return True
    if active:
        async_tools.add_timer_seconds(1, tick)


def write(value, options):
    # BlueZ enforces authenticated encryption before this callback.
    controller.command(value)


def disconnected(*args):
    # Best-effort early stop; MCU timer and physical interlock are authoritative.
    for target in (1, 2):
        try:
            bridge.call('dairyos_set', target, 0, timeout=1)
        except Exception:
            pass


board.add_characteristic(srv_id=1, chr_id=1, uuid=TELEMETRY,
                        value=[], notifying=False, flags=['read', 'encrypt-authenticated-read', 'notify'],
                        read_callback=read, write_callback=None, notify_callback=notify)
board.add_characteristic(srv_id=1, chr_id=2, uuid=CONTROL,
                        value=[], notifying=False, flags=['write', 'encrypt-authenticated-write'],
                        read_callback=None, write_callback=write, notify_callback=None)
board.on_disconnect = disconnected
disconnected()  # Explicitly stop both outputs before advertising a new session.
try:
    board.publish()
finally:
    disconnected()
    bridge.disconnect()
