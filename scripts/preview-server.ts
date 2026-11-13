import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { runInference, stopInference, isBusy } from '../src/engine';
import type { FarmRecord, Reference, Turn } from '../src/domain';
import { localDate, validateRecord } from '../src/domain';
import { dockerBusy, runDockerInference, stopDockerInference } from './docker-inference';
import { expectedModelBytes, modelNames } from '../src/model-specs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8786;
const paths = { text: path.join(root, 'models', modelNames.text), vision: path.join(root, 'models/vision-flash.gguf'), projection: path.join(root, 'models/vision-flash-mmproj.gguf') };
const contentTypes: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };

async function modelState() {
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, file]) => {
    const info = await stat(file).catch(() => null);
    return [key, info?.isFile() ? { name: path.basename(file), bytes: info.size } : null];
  })));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (!allowed.includes('http://' + req.headers.host) || (origin && !allowed.includes(origin))) { res.writeHead(403).end('Local preview only.'); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.url === '/api/models' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await modelState())); return; }
    if (req.url === '/api/answer' && req.method === 'POST') {
      if (isBusy() || dockerBusy()) { res.writeHead(409).end('Another local inference is running.'); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 3_000_000) throw new Error('Request is too large.'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof input.question !== 'string' || input.question.length > 1500) throw new Error('Invalid question.');
      if (!Array.isArray(input.records) || input.records.length > 10000 || !Array.isArray(input.references) || input.references.length > 200 || !Array.isArray(input.turns) || input.turns.length > 40) throw new Error('Invalid local context.');
      const records = input.records.map((record: FarmRecord) => ({ ...validateRecord(record), id: Number(record.id) }));
      const references: Reference[] = input.references.map((ref: Reference) => {
        if (!ref || ['id', 'title', 'source', 'section', 'text'].some(key => typeof ref[key as keyof Reference] !== 'string') || ref.text.length > 4000 || !Array.isArray(ref.keywords) || ref.keywords.some(word => typeof word !== 'string')) throw new Error('Invalid reference.');
        return ref;
      });
      const turns: Turn[] = input.turns.filter((turn: Turn) => turn && typeof turn.question === 'string' && typeof turn.answer === 'string' && ['complete', 'stopped'].includes(turn.status));
      let photoPath: string | undefined;
      if (input.photo) {
        if (typeof input.photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.photo)) throw new Error('Choose a JPEG photo.');
        const bytes = Buffer.from(input.photo.split(',')[1], 'base64');
        if (bytes.length > 2_000_000 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid or oversized JPEG.');
        await mkdir(path.join(root, '.private'), { recursive: true, mode: 0o700 });
        photoPath = path.join(root, '.private', 'preview-photo-' + crypto.randomUUID() + '.jpg');
        await writeFile(photoPath, bytes, { mode: 0o600 });
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const send = (type: string, value: unknown) => { if (!res.destroyed) res.write(JSON.stringify({ type, value }) + '\n'); };
      res.on('close', () => { if (!res.writableEnded) { stopDockerInference(); void stopInference().catch(() => {}); } });
      try {
        const infer = process.env.DAIRYOS_DESKTOP_DOCKER === '1' ? (options: Parameters<typeof runInference>[0]) => runDockerInference(root, options) : runInference;
        const result = await infer({ mode: input.mode === 'intent' ? 'intent' : undefined, question: input.question, records, references, turns, localDate: input.localDate ?? localDate(), photoPath, paths, device: 'cpu',
          prepare: async () => {
            for (const key of photoPath ? ['text', 'vision', 'projection'] as const : ['text'] as const) {
              const info = await stat(paths[key]).catch(() => null);
              if (!info?.isFile() || info.size !== expectedModelBytes[key]) throw new Error(`Missing or incomplete ${key} model. Finish staging the verified model pack on this computer.`);
            }
          },
          onStatus: value => send('status', value.replaceAll('this iPhone', 'this computer')),
          onText: value => send('text', value),
        });
        send('result', result);
      } catch (error) { send('error', error instanceof Error ? error.message : String(error)); }
      finally { if (photoPath) await rm(photoPath, { force: true }); res.end(); }
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', allowed[0]).pathname);
    const design = pathname.startsWith('/design/');
    const publicRoot = path.join(root, design ? 'docs/design' : 'dist');
    const relative = design ? pathname.slice('/design'.length) : pathname;
    const filename = path.resolve(publicRoot, '.' + relative + (relative.endsWith('/') ? 'index.html' : ''));
    if (!filename.startsWith(publicRoot + path.sep)) { res.writeHead(403).end(); return; }
    const contents = await readFile(filename);
    res.setHeader('Content-Type', contentTypes[path.extname(filename)] ?? 'application/octet-stream'); res.end(contents);
  } catch (error) {
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(error instanceof Error ? error.message : String(error));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`DairyOS computer preview: http://127.0.0.1:${port}\nBrowser data stays in this browser; QVAC runs on this computer, not on an iPhone.`));
function shutdown() {
  stopDockerInference();
  void stopInference().catch(() => {}).finally(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
