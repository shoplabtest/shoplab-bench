import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagChanges, reflagHard } from '../src/reflag.ts';
import type { AnswerKey, PrResult } from '../src/types.ts';

const key: AnswerKey = {
  id: 'B-03', repo: 'shoplab-catalog-api', pr: 6, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), split: 'dev', category: 'B', difficulty: 'hard', expect: 'break', kinds: ['event'],
  sites: [
    { consumer: 'shoplab-cart-api', file: 'src/consumer.ts', line: 9, why: 'guard', hard: true }, // grep finds it: not hard any more
    { consumer: 'shoplab-cart-api', file: 'src/events.ts', line: 17, why: 'type' }, // grep misses it: now hard
    { consumer: 'shoplab-contracts', file: 'events/x.json', line: 8, why: 'schema', hard: false }, // grep finds it near the line
  ],
  mustNotFlag: [],
};
const grep: PrResult = {
  id: 'B-03', verdict: 'break',
  sites: [{ consumer: 'shoplab-cart-api', file: 'src/consumer.ts', line: 9 }, { consumer: 'shoplab-contracts', file: 'events/x.json', line: 12 }],
};

test('a site is hard exactly when the grep baseline does not find it (same file, within 5 lines)', () => {
  assert.deepEqual(reflagHard(key, grep).sites.map((s) => s.hard), [false, true, false]);
});

test('with no baseline result every site is hard, and nothing else about the key changes', () => {
  const r = reflagHard(key, undefined);
  assert.deepEqual(r.sites.map((s) => s.hard), [true, true, true]);
  assert.deepEqual({ ...r, sites: [] }, { ...key, sites: [] });
});

test('flagChanges lists only the sites whose flag moved', () => {
  assert.deepEqual(flagChanges(key, reflagHard(key, grep)), [
    { id: 'B-03', site: 'shoplab-cart-api/src/consumer.ts:9', from: true, to: false },
    { id: 'B-03', site: 'shoplab-cart-api/src/events.ts:17', from: false, to: true },
  ]);
});

test('reflagging twice gives the same keys', () => {
  const once = reflagHard(key, grep);
  assert.deepEqual(reflagHard(once, grep), once);
});
