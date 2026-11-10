// Explicit operator test: real chat question, compared with received BLE bytes.
(async () => {
  const report = { startedAt: new Date().toISOString(), passed: false };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frames = [];
  await pause(2500);
  const receive = window.dairyosReceive;
  window.dairyosReceive = message => {
    if (message.type === 'ble' && message.value?.kind === 'telemetry' && message.value.bytes?.length === 20) {
      const bytes = Uint8Array.from(message.value.bytes);
      const view = new DataView(bytes.buffer);
      if (bytes[0] === 1 && (bytes[1] & 2)) frames.push({ temperature: view.getInt16(10, true) / 100, humidity: view.getUint16(12, true) / 100 });
      if (frames.length > 120) frames.shift();
    }
    receive?.(message);
  };
  const turns = () => JSON.parse(localStorage.getItem('dairyos-phone-v1:turns') || '[]');
  try {
    document.querySelector('[role=tab][aria-label=Ask]')?.click(); await pause(300);
    const before = turns().at(-1)?.id;
    const question = 'How warm and humid is it here right now?';
    const field = document.querySelector('[aria-label="Farm question"]');
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, question);
    field.dispatchEvent(new Event('input', { bubbles: true })); await pause(200);
    document.querySelector('[aria-label="Ask DairyOS"]').click();
    const end = Date.now() + 150000;
    while (turns().at(-1)?.id === before && Date.now() < end) await pause(100);
    const turn = turns().at(-1);
    if (turn?.id === before || turn?.question !== question) throw new Error('No new matching chat response.');
    Object.assign(report, { question, answer: turn.answer, receivedFrames: frames.length, measurements: frames });
    const measurement = frames.find(frame => turn.answer.includes(`Temperature: ${frame.temperature} °C.`) && turn.answer.includes(`Humidity: ${frame.humidity}%.`));
    if (!measurement || !turn.answer.startsWith('Latest received farm sensor readings.') || !turn.answer.includes('Last updated') || turn.answer.includes('disconnected')) throw new Error('Reply did not match fresh received sensor telemetry.');
    Object.assign(report, { passed: true, question, answer: turn.answer, measurement, receivedFrames: frames.length });
  } catch (error) { report.error = String(error); }
  report.completedAt = new Date().toISOString();
  window.webkit.messageHandlers.dairyos.postMessage({ id: 'sensor-chat-validation', command: 'sensorChatValidation', value: report });
})();
