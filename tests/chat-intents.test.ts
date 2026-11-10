import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFarmReading } from '../src/ble/chat-intents';
import { decodeTelemetry } from '../src/ble/protocol';
import { receiveReading, type BleState } from '../src/ble/state';
import { validateIntent, normalizeIntentJSON } from '../src/ble/semantic-intent';
test('read-only replies use measured values, original timestamps and logical NC mapping', () => {
  const b = new DataView(new ArrayBuffer(20)); b.setUint8(0,1); b.setUint8(1,10); b.setUint32(6,42,true); b.setInt16(10,2760,true); b.setUint16(12,6400,true);
  const initial: BleState = { connected: true, telemetryReady: false, boards: [], status: '', simulated: false };
  const state = { ...initial, ...receiveReading(initial, Array.from(new Uint8Array(b.buffer)), 1000) };
  const readings = describeFarmReading({ kind: 'sensors', temperature: true, humidity: true }, state, 2000);
  assert.match(readings, /27.6 °C/); assert.match(readings, /64%/); assert.match(readings, /Last updated/); assert.doesNotMatch(readings, /Stale/);
  assert.match(describeFarmReading({ kind: 'sensors', temperature: true, humidity: false }, { ...state, connected: false }, 301000), /Stale/);
  const status = describeFarmReading({ kind: 'status' }, state, 2000);
  assert.match(status, /Bulb 1: ON/); assert.match(status, /Bulb 2: OFF/);
  assert.match(describeFarmReading({ kind: 'status', target: 1 }, { ...state, connected: false }, 2000), /not a confirmed current state/);
  assert.match(describeFarmReading({ kind: 'sensors', temperature: true, humidity: true }, initial), /No measured/);
  assert.equal(decodeTelemetry(Array.from(new Uint8Array(b.buffer))).on, false);
});
const valid = { intent: 'command', target: 1, state: 'ON', seconds: 10, metric: 'both', clarification: '' };
test('only valid structured model output reaches a command proposal', () => {
  assert.deepEqual(validateIntent(JSON.stringify(valid)), { kind: 'command', target: 1, on: true, seconds: 10 });
  for (const patch of [{target: 3}, {seconds: 31}, {seconds: -1}, {state: 'toggle'}, {intent: 'execute'}, {seconds: '10'}]) assert.throws(() => validateIntent(JSON.stringify({...valid, ...patch})));
  assert.equal(validateIntent(JSON.stringify({...valid, target: 0})).kind, 'clarify');
  assert.equal(validateIntent(JSON.stringify({...valid, state: 'unknown'})).kind, 'clarify');
  assert.throws(() => validateIntent('turn bulb 1 on'));
});

test('format normalization accepts only an optional JSON fence, not surrounding prose', () => {
  const json = JSON.stringify(valid);
  assert.equal(normalizeIntentJSON('```json\n'+json+'\n```'), json);
  assert.deepEqual(validateIntent(normalizeIntentJSON('```\n'+json+'\n```')), {kind:'command',target:1,on:true,seconds:10});
  assert.throws(() => validateIntent(normalizeIntentJSON('My answer is '+json)));
});

test('capability validation checks only fields relevant to the interpreted intent', () => {
  assert.deepEqual(validateIntent(JSON.stringify({...valid,metric:'unknown'})), {kind:'command',target:1,on:true,seconds:10});
  assert.deepEqual(validateIntent('{"intent":"sensors","metric":"humidity"}'), {kind:'sensors',temperature:false,humidity:true});
  assert.deepEqual(validateIntent('{"intent":"none"}'), {kind:'none'});
  assert.throws(() => validateIntent('{"intent":"sensors","metric":"unknown"}'));
});

test('model protocol enum casing is canonicalized without reading or matching user phrases', () => {
  assert.deepEqual(validateIntent(normalizeIntentJSON(JSON.stringify({...valid,intent:'COMMAND',state:'on',metric:'unknown'}))), {kind:'command',target:1,on:true,seconds:10});
  assert.throws(() => validateIntent(normalizeIntentJSON(JSON.stringify({...valid,state:'toggle'}))));
});
