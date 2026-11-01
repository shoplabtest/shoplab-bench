import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTagSha, pinRepos, resolveTags } from '../src/pin.ts';
import { validateManifest } from '../src/validate.ts';
import type { Manifest } from '../src/types.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const TAG_OBJ = 'c'.repeat(40);

test('annotated tags resolve to the commit, not the tag object', () => {
  const out = `${TAG_OBJ}\trefs/tags/base\n${A}\trefs/tags/base^{}\n`;
  assert.equal(parseTagSha(out, 'base'), A);
});

test('lightweight tags resolve directly; missing tags return null', () => {
  assert.equal(parseTagSha(`${B}\trefs/tags/base\n`, 'base'), B);
  assert.equal(parseTagSha('', 'base'), null);
  assert.equal(parseTagSha(`${B}\trefs/tags/other\n`, 'base'), null);
});

test('pinRepos adds and overwrites only the named repos', () => {
  const m: Manifest = { benchmarkVersion: '1', shuffleSeed: 1, repos: { x: { url: 'u', sha: A } }, prs: [] };
  const next = pinRepos(m, { y: { url: 'v', sha: B } });
  assert.deepEqual(Object.keys(next.repos).sort(), ['x', 'y']);
  assert.equal(m.repos.y, undefined, 'input is not mutated');
});

test('resolveTags builds org urls, and a missing tag is an error', () => {
  const fake = (url: string) => (url.includes('good') ? `${A}\trefs/tags/t^{}\n` : '');
  const pins = resolveTags('org', ['good'], 't', fake);
  assert.deepEqual(pins.good, { url: 'https://github.com/org/good.git', sha: A });
  assert.throws(() => resolveTags('org', ['bad'], 't', fake), /bad: tag t not found/);
});

test('a pinned manifest validates', () => {
  const m = pinRepos({ benchmarkVersion: '1', shuffleSeed: 1, repos: {}, prs: [] }, { x: { url: 'u', sha: A } });
  assert.deepEqual(validateManifest(m), []);
});
