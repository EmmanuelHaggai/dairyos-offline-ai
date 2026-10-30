// Invoked only by the desktop test runner, in a local --network none container.
import { Buffer } from 'node:buffer';
import { runInference } from '../src/engine';
async function main() {
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const send = (type: string, value: unknown) => process.stdout.write(JSON.stringify({ type, value }) + '\n');
try {
  const result = await runInference({ ...input, paths: { text: '/workspace/models/text.gguf', vision: '/workspace/models/vision-flash.gguf', projection: '/workspace/models/vision-flash-mmproj.gguf' }, device: 'cpu', prepare: () => {}, onText: value => send('text', value), onStatus: value => send('status', value.replaceAll('this iPhone', 'this computer')) });
  send('result', result);
} catch (error) { send('error', error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
