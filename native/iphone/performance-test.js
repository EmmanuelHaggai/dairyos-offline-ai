// Explicit diagnostic launch only. Interpret sensors; never send equipment commands.
(async () => {
  let sequence = 0;
  const requests = new Map();
  const previous = window.dairyosReceive;
  window.dairyosReceive = message => {
    previous?.(message);
    const pending = requests.get(message.id);
    if (pending && ['result', 'error'].includes(message.type)) {
      requests.delete(message.id);
      if (message.type === 'error') pending.reject(new Error(String(message.value)));
      else pending.resolve(message.value);
    }
  };
  const request = (command, value = {}) => new Promise((resolve, reject) => {
    const id = 'performance-' + ++sequence;
    requests.set(id, { resolve, reject });
    window.webkit.messageHandlers.dairyos.postMessage({ id, command, value });
  });
  const report = { startedAt: new Date().toISOString(), requests: [], passed: false };
  try {
    for (const label of ['cold', 'warm', 'repeat']) {
      const result = await request('answer', { mode: 'intent', question: 'What are the temperature and humidity right now?', records: [], references: [], turns: [] });
      const intent = JSON.parse(result.text);
      const passed = !result.stopped && !result.limited && intent.intent === 'sensors' && intent.metric === 'both' && result.verification?.approved === true && result.reusedModel === (label !== 'cold');
      report.requests.push({ label, passed, ...result });
      await request('performanceValidation', report);
      if (!passed) throw new Error('Sensor interpretation or model reuse failed: ' + label);
    }
    report.passed = true;
  } catch (error) { report.error = String(error); }
  report.completedAt = new Date().toISOString();
  await request('performanceValidation', report);
})();
