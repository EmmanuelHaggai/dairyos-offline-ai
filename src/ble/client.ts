import { phoneRequest, phoneShell } from '../phone-shell';
import { bulbCommand, bulbOn, relayOn, type Output } from './output-policy';
import { commandFrame } from './protocol';
import { disconnectedState, liveReading, sampleIsStale, receiveReading, type BleState } from './state';
export type { Board, BleState } from './state';
let state: BleState = { status: 'Scan for your nearby DairyOS board.', connected: false, telemetryReady: false, boards: [], simulated: false };
const listeners = new Set<(s: BleState) => void>();
let started = false, counter = 0, simulation: ReturnType<typeof setInterval> | undefined;
let acknowledgment: { sequence: number; target: Output; on: boolean; logicalOn: boolean; session: number; timer: ReturnType<typeof setTimeout> } | undefined;
function update(value: Partial<BleState>) { state = { ...state, ...value }; listeners.forEach(fn => fn(state)); }
function clearPending(message: string) { if (acknowledgment) clearTimeout(acknowledgment.timer); acknowledgment = undefined; update({ pending: undefined, lastCommand: message }); }
export function bleSnapshot() { return state; }
export function subscribeBLE(listener: (s: BleState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; }
function receive(value: unknown) {
  const e = value as { kind: string; text?: string; id: string; name: string; rssi: number; bytes: number[] };
  if (e.kind === 'device') update({ boards: [...state.boards.filter(b => b.id !== e.id), { id: e.id, name: e.name, rssi: e.rssi }] });
  else if (e.kind === 'connected') update({ connected: true, telemetryReady: false, status: e.text! });
  else if (e.kind === 'reconnecting') { clearPending('Connection interrupted; output state unknown. No automatic command retry.'); update({ ...disconnectedState(), status: e.text! }); }
  else if (e.kind === 'disconnected') { clearPending('Connection lost; output state unknown. No automatic retry.'); update({ ...disconnectedState(), status: e.text! }); }
  else if (e.kind === 'telemetry') {
    const previous = state.reading;
    update(receiveReading(state, e.bytes));
    const r = state.reading;
    if (r && r !== previous && state.telemetryReady) {
      if (previous && r.session !== previous.session) clearPending('Board restarted. Previous command is no longer confirmed.');
      const ack = acknowledgment;
      if (ack && r.session === ack.session && r.sequence === ack.sequence) {
        const on = relayOn(r, ack.target);
        clearPending(!r.fault && on === ack.on ? `Bulb ${ack.target}: board reports ${ack.logicalOn ? 'ON' : 'OFF'} (relay ${on ? 'ON' : 'OFF'}).` : 'Board rejected command or reported a different GPIO state.');
      }
    }
  } else update({ ...(e.kind === 'error' ? { telemetryReady: false } : {}), status: e.text ?? 'Bluetooth event.' });
}
export function startBLE() {
  if (started || !phoneShell) return;
  started = true;
  // Subscription intentionally remains pending; native events reuse this request ID.
  void phoneRequest('bleSubscribe', {}, event => receive(event.value)).catch(error => { started = false; update({ status: String(error) }); });
}
export async function scanBLE() {
  stopSimulation(); update({ boards: [], ...disconnectedState() }); startBLE();
  if (!phoneShell) throw new Error('Real BLE is available in the installed iPhone app. Use the labeled simulator on this computer.');
  await phoneRequest('bleScan');
}
export async function retryBLEReading() { if (!state.connected || state.simulated) throw new Error('Connect a real board before retrying.'); await phoneRequest('bleRead'); }
export async function connectBLE(id: string) { clearPending('No command sent.'); update({ ...disconnectedState(), selectedBoard: state.boards.find(b => b.id === id)?.name ?? 'DairyOS board' }); await phoneRequest('bleConnect', { device: id }); }
export async function disconnectBLE() { stopSimulation(); if (phoneShell && started) await phoneRequest('bleDisconnect'); update({ ...disconnectedState(), boards: [], status: 'Disconnected.' }); clearPending('Disconnected; output state unknown.'); }
export async function setBulbBLE(target: Output, on: boolean, holdSeconds = 10) {
  const plan = bulbCommand(target, on, holdSeconds), seconds = plan.relaySeconds;
  if (!liveReading(state) || state.pending || !state.reading) throw new Error('Connect a board and wait for telemetry and any pending command.');
  const r = state.reading;
  counter = Math.max(counter, r.sequence) + 1;
  const bytes = commandFrame(r, counter, seconds, Date.now(), target);
  update({ pending: `${plan.description} requested. Awaiting board acknowledgment.`, lastCommand: undefined });
  acknowledgment = { sequence: counter, target, on: plan.relayOn, logicalOn: on, session: r.session, timer: setTimeout(() => clearPending('No board acknowledgment. Output state unknown; no automatic retry.'), 5000) };
  try {
    if (state.simulated) {
      const next = { ...r, sequence: counter, [target === 1 ? 'on' : 'on2']: seconds > 0, receivedAt: Date.now() };
      update({ reading: next }); clearPending(`SIMULATION: bulb ${target} ${on ? 'ON' : 'OFF'} (relay ${plan.relayOn ? 'ON' : 'OFF'}).`);
      if (seconds) setTimeout(() => { if (state.simulated && state.reading?.session === r.session) update({ reading: { ...state.reading, [target === 1 ? 'on' : 'on2']: false } }); }, seconds * 1000);
    } else await phoneRequest('bleWrite', { bytes });
  } catch (error) { clearPending('Write failed; output state unknown. No automatic retry.'); throw error; }
}
export function startSimulation() {
  if (phoneShell) return;
  stopSimulation();
  update({ simulated: true, readingSimulated: true, sample: { session: 1, temperature: 25, humidity: 60, receivedAt: Date.now(), source: 'BLE simulator', simulated: true }, readingSource: 'BLE simulator', telemetryReady: true, connected: true, boards: [], status: 'SIMULATION · no hardware connected', reading: { session: Math.floor(Math.random() * 0xffffff) + 1, sequence: 0, uptime: 0, temperature: 25, humidity: 60, on: false, on2: false, armed: true, fault: false, receivedAt: Date.now() } });
  if (state.reading && state.sample) update({ sample: { ...state.sample, session: state.reading.session } });
  simulation = setInterval(() => { if (state.reading) update({ reading: { ...state.reading, uptime: state.reading.uptime + 1, receivedAt: Date.now() }, sample: state.sample ? { ...state.sample, receivedAt: Date.now() } : undefined }); }, 1000);
}
function stopSimulation() { if (simulation) clearInterval(simulation); simulation = undefined; update({ simulated: false }); }
export function sensorReply(question: string): string | null {
  if (!/\b(?:temperature|humidity|sensor|bulb\s*[12])\b/i.test(question) || /\b(?:should|why|how|if|when|above|below|turn|switch|toggle|on|off)\b/i.test(question)) return null;
  const r = state.reading;
  if (!r) return 'No BLE sensor reading has been received. Open Devices and connect your DairyOS board. No online lookup was made.';
  const sample = state.sample, stale = sampleIsStale(sample);
  return `${sample?.simulated ? 'SIMULATION — invented test values. ' : 'Nearby board report. '}${stale ? 'Last received values — stale after 5 minutes without a valid measurement. ' : 'Latest received sensor values. '}Temperature: ${sample ? sample.temperature + ' °C' : 'unknown'}. Humidity: ${sample ? sample.humidity + '%' : 'unknown'}. Bulb 1 last board report: ${bulbOn(r, 1) ? 'ON' : 'OFF'} (relay ${r.on ? 'ON' : 'OFF'}). Bulb 2 last board report: ${bulbOn(r, 2) ? 'ON' : 'OFF'} (relay ${r.on2 ? 'ON' : 'OFF'}). Last updated ${new Date(sample?.receivedAt ?? r.receivedAt).toLocaleString()}. GPIO reports do not verify electrical bulb output.`;
}
