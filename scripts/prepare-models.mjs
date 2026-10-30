import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Read data-only metadata from the pinned SDK; do not start its inference worker or registry.
import { QWEN3_5_2B_MULTIMODAL_Q4_K_M, VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 } from '../node_modules/@qvac/inference/dist/models/registry/models.js';
const choices = [
  ['text.gguf', QWEN3_5_2B_MULTIMODAL_Q4_K_M],
  ['vision-flash.gguf', VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M],
  ['vision-flash-mmproj.gguf', MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0],
];
const manifest = choices.map(([file, model]) => ({ file, name: model.name, url: 'https://huggingface.co/' + model.registryPath, bytes: model.expectedSize, sha256: model.sha256Checksum }));
await mkdir(new URL('../models/', import.meta.url), { recursive: true });
const target = new URL('../models/manifest.json', import.meta.url);
await writeFile(target, JSON.stringify({ qvac: '0.22.0', models: manifest }, null, 2) + '\n');
console.log(`Wrote ${fileURLToPath(target)}. Total ${(manifest.reduce((n, m) => n + m.bytes, 0) / 1e9).toFixed(2)} GB.`);
console.log('Download on this computer: python3 scripts/download-models.py');
