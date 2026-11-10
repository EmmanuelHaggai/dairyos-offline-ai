import { phoneRequest, phoneShell } from '../phone-shell';
import { bulbCommand, relayOn, type Output } from './output-policy';
import { commandFrame } from './protocol';
import { boardPresence, disconnectedState, liveReading, receiveReading, type BleState } from './state';
export type { Board, BleState } from './state';
let state: BleState = { status: 'Scan for your nearby DairyOS board.', connected: false, telemetryReady: false, boards: [], simulated: false };
const listeners = new Set<(s: BleState) => void>();
let selectedId: string | undefined;
let autoConnection: Promise<BleState> | undefined;
let connectionGeneration = 0;
let automaticTimer: ReturnType<typeof setInterval> | undefined;
let foreground = true, nextAutomaticAttempt = 0;
let started = false, counter = 0, simulation: ReturnType<typeof setInterval> | undefined;
let acknowledgment: { sequence: number; target: Output; on: boolean; logicalOn: boolean; session: number; timer: ReturnType<typeof setTimeout> } | undefined;
function update(value: Partial<BleState>) { state = { ...state, ...value }; listeners.forEach(fn => fn(state)); }
function clearPending(message: string, confirmed = false) {
  const request = acknowledgment;
  if (request) clearTimeout(request.timer);
  acknowledgment = undefined;
  update({ pending: undefined, pendingTarget: undefined, lastCommand: message, lastAction: request ? { target: request.target, on: request.logicalOn, confirmed, sequence: request.sequence, session: request.session, at: Date.now() } : undefined });
}
export function bleSnapshot() { return state; }
export function subscribeBLE(listener: (s: BleState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; }
function receive(value: unknown) {
  const e = value as { active?: boolean; preferredId?: string; radio?: string; phase?: string; kind: string; text?: string; id: string; name: string; rssi: number; bytes: number[] };
  if (e.kind === 'lifecycle') { setBLEForeground(e.active === true); return; }
  if (e.preferredId && !selectedId) selectedId = e.preferredId;
  if (e.radio) update({ radio: e.radio });
  if (e.phase) update({ scanning: e.phase === 'scanning', connecting: ['connecting', 'closing', 'service discovery', 'characteristic discovery', 'telemetry subscription', 'reconnecting'].includes(e.phase) });
  if (e.kind === 'device') update({ boards: [...state.boards.filter(b => b.id !== e.id), { id: e.id, name: e.name, rssi: e.rssi, lastSeenAt: Date.now() }] });
  else if (e.kind === 'scanComplete') update({ scanning: false, lastScanAt: Date.now(), status: e.text ?? 'Scan finished.' });
  else if (e.kind === 'signal') update({ signalRSSI: e.rssi, signalAt: Date.now() });
  else if (e.kind === 'connected') update({ connected: true, connecting: false, scanning: false, telemetryReady: false, status: e.text! });
  else if (e.kind === 'reconnecting') { clearPending('Connection interrupted; output state unknown. No automatic command retry.'); update({ ...disconnectedState(), connecting: true, status: e.text! }); }
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
        clearPending(!r.fault && on === ack.on ? `Bulb ${ack.target}: board reports ${ack.logicalOn ? 'ON' : 'OFF'} (relay ${on ? 'ON' : 'OFF'}).` : 'Board rejected command or reported a different GPIO state.', !r.fault && on === ack.on);
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
  update({ scanning: true });
  try { await phoneRequest('bleScan'); } catch (error) { update({ scanning: false }); throw error; }
}
export async function retryBLEReading() { if (!state.connected || state.simulated) throw new Error('Connect a real board before retrying.'); await phoneRequest('bleRead'); }
export async function connectBLE(id: string) { selectedId = id; nextAutomaticAttempt = Date.now() + 20000; clearPending('No command sent.'); update({ ...disconnectedState(), connecting: true, selectedBoard: state.boards.find(b => b.id === id)?.name ?? 'DairyOS board' }); try { await phoneRequest('bleConnect', { device: id }); } catch (error) { update({ connecting: false }); throw error; } }
export async function disconnectBLE() { update({ automatic: false }); connectionGeneration++; stopSimulation(); if (phoneShell && started) await phoneRequest('bleDisconnect'); update({ ...disconnectedState(), boards: [], status: 'Disconnected.' }); clearPending('Disconnected; output state unknown.'); }
export async function setBulbBLE(target: Output, on: boolean, holdSeconds = 0, onQueued?: (ticket: { sequence: number; session: number }) => void) {
  const plan = bulbCommand(target, on, holdSeconds), seconds = plan.relaySeconds;
  if (!liveReading(state) || state.pending || !state.reading) throw new Error('Connect a board and wait for telemetry and any pending command.');
  const r = state.reading;
  counter = Math.max(counter, r.sequence) + 1;
  const sequence = counter;
  if (plan.persistent && r.protocolVersion !== 2) throw new Error('The UNO Q needs the coordinated persistent-control update first. No timed substitute was sent.');
  const bytes = commandFrame(r, sequence, seconds, Date.now(), target, plan.persistent && plan.relayOn);
  onQueued?.({ sequence, session: r.session });
  update({ pending: `${plan.description} requested. Awaiting board acknowledgment.`, pendingTarget: target, lastCommand: undefined, lastAction: undefined });
  acknowledgment = { sequence, target, on: plan.relayOn, logicalOn: on, session: r.session, timer: setTimeout(() => { if (acknowledgment?.sequence === sequence && acknowledgment.session === r.session) clearPending('No board acknowledgment. Output state unknown; no automatic retry.'); }, 5000) };
  try {
    if (state.simulated) {
      const next = { ...r, sequence, [target === 1 ? 'on' : 'on2']: plan.relayOn, receivedAt: Date.now() };
      update({ reading: next }); clearPending(`SIMULATION: bulb ${target} ${on ? 'ON' : 'OFF'} (relay ${plan.relayOn ? 'ON' : 'OFF'}).`, true);
      if (!plan.persistent && seconds) setTimeout(() => { if (state.simulated && state.reading?.session === r.session) update({ reading: { ...state.reading, [target === 1 ? 'on' : 'on2']: false } }); }, seconds * 1000);
    } else await phoneRequest('bleWrite', { bytes });
  } catch (error) { if (state.lastAction?.sequence === sequence && state.lastAction.session === r.session && state.lastAction.confirmed) return; clearPending('Write failed; output state unknown. No automatic retry.'); throw error; }
}
// A clear chat request is authorization. Resolve only for its exact board ACK.
export function executeBulbBLE(target: Output, on: boolean, seconds = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    let ticket: { sequence: number; session: number } | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; unsubscribe(); clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const unsubscribe = subscribeBLE(snapshot => {
      const action = snapshot.lastAction;
      if (!ticket || !action || action.sequence !== ticket.sequence || action.session !== ticket.session || action.target !== target || action.on !== on) return;
      finish(action.confirmed ? undefined : new Error(snapshot.lastCommand ?? 'The board did not confirm this command.'));
    });
    const timeout = setTimeout(() => finish(new Error('No matching board acknowledgment. Output state is unknown.')), 8000);
    void setBulbBLE(target, on, seconds, value => { ticket = value; }).catch(error => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
export function startSimulation() {
  if (phoneShell) return;
  stopSimulation();
  update({ simulated: true, readingSimulated: true, sample: { session: 1, temperature: 25, humidity: 60, receivedAt: Date.now(), source: 'BLE simulator', simulated: true }, readingSource: 'BLE simulator', telemetryReady: true, connected: true, boards: [], status: 'SIMULATION · no hardware connected', reading: { protocolVersion: 2, syncPending: false, session: Math.floor(Math.random() * 0xffffff) + 1, sequence: 0, uptime: 0, temperature: 25, humidity: 60, on: false, on2: false, armed: true, fault: false, receivedAt: Date.now() } });
  if (state.reading && state.sample) update({ sample: { ...state.sample, session: state.reading.session } });
  simulation = setInterval(() => { if (state.reading) update({ reading: { ...state.reading, uptime: state.reading.uptime + 1, receivedAt: Date.now() }, sample: state.sample ? { ...state.sample, receivedAt: Date.now() } : undefined }); }, 1000);
}
function stopSimulation() { if (simulation) clearInterval(simulation); simulation = undefined; update({ simulated: false }); }
export function ensureBLEConnection(onStatus: (text: string) => void): Promise<BleState> {
  if (liveReading(state)) return Promise.resolve(state);
  if (autoConnection) return autoConnection;
  const generation = connectionGeneration;
  const wait = async (ready: () => boolean, milliseconds: number, failed?: () => boolean) => {
    const end = Date.now() + milliseconds;
    while (true) {
      if (generation !== connectionGeneration) throw new Error('Connection cancelled. No command sent.');
      if (state.radio === 'unavailable') throw new Error(state.status);
      if (ready()) return;
      if (failed?.()) throw new Error(state.status);
      if (Date.now() >= end) throw new Error('Could not obtain a fresh board connection. ' + state.status);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  autoConnection = (async () => {
    if (!phoneShell) throw new Error('Automatic Bluetooth connection requires the installed iPhone app.');
    startBLE(); onStatus('Preparing Bluetooth…');
    await wait(() => state.radio === 'ready', 15000);
    if (state.connected) { await retryBLEReading(); await wait(() => liveReading(state), 8000); return state; }
    if (state.connecting) { await wait(() => liveReading(state), 35000); return state; }
    onStatus('Looking for your nearby DairyOS board…');
    if (!state.scanning) await scanBLE();
    // Complete the service-filtered scan before choosing: never pick an arbitrary board.
    await wait(() => !state.scanning, 14000);
    if (state.connected || state.connecting) { await wait(() => liveReading(state), 50000); return state; }
    const board = selectedId ? state.boards.find(b => b.id === selectedId) : state.boards.length === 1 ? state.boards[0] : undefined;
    if (!board) throw new Error(state.boards.length > 1 ? 'Several boards are nearby. Choose your board in Devices.' : 'Your DairyOS board was not found. Check its power and distance.');
    onStatus('Connecting to ' + board.name + '…');
    await connectBLE(board.id); await wait(() => liveReading(state), 50000, () => !state.connected && !state.connecting);
    return state;
  })().finally(() => { autoConnection = undefined; });
  return autoConnection;
}

// Transport housekeeping only: no inference and no actuator writes.
export function setBLEForeground(active: boolean) {
  foreground = active;
  if (!active) connectionGeneration++;
  else { nextAutomaticAttempt = 0; void automaticTick(); }
}
async function automaticTick() {
  if (!foreground || !state.automatic || state.simulated || state.connected || state.connecting || state.radio === 'unavailable' || Date.now() < nextAutomaticAttempt) return;
  nextAutomaticAttempt = Date.now() + 20000;
  const generation = connectionGeneration;
  try { await ensureBLEConnection(() => {}); }
  catch (error) { if (foreground && state.automatic) update({ status: error instanceof Error ? error.message : String(error) }); }
  finally { nextAutomaticAttempt = generation === connectionGeneration ? Date.now() + 20000 : 0; }
}
export function resumeAutomaticBLE() {
  update({ automatic: true }); nextAutomaticAttempt = 0; startBLE(); void automaticTick();
}
export function startAutomaticBLE() {
  if (!phoneShell || automaticTimer) return () => {};
  resumeAutomaticBLE();
  let presence = boardPresence(state);
  automaticTimer = setInterval(() => {
    const next = boardPresence(state);
    if (next !== presence) { presence = next; update({}); }
    void automaticTick();
  }, 1000);
  return () => { if (automaticTimer) clearInterval(automaticTimer); automaticTimer = undefined; connectionGeneration++; };
}
