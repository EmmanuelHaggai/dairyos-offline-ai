import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function openBrowser({ width = 1280, height = 900, port = 9242, profile = '.private/design-browser' } = {}) {
  await mkdir(profile, { recursive: true });
  const process = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + port, '--user-data-dir=' + path.resolve(profile), 'about:blank'], { stdio: 'ignore' });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let page;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { page = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(tab => tab.type === 'page'); if (page) break; } catch {}
    await pause(150);
  }
  if (!page) { process.kill(); throw new Error('Chrome did not start.'); }
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  function call(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome timed out: ' + method)); }, 30000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) { clearTimeout(request.timer); pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result); }
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.result.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const viewport = async (width, height = 900) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  const until = async (expression, attempts = 150) => {
    for (let index = 0; index < attempts; index++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); }
    throw new Error('Page condition not reached: ' + expression);
  };
  const navigate = async url => { const result = await call('Page.navigate', { url }); if (result.errorText) throw new Error(result.errorText); await until('document.readyState === "complete"'); await pause(200); };
  const screenshot = async (file, fullPage = false) => {
    let clip;
    if (fullPage) { const metrics = await call('Page.getLayoutMetrics'); clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 }; }
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, Buffer.from(result.data, 'base64'));
  };
  await call('Page.enable'); await call('Runtime.enable'); await viewport(width, height);
  return { call, evaluate, until, navigate, viewport, screenshot, pause, errors, close() { for (const request of pending.values()) clearTimeout(request.timer); socket.close(); process.kill(); } };
}
