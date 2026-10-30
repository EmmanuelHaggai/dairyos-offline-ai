import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInference, stopInference, isBusy } from '../src/engine';
import { starterLibrary } from '../data/library';

type SDK = typeof import('@qvac/sdk');
function fixture(override?: string) {
  const calls: string[] = [];
  let count = 0;
  const sdk = {
    loadModel(options: {modelSrc: string}) { calls.push('load:' + options.modelSrc); return Object.assign(Promise.resolve('model-' + ++count), { requestId: 'load-' + count }); },
    completion(options: {history: {role: string; content: string}[]}) {
      assert.equal(options.history[0]?.role, 'system');
      const content = override ?? 'Local output ' + count;
      return { requestId: 'run-' + count, final: Promise.resolve({ contentText: content }), events: (async function* () { yield { type: 'contentDelta', text: content }; })() };
    },
    async unloadModel({ modelId }: {modelId: string}) { calls.push('unload:' + modelId); },
    async cancel({ requestId }: {requestId: string}) { calls.push('cancel:' + requestId); },
    async close() { calls.push('close'); },
  };
  return { sdk, calls };
}
const options = () => ({ question: 'How do I clean milking equipment?', records: [], references: starterLibrary, turns: [], onStatus: (_s: string) => {}, onText: (_s: string) => {}, prepare: () => {}, paths: { text: '/local/text.gguf', vision: '/local/vision.gguf', projection: '/local/projection.gguf' } });

test('text inference loads only local weights and releases native resources', async () => {
  const { sdk, calls } = fixture();
  const result = await runInference({ ...options(), loadSDK: async () => sdk as unknown as SDK });
  assert.equal(result.text, 'Local output 1');
  assert.deepEqual(calls, ['load:/local/text.gguf', 'unload:model-1', 'close']);
  assert.equal(isBusy(), false);
});
test('record arithmetic never loads a model or asks it to recalculate stored facts', async () => {
  const result = await runInference({ ...options(), question: 'How much milk today?', localDate: '2026-10-30', records: [{ id: 1, kind: 'milk', date: '2026-10-30', animal: 'Daisy', quantity: 12.5, note: '' }], prepare: () => { throw new Error('Must not prepare models'); }, loadSDK: async () => { throw new Error('Must not load SDK'); } });
  assert.equal(result.origin, 'records');
  assert.match(result.text, /12\.5 litres/);
  assert.equal(isBusy(), false);
});
test('an observed false healthy assessment is discarded and replaced by the actual offline inspection guide', async () => {
  const { sdk, calls } = fixture('The leaf appears healthy.');
  const result = await runInference({ ...options(), photoPath: '/local/photo.jpg', loadSDK: async () => sdk as unknown as SDK });
  assert.equal(result.origin, 'library');
  assert.match(result.text, /could not reliably assess/);
  assert.doesNotMatch(result.text, /leaf appears healthy/);
  assert.equal(result.observation, '');
  assert.ok(result.references.length > 0);
  assert.deepEqual(calls, ['load:/local/vision.gguf', 'unload:model-1', 'close']);
});
test('unsupported disease-free claims in final photo guidance never reach the display or saved result', async () => {
  const { sdk, calls } = fixture();
  let stage = 0;
  sdk.completion = () => {
    const content = ++stage === 1 ? 'A green leaf with brown surface marks.' : 'No signs of disease, insect damage, or wilting are visible on this specific leaf.';
    return { requestId: 'stage-' + stage, final: Promise.resolve({ contentText: content }), events: (async function* () { yield { type: 'contentDelta', text: content }; })() };
  };
  const displayed: string[] = [];
  const result = await runInference({ ...options(), photoPath: '/local/photo.jpg', onText: text => displayed.push(text), loadSDK: async () => sdk as unknown as SDK });
  assert.equal(result.origin, 'library');
  assert.equal(displayed.length, 1);
  assert.match(displayed[0]!, /generated assessment was discarded/);
  assert.doesNotMatch(displayed[0]!, /No signs of disease/);
  assert.deepEqual(calls, ['load:/local/vision.gguf', 'unload:model-1', 'load:/local/text.gguf', 'unload:model-2', 'close']);
});
test('photo stage is unloaded before text stage, with no simultaneous model residency', async () => {
  const { sdk, calls } = fixture();
  const result = await runInference({ ...options(), photoPath: '/local/photo.jpg', loadSDK: async () => sdk as unknown as SDK });
  assert.equal(result.observation, 'Local output 1');
  assert.equal(result.text, 'Local output 2');
  assert.deepEqual(calls, ['load:/local/vision.gguf', 'unload:model-1', 'load:/local/text.gguf', 'unload:model-2', 'close']);
});
test('failure during setup or close cannot leave the app stuck busy', async () => {
  await assert.rejects(runInference({ ...options(), prepare: () => { throw new Error('missing model'); } }), /missing model/);
  assert.equal(isBusy(), false);
  const { sdk } = fixture();
  sdk.close = async () => { throw new Error('close failed'); };
  await assert.rejects(runInference({ ...options(), loadSDK: async () => sdk as unknown as SDK }), /close failed/);
  assert.equal(isBusy(), false);
});
test('repetitive output is cancelled and rejected rather than returned as a successful answer', async () => {
  const repeated = 'Hifadhi maziwa kwenye mazingira ya kukamua kama vile kwenye kipekee au kwenye kipekee. '.repeat(5);
  const { sdk, calls } = fixture(repeated);
  await assert.rejects(runInference({ ...options(), loadSDK: async () => sdk as unknown as SDK }), /repeated itself/);
  assert.deepEqual(calls, ['load:/local/text.gguf', 'cancel:run-1', 'unload:model-1', 'close']);
  assert.equal(isBusy(), false);
});
test('cancellation during loading releases the model and does not start generation', async () => {
  const { sdk, calls } = fixture();
  let release: (model: string) => void = () => {};
  sdk.loadModel = () => Object.assign(new Promise<string>(resolve => { release = resolve; }), { requestId: 'pending-load' });
  const running = runInference({ ...options(), loadSDK: async () => sdk as unknown as SDK });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(isBusy(), true);
  await assert.rejects(runInference({ ...options() }), /current answer/);
  await stopInference(); release('cancelled-model');
  const result = await running;
  assert.equal(result.stopped, true);
  assert.equal(result.text, '');
  assert.deepEqual(calls, ['cancel:pending-load', 'unload:cancelled-model', 'close']);
  assert.equal(isBusy(), false);
});
