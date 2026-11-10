// Explicit, read-only native link test. No actuator writes.
(async () => {
  const report = { startedAt: new Date().toISOString(), cycles: [], error: null, writesSent: 0 };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, ms = 45000) => { const end = Date.now() + ms; while (Date.now() < end) { if (predicate()) return; await pause(50); } throw new Error('BLE reconnect test timed out.'); };
  const requests = new Map(), boards = new Map();
  let serial = 0, connected = false, frames = 0, ready = false;
  try {
    await until(() => window.dairyosReceive && window.webkit?.messageHandlers?.dairyos, 15000);
    const original = window.dairyosReceive;
    const observe = event => {
      if (event.kind === 'status' && event.text?.startsWith('Bluetooth ready')) ready = true;
      if (event.kind === 'device') boards.set(event.id, event);
      if (event.kind === 'connected') connected = true;
      if (event.kind === 'disconnected' || event.kind === 'reconnecting') connected = false;
      if (event.kind === 'telemetry') frames++;
    };
    window.dairyosReceive = message => {
      // Observe transport events even if the visible Devices screen subscribes.
      if (message.type === 'ble') observe(message.value);
      const request = requests.get(message.id);
      if (!request) { original(message); return; }
      if (message.type === 'result' || message.type === 'error') {
        requests.delete(message.id); clearTimeout(request.timer);
        if (message.type === 'error') request.reject(new Error(String(message.value))); else request.resolve(message.value);
      } else request.event?.(message.value);
    };
    const request = (command, value = {}, event) => new Promise((resolve, reject) => {
      const id = 'reconnect-check-' + ++serial;
      const timer = event ? undefined : setTimeout(() => { requests.delete(id); reject(new Error(command + ' did not complete')); }, 45000);
      requests.set(id, { resolve, reject, event, timer });
      window.webkit.messageHandlers.dairyos.postMessage({ id, command, value });
    });
    void request('bleSubscribe', {}, () => {}).catch(error => { report.subscriptionError = String(error); });
    await until(() => ready, 15000);
    await request('bleScan');
    await until(() => [...boards.values()].some(b => ['DairyOS UNO Q', 'uno-q'].includes(b.name)), 15000);
    const candidates = [...boards.values()].filter(b => ['DairyOS UNO Q', 'uno-q'].includes(b.name));
    if (candidates.length !== 1) throw new Error('Select a single commissioned UNO Q for this test.');
    const device = candidates[0].id;
    report.rssi = candidates[0].rssi;
    await request('bleConnect', { device });
    await until(() => connected && frames > 0);
    report.initialConnectionAt = new Date().toISOString();
    for (let cycle = 1; cycle <= 3; cycle++) {
      const result = { cycle, disconnectedAt: new Date().toISOString(), immediateGapMs: null, connected: false };
      report.cycles.push(result);
      await request('bleDisconnect');
      const disconnected = performance.now(), baseline = frames;
      connected = false;
      result.immediateGapMs = Math.round(performance.now() - disconnected);
      const started = performance.now();
      await request('bleConnect', { device }); // Deliberately no sleep or rescan.
      await until(() => connected && frames > baseline);
      result.connected = true; result.reconnectMs = Math.round(performance.now() - started); result.telemetryReceived = true;
    }
    report.finalConnected = connected;
  } catch (error) { report.error = String(error); report.finalConnected = connected; }
  finally {
    report.completedAt = new Date().toISOString();
    window.webkit.messageHandlers.dairyos.postMessage({ id: 'reconnect-validation', command: 'reconnectValidation', value: report });
  }
})();
