// DairyOS BLE v1. Every frame fits the minimum 20-byte ATT payload.
export const SERVICE = 'd8a10000-7c36-4f19-aef4-76b80a0d1000';
export const TELEMETRY = 'd8a10001-7c36-4f19-aef4-76b80a0d1000';
export const CONTROL = 'd8a10002-7c36-4f19-aef4-76b80a0d1000';
export type Reading = { session: number; sequence: number; uptime: number; temperature: number | null; humidity: number | null; on: boolean; on2: boolean; armed: boolean; fault: boolean; receivedAt: number };
export function decodeTelemetry(bytes: number[], now = Date.now()): Reading {
  if (bytes.length !== 20 || bytes.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error('Invalid BLE frame length or bytes.');
  const d = new DataView(Uint8Array.from(bytes).buffer);
  if (d.getUint8(0) !== 1 || (d.getUint8(1) & 0xe0) || d.getUint16(18, true) !== 0) throw new Error('Unsupported BLE protocol.');
  const flags = d.getUint8(1), t = d.getInt16(10, true), m = d.getUint16(12, true);
  const valid = !!(flags & 2);
  if (valid && (t < -5000 || t > 10000 || m > 10000)) throw new Error('Sensor reading outside protocol range.');
  const session = d.getUint32(6, true);
  if (!session) throw new Error('Missing board session.');
  return { session, sequence: d.getUint32(2, true), temperature: valid ? t / 100 : null, humidity: valid ? m / 100 : null, uptime: d.getUint32(14, true), on: !!(flags & 1), on2: !!(flags & 16), armed: !!(flags & 8), fault: !!(flags & 4), receivedAt: now };
}
export const fresh = (r?: Reading, now = Date.now()) => !!r && now >= r.receivedAt && now - r.receivedAt < 6000;
export function commandFrame(r: Reading, sequence: number, seconds: number, now = Date.now(), target: 1 | 2 = 1): number[] {
  if (target !== 1 && target !== 2) throw new Error('Unknown bulb output.');
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 0xffffffff) throw new Error('Invalid command sequence.');
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30) throw new Error('Use a run time from 1 to 30 seconds, or 0 to stop.');
  if (!fresh(r, now)) throw new Error('Wait for fresh telemetry before sending a command.');
  if (seconds && (!r.armed || r.fault)) throw new Error('Enable the physical board interlock and clear its fault first.');
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 1); d.setUint8(1, seconds ? 1 : 0); d.setUint32(2, sequence, true); d.setUint32(6, r.session, true); d.setUint16(10, seconds, true); d.setUint8(12, target);
  return Array.from(new Uint8Array(d.buffer));
}
