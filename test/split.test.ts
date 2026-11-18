import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSplit, shuffle, splitProblems, type SlateEntry } from '../src/split.ts';

const e = (id: string, kinds: string[] = []): SlateEntry => ({ id, category: id[0], kinds });

test('shuffle is a pure function of the seed and keeps every item', () => {
  const xs = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(shuffle(xs, 7), shuffle(xs, 7));
  assert.notDeepEqual(shuffle(xs, 7), shuffle(xs, 8));
  assert.deepEqual([...shuffle(xs, 7)].sort(), xs);
  assert.deepEqual(xs, ['a', 'b', 'c', 'd', 'e', 'f']); // input untouched
});

test('splitProblems names the missing hold-out category, kind and dev example', () => {
  const existing = [e('A-01', ['component'])];
  const dev = [e('A-02', ['function']), e('B-01', ['type'])];
  const hold = [e('B-02', ['http-endpoint'])];
  const p = splitProblems(existing, dev, hold);
  assert.ok(p.includes('category A has no hold-out PR'));
  assert.ok(p.includes('kind component has no hold-out PR'));
  assert.ok(p.includes('kind function has no hold-out PR'));
  assert.ok(!p.some((m) => m.includes('B has no hold-out'))); // B-02 is held out
});

test('a kind that only new PRs have needs a dev example when it has two or more PRs, not when it has one', () => {
  const dev = [e('A-02', ['http-endpoint'])];
  const holdBoth = [e('A-03', ['function']), e('B-01', ['function'])];
  assert.ok(splitProblems([], dev, holdBoth).includes('kind function has no dev PR'));
  assert.ok(!splitProblems([], dev, [e('A-03', ['function'])]).some((m) => m.includes('function has no dev PR')));
  const seen = [e('A-01', ['function'])]; // already public in dev: no extra dev example is demanded
  assert.ok(!splitProblems(seen, dev, holdBoth).some((m) => m.includes('function has no dev PR')));
});

const slate: SlateEntry[] = [
  e('A-10', ['api-operation']), e('A-11', ['type']), e('A-12', ['function']), e('A-13', ['db-table']),
  e('B-10', ['api-operation', 'type']), e('B-11', ['function']), e('C-10', ['db-table']), e('C-11', ['event']),
  e('D-10', ['value']), e('E-10', []), e('F-10', ['package']), e('F-11', ['package']),
];

test('assignSplit returns the requested number, satisfies every rule, and is reproducible', () => {
  const existing = [e('A-01', ['event']), e('D-01', ['value'])];
  const r = assignSplit(existing, slate, 8, 20261101);
  assert.equal(r.holdout.length, 8);
  assert.equal(r.dev.length, 4);
  assert.deepEqual([...r.holdout, ...r.dev].sort(), slate.map((s) => s.id).sort());
  const byId = new Map(slate.map((s) => [s.id, s]));
  assert.deepEqual(splitProblems(existing, r.dev.map((i) => byId.get(i)!), r.holdout.map((i) => byId.get(i)!)), []);
  assert.deepEqual(assignSplit(existing, slate, 8, 20261101), r);
  assert.deepEqual(assignSplit(existing, [...slate].reverse(), 8, 20261101), r); // input order does not matter
});

test('the seed matters, and an impossible request is an error', () => {
  const existing = [e('A-01', ['event'])];
  const loose = Array.from({ length: 20 }, (_, i) => e(`${'ABCDE'[i % 5]}-${20 + i}`, ['http-endpoint']));
  const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => assignSplit([e('A-01', ['http-endpoint'])], loose, 10, seed).holdout.join()));
  assert.ok(distinct.size > 1, 'the seed has to matter');
  assert.throws(() => assignSplit(existing, slate, 13, 1), /cannot hold out 13 of 12/);
  assert.throws(() => assignSplit(existing, slate, 1, 1, 50), /no split satisfies the rules/);
});
