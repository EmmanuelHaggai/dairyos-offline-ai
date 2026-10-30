import { decodeTelemetry, fresh, type Reading } from './protocol';
export const SENSOR_STALE_MS = 5 * 60 * 1000;
export const sampleIsStale = (sample?: SensorSample, now = Date.now()) => !!sample && (now < sample.receivedAt || now - sample.receivedAt >= SENSOR_STALE_MS);
export type Board = { id: string; name: string; rssi: number };
export type SensorSample = { temperature: number; humidity: number; receivedAt: number; session: number; source: string; simulated: boolean };
export type BleState = { status: string; connected: boolean; telemetryReady: boolean; boards: Board[]; reading?: Reading; sample?: SensorSample; readingSource?: string; readingSimulated?: boolean; selectedBoard?: string; pending?: string; lastCommand?: string; simulated: boolean };
export const liveReading = (state: BleState, now = Date.now()) => state.connected && state.telemetryReady && fresh(state.reading, now);
export const liveSample = (state: BleState, now = Date.now()) => liveReading(state, now) && !!state.sample && state.sample.session === state.reading?.session && state.reading.temperature !== null && now >= state.sample.receivedAt && now - state.sample.receivedAt < 6000;
// A failed transport or decode never overwrites the last received measurement.
export function receiveReading(state: BleState, bytes: number[], now = Date.now()): Partial<BleState> {
  try {
    const reading = decodeTelemetry(bytes, now), old = state.reading;
    if (old && reading.session === old.session && reading.uptime < old.uptime) throw new Error('Out-of-order board telemetry. Reconnect the board.');
    const source = state.selectedBoard ?? 'Connected DairyOS board';
    const sample = reading.temperature !== null && reading.humidity !== null ? { temperature: reading.temperature, humidity: reading.humidity, receivedAt: now, session: reading.session, source, simulated: state.simulated } : state.sample;
    return { reading, sample, telemetryReady: true, readingSource: state.selectedBoard ?? 'Connected DairyOS board', readingSimulated: state.simulated, status: 'Connected. Telemetry received.' };
  } catch (error) { return { telemetryReady: false, status: error instanceof Error ? error.message : String(error) }; }
}
export function disconnectedState(): Partial<BleState> { return { connected: false, telemetryReady: false }; }
