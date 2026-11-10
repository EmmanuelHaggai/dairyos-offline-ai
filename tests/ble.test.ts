import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFarmReading } from '../src/ble/chat-intents';
import { commandFrame, decodeTelemetry, fresh } from '../src/ble/protocol';
import { executeBulbBLE, setBulbBLE, bleSnapshot, disconnectBLE, startSimulation } from '../src/ble/client';
function frame(flags = 10) {
  const b = new DataView(new ArrayBuffer(20)); b.setUint8(0, 1); b.setUint8(1, flags); b.setUint32(6, 42, true); b.setInt16(10, 2534, true); b.setUint16(12, 6025, true); return Array.from(new Uint8Array(b.buffer));
}
test('BLE codec reads temperature, humidity, both GPIOs and interlock without defaults', () => {
  const r = decodeTelemetry(frame(27), 1000);
  assert.equal(r.temperature, 25.34); assert.equal(r.humidity, 60.25); assert.equal(r.on, true); assert.equal(r.on2, true); assert.equal(r.armed, true);
  const unknown = decodeTelemetry(frame(0)); assert.equal(unknown.temperature, null); assert.equal(unknown.humidity, null);
});
test('BLE rejects malformed frames, unknown versions, flags and ranges', () => {
  assert.throws(() => decodeTelemetry([]));
  for (const [offset, value] of [[0, 3], [1, 255], [18, 1], [13, 255], [2, -1]]) { const b = frame(); b[offset!] = value!; assert.throws(() => decodeTelemetry(b)); }
  const b = frame(); b[6] = 0; assert.throws(() => decodeTelemetry(b));
});
test('BLE requires fresh telemetry, bounded duration, known target and interlock for ON', () => {
  const r = decodeTelemetry(frame(), 1000);
  assert.equal(fresh(r, 6999), true); assert.equal(fresh(r, 7000), false); assert.equal(fresh(r, 999), false);
  assert.throws(() => commandFrame(r, 1, 10, 7000));
  for (const duration of [-1, 31, 1.5, NaN]) assert.throws(() => commandFrame(r, 1, duration, 1000));
  for (const sequence of [0, -1, 1.2, 0x100000000]) assert.throws(() => commandFrame(r, sequence, 10, 1000));
  assert.throws(() => commandFrame({ ...r, armed: false }, 1, 10, 1000));
  assert.throws(() => commandFrame({ ...r, fault: true }, 1, 10, 1000));
  assert.doesNotThrow(() => commandFrame({ ...r, armed: false, fault: true }, 1, 0, 1000));
});
test('BLE command matches Python little endian wire format and explicit absolute target', () => {
  const bytes = commandFrame(decodeTelemetry(frame(), 1000), 123, 10, 1000, 2);
  assert.equal(Buffer.from(bytes).toString('hex'), '01017b0000002a0000000a000200000000000000');
});
test('computer simulator is labeled and cannot send hardware commands; disconnect retains last values with stale status', async () => {
  const reply = () => describeFarmReading({kind:'sensors',temperature:true,humidity:true}, bleSnapshot());
  assert.match(reply(), /No measured/);
  await assert.rejects(setBulbBLE(1, true, 10));
  startSimulation();
  assert.match(reply(), /SIMULATION/);
  await setBulbBLE(2, false, 0); assert.match(bleSnapshot().lastCommand!, /SIMULATION/);
  await disconnectBLE(); assert.ok(bleSnapshot().reading); assert.equal(bleSnapshot().telemetryReady, false); assert.match(reply(), /last received measurements/); assert.match(reply(), /SIMULATION/); assert.equal(bleSnapshot().simulated, false);
});

test('delays, disconnect, decode failure and invalid sensor frames retain last measured values and their original time', async () => {
  const { disconnectedState, liveReading, liveSample, receiveReading } = await import('../src/ble/state');
  let state: import('../src/ble/state').BleState = { connected: true, telemetryReady: false, status: '', boards: [], simulated: false, selectedBoard: 'Commissioned UNO Q' };
  state = { ...state, ...receiveReading(state, frame(), 1000) };
  const reading = state.reading, sample = state.sample;
  assert.equal(sample?.temperature, 25.34); assert.equal(sample?.humidity, 60.25); assert.equal(sample?.receivedAt, 1000);
  assert.equal(liveSample(state, 6999), true); assert.equal(liveSample(state, 7000), false); assert.equal(state.sample, sample);
  const invalid = { ...state, ...receiveReading(state, [], 9000) };
  assert.equal(invalid.reading, reading); assert.equal(invalid.sample, sample); assert.equal(liveReading(invalid, 1001), false);
  const disconnected = { ...state, ...disconnectedState() };
  assert.equal(disconnected.sample, sample); assert.equal(disconnected.reading, reading); assert.equal(liveReading(disconnected, 1001), false);
  assert.equal(liveReading({ ...disconnected, connected: true }, 1001), false, 'reconnection cannot reuse an old frame for controls');
  const failedSensor = { ...state, ...receiveReading(state, frame(8), 2000) };
  assert.equal(failedSensor.sample, sample); assert.equal(failedSensor.sample?.receivedAt, 1000); assert.equal(liveReading(failedSensor, 2001), true); assert.equal(liveSample(failedSensor, 2001), false);
  const recovered = { ...failedSensor, ...receiveReading(failedSensor, frame(), 3000) };
  assert.equal(recovered.sample?.receivedAt, 3000); assert.equal(liveSample(recovered, 3001), true);
});

