import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineHas, verifyKeys } from '../src/verify.ts';
import type { AnswerKey, Manifest } from '../src/types.ts';

const A = 'a'.repeat(40);
const manifest: Manifest = { benchmarkVersion: '1', shuffleSeed: 1, repos: { c: { url: 'u', sha: A } }, prs: [] };
const file = 'one\ntwo needle\nthree\n';
const key = (over: Partial<AnswerKey['sites'][0]> = {}): AnswerKey => ({
  id: 'A-01', repo: 'r', pr: 1, baseSha: A, headSha: A, split: 'dev', category: 'A', difficulty: 'easy', expect: 'break', kinds: ['component'],
  sites: [{ consumer: 'c', file: 'f.ts', line: 2, why: 'w', snippet: 'needle', ...over }], mustNotFlag: [],
});

test('lineHas is 1-based and substring based', () => {
  assert.ok(lineHas(file, 2, 'needle'));
  assert.ok(!lineHas(file, 1, 'needle'));
  assert.ok(!lineHas(file, 99, 'needle'));
});

test('a correct site verifies', () => assert.deepEqual(verifyKeys([key()], manifest, () => file), []));

test('wrong line, missing file, missing snippet and unknown consumer are reported', () => {
  assert.match(verifyKeys([key({ line: 3 })], manifest, () => file)[0], /does not contain/);
  assert.match(verifyKeys([key()], manifest, () => null)[0], /does not exist/);
  assert.match(verifyKeys([key({ snippet: undefined })], manifest, () => file)[0], /no snippet/);
  assert.match(verifyKeys([key({ consumer: 'zzz' })], manifest, () => file)[0], /not in the manifest/);
});

test('decoys are verified too', () => {
  const k = key();
  k.mustNotFlag = [{ consumer: 'c', file: 'f.ts', line: 1, why: 'w', snippet: 'needle' }];
  assert.match(verifyKeys([k], manifest, () => file)[0], /decoy/);
});
