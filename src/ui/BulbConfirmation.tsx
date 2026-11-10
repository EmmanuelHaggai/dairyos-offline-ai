import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bulbCommand, outputPolicy, type Output } from '../ble/output-policy';
import { Button, Icon, s } from './components';
import { colors as c } from './theme';
export type BulbProposal = { target: Output; on: boolean; seconds: number; session: number };
export function BulbConfirmation({ proposal, phase, error, allowed, simulated, onConfirm, onCancel }: {
  proposal?: BulbProposal; phase: 'review' | 'waiting' | 'failed'; error: string; allowed: boolean; simulated: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!proposal) return null;
  const plan = bulbCommand(proposal.target, proposal.on, proposal.seconds);
  const waiting = phase === 'waiting';
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!waiting) onCancel(); }}>
    <View style={styles.backdrop}><View nativeID="bulb-confirmation-dialog" style={styles.dialog}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.symbol}><Icon name="device" size={25} /></View>
        <Text style={s.eyebrow}>{simulated ? "SIMULATION · NO HARDWARE" : "BULB CONTROL"}</Text>
        <Text accessibilityRole="header" style={styles.title}>Turn Bulb {proposal.target} {proposal.on ? 'ON' : 'OFF'}{!plan.persistent ? ` for ${proposal.seconds} seconds` : ''}?</Text>
        <Text style={s.body}>{!plan.persistent ? `It will return ${outputPolicy[proposal.target].normallyOn ? 'ON' : 'OFF'} automatically when the ${proposal.seconds}-second hold ends.` : `It stays ${proposal.on ? 'ON' : 'OFF'} until another command or the physical interlock changes it. Bluetooth disconnection does not reset it.`}</Text>
        <View style={styles.detail}><Text style={s.caption}>{outputPolicy[proposal.target].normallyOn ? 'Normally ON wiring' : 'Normally OFF wiring'} · relay {plan.relayOn ? 'ON' : 'OFF'}</Text></View>
        {waiting ? <View accessibilityRole="alert" style={styles.progress}><ActivityIndicator size="small" color={c.forest} /><Text style={[s.body, { flex: 1 }]}>Waiting for confirmation from the board…</Text></View> : error ? <Text accessibilityRole="alert" style={[s.body, { color: c.danger }]}>{error}</Text> : !allowed ? <Text accessibilityRole="alert" style={[s.body, { color: c.warning }]}>The connection is not ready. Close this dialog and reconnect before sending.</Text> : <Text style={s.caption}>Check that you selected the correct bulb, then confirm.</Text>}
        {phase === 'failed' ? <Button label="Close confirmation" displayLabel="Close" onPress={onCancel} /> : <>
          <Button label="Confirm bulb command" displayLabel={waiting ? 'Sending…' : `Confirm ${proposal.on ? 'ON' : 'OFF'}`} disabled={!allowed || waiting} onPress={onConfirm} />
          <Button label="Cancel command" displayLabel="Cancel" variant="secondary" disabled={waiting} onPress={onCancel} />
        </>}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,55,42,0.48)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 460, maxHeight: '92%', backgroundColor: c.white, borderRadius: 20, overflow: 'hidden' },
  content: { padding: 24, gap: 16 }, symbol: { width: 50, height: 50, borderRadius: 15, backgroundColor: c.sage, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '700', color: c.forest },
  detail: { padding: 12, borderRadius: 8, backgroundColor: c.cream }, progress: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
