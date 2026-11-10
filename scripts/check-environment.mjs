import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) { return error.message; } };
console.log('Node:', process.version);
console.log('Platform:', process.platform, process.arch);
if (process.platform === 'darwin') {
  console.log('macOS:', run('sw_vers', ['-productVersion']));
  console.log('Xcode:', run('xcodebuild', ['-version']));
  console.log(run('xcrun', ['devicectl', 'list', 'devices']));
  const version = run('xcodebuild', ['-version']).match(/Xcode (\d+)\.(\d+)/);
  if (!version || Number(version[1]) < 16 || (version[1] === '16' && Number(version[2]) < 1)) console.log('BLOCKER: React Native 0.81 requires Xcode >=16.1. Update the Mac toolchain or use a compatible build Mac before Personal Team installation.');
}
for (const model of ['text-qwen3-4b-q3.gguf', 'vision-flash.gguf', 'vision-flash-mmproj.gguf']) console.log(model + ':', fs.existsSync(new URL('../models/' + model, import.meta.url)) ? 'staged; inference validation still required' : 'not staged');
