import { runInference, stopInference } from '../../src/engine';
import { expectedModelBytes, modelNames } from '../../src/model-specs';
import { localDate } from '../../src/domain';
import fs from 'bare-fs';
import path from 'bare-path';
import { Buffer } from 'bare-buffer';
import performance from 'bare-performance';
import * as inference from '@qvac/inference';
import { setConfig, setRuntimeContext } from '@qvac/inference/engine';
import { llmPlugin } from '@qvac/inference/llamacpp-completion/plugin';

declare const BareKit: { IPC: { on: (name: string, callback: (data: Buffer) => void) => void; write: (data: Buffer) => void } };
globalThis.performance = performance as unknown as Performance;
const send = (id: string, type: string, value: unknown) => BareKit.IPC.write(Buffer.from(JSON.stringify({ id, type, value }) + '\n'));
let buffer = '';
let configured = false;
BareKit.IPC.on('data', (data: Buffer) => {
  buffer += data.toString();
  let end: number;
  while ((end = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    void handle(JSON.parse(line)).catch(error => console.error(String(error)));
  }
});

async function handle(message: { id: string; command: string; value: Parameters<typeof runInference>[0] & { home: string; photoPath?: string; diagnostics?: boolean } }) {
  const { id, command, value } = message;
  if (command === 'stop') { await stopInference(); send(id, 'result', true); return; }
  let unsubscribeLogs: (() => void) | undefined;
  try {
    const paths = Object.fromEntries(Object.entries(modelNames).map(([slot, name]) => [slot, path.join(value.home, 'models', name)])) as { text: string; vision: string; projection: string };
    const result = await runInference({ ...value, localDate: value.localDate ?? localDate(), paths, device: value.device === 'cpu' ? 'cpu' : 'gpu',
      prepare: () => {
        for (const slot of value.photoPath ? ['text', 'vision', 'projection'] as const : ['text'] as const) {
          if (!fs.existsSync(paths[slot]) || fs.statSync(paths[slot]).size !== expectedModelBytes[slot]) throw new Error('Missing or incomplete ' + slot + ' model. Copy the verified model pack into Documents/models by USB.');
        }
        if (!configured) {
          setConfig({ cacheDirectory: path.join(value.home, 'qvac-cache'), loggerLevel: value.diagnostics ? 'info' : 'error', loggerConsoleOutput: false });
          setRuntimeContext({ runtime: 'bare', platform: 'ios', deviceBrand: 'Apple', deviceModel: 'iPhone14,3' });
          inference.registerPlugin(llmPlugin);
          if (value.diagnostics) {
            let lines = 0;
            unsubscribeLogs = inference.subscribeServerLogs(log => {
              if (++lines <= 500) { try { fs.appendFileSync(path.join(value.home, 'model-loader.log'), JSON.stringify({ ...log, message: log.message.slice(0, 1600) }) + '\n'); } catch {} }
            });
          }
          configured = true;
        }
      },
      loadSDK: async () => ({ ...inference, close: async () => { unsubscribeLogs?.(); await inference.close(); } }) as unknown as typeof import('@qvac/sdk'),
      onStatus: status => send(id, 'status', status), onText: text => send(id, 'text', text),
    });
    send(id, 'result', result);
  } catch (error) { send(id, 'error', error instanceof Error ? error.message : String(error)); }
}

BareKit.IPC.write(Buffer.from(JSON.stringify({ id: 'boot', type: 'ready', value: true }) + '\n'));
