import { bulbOn, outputPolicy, type Output } from './output-policy';
import { liveReading, sampleIsStale, type BleState } from './state';
export type FarmChatIntent =
  | { kind: 'sensors'; temperature: boolean; humidity: boolean }
  | { kind: 'status'; target?: Output }
  | { kind: 'command'; target: Output; on: boolean; seconds: number }
  | { kind: 'clarify'; text: string }
  | { kind: 'none' };
export function describeFarmReading(intent: Extract<FarmChatIntent, { kind: 'sensors' | 'status' }>, state: BleState, now = Date.now()): string {
  if (intent.kind === 'sensors') {
    const sample = state.sample;
    if (!sample) return 'No measured temperature or humidity reading has been received yet. Connect the DairyOS board in Devices and wait for a sensor update. I will not substitute a default value.';
    const lines = [sample.simulated ? 'SIMULATION — test values; no farm hardware.' : 'Latest received farm sensor readings.'];
    if (intent.temperature) lines.push(`Temperature: ${sample.temperature} °C.`);
    if (intent.humidity) lines.push(`Humidity: ${sample.humidity}%.`);
    lines.push(`Last updated ${new Date(sample.receivedAt).toLocaleString()}.`);
    if (sampleIsStale(sample, now)) lines.push('Stale: no valid sensor update for at least 5 minutes.');
    if (!state.connected) lines.push('The board is disconnected; these are the last received measurements.');
    return lines.join('\n');
  }
  if (!state.reading) return 'I have no board-reported bulb state yet. Connect the DairyOS board in Devices. No equipment command was sent.';
  const targets: Output[] = intent.target ? [intent.target] : [1, 2];
  const lines = [state.readingSimulated ? 'SIMULATION — no hardware.' : 'Latest board report.'];
  for (const target of targets) lines.push(`Bulb ${target}: ${bulbOn(state.reading, target) ? 'ON' : 'OFF'} (${outputPolicy[target].normallyOn ? 'normally ON' : 'normally OFF'} wiring).`);
  lines.push(`Received ${new Date(state.reading.receivedAt).toLocaleString()}.`);
  if (!liveReading(state, now)) lines.push('This is the last received report, not a confirmed current state.');
  lines.push('A board report does not verify electrical lamp output.');
  return lines.join('\n');
}
