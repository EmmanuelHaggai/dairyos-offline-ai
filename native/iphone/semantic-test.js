// Explicit operator test only. Real local model first; optional real UI actuation.
(async () => {
  const report = { startedAt: new Date().toISOString(), model: [], ui: [], error: null };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const pending = new Map(); let serial = 0;
  await pause(2500);
  const receiver = window.dairyosReceive;
  window.dairyosReceive = message => {
    const request = pending.get(message.id);
    if (request && (message.type === 'result' || message.type === 'error')) {
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.type === 'error') request.reject(new Error(String(message.value)));
      else request.resolve(message.value);
    } else {
      if (message.type === 'result' || message.type === 'error') {
        report.trace ??= []; report.trace.push({ id: message.id, type: message.type, value: message.value });
      }
      receiver?.(message);
    }
  };
  const request = (command, value = {}) => new Promise((resolve, reject) => {
    const id = 'semantic-test-' + (++serial);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native request timed out')); }, 180000);
    pending.set(id, { resolve, reject, timer });
    window.webkit.messageHandlers.dairyos.postMessage({ id, command, value });
  });
  const checkpoint = () => request('semanticValidation', report);
  const cases = [
    ['Turn bulb 1 back on', 'command', 1, 'ON'],
    ['Turn bulb 1 off for 5 seconds', 'command', 1, 'OFF', false, 5],
    ['turn it back on', 'command', 1, 'ON', true],
    ['Could you bring the second light back to life?', 'clarify'],
    ['Please illuminate the second bulb.', 'command', 2, 'ON'],
    ['How warm and humid is it in here right now?', 'sensors'],
    ['Turn it off', 'clarify'],
    ['Do not turn bulb 1 off', 'clarify'],
    ['If it gets hot, turn bulb 2 on', 'clarify'],
    ['What temperature is best for calves?', 'none'],
    ['Do not turn bulb 1 off', 'clarify', undefined, undefined, true],
    ['If it gets hot, turn bulb 2 on', 'clarify', undefined, undefined, true],
  ];
  try {
    if (window.dairyosSemanticResume) {
      const saved = await request('semanticResume');
      if (saved.coreAccepted !== true || saved.model?.length !== cases.length || saved.model.some((row, i) => !row.passed || row.question !== cases[i][0]) || !saved.guidance?.passed || !saved.photo?.passed) throw new Error('Saved model/regression acceptance is incomplete. Run the full suite first.');
      const models = await request('verifyModels');
      if (models.length !== 3 || models.some(m => !m.matches || !saved.models?.some(old => old.file === m.file && old.sha256 === m.sha256))) throw new Error('Model files differ from the accepted run.');
      Object.assign(report, saved, { resumedAt: new Date().toISOString(), resumedFrom: saved.completedAt, error: null, completedAt: undefined, ui: [], trace: [] });
    } else {
    report.stage = 'Verifying model files'; await checkpoint();
    report.models = await request('verifyModels');
    if (report.models.length !== 3 || report.models.some(m => !m.matches)) throw new Error('Model checksums do not match.');
    report.stage = 'Testing local model'; await checkpoint();
    for (const [question, expected, target, state, context, seconds] of (window.dairyosSemanticSmoke ? cases.slice(0,1) : cases)) {
      const turns = context ? [{ question: 'Turn bulb 1 off', answer: 'The board confirmed Bulb 1 OFF.', status: 'complete' }] : [];
      const result = await request('answer', { mode: 'intent', question, turns, records: [], references: [] });
      if (result.stopped || result.limited) throw new Error('Local interpretation was interrupted or truncated; no command sent.');
      const intent = JSON.parse(result.text);
      const shapeValid = intent.intent === 'command' ? [1,2].includes(intent.target) && ['ON','OFF'].includes(intent.state) && Number.isInteger(intent.seconds) && intent.seconds >= 0 && intent.seconds <= 30
        : intent.intent === 'sensors' ? ['temperature','humidity','both'].includes(intent.metric)
        : intent.intent === 'status' ? [0,1,2].includes(intent.target)
        : intent.intent === 'clarify' ? typeof intent.clarification === 'string'
        : intent.intent === 'none';
      const exploratory = question === 'Could you bring the second light back to life?';
      const acceptableMetaphor = exploratory && intent.intent === 'command' && intent.target === 2 && intent.state === 'ON';
      const passed = shapeValid && !result.limited && !result.stopped && ((intent.intent === expected && (!target || intent.target === target) && (!state || intent.state === state) && (expected !== 'command' || intent.seconds === (seconds ?? 0))) || acceptableMetaphor);
      report.model.push({ question, intent, proposedIntent: result.proposedIntent, verification: result.verification, shapeValid, passed, exploratory, elapsedMs: result.elapsedMs });
      await checkpoint();
      if (!shapeValid) throw new Error('Invalid model output shape; recorded in model results. No actuation attempted.');
      if (!passed && !exploratory) throw new Error('Semantic acceptance failed for: ' + question + '. No actuation attempted.');
    }
    if (window.dairyosSemanticSmoke) { report.completedAt = new Date().toISOString(); await checkpoint(); return; }
    report.coreAccepted = report.model.every(row => row.exploratory || row.passed);
    if (!report.coreAccepted) throw new Error('Semantic model acceptance failed; no UI actuation attempted.');
    report.stage = 'Checking guidance and photo regression'; await checkpoint();
    const references = await request('testLibrary');
    const guidance = await request('answer', { question: 'How do I keep milking clean? Give three brief steps.', turns: [], records: [], references });
    report.guidance = { origin: guidance.origin, text: guidance.text, elapsedMs: guidance.elapsedMs, passed: guidance.origin === 'model' && !!guidance.text?.trim() && !guidance.stopped && !guidance.limited };
    await checkpoint();
    if (!report.guidance.passed) throw new Error('Normal text guidance did not complete.');
    const photo = await request('testPhoto');
    const photoAnswer = await request('answer', { question: 'Describe this leaf photo and suggest what I should inspect next.', turns: [], records: [], references, photo });
    report.photo = { origin: photoAnswer.origin, text: photoAnswer.text, observation: photoAnswer.observation, elapsedMs: photoAnswer.elapsedMs, passed: !!photoAnswer.text?.trim() && !photoAnswer.stopped && !photoAnswer.limited && (photoAnswer.origin === 'library' || !!photoAnswer.observation) };
    await checkpoint();
    if (!report.photo.passed) throw new Error('Photo pipeline did not complete.');
    }
    if (window.dairyosSemanticActuate) {
      document.querySelector('[role=tab][aria-label=Ask]')?.click();
      await pause(300);
      const button = label => document.querySelector('[role=button][aria-label="' + label + '"]');
      const body = () => document.body.innerText;
      const until = async predicate => { const end = Date.now() + 150000; while (!predicate()) { if (Date.now() > end) throw new Error('Interactive UI test timed out: ' + body().slice(-2000)); await pause(100); } };
      const click = async label => { await until(() => button(label) && button(label).getAttribute('aria-disabled') !== 'true'); button(label).click(); await pause(200); };
      const turns = () => JSON.parse(localStorage.getItem('dairyos-phone-v1:turns') || '[]');
      async function ask(question, on) {
        report.stage = 'Asking: ' + question; await checkpoint();
        const beforeId = turns().at(-1)?.id;
        const field = document.querySelector('[aria-label="Farm question"]');
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, question);
        field.dispatchEvent(new Event('input', { bubbles: true })); await pause(200); await click('Ask DairyOS');
        await until(() => turns().at(-1)?.id !== beforeId || body().includes('Could not complete that request'));
        if (button('Confirm bulb command')) throw new Error('AI command unexpectedly required a manual confirmation.');
        const receipt = turns().at(-1);
        if (receipt?.id === beforeId || receipt?.question !== question || !receipt.answer.startsWith('The board confirmed Bulb 1 ' + (on ? 'ON' : 'OFF'))) throw new Error('No matching board-confirmed receipt: ' + (receipt?.answer ?? 'none'));
        report.ui.push({ question, on, completedAt: new Date().toISOString(), receipt: receipt.answer }); await checkpoint();
      }
      // Short timed OFF self-restores if later test fails. Final action explicitly restores ON.
      await ask('Turn bulb 1 off for 5 seconds', false);
      await ask('turn it back on', true);
      await request('bleDisconnect');
      await ask('Turn bulb 1 back on', true);
    }
  } catch (error) { report.error = String(error); }
  report.completedAt = new Date().toISOString(); report.jsErrors = window.dairyosErrors;
  await checkpoint();
})();
