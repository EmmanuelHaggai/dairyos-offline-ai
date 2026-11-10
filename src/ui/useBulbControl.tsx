import { useCallback, useEffect, useRef, useState } from 'react';
import { bleSnapshot, setBulbBLE } from '../ble/client';
import { bulbCommand, type Output } from '../ble/output-policy';
import { liveReading, type BleState } from '../ble/state';
import { BulbConfirmation, type BulbProposal } from './BulbConfirmation';
export type BulbOutcome = { kind: 'confirmed' | 'cancelled' | 'failed'; proposal: BulbProposal; message: string };

// Manual Devices controls retain review; chat uses the shared ACK transport directly.
export function useBulbControl(state: BleState, onOutcome?: (outcome: BulbOutcome) => void) {
  const [proposal, setProposal] = useState<BulbProposal>();
  const [phase, setPhase] = useState<'review' | 'waiting' | 'failed'>('review');
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  const sending = useRef(false), callback = useRef(onOutcome);
  callback.current = onOutcome;
  useEffect(() => { if (!proposal) return; const timer = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(timer); }, [proposal]);
  const finish = useCallback((kind: BulbOutcome['kind'], message: string) => {
    const request = proposal;
    sending.current = false; setProposal(undefined); setPhase('review'); setError('');
    if (request) callback.current?.({ kind, message, proposal: request });
  }, [proposal]);
  useEffect(() => {
    if (phase !== 'waiting' || state.pending || !state.lastAction || !proposal) return;
    const action = state.lastAction;
    if (action.target !== proposal.target || action.on !== proposal.on || action.session !== proposal.session) return;
    sending.current = false;
    if (action.confirmed) finish('confirmed', state.lastCommand ?? 'Board confirmed the command.');
    else { setPhase('failed'); setError(state.lastCommand ?? 'No board confirmation. State is unknown.'); }
  }, [phase, proposal, state.pending, state.lastAction, state.lastCommand, finish]);
  function open(target: Output, on: boolean, seconds = 0) {
    if (proposal || bleSnapshot().pending) throw new Error('Finish the current bulb command first.');
    const plan = bulbCommand(target, on, seconds);
    if (plan.persistent && bleSnapshot().reading?.protocolVersion !== 2) throw new Error('Upgrade the UNO Q for persistent controls first. No command was sent.');
    const reading = bleSnapshot().reading;
    if (!reading || !liveReading(bleSnapshot())) throw new Error('Connect the DairyOS board in Devices first.');
    sending.current = false; setPhase('review'); setError(''); setProposal({ target, on, seconds, session: reading.session });
  }
  async function confirm() {
    if (!proposal || sending.current) return;
    const request = proposal;
    sending.current = true; setPhase('waiting'); setError('');
    try {
      if (bleSnapshot().reading?.session !== request.session) throw new Error('The board connection changed. Close this dialog and review the command again.');
      await setBulbBLE(request.target, request.on, request.seconds);
    } catch (failure) { sending.current = false; setPhase('failed'); setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  const reading = state.reading, plan = proposal ? bulbCommand(proposal.target, proposal.on, proposal.seconds) : undefined;
  const allowed = !!(liveReading(state) && reading && proposal?.session === reading.session && !state.pending && (!plan?.relayOn || (reading.armed && !reading.fault)));
  const cancel = () => { if (!sending.current) finish(phase === 'failed' ? 'failed' : 'cancelled', phase === 'failed' ? error : 'Cancelled. No equipment command was sent.'); };
  return { proposal, open, cancel, dialog: <BulbConfirmation proposal={proposal} phase={phase} error={error} allowed={allowed} simulated={state.simulated} onConfirm={() => void confirm()} onCancel={cancel} /> };
}
