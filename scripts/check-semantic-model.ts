import { runDockerInference } from './docker-inference';
import { validateIntent } from '../src/ble/semantic-intent';
import { writeFile } from 'node:fs/promises';
async function main() {
const turns = [{ id: 1, question: 'Turn bulb 1 off', answer: 'The board confirmed Bulb 1 OFF.', createdAt: new Date().toISOString(), references: [], photo: false, elapsedMs: 1, status: 'complete' as const }];
const cases = [
  { question: 'turn it back on', turns, kind: 'command', target: 1, on: true },
  { question: 'Turn bulb 1 back on', turns: [], kind: 'command', target: 1, on: true },
  { question: 'Could you bring the second light back to life?', turns: [], kind: 'clarify' },
  { question: 'Please illuminate the second bulb.', turns: [], kind: 'command', target: 2, on: true },
  { question: 'How warm and humid is it in here right now?', turns: [], kind: 'sensors' },
  { question: 'Turn it off', turns: [], kind: 'clarify' },
  { question: 'Do not turn bulb 1 off', turns: [], kind: 'clarify' },
  { question: 'If it gets hot, turn bulb 2 on', turns: [], kind: 'clarify' },
  { question: 'What temperature is best for calves?', turns: [], kind: 'none' },
];
const results = [];
for (const test of cases) {
  const result = await runDockerInference(process.cwd(), { mode: 'intent', question: test.question, turns: test.turns, records: [], references: [], paths: { text: '', vision: '', projection: '' }, prepare() {}, onStatus() {}, onText() {} });
  const intent = validateIntent(result.text);
  const passed = !result.limited && intent.kind === test.kind && (!('target' in test) || 'target' in intent && intent.target === test.target) && (!('on' in test) || 'on' in intent && intent.on === test.on);
  const row = { question: test.question, intent, passed, elapsedMs: result.elapsedMs, raw: result.text };
  results.push(row); console.log(JSON.stringify(row));
  await writeFile('.private/semantic-model-results.json', JSON.stringify({ runtime: 'QVAC Qwen3-4B-Instruct-2507, local Docker CPU, network none', results }, null, 2));
}
if (results.some(r => !r.passed)) process.exitCode = 1;

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
