import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Read data-only metadata from the pinned SDK; do not start its inference worker or registry.
import { VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 } from '../node_modules/@qvac/inference/dist/models/registry/models.js';
const text = JSON.parse(await readFile(new URL('../models/text-qwen3-4b-q3.provenance.json', import.meta.url), 'utf8'));
const choices = [
  ['vision-flash.gguf', VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M],
  ['vision-flash-mmproj.gguf', MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0],
];
const manifest = [text, ...choices.map(([file, model]) => ({ file, name: model.name, url: 'https://huggingface.co/' + model.registryPath, bytes: model.expectedSize, sha256: model.sha256Checksum }))];
await mkdir(new URL('../models/', import.meta.url), { recursive: true });
const target = new URL('../models/manifest.json', import.meta.url);
await writeFile(target, JSON.stringify({ qvac: '0.22.0', models: manifest }, null, 2) + '\n');
console.log(`Wrote ${fileURLToPath(target)}. Total ${(manifest.reduce((n, m) => n + m.bytes, 0) / 1e9).toFixed(2)} GB.`);
console.log('Stage the locally generated text candidate using its recorded derivation; verify the pack and download missing vision files with: python3 scripts/download-models.py');
