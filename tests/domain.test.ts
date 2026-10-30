import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRepetition, localDate, localModelPath, makePrompt, recordAnswer, recordSummary, retrieve, validateRecord, validDate } from '../src/domain';
import { starterLibrary } from '../data/library';

test('records reject invalid dates and non-finite quantities', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  for (const quantity of [NaN, Infinity, -1, null]) assert.throws(() => validateRecord({ kind: 'milk', date: '2026-10-30', quantity, animal: '', note: '' }));
});
test('the phone local date is carried into prompts independently of a UTC desktop container', () => {
  assert.equal(localDate(new Date(2026, 9, 30, 2, 0)), '2026-10-30');
  assert.match(makePrompt('What did I record today?', [], [], [], false, undefined, '2026-10-30').systemPrompt, /Local date: 2026-10-30/);
  assert.throws(() => makePrompt('Today?', [], [], [], false, undefined, '2026-02-30'));
});
test('totals are calculated outside the model and preserve dated incomplete coverage', () => {
  const result = JSON.parse(recordSummary([
    { id: 1, kind: 'milk', date: '2026-10-29', animal: 'A', quantity: 0.1, note: '' },
    { id: 2, kind: 'milk', date: '2026-10-29', animal: 'B', quantity: 0.2, note: '' },
    { id: 3, kind: 'feed', date: '2026-10-30', animal: '', quantity: 5, note: '' },
  ]));
  assert.equal(result.dailyTotals[1].recordedMilkLitres, 0.3);
  assert.equal(result.dailyTotals[0].date, '2026-10-30');
  assert.equal(result.dailyTotals[0].recordedMilkLitres, null);
  assert.match(result.coverage, /not necessarily complete/);
});
test('an explicitly requested older date remains available beyond the recent-record window', () => {
  const records = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, kind: 'milk' as const, date: `2026-10-${String(30 - index).padStart(2, '0')}`, animal: 'Cow A', quantity: index + 1, note: '' }));
  const result = JSON.parse(recordSummary(records, 'Milk on 2026-10-11?', '2026-10-30'));
  assert.equal(result.dailyTotals[0].recordedMilkLitres, 20);
  assert.equal(result.recentRecords[0].date, '2026-10-11');
  assert.equal(result.matchingRecords, 1);
  const missing = JSON.parse(recordSummary(records, 'Milk on 2026-09-01?', '2026-10-30'));
  assert.equal(missing.matchingRecords, 0);
  assert.deepEqual(missing.dailyTotals, []);
});
test('named-animal queries do not substitute whole-farm daily totals', () => {
  const records = [
    { id: 1, kind: 'milk' as const, date: '2026-10-29', animal: 'Daisy', quantity: 12.5, note: '' },
    { id: 2, kind: 'milk' as const, date: '2026-10-29', animal: 'Rose', quantity: 7.5, note: '' },
  ];
  const result = JSON.parse(recordSummary(records, 'What did Daisy produce yesterday?', '2026-10-30'));
  assert.equal(result.dailyTotals[0].recordedMilkLitres, 12.5);
  assert.match(result.totalsScope, /Daisy/);
  assert.equal(result.matchingRecords, 1);
});
test('English and Kiswahili retrieval returns actual local references; unrelated queries return none', () => {
  assert.equal(retrieve('usafi wa kukamua maziwa', starterLibrary)[0]?.id, 'fao-dairy-hygiene');
  assert.equal(retrieve('poultry housing ventilation', starterLibrary)[0]?.id, 'fao-poultry-housing');
  assert.equal(retrieve('jani la nyanya', starterLibrary)[0]?.id, 'csu-crop-inspection');
  assert.deepEqual(retrieve('quantum satellite price', starterLibrary), []);
  assert.deepEqual(retrieve('How many litres did I record today?', starterLibrary), []);
});
test('degenerate repetition observed in the real Kiswahili trial is rejected', () => {
  assert.equal(hasRepetition('Hifadhi maziwa kwenye mazingira ya kukamua kama vile kwenye kipekee au kwenye kipekee. '.repeat(5)), true);
  assert.equal(hasRepetition(starterLibrary.map(row => row.text).join(' ')), false);
});
test('record answers use calculated totals and distinguish missing entries from recorded zeros', () => {
  const records = [
    { id: 1, kind: 'milk' as const, date: '2026-10-29', animal: 'A', quantity: 12.5, note: '' },
    { id: 2, kind: 'milk' as const, date: '2026-10-29', animal: 'B', quantity: 7.5, note: '' },
  ];
  const answer = recordAnswer('How many litres did I record on 2026-10-29? What about today?', records, '2026-10-30')!;
  assert.match(answer, /20 litres/);
  assert.match(answer, /2026-10-30: no milk entry/);
  assert.doesNotMatch(answer, /37\.5/);
  assert.equal(recordAnswer('How do I keep milking clean?', records), null);
  assert.match(recordAnswer('How much milk today?', [{ ...records[0]!, date: '2026-10-30', quantity: 0 }], '2026-10-30')!, /0 litres/);
});
test('two long repeated photo-advice passages are detected', () => {
  const phrase = 'The farmer should check for any signs of pests or diseases and ensure the plant is receiving adequate sunlight. ';
  assert.equal(hasRepetition('A green leafy plant is visible. ' + phrase.repeat(2)), true);
});
test('prompt excludes incomplete turns and limits history, explicitly handles absent records and sources', () => {
  const result = makePrompt('current market price?', [], starterLibrary, [{ id: 1, question: 'old', answer: 'partial answer', createdAt: '', references: [], photo: false, elapsedMs: 0, status: 'stopped' }]);
  assert.equal(result.history.length, 1);
  assert.match(result.systemPrompt, /No local farm records/);
  assert.match(result.systemPrompt, /No relevant passage/);
  assert.match(result.systemPrompt, /no internet/);
  assert.throws(() => makePrompt('x'.repeat(1501), [], [], []));
});
test('remote sources, path traversal and disguised URLs cannot become model sources', () => {
  for (const source of ['https://host/model.gguf', 'pear://key/model', 'file:///a/../model.gguf', 'file:///a/%2e%2e/model.gguf', 'file:///a/model.gguf?url=https://host', '/a/model.gguf']) assert.throws(() => localModelPath(source));
  assert.equal(localModelPath('file:///Documents/My%20Model.gguf'), '/Documents/My Model.gguf');
});
