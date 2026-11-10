import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulbCommand } from '../src/ble/output-policy';
import { commandFrame, decodeTelemetry, type Reading } from '../src/ble/protocol';
import { validateIntent } from '../src/ble/semantic-intent';
const r: Reading = { protocolVersion: 2, session: 42, sequence: 1, uptime: 1, temperature: null, humidity: null, on: false, on2: false, armed: true, fault: false, receivedAt: 1000 };
test('untimed model requests retain zero duration and normally-ON inversion exactly once', () => {
  assert.deepEqual(validateIntent(JSON.stringify({intent:'command',target:1,state:'OFF',seconds:0})),{kind:'command',target:1,on:false,seconds:0});
  const off=bulbCommand(1,false);assert.equal(off.persistent,true);assert.equal(off.relayOn,true);assert.match(off.description,/until changed/);assert.doesNotMatch(off.description,/10 seconds/);
  const on=bulbCommand(2,true);assert.equal(on.persistent,true);assert.equal(on.relayOn,true);
  assert.equal(bulbCommand(1,true).relayOn,false);
});
test('persistent wire command has dedicated opcode and requires coordinated firmware and interlock',()=>{
  const bytes=commandFrame(r,2,0,1001,1,true);assert.equal(bytes[0],2);assert.equal(bytes[1],2);assert.equal(bytes[10],0);
  assert.throws(()=>commandFrame({...r,protocolVersion:1},2,0,1001,1,true),/firmware update/);
  assert.throws(()=>commandFrame({...r,armed:false},2,0,1001,1,true),/interlock/);
  assert.throws(()=>commandFrame({...r,fault:true},2,0,1001,1,true),/interlock/);
  assert.equal(commandFrame({...r,armed:false},2,0,1001,1)[1],0);
});
test('explicit timers remain bounded, while persistent state is never encoded as timed zero',()=>{
  assert.equal(commandFrame(r,2,5,1001,1)[1],1);
  assert.equal(bulbCommand(1,false,5).persistent,false);
  assert.throws(()=>bulbCommand(2,true,31));assert.throws(()=>bulbCommand(1,true,5),/Timed actions/);
});
test('v2 pending-sync bit is accepted only from a v2 board',()=>{
  const frame=new DataView(new ArrayBuffer(20));frame.setUint8(0,2);frame.setUint8(1,40);frame.setUint32(6,42,true);
  const bytes=Array.from(new Uint8Array(frame.buffer));const reading=decodeTelemetry(bytes,1000);assert.equal(reading.protocolVersion,2);assert.equal(reading.syncPending,true);
  bytes[0]=1;assert.throws(()=>decodeTelemetry(bytes),/Unsupported/);
});
