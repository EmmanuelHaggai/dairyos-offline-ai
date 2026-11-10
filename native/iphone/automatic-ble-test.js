// Operator-only transport test. No AI requests and no output commands.
(async () => {
  const report = { startedAt: new Date().toISOString(), checks: [], passed: false };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    let end = Date.now() + 75000, last = Date.now();
    while (document.hidden || !predicate()) {
      const now = Date.now();
      if (document.hidden || now - last > 1000) end += now - last;
      if (now > end) throw new Error('Automatic connection timed out.');
      last = now; await pause(100);
    }
  };
  const body = () => document.body.textContent;
  const click = label => document.querySelector('[aria-label="' + label + '"]')?.click();
  try {
    await until(() => document.querySelector('[aria-label="View board connection"]')?.textContent === 'Board connected');
    report.checks.push('Connected automatically from app startup without asking the AI or tapping Connect.');
    click('View board connection'); await pause(400); click('Disconnect'); await pause(2500);
    if (!body().includes('Automatic connection paused.') || body().includes('Connection: Connected')) throw new Error('Manual disconnect did not pause automatic connection.');
    report.checks.push('Manual disconnect remained paused.');
    click('Resume auto-connect');
    await until(() => body().includes('Connection: Connected'));
    report.checks.push('Resume automatically scanned and reconnected.');
    report.passed = true;
  } catch (error) { report.error = String(error); }
  report.completedAt = new Date().toISOString();
  window.webkit.messageHandlers.dairyos.postMessage({ id:'automatic-ble-validation', command:'automaticBLEValidation', value:report });
})();
