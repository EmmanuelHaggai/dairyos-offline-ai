"""DairyOS BLE v1 codec; no Bluetooth or hardware imports, for offline tests."""
import struct
import time
import secrets

SERVICE = 'd8a10000-7c36-4f19-aef4-76b80a0d1000'
TELEMETRY = 'd8a10001-7c36-4f19-aef4-76b80a0d1000'
CONTROL = 'd8a10002-7c36-4f19-aef4-76b80a0d1000'


class Controller:
    def __init__(self, bridge, coordinator=None):
        self.bridge = bridge
        self.coordinator = coordinator
        self.session = secrets.randbelow(0xfffffffe) + 1
        self.sequence = 0
        self.fault = False
        self.started = time.monotonic()

    def command(self, value):
        raw = bytes(value)
        if len(raw) != 20:
            raise ValueError('Frame must be 20 bytes')
        version, opcode, sequence, session, seconds, target = struct.unpack('<BBIIHB', raw[:13])
        if version not in ((1, 2) if self.coordinator else (1,)) or opcode not in ((0, 1, 2) if version == 2 else (0, 1)) or target not in (1, 2) or any(raw[13:]) or session != self.session or not sequence or seconds > 30 or (opcode == 1) != (seconds > 0):
            raise ValueError('Unsupported command')
        if sequence <= self.sequence:
            # Never replay or extend a timed ON, including after phone reconnect.
            raise ValueError('Duplicate or old command')
        self.sequence = sequence  # consume before hardware call; failures must not replay
        try:
            applied = self.coordinator.command(target, opcode, seconds) if self.coordinator else self.bridge.call('dairyos_set', target, seconds, timeout=1)
            self.fault = not bool(applied)
        except Exception:
            self.fault = True
            raise

    def telemetry(self):
        try:
            # Snapshot is produced atomically by the MCU, never invented on Linux.
            raw = str(self.bridge.call('dairyos_snapshot', timeout=1)).split(',')
            t, h, valid, on1, on2, armed = map(int, raw)
            if valid and not (-5000 <= t <= 10000 and 0 <= h <= 10000):
                raise ValueError('Invalid sensors')
            pending = bool(self.coordinator and self.coordinator.pending())
            flags = (pending << 5) | bool(on1) | (bool(valid) << 1) | (self.fault << 2) | (bool(armed) << 3) | (bool(on2) << 4)
            return list(struct.pack('<BBIIhHIH', 2 if self.coordinator else 1, flags, self.sequence, self.session, t if valid else 0, h if valid else 0, int(time.monotonic() - self.started) & 0xffffffff, 0))
        except Exception:
            # No fabricated fresh frame on a Bridge failure. iPhone marks old data stale.
            return None
