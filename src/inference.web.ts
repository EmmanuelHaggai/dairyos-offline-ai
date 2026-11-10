import type { runInference } from './engine';
import { phoneRequest, phoneShell } from './phone-shell';
import { localReply } from './commands';
import { localDate, makePrompt } from './domain';
type Options = Omit<Parameters<typeof runInference>[0], 'paths' | 'prepare' | 'loadSDK' | 'device'>;
let controller: AbortController | undefined;
let phoneBusy = false;
export function isBusy() { return controller !== undefined || phoneBusy; }
export async function stopInference() { if (phoneShell && phoneBusy) await phoneRequest('stop'); else controller?.abort(); }
export async function answerQuestion(options: Options) {
  if (isBusy()) throw new Error('Wait for the current answer.');
  if (phoneShell) {
    makePrompt(options.question, options.records, options.references, options.turns, !!options.photoPath, undefined, options.localDate);
    const direct = !options.mode && !options.photoPath && localReply(options.question, options.records, options.localDate ?? localDate());
    if (direct) {
      options.onText(direct.text);
      options.onStatus('Ready · local response');
      return { text: direct.text, origin: direct.origin, references: [], observation: '', elapsedMs: 0, firstTokenMs: undefined, stopped: false, limited: false };
    }
    phoneBusy = true;
    try {
      return await phoneRequest<Awaited<ReturnType<typeof runInference>>>('answer', { mode: options.mode, question: options.question, records: options.records, references: options.references, turns: options.turns, localDate: options.localDate, photo: options.photoPath }, event => {
        if (event.type === 'text') options.onText(String(event.value));
        if (event.type === 'status') options.onStatus(String(event.value));
      });
    } finally { phoneBusy = false; options.onStatus('Ready · inference stays on this iPhone'); }
  }
  controller = new AbortController();
  const started = performance.now();
  let text = '';
  try {
    let photo: string | undefined;
    if (options.photoPath) {
      const blob = await (await fetch(options.photoPath)).blob();
      if (blob.size > 2_000_000) throw new Error('Choose a photo smaller than 2 MB for the desktop preview.');
      photo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    }
    const response = await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: options.mode, question: options.question, records: options.records, references: options.references, turns: options.turns, localDate: options.localDate, photo }), signal: controller.signal });
    if (!response.ok) throw new Error(await response.text());
    if (!response.body) throw new Error('No local inference response.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status') options.onStatus(event.value);
        if (event.type === 'text') { text = event.value; options.onText(text); }
        if (event.type === 'error') throw new Error(event.value);
        if (event.type === 'result') return event.value as Awaited<ReturnType<typeof runInference>>;
      }
      if (chunk.done) throw new Error('Local inference connection ended before an answer completed.');
    }
  } catch (error) {
    if (controller.signal.aborted) return { text, references: [], observation: '', elapsedMs: performance.now() - started, firstTokenMs: undefined, stopped: true, limited: false, origin: 'model' as const };
    throw error;
  } finally { controller = undefined; options.onStatus('Desktop preview · records in this browser; AI on this computer'); }
}
