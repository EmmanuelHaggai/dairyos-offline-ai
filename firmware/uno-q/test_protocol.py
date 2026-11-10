import unittest
import struct
from protocol import Controller

class Bridge:
    def __init__(self):
        self.calls = []
        self.armed = True
    def call(self, name, *args, **kwargs):
        if name == 'dairyos_snapshot':
            return '2534,6025,1,0,1,1'
        self.calls.append(args)
        return self.armed or args[1] == 0

class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.bridge = Bridge()
        self.controller = Controller(self.bridge)
        self.controller.session = 42
    def command(self, seq=123, seconds=10, target=2, session=42):
        return struct.pack('<BBIIHB7x', 1, bool(seconds), seq, session, seconds, target)
    def test_wire_fixture(self):
        raw = self.command()
        self.assertEqual(raw.hex(), '01017b0000002a0000000a000200000000000000')
        self.controller.command(raw)
        self.assertEqual(self.bridge.calls, [(2, 10)])
        frame = self.controller.telemetry()
        self.assertEqual(len(frame), 20)
        self.assertEqual(struct.unpack('<BBIIhHIH', bytes(frame))[:7], (1, 26, 123, 42, 2534, 6025, 0))
    def test_replays_never_extend_on(self):
        self.controller.command(self.command())
        for seq in [123, 122]:
            with self.assertRaises(ValueError): self.controller.command(self.command(seq=seq))
        self.assertEqual(len(self.bridge.calls), 1)
    def test_invalid_frames_never_touch_hardware(self):
        for raw in [b'', self.command(seconds=31), self.command(target=3), self.command(session=43), self.command(seq=0), self.command()[:-1] + b'\x01']:
            with self.assertRaises(ValueError): self.controller.command(raw)
        self.assertEqual(self.bridge.calls, [])
    def test_interlock_rejection_reports_fault_and_off_can_clear(self):
        self.bridge.armed = False
        self.controller.command(self.command())
        self.assertTrue(self.controller.fault)
        self.controller.command(self.command(seq=124, seconds=0))
        self.assertFalse(self.controller.fault)
    def test_bridge_failure_does_not_fabricate_telemetry_or_replay(self):
        def fail(*args, **kwargs): raise TimeoutError()
        self.bridge.call = fail
        self.assertIsNone(self.controller.telemetry())
        with self.assertRaises(TimeoutError): self.controller.command(self.command())
        with self.assertRaises(ValueError): self.controller.command(self.command())

class CoordinatedProtocolTests(unittest.TestCase):
    def test_v2_persistent_opcode_is_not_confused_with_off_and_advertises_sync_pending(self):
        class Output:
            def __init__(self): self.calls=[]
            def command(self,*args): self.calls.append(args); return True
            def pending(self): return True
        output=Output();controller=Controller(Bridge(),output);controller.session=42
        controller.command(struct.pack('<BBIIHB7x',2,2,1,42,0,1))
        self.assertEqual(output.calls,[(1,2,0)])
        frame=controller.telemetry();self.assertEqual(frame[0],2);self.assertTrue(frame[1]&32)
        with self.assertRaises(ValueError):controller.command(struct.pack('<BBIIHB7x',2,2,2,42,5,1))
    def test_legacy_board_never_claims_persistent_support(self):
        controller=Controller(Bridge());controller.session=42
        self.assertEqual(controller.telemetry()[0],1)
        with self.assertRaises(ValueError):controller.command(struct.pack('<BBIIHB7x',2,2,1,42,0,1))

if __name__ == '__main__': unittest.main()
