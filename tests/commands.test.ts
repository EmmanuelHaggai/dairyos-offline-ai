import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAnswer, recordSummary, unsupportedPhotoAssessment, photoReferenceFallback, type FarmRecord } from '../src/domain';
import { starterLibrary } from '../data/library';

const date = '2026-10-30';
const records: FarmRecord[] = [
  { id: 1, kind: 'milk', date, animal: 'Daisy', quantity: 12.5, note: '' },
  { id: 2, kind: 'milk', date, animal: 'Rose', quantity: 7.5, note: '' },
  { id: 3, kind: 'feed', date, animal: 'Daisy', quantity: 4, note: '' },
  { id: 4, kind: 'milk', date: '2026-10-29', animal: 'Daisy', quantity: 0, note: '' },
];

test('natural short record queries have immediate exact answers', () => {
  for (const q of ['Milk today', 'Total milk today?', 'How much milk today?', 'How many litres today?', 'Maziwa leo']) assert.match(recordAnswer(q, records, date)!, /20 litres/);
  assert.match(recordAnswer('Feed today', records, date)!, /4 kg/);
  assert.match(recordAnswer('How much milk did Daisy produce today?', records, date)!, /12\.5 litres/);
  assert.match(recordAnswer('Milk yesterday', records, date)!, /0 litres/);
  assert.match(recordAnswer('Milk on 2026-10-28', records, date)!, /unknown, not zero/);
  assert.match(recordAnswer('How much milk?', records, date)!, /Which date/);
});

test('known-animal queries keep their scope even when that date has no matching entry', () => {
  assert.match(recordAnswer('How much milk did Rose produce yesterday?', records, date)!, /no milk entry/);
  const result = JSON.parse(recordSummary(records, 'Rose yesterday', date));
  assert.match(result.totalsScope, /Rose/);
  assert.equal(result.matchingRecords, 0);
  assert.match(recordAnswer('How much milk did Bella produce today?', records, date)!, /cannot find/);
  assert.match(recordAnswer('Milk for Bella today', records, date)!, /cannot find/);
  assert.equal(JSON.parse(recordSummary(records, 'Rosemary today', date)).matchingRecords, 3);
});

test('feeding recommendations are not confused with saved consumption', () => {
  assert.equal(recordAnswer('How much feed should I give Daisy today?', records, date), null);
  assert.equal(recordAnswer('How much milk should a cow produce?', records, date), null);
  assert.equal(recordAnswer('How do I keep milking clean?', records, date), null);
});
test('observed false absence claims route to relevant local crop guidance instead of unrelated sources', () => {
  for (const text of ['The surface has no visible markings or textures.', 'Uniform in color without visible spots or lesions.', 'No distinct symptoms of disease are apparent.']) assert.equal(unsupportedPhotoAssessment(text), true);
  const result = photoReferenceFallback('What should I inspect in this leaf photo?', starterLibrary);
  assert.equal(result.references[0]!.id, 'csu-crop-inspection');
  assert.match(result.text, /Confirm the crop identity first/);
  assert.doesNotMatch(result.text, /Poultry housing/);
  assert.deepEqual(photoReferenceFallback('A photo', []).references, []);
});
