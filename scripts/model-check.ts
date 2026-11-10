import { modelNames } from '../src/model-specs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { runInference } from '../src/engine';
import { starterLibrary } from '../data/library';
import type { FarmRecord } from '../src/domain';

// Run inside the local Linux container with --network none and the same engine as the iPhone.
async function main() {
for (let attempt = 0; attempt < 900; attempt++) {
  if ((await stat('/workspace/models/' + modelNames.text).catch(() => null))?.size === 2075618016) break;
  if (attempt === 0) console.log('Waiting for the verified local answer model…');
  if (attempt === 899) throw new Error('Answer model transfer is not complete yet.');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
const records: FarmRecord[] = [
  { id: 1, kind: 'milk', date: '2026-10-29', animal: 'Test cow A', quantity: 12.5, note: 'Synthetic test record' },
  { id: 2, kind: 'milk', date: '2026-10-29', animal: 'Test cow B', quantity: 7.5, note: 'Synthetic test record' },
];
const cases = [
  { id: 'dated-records', question: 'How many litres did I record on 2026-10-29? Do you know today’s production?' },
  { id: 'english-reference', question: 'How do I keep milking clean? Give three short steps.' },
  { id: 'kiswahili-input-english-output', question: 'Ninawezaje kuweka usafi wakati wa kukamua maziwa?' },
  { id: 'leaf-photo', question: 'What can you observe in this leaf photo, and what should I check next?', photoPath: '/workspace/.private/photo-checks/leaf-b.jpg' },
];
const results = [];
for (const scenario of cases) {
  console.log('Checking ' + scenario.id);
  try {
    const result = await runInference({ ...scenario, localDate: '2026-10-30', records, references: starterLibrary, turns: [], paths: { text: '/workspace/models/' + modelNames.text, vision: '/workspace/models/vision-flash.gguf', projection: '/workspace/models/vision-flash-mmproj.gguf' }, device: 'cpu', prepare: () => {}, onStatus: value => console.log(scenario.id + ': ' + value.replaceAll('this iPhone', 'this computer')), onText: () => {} });
    results.push({ ...scenario, ...result });
    console.log(JSON.stringify({ case: scenario.id, text: result.text, observation: result.observation, seconds: result.elapsedMs / 1000, limited: result.limited }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...scenario, error: message });
    console.log(JSON.stringify({ case: scenario.id, error: message }));
    process.exitCode = 1;
  }
  await mkdir('/workspace/.private/model-check', { recursive: true });
  await writeFile('/workspace/.private/model-check/results.json', JSON.stringify({ runtime: 'Local Linux Docker CPU; network disabled. Not iPhone validation.', results }, null, 2));
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