test('a new board without a valid sensor sample cannot make the previous board reading current', async () => {
  const { liveSample, receiveReading } = await import('../src/ble/state');
  let state: import('../src/ble/state').BleState = { connected: true, telemetryReady: false, status: '', boards: [], simulated: false, selectedBoard: 'Board A' };
  state = { ...state, ...receiveReading(state, frame(), 1000) };
  const sample = state.sample;
  const other = frame(8); other[6] = 43;
  state = { ...state, selectedBoard: 'Board B', ...receiveReading({ ...state, selectedBoard: 'Board B' }, other, 1001) };
  assert.equal(state.sample, sample); assert.equal(state.sample?.source, 'Board A'); assert.equal(state.reading?.session, 43); assert.equal(liveSample(state, 1002), false);
  const late = frame(); late[14] = 10;
  const newer = { ...state, ...receiveReading(state, late, 2000) };
  const rejected = { ...newer, ...receiveReading(newer, frame(), 2001) };
  assert.equal(rejected.sample, newer.sample); assert.equal(rejected.sample?.receivedAt, 2000); assert.equal(rejected.telemetryReady, false);
});

test('actual commissioned UNO Q frames decode and a following DHT-invalid frame retains 27.6°C / 64% with the same timestamp', async () => {
  const { receiveReading, liveSample } = await import('../src/ble/state');
  const good = [1,10,0,0,0,0,50,85,149,46,200,10,0,25,113,8,0,0,0,0];
  const missing = [1,8,0,0,0,0,50,85,149,46,0,0,0,0,124,8,0,0,0,0];
  let state: import('../src/ble/state').BleState = { connected: true, telemetryReady: false, status: 'Bluetooth pairing is required.', boards: [], simulated: false, selectedBoard: 'uno-q' };
  state = { ...state, ...receiveReading(state, good, 1000) };
  assert.equal(state.sample?.temperature, 27.6); assert.equal(state.sample?.humidity, 64); assert.equal(liveSample(state, 1001), true); assert.match(state.status, /Telemetry received/);
  const sample = state.sample;
  state = { ...state, ...receiveReading(state, missing, 12000) };
  assert.equal(state.sample, sample); assert.equal(state.sample?.receivedAt, 1000); assert.equal(liveSample(state, 12001), false); assert.equal(state.reading?.armed, true);
});

test('sensor stale label starts at five minutes, independent of six-second control freshness', async () => {
  const { sampleIsStale, SENSOR_STALE_MS, receiveReading, liveReading, disconnectedState } = await import('../src/ble/state');
  let state: import('../src/ble/state').BleState = { connected: true, telemetryReady: false, status: '', boards: [], simulated: false };
  state = { ...state, ...receiveReading(state, frame(), 1000) };
  assert.equal(SENSOR_STALE_MS, 300000);
  assert.equal(sampleIsStale(state.sample, 1001), false);
  assert.equal(sampleIsStale(state.sample, 300999), false);
  assert.equal(sampleIsStale(state.sample, 301000), true);
  assert.equal(liveReading(state, 7000), false);
  assert.equal(sampleIsStale({ ...state, ...disconnectedState() }.sample, 7000), false);
  assert.equal(state.sample?.receivedAt, 1000);
});

test('commissioned normally-ON Bulb 1 and normally-OFF Bulb 2 map logical requests and reports once', async () => {
  const { bulbCommand, bulbOn } = await import('../src/ble/output-policy');
  const rawOff = decodeTelemetry(frame(10));
  assert.equal(bulbOn(rawOff, 1), true); assert.equal(bulbOn(rawOff, 2), false);
  const rawOn = decodeTelemetry(frame(27));
  assert.equal(bulbOn(rawOn, 1), false); assert.equal(bulbOn(rawOn, 2), true);
  assert.equal(bulbCommand(1, true, 0).relaySeconds, 0);
  assert.equal(bulbCommand(1, false, 10).relaySeconds, 10);
  assert.equal(bulbCommand(2, true, 10).relaySeconds, 10);
  assert.equal(bulbCommand(2, false, 0).relaySeconds, 0);
  assert.throws(() => bulbCommand(1, false, 31));
  assert.equal(bulbCommand(2, true, 0).persistent, true);
  assert.equal(bulbCommand(1, true, 0).relaySeconds, 0, 'de-energizing does not require a hold duration');
  assert.equal(bulbOn({ ...rawOff, on: false }, 1), true, 'timer expiry / released relay returns normally-ON lamp to ON');
});

test('confirmation UI receives a structured logical ON/OFF acknowledgment only for the current command', async () => {
  startSimulation();
  try {
    await setBulbBLE(1, false, 1);
    const off = bleSnapshot().lastAction;
    assert.equal(off?.target, 1); assert.equal(off?.on, false); assert.equal(off?.confirmed, true);
    assert.equal(bleSnapshot().pending, undefined); assert.equal(bleSnapshot().pendingTarget, undefined);
    assert.equal(bleSnapshot().reading?.on, true, 'normally-ON bulb OFF means relay ON');
    await setBulbBLE(1, true, 0);
    const on = bleSnapshot().lastAction;
    assert.equal(on?.on, true); assert.equal(on?.confirmed, true);
    assert.ok(on!.sequence > off!.sequence); assert.equal(on?.session, off?.session);
    assert.equal(bleSnapshot().reading?.on, false, 'normally-ON bulb ON means relay OFF');
  } finally { await disconnectBLE(); }
});

test('direct execution awaits its own acknowledgment and never accepts an earlier success for invalid input', async () => {
  startSimulation();
  try {
    await executeBulbBLE(1, true);
    const acknowledged = bleSnapshot().lastAction;
    assert.equal(acknowledged?.confirmed, true);
    assert.equal(acknowledged?.on, true);
    await assert.rejects(executeBulbBLE(1, false, 31), /1 to 30/);
    assert.equal(bleSnapshot().lastAction, acknowledged);
  } finally { await disconnectBLE(); }
});
