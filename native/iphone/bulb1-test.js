// Only loaded by the explicit DAIRYOS_BULB1_TEST=1 operator test launch.
// Real Bulb 1 ON/OFF commands; never used by ordinary app launches.
(async () => {
  const report = { startedAt: new Date().toISOString(), profile: 'bulb_1 normally ON', steps: [], error: null, restored: false };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const body = () => document.body.innerText;
  const button = label => document.querySelector('[role=button][aria-label="' + label + '"]');
  const until = async (predicate, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (predicate()) return; await pause(100); } throw new Error('Timed out waiting for bulb test state.'); };
  const click = async label => { const el = button(label); if (!el || el.getAttribute('aria-disabled') === 'true') throw new Error('Unavailable: ' + label); el.scrollIntoView({ block: 'center' }); await pause(200); el.click(); await pause(150); };
  let needsRestore = false;
  async function request(on) {
    const expected = `Bulb 1: board reports ${on ? 'ON' : 'OFF'} (relay ${on ? 'OFF' : 'ON'}).`;
    const step = { requestedAt: new Date().toISOString(), logicalBulb: on ? 'ON' : 'OFF', expectedRelay: on ? 'OFF' : 'ON', acknowledged: false };
    report.steps.push(step);
    await click('Turn bulb 1 ' + (on ? 'on' : 'off'));
    await until(() => button('Confirm bulb command'));
    await click('Confirm bulb command');
    await until(() => body().includes(expected) || body().includes('Write failed; output state unknown') || body().includes('No board acknowledgment') || body().includes('Board rejected command'), 10000);
    if (!body().includes(expected)) { step.failure = body().slice(-6000); throw new Error('BLE command was not acknowledged. ' + (body().includes('Encryption is insufficient') ? 'Authenticated pairing is required.' : 'See native BLE report.')); }
    step.acknowledged = true; step.acknowledgedAt = new Date().toISOString();
  }
  try {
    await until(() => button('Turn bulb 1 on')?.getAttribute('aria-disabled') !== 'true' && body().includes('Bulb 1 · ON'), 60000);
    await pause(750);
    report.initialState = 'ON (relay OFF), matching server baseline';
    await request(true);
    // Arm restoration before the potentially uncertain OFF request.
    needsRestore = true;
    await request(false);
    await pause(1500);
    await request(true);
    needsRestore = false; report.restored = true;
  } catch (error) { report.error = String(error); }
  finally {
    if (needsRestore) {
      try { await request(true); report.restored = true; } catch (error) { report.restorationError = String(error); }
    }
    report.completedAt = new Date().toISOString();
    report.finalUI = body().slice(-8000);
    report.jsErrors = window.dairyosErrors ?? [];
    window.webkit.messageHandlers.dairyos.postMessage({ id: 'bulb1-validation', command: 'bulbValidation', value: report });
  }
})();
