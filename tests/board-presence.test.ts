import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardPresence, type BleState } from '../src/ble/state';
const base: BleState = { connected: false, telemetryReady: false, simulated: false, boards: [], status: '' };
test('advertisements establish recent presence but never connection or exact range', () => {
  const nearby = { ...base, boards: [{ id: 'a', name: 'Board', rssi: -90, lastSeenAt: 1000 }] };
  assert.equal(boardPresence(nearby, 2000), 'Board nearby · not connected');
  assert.equal(boardPresence({ ...nearby, lastScanAt: 1000 }, 32000), 'Board not detected · off, out of range or not advertising');
  assert.equal(boardPresence({ ...nearby, connected: true }, 32000), 'Board connected');
  assert.equal(boardPresence({ ...base, connecting: true }), 'Connecting to board…');
  assert.equal(boardPresence({ ...base, radio: 'unavailable', lastScanAt: 1000 }), 'Bluetooth unavailable');
});
