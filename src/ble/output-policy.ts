import type { Reading } from './protocol';
export type Output = 1 | 2;
// Commissioned FARM004 installation, verified against server invert_display on
// 2026-10-30. This is load-contact inversion, not the GPIO active-low setting.
export const outputPolicy = { 1: { normallyOn: true }, 2: { normallyOn: false } } as const;
export const relayOn = (reading: Reading, target: Output) => target === 1 ? reading.on : reading.on2;
export const bulbOn = (reading: Reading, target: Output) => relayOn(reading, target) !== outputPolicy[target].normallyOn;
export function bulbCommand(target: Output, on: boolean, holdSeconds = 0) {
  if (target !== 1 && target !== 2) throw new Error('Unknown bulb output.');
  const relay = on !== outputPolicy[target].normallyOn;
  if (!Number.isInteger(holdSeconds) || holdSeconds < 0 || holdSeconds > 30) throw new Error('Use 0 for a persistent state or 1 to 30 seconds for an explicit timer.');
  if (holdSeconds && !relay) throw new Error('Timed actions are supported only for Bulb 1 OFF and Bulb 2 ON.');
  return { target, on, relayOn: relay, relaySeconds: relay ? holdSeconds : 0, persistent: holdSeconds === 0,
    description: `Bulb ${target} ${on ? 'ON' : 'OFF'}${holdSeconds ? ` for ${holdSeconds} seconds` : ' until changed'} (relay ${relay ? 'ON' : 'OFF'})` };
}
