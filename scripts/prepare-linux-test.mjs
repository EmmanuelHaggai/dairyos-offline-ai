import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const directory = path.join(root, '.private/linux');
mkdirSync(directory, { recursive: true });
const packages = [
  ['@qvac/fabric-linux-x64@0.22.0', 'qvac-fabric-linux-x64-0.22.0.tgz', '@qvac/fabric-linux-x64'],
  ['bare-runtime-linux-x64@1.36.0', 'bare-runtime-linux-x64-1.36.0.tgz', 'bare-runtime-linux-x64'],
  ['@esbuild/linux-x64@0.28.2', 'esbuild-linux-x64-0.28.2.tgz', '@esbuild/linux-x64'],
];
function run(cmd, args) { const result = spawnSync(cmd, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error(cmd + ' failed'); }
for (const [pkg, archive, name] of packages) {
  const packed = path.join(directory, archive);
  if (!existsSync(packed)) run('npm', ['pack', pkg, '--pack-destination', directory, '--silent']);
  const destination = path.join(directory, 'node_modules', name);
  mkdirSync(destination, { recursive: true });
  run('tar', ['-xzf', packed, '-C', destination, '--strip-components=1']);
}
chmodSync(path.join(directory, 'node_modules/bare-runtime-linux-x64/bin/bare'), 0o755);
chmodSync(path.join(directory, 'node_modules/@esbuild/linux-x64/bin/esbuild'), 0o755);
run('docker', ['pull', 'node:22.22.0-bookworm-slim']);
console.log('Local Linux CPU test runtime ready. Start with npm run preview:docker. Inference containers use --network none.');
