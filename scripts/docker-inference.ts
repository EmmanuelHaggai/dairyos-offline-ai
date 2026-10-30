import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { runInference } from '../src/engine';
type Options = Parameters<typeof runInference>[0];
type Result = Awaited<ReturnType<typeof runInference>>;
let child: ChildProcess | undefined;
export function dockerBusy() { return child !== undefined; }
export function stopDockerInference() { child?.kill('SIGTERM'); }
export async function runDockerInference(root: string, options: Options): Promise<Result> {
  if (child) throw new Error('Another local model request is running.');
  await options.prepare();
  const args = ['run', '--rm', '-i', '--name', 'dairyos-local-inference', '--network', 'none', '--memory', '6g', '--cpus', '4', '-v', `${root}:/workspace`];
  for (const pkg of ['@qvac/fabric-linux-x64', 'bare-runtime-linux-x64', '@esbuild/linux-x64']) args.push('-v', `${path.join(root, '.private/linux/node_modules', pkg)}:/workspace/node_modules/${pkg}:ro`);
  args.push('-w', '/workspace', 'node:22.22.0-bookworm-slim', 'node', '--import', 'tsx', 'scripts/infer-request.ts');
  const request = { question: options.question, records: options.records, references: options.references, turns: options.turns, localDate: options.localDate, photoPath: options.photoPath?.replace(root, '/workspace') };
  return new Promise<Result>((resolve, reject) => {
    child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = ''; let errors = ''; let result: Result | undefined; let failure: string | undefined;
    child.stdout!.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('{"type":')) continue; // native backend diagnostics are not UI events
        try {
          const event = JSON.parse(line);
          if (event.type === 'status') options.onStatus(event.value);
          if (event.type === 'text') options.onText(event.value);
          if (event.type === 'result') result = event.value;
          if (event.type === 'error') failure = event.value;
        } catch { failure = 'Invalid local runtime event.'; }
      }
    });
    child.stderr!.on('data', chunk => { errors = (errors + chunk.toString()).slice(-3000); });
    child.on('error', error => { child = undefined; reject(error); });
    child.on('close', code => { child = undefined; if (result && code === 0) resolve(result); else reject(new Error(failure ?? (errors.trim() || 'Local inference stopped.'))); });
    child.stdin!.on('error', () => {});
    child.stdin!.end(JSON.stringify(request));
  });
}
