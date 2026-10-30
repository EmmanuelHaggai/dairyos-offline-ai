(async () => {
  const report = { startedAt: new Date().toISOString(), passed: [], answers: [], failure: null };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (check, limit = 200) => {
    for (let i = 0; i < limit; i++) { if (check()) return; await pause(100); }
    throw new Error('Timed out waiting for the app');
  };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const click = async (role, text) => {
    const element = [...document.querySelectorAll('[role="' + role + '"]')].find(el => el.getAttribute('aria-label') === text || el.textContent.trim() === text);
    assert(element, 'Missing control: ' + text); element.click(); await pause(150);
  };
  const fill = async (label, text) => {
    const element = document.querySelector('[aria-label="' + label + '"]');
    assert(element, 'Missing input: ' + label);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true })); await pause(50);
  };
  const prefix = 'dairyos-phone-test-v1:';
  const turns = () => JSON.parse(localStorage.getItem(prefix + 'turns') || '[]');
  const question = async (text, expected) => {
    const count = turns().length;
    await fill('Farm question', text); await click('button', 'Ask DairyOS');
    await until(() => turns().length > count || document.body.textContent.includes('Could not complete that request'), 3000);
    const last = turns().at(-1);
    assert(last && turns().length > count, 'Answer failed: ' + document.body.innerText);
    assert(last.status === 'complete', 'Partial answer: ' + last.answer);
    if (expected) assert(expected.test(last.answer), 'Unexpected answer: ' + last.answer);
    report.answers.push({ question: text, answer: last.answer, elapsedMs: last.elapsedMs });
    report.passed.push(text);
  };
  try {
    await until(() => document.body.textContent.includes('Your farm, at hand.') && window.dairyosReceive);
    if (window.dairyosPersistenceTest) {
      const saved = JSON.parse(localStorage.getItem(prefix + 'records') || '[]');
      assert(saved.length === 3, 'Saved records were not restored after process restart');
      assert(saved.filter(row => row.kind === 'milk').reduce((sum, row) => sum + row.quantity, 0) === 20, 'Saved milk amounts changed');
      assert(turns().length >= 9 && turns().some(turn => turn.answer.includes('20 litres')), 'Saved conversation was not restored after process restart');
      await click('tab', 'Records');
      await until(() => document.body.textContent.includes('12.5 L') && document.body.textContent.includes('7.5 L') && document.body.textContent.includes('4 kg'));
      report.passed.push('All milk/feed records restored after terminating and reopening app', 'Exact quantities preserved', 'Conversation restored after process restart', 'Stored records render offline');
      report.completedAt = new Date().toISOString();
      window.webkit.messageHandlers.dairyos.postMessage({ id: 'validation-report', command: 'validation', value: report });
      return;
    }
    // Isolated validation data; never clear the farmer's production namespace.
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    await click('tab', 'Records');
    await click('button', 'Add record');
    const today = new Date();
    const date = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    await fill('Record date', date);
    for (const [name, amount] of [['Daisy', '12.5'], ['Rose', '7.5']]) {
      await fill('Animal or group name', name); await fill('Record quantity', amount); await click('button', 'Save local record');
      await until(() => document.body.textContent.includes(amount + ' L'));
    }
    await click('button', 'Feed'); await fill('Animal or group name', 'Daisy'); await fill('Record quantity', '4'); await click('button', 'Save local record');
    await until(() => document.body.textContent.includes('4 kg')); report.passed.push('Native local records saved');
    await fill('Record date', '2026-02-30'); await fill('Record quantity', '3'); await click('button', 'Save local record');
    await until(() => document.body.textContent.includes('Use a real date')); await click('button', 'Dismiss message'); report.passed.push('Invalid input visible error');
    await click('tab', 'Library'); await fill('Search local references', 'kukamua');
    await until(() => document.body.textContent.includes('Clean milking routines') && !document.body.textContent.includes('Feed and water management')); report.passed.push('Native Kiswahili reference retrieval');
    await click('tab', 'Ask');
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'Phone layout overflows'); report.passed.push('Phone layout fits');
    await question('Help', /I can check saved/);
    await question('Milk today', /20 litres/);
    await question('How much milk did Daisy produce today?', /12\.5 litres/);
    await question('How much milk did Rose produce yesterday?', /no milk entry/);
    await question('Feed today', /4 kg/);
    await question('Turn on the pump', /No equipment command was sent/);
    await question('Record 99 litres today', /No farm data was changed/);
    await question('Weather tomorrow?', /cannot check live/);
    await question('How do I keep milking clean? Give three brief steps.');
    const original = window.dairyosReceive;
    const replies = new Map(); let sequence = 0;
    window.dairyosReceive = message => {
      const pending = replies.get(message.id);
      if (!pending) { original(message); return; }
      if (message.type === 'error') { replies.delete(message.id); pending.reject(new Error(String(message.value))); }
      if (message.type === 'result') { replies.delete(message.id); pending.resolve(message.value); }
    };
    const request = (command, value = {}) => new Promise((resolve, reject) => {
      const id = 'selftest-' + ++sequence; replies.set(id, { resolve, reject }); window.webkit.messageHandlers.dairyos.postMessage({ id, command, value });
    });
    report.models = await request('verifyModels');
    assert(report.models.length === 3 && report.models.every(model => model.matches), 'Phone model checksums differ from the pinned pack');
    report.passed.push('All three on-device model SHA-256 checksums match');
    const photo = await request('testPhoto');
    const references = await request('testLibrary');
    const photoAnswer = await request('answer', { question: 'What can you see in this leaf photo, and what should I inspect next?', records: [], references, turns: [], localDate: date, photo });
    assert((photoAnswer.observation || photoAnswer.origin === 'library') && photoAnswer.text && !photoAnswer.stopped && !photoAnswer.limited, 'Photo pipeline did not complete');
    report.answers.push({ question: 'Native leaf photo', ...photoAnswer }); report.passed.push(photoAnswer.origin === 'library' ? 'Native vision assessment discarded; offline inspection guide shown' : 'Native QVAC vision then text');
  } catch (error) { report.failure = String(error) + '\n' + String(error.stack || ''); }
  report.completedAt = new Date().toISOString();
  window.webkit.messageHandlers.dairyos.postMessage({ id: 'validation-report', command: 'validation', value: report });
})();
