import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestFile, scorePr, sitesMatch, summarize } from '../src/score.ts';
import { coverageReport } from '../src/coverage.ts';
import { validateKey } from '../src/validate.ts';
import type { AnswerKey, PrResult } from '../src/types.ts';

const sha = 'a'.repeat(40);
const key = (over: Partial<AnswerKey> = {}): AnswerKey => ({
  id: 'B-03',
  repo: 'shoplab-catalog-api',
  pr: 41,
  baseSha: sha,
  headSha: sha,
  split: 'dev',
  category: 'B',
  difficulty: 'hard',
  expect: 'break',
  kinds: ['http-endpoint'],
  sites: [
    { consumer: 'shoplab-cart-api', file: 'src/clients/catalog.ts', line: 27, why: 'templated URL', hard: true },
    { consumer: 'shoplab-gateway', file: 'src/routes.ts', line: 10, why: 'route table' },
  ],
  mustNotFlag: [],
  ...over,
});

test('line tolerance is 5 and consumer/file must be equal', () => {
  const k = { consumer: 'a', file: 'f.ts', line: 27 };
  assert.ok(sitesMatch({ consumer: 'a', file: 'f.ts', line: 32 }, k));
  assert.ok(!sitesMatch({ consumer: 'a', file: 'f.ts', line: 33 }, k));
  assert.ok(!sitesMatch({ consumer: 'b', file: 'f.ts', line: 27 }, k));
  assert.ok(!sitesMatch({ consumer: 'a', file: 'g.ts', line: 27 }, k));
});

test('matches, misses and false positives', () => {
  const res: PrResult = {
    id: 'B-03',
    verdict: 'break',
    sites: [
      { consumer: 'shoplab-cart-api', file: 'src/clients/catalog.ts', line: 25 },
      { consumer: 'shoplab-orders', file: 'src/clients/catalog.ts', line: 12 },
    ],
  };
  const s = scorePr(key(), res);
  assert.equal(s.matched.length, 1);
  assert.equal(s.misses.length, 1);
  assert.equal(s.falsePositives.length, 1);
});

test('unsupported-language sites are never counted as misses', () => {
  const k = key({ sites: [{ consumer: 'shoplab-inventory', file: 'main.go', line: 3, why: 'Go', unsupported: true }] });
  const s = scorePr(k, { id: 'B-03', verdict: 'safe', sites: [] });
  assert.equal(s.misses.length, 0);
  assert.equal(s.unsupportedSkipped.length, 1);
});

test('summary metrics', () => {
  const keys = [key(), key({ id: 'C-01', category: 'C', expect: 'safe', sites: [], kinds: ['event'] })];
  const results = new Map<string, PrResult>([
    ['B-03', { id: 'B-03', verdict: 'break', sites: [{ consumer: 'shoplab-cart-api', file: 'src/clients/catalog.ts', line: 27 }] }],
    ['C-01', { id: 'C-01', verdict: 'safe', sites: [] }],
  ]);
  const s = summarize(keys, results);
  assert.equal(s.prDetectionRecall, 1);
  assert.equal(s.siteRecall, 0.5);
  assert.equal(s.hardSiteRecall, 1);
  assert.equal(s.sitePrecision, 1);
  assert.equal(s.safeQuietRate, 1);
  assert.equal(s.verdictAccuracy, 1);
});

test('missing result counts as miss and not quiet', () => {
  const s = summarize([key()], new Map());
  assert.equal(s.prDetectionRecall, 0);
  assert.equal(s.verdictAccuracy, 0);
});

test('coverage report fails with fewer than two sites per kind', () => {
  const r = coverageReport([key()]);
  assert.equal(r.ok, false);
  assert.equal(r.rows.find((x) => x.kind === 'http-endpoint')!.ok, true);
  assert.equal(r.rows.find((x) => x.kind === 'event')!.ok, false);
});

test('key validation', () => {
  assert.deepEqual(validateKey(key()), []);
  assert.ok(validateKey(key({ baseSha: 'abc' })).length > 0);
  assert.ok(validateKey(key({ expect: 'safe' })).length > 0);
  assert.ok(validateKey(key({ id: 'C-03' })).length > 0);
});

test('isTestFile recognises test directories and test file names', () => {
  for (const f of ['test/app.test.ts', 'src/test/helpers.ts', 'a/__tests__/x.ts', 'src/Page.spec.tsx', 'x.test.mjs']) assert.ok(isTestFile(f), f);
  for (const f of ['src/app.ts', 'src/contest.ts', 'scripts/e2e.mjs', 'docker-compose.yml']) assert.ok(!isTestFile(f), f);
});

test('findings in test files are neither false positives nor matches', () => {
  const res: PrResult = {
    id: 'B-03',
    verdict: 'break',
    sites: [
      { consumer: 'shoplab-cart-api', file: 'src/clients/catalog.ts', line: 27 },
      { consumer: 'shoplab-cart-api', file: 'test/clients.test.ts', line: 3 },
    ],
  };
  const s = scorePr(key(), res);
  assert.equal(s.matched.length, 1);
  assert.equal(s.falsePositives.length, 0);
  assert.equal(s.ignoredTestSites.length, 1);
  assert.equal(summarize([key()], new Map([['B-03', res]])).sitePrecision, 1);
});
