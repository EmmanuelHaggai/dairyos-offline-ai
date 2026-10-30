import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { setBulbBLE, retryBLEReading, connectBLE, disconnectBLE, scanBLE, startBLE, startSimulation, subscribeBLE, bleSnapshot } from '../ble/client';
import { bulbCommand, bulbOn, outputPolicy, relayOn, type Output } from '../ble/output-policy';
import { liveReading, liveSample, sampleIsStale } from '../ble/state';
import { phoneShell } from '../phone-shell';
import { Badge, Button, Heading, Input, s } from './components';
export function Devices() {
  const [state, setState] = useState(bleSnapshot), [seconds, setSeconds] = useState('10');
  const [proposal, setProposal] = useState<{ target: Output; on: boolean; seconds: number; session: number }>(), [error, setError] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { startBLE(); const unsubscribe = subscribeBLE(setState); const timer = setInterval(() => tick(n => n + 1), 1000); return () => { unsubscribe(); clearInterval(timer); }; }, []);
  const current = liveReading(state), r = state.reading, sample = state.sample, sampleCurrent = liveSample(state), stale = sampleIsStale(sample);
  useEffect(() => { setProposal(value => value && (!state.connected || value.session !== r?.session) ? undefined : value); }, [state.connected, r?.session]);
  async function run(task: () => Promise<unknown>) { setError(''); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  function propose(target: Output, on = true) {
    const duration = Number(seconds);
    if (bulbCommand(target, on, 1).relayOn && (!/^\d+$/.test(seconds) || !Number.isInteger(duration) || duration < 1 || duration > 30)) { setError('Enter a whole number from 1 to 30 seconds.'); return; }
    if (r) setProposal({ target, on, seconds: duration, session: r.session });
  }
  return <View style={{ gap: 20 }}><Heading eyebrow="NEARBY HARDWARE" title="Sensors & controls" subtitle="Temperature, humidity and two bulb outputs, directly over Bluetooth." />
    <Badge label={sample?.simulated ? 'SIMULATION · no real hardware' : sample ? stale ? 'Last received · stale' : sampleCurrent ? 'Fresh sensor readings' : 'Last reading · updated recently' : 'No sensor reading received'} warning={stale || !!sample?.simulated} />
    <Text style={s.body}>{state.status}</Text><Text style={s.caption}>Bluetooth must be on. Wi-Fi, cellular and internet are not needed. Verify the board identity when pairing.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{phoneShell ? <Button label="Scan for boards" onPress={() => void run(scanBLE)} disabled={state.connected} icon="search" /> : <Button label="Start BLE simulator" onPress={startSimulation} icon="device" />}{phoneShell && state.connected && <Button label="Retry reading" onPress={() => void run(retryBLEReading)} variant="secondary" />}<Button label="Disconnect" onPress={() => { setProposal(undefined); void run(disconnectBLE); }} variant="secondary" /></View>
    {state.boards.map(board => <Button key={board.id} label={`Connect ${board.name} (${board.rssi} dBm)`} onPress={() => void run(() => connectBLE(board.id))} disabled={state.connected} variant="secondary" />)}
    <View style={s.dividedList}><View style={{ padding: 16, gap: 8 }}><Text style={s.sectionTitle}>Temperature</Text><Text style={s.title}>{sample ? `${sample.temperature} °C` : '—'}</Text><Text style={s.sectionTitle}>Humidity</Text><Text style={s.title}>{sample ? `${sample.humidity}%` : '—'}</Text><Text style={s.caption}>{sample ? `Last updated ${new Date(sample.receivedAt).toLocaleString()}${stale ? ' · stale; no valid sensor update for 5 minutes' : ''} · ${sample.source}` : 'Waiting for measured values. No default readings.'}</Text></View></View>
    <Input label="Relay hold time (seconds)" hint="1–30" value={seconds} onChangeText={value => { setSeconds(value); setProposal(undefined); }} keyboardType="number-pad" />
    {([1, 2] as const).map(target => <View key={target} style={{ gap: 10 }}><Text style={s.sectionTitle}>Bulb {target} · {current ? '' : 'last reported '}{r ? bulbOn(r, target) ? 'ON' : 'OFF' : 'unknown'}</Text><Text style={s.caption}>{outputPolicy[target].normallyOn ? 'Normally ON · relay OFF turns this bulb ON' : 'Normally OFF · relay ON turns this bulb ON'}{r ? ` · last relay ${relayOn(r, target) ? 'ON' : 'OFF'}` : ''}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button label={`Turn bulb ${target} on`} disabled={!current || (!outputPolicy[target].normallyOn && (!r?.armed || r.fault)) || !!state.pending} onPress={() => propose(target)} /><Button label={`Turn bulb ${target} off`} variant="secondary" disabled={!current || (outputPolicy[target].normallyOn && (!r?.armed || r.fault)) || !!state.pending} onPress={() => { if (outputPolicy[target].normallyOn) propose(target, false); else { setProposal(undefined); void run(() => setBulbBLE(target, false)); } }} /></View></View>)}
    {proposal && <View style={{ gap: 10 }}><Text style={s.body}>Confirm {bulbCommand(proposal.target, proposal.on, proposal.seconds).description} on this connected board. Check the wiring and area first.</Text><Button label="Confirm bulb command" disabled={!current || !!state.pending} onPress={() => { const p = proposal; setProposal(undefined); void run(async () => { if (bleSnapshot().reading?.session !== p.session) throw new Error('Board changed. Review the command again.'); await setBulbBLE(p.target, p.on, p.seconds); }); }} /><Button label="Cancel command" variant="ghost" onPress={() => setProposal(undefined)} /></View>}
    <Text style={s.body}>{state.pending ?? state.lastCommand ?? 'No equipment command sent.'}</Text>{error ? <Text accessibilityRole="alert" style={s.body}>{error}</Text> : null}
    <Text style={s.caption}>Physical enable interlock: {current ? r?.armed ? 'enabled' : 'disabled' : 'unknown'}. Board fault: {current ? r?.fault ? 'yes' : 'no' : 'unknown'}. GPIO reports confirm firmware state, not electrical bulb output. Relay energization is limited to 30 seconds. Bulb 1 is normally ON: releasing its relay or an expired OFF hold returns it to ON. Bulb 2 is normally OFF. This installation profile matches the server; it is not downloaded during offline use. Offline controls are independent of website commands; no sync is enabled.</Text>
  </View>;
}
