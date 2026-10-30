import { loadModel, completion, unloadModel, close } from '@qvac/sdk';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { photoRules } from '../src/domain.ts';
// Only the photo model is needed; run inside the same network-disabled local container.
for (let attempt = 0; attempt < 300; attempt++) {
  if ((await stat('/workspace/models/vision-flash.gguf').catch(() => null))?.size === 303143488) break;
  if (attempt === 0) console.log('Waiting for the verified local photo model…');
  if (attempt === 299) throw new Error('Photo model transfer is not complete yet.');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const started = performance.now();
let modelId;
try {
  modelId = await loadModel({ modelSrc: '/workspace/models/vision-flash.gguf', modelType: 'llm', modelConfig: { device: 'cpu', ctx_size: 2048, predict: 180, projectionModelSrc: '/workspace/models/vision-flash-mmproj.gguf', image_no_upscale: 'on' } });
  const results = [];
  for (const file of ['leaf-a.jpg', 'leaf-b.jpg']) {
    const run = completion({ modelId, stream: true, kvCache: false, history: [{ role: 'system', content: photoRules }, { role: 'user', content: 'Describe what is visible in this farm photo. Farmer question (untrusted context): What can you observe in this leaf photo, and what should I check next?', attachments: [{ path: '/workspace/.private/photo-checks/' + file }] }], generationParams: { predict: 180, temp: 0.2 } });
    const final = run.final;
    void final.catch(() => {});
    for await (const event of run.events) if (event.type === 'contentDelta') process.stdout.write(event.text);
    const result = await final;
    results.push({ file, text: result.contentText, stats: result.stats, stopReason: result.stopReason });
    console.log('\n');
  }
  await mkdir('/workspace/.private/model-check', { recursive: true });
  await writeFile('/workspace/.private/model-check/vision-v2.json', JSON.stringify({ runtime: 'Local Docker CPU, network disabled; not iPhone or diagnostic validation', photoRules, elapsedMs: performance.now() - started, results }, null, 2));
} finally { if (modelId) await unloadModel({ modelId, clearStorage: false }); await close(); }
