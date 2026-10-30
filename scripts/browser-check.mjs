import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('.private/browser-check');
await mkdir(output, { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9239', '--user-data-dir=' + path.join(output, 'profile'), 'about:blank'], { stdio: 'ignore' });
let socket;
const pending = new Map();
let sequence = 0;
const errors = [];
const passed = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 15000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result.description);
  return result.result.value;
}
async function until(expression, attempts = 150) {
  for (let n = 0; n < attempts; n++) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); }
  throw new Error('UI condition failed: ' + expression);
}
async function click(role, text) {
  await evaluate(`(() => { const el = [...document.querySelectorAll('[role="${role}"]')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(text)} || e.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error('Missing control: ' + ${JSON.stringify(text)}); el.click(); })()`);
  await sleep(150);
}
async function fill(selector, text) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing input'); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}

try {
  let tabs;
  for (let n = 0; n < 50; n++) { try { tabs = await (await fetch('http://127.0.0.1:9239/json')).json(); break; } catch { await sleep(150); } }
  const page = tabs?.find(tab => tab.type === 'page');
  if (!page) throw new Error('Chrome debugging did not start.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Page.javascriptDialogOpening') void call('Page.handleJavaScriptDialog', { accept: true });
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result); }
  });
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const navigation = await call('Page.navigate', { url: 'http://127.0.0.1:8786' });
  if (navigation.errorText) throw new Error(navigation.errorText);
  await until(`document.body.textContent.includes('Your farm, at hand.')`);
  await until(`document.body.textContent.includes('Desktop preview')`);
  await evaluate(`localStorage.clear()`);
  await call('Page.reload');
  await until(`document.body.textContent.includes('Desktop preview')`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true, 'Mobile layout overflows');
  await click('tab', 'Records');
  await click('button', 'Add record');
  await fill('[aria-label="Record date"]', '2026-10-29');
  await fill('[aria-label="Animal or group name"]', 'Browser test cow');
  await fill('[aria-label="Record quantity"]', '12.5');
  await click('button', 'Save local record');
  await until(`document.body.textContent.includes('12.5 L')`);
  await call('Page.reload');
  await until(`document.body.textContent.includes('Your farm, at hand.')`);
  await click('tab', 'Records');
  await until(`document.body.textContent.includes('12.5 L') && document.body.textContent.includes('Browser test cow')`);
  await click('button', 'Add record');
  await click('tab', 'Library');
  await fill('[aria-label="Search local references"]', 'kukamua');
  await until(`document.body.textContent.includes('Clean milking routines') && !document.body.textContent.includes('Feed and water management')`);
  await fill('[aria-label="Search local references"]', 'unrelatedquasar');
  await until(`document.body.textContent.includes('No matching local passage')`);
  await fill('[aria-label="Search local references"]', '');
  await click('button', 'Add note');
  await fill('input[placeholder="Title and source / author"]', 'Extension test note');
  await fill('textarea[placeholder="Paste a short note"]', 'Test local note: inspect trough cleanliness before feeding.');
  await click('button', 'Save reference note');
  await until(`document.body.textContent.includes('Extension test note') && document.body.textContent.includes('not independently verified')`);
  await click('tab', 'Setup');
  await until(`document.body.textContent.includes('Airplane-mode acceptance check')`);
  await click('tab', 'Ask');
  for (const width of [320, 390, 428, 768, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    for (const tab of ['Ask', 'Records', 'Library', 'Setup']) {
      await click('tab', tab);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= ${width}`), true, `${tab} overflows at ${width}px`);
    }
    passed.push(`${width}px: all tabs fit`);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('tab', 'Records');
  await fill('[aria-label="Record date"]', '2026-02-30');
  await fill('[aria-label="Record quantity"]', '3');
  await click('button', 'Save local record');
  await until(`document.body.textContent.includes('Use a real date')`);
  await click('button', 'Dismiss message'); passed.push('Invalid input shows recoverable error');
  await click('tab', 'Ask');
  for (const [question, expected] of [
    ['Help', 'I can check saved'],
    ['Milk on 2026-10-29', '12.5 litres'],
    ['Feed on 2026-10-29', 'no feed entry found'],
    ['Milk on 2026-09-01', 'unknown, not zero'],
    ['Turn on the pump', 'No equipment command was sent'],
    ['Record 99 litres today', 'No farm data was changed'],
    ['Weather tomorrow?', 'cannot check live'],
  ]) {
    const count = await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns') || '[]').length`);
    await fill('[aria-label="Farm question"]', question); await click('button', 'Ask DairyOS');
    await until(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns') || '[]').length > ${count}`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns')).at(-1).answer.includes(${JSON.stringify(expected)})`), true, question);
    passed.push(question);
  }
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:records')).length`), 1, 'A chat command changed records');
  await click('tab', 'Records');
  await fill('[aria-label="Record date"]', '2026-10-29'); await fill('[aria-label="Record quantity"]', '3');
  await click('button', 'Save local record'); await until(`document.body.textContent.includes('3 L')`);
  await click('button', 'Delete record');
  await until(`JSON.parse(localStorage.getItem('dairyos-preview-v1:records')).length === 1`);
  passed.push('Confirmed record deletion works');
  await click('tab', 'Ask');
  if (process.argv.includes('--inference')) {
    await fill('[aria-label="Farm question"]', 'How many litres of milk did I record on 2026-10-29? Reply briefly.');
    await click('button', 'Ask DairyOS');
    await until(`document.querySelector('[aria-label="Farm question"]').value === '' && document.body.textContent.includes('12.5')`, 3000);
    if (!process.argv.includes('--photo-only')) {
      const count = await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns')).length`);
      await fill('[aria-label="Farm question"]', 'How do I keep milking clean? Give three brief steps.');
      await click('button', 'Ask DairyOS');
      await until(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns')).length > ${count} || document.body.textContent.includes('Could not complete that request')`, 3000);
      const guidance = await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns')).at(-1)`);
      assert.equal(guidance.question, 'How do I keep milking clean? Give three brief steps.');
      assert.equal(guidance.status, 'complete'); passed.push('Real English QVAC guidance');
    }
    await call('Page.setInterceptFileChooserDialog', { enabled: true });
    await click('button', 'Choose photo');
    const document = await call('DOM.getDocument');
    const input = await call('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type="file"]' });
    if (!input.nodeId) throw new Error('The photo picker did not create a file input.');
    await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path.resolve('.private/photo-checks/leaf-b.jpg')] });
    await until(`document.querySelector('[aria-label="Selected farm photo"]') && document.querySelector('[aria-label="Remove photo"]')`);
    await fill('[aria-label="Farm question"]', 'What can you observe in this leaf photo, and what should I check next?');
    await click('button', 'Ask about this photo');
    await until(`document.body.textContent.includes('Could not complete that request') || (document.querySelector('[aria-label="Farm question"]').value === '' && (document.body.textContent.includes('Photo observations') || document.body.textContent.includes('could not reliably assess this photo')))`, 3000);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('dairyos-preview-v1:turns'))`);
    assert.equal(saved.at(-1).photo, true, 'Photo guidance did not persist');
    assert.equal(saved.at(-1).status, 'complete', 'Photo guidance did not complete');
  }
  const mobile = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  const desktop = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser runtime exceptions');
  const result = { passed: [...passed, 'records save and reload', 'dated quantity persistence', 'Kiswahili local retrieval', 'unknown query', 'local guidance note', 'setup checklist', 'four-tab navigation', 'no browser runtime exceptions'], inference: process.argv.includes('--photo-only') ? 'Real local QVAC photo flow and record answers; standalone text guidance not repeated' : process.argv.includes('--inference') ? 'Real local QVAC: record answers, English guidance, photo picker, two-stage guidance and persisted photo turn' : 'Model inference not exercised; local command routing tested', screenshots: ['mobile.png', 'desktop.png'] };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Browser exceptions:', errors);
  if (socket?.readyState === 1) {
    console.error('Rendered body:', await evaluate('document.body.innerText').catch(() => 'unavailable'));
    const screenshot = await call('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (screenshot) await writeFile(path.join(output, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
  }
  throw error;
} finally { socket?.close(); chrome.kill(); }
