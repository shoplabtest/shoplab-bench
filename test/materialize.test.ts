import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize } from '../src/materialize.ts';
import type { Manifest } from '../src/types.ts';

const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let tmp: string;
let manifest: Manifest;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bench-materialize-'));
  const origin = join(tmp, 'origin-svc');
  execFileSync('git', ['init', '-q', '-b', 'main', origin]);
  run(origin, 'config', 'user.email', 't@t');
  run(origin, 'config', 'user.name', 't');
  run(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  writeFileSync(join(origin, 'a.ts'), 'export const price = 1;\n');
  run(origin, 'add', '.');
  run(origin, 'commit', '-q', '-m', 'baseline');
  const base = run(origin, 'rev-parse', 'HEAD');
  writeFileSync(join(origin, 'a.ts'), 'export const cost = 1;\n');
  run(origin, 'commit', '-qam', 'feat: rename price to cost');
  const headSha = run(origin, 'rev-parse', 'HEAD');
  run(origin, 'checkout', '-q', base); // the baseline is what main is pinned to; the PR head is a different commit
  manifest = {
    benchmarkVersion: 'test',
    shuffleSeed: 1,
    repos: { 'svc': { url: `file://${origin}`, sha: base } },
    prs: [{ id: 'X-01', repo: 'svc', pr: 1, baseSha: base, headSha, split: 'dev' }],
  };
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('checks every repo out at its pinned sha and writes the diff and request for each PR', () => {
  const out = join(tmp, 'work');
  const r = materialize(manifest, out);
  assert.deepEqual(r, { repos: ['svc'], prs: ['X-01'] });
  assert.equal(readFileSync(join(out, 'repos/svc/a.ts'), 'utf8'), 'export const price = 1;\n'); // baseline content, not the PR's
  assert.equal(run(join(out, 'repos/svc'), 'rev-parse', 'HEAD'), manifest.repos.svc.sha);

  const diff = readFileSync(join(out, 'prs/X-01/diff.patch'), 'utf8');
  assert.match(diff, /-export const price = 1;/);
  assert.match(diff, /\+export const cost = 1;/);
  const req = JSON.parse(readFileSync(join(out, 'prs/X-01/request.json'), 'utf8'));
  assert.deepEqual(req, { id: 'X-01', repo: 'svc', baseSha: manifest.prs[0].baseSha, headSha: manifest.prs[0].headSha, commitSubject: 'feat: rename price to cost' });
});

test('a review request holds no answer: no split, category, verdict or key', () => {
  const req = JSON.parse(readFileSync(join(tmp, 'work/prs/X-01/request.json'), 'utf8'));
  assert.deepEqual(Object.keys(req).sort(), ['baseSha', 'commitSubject', 'headSha', 'id', 'repo']);
});

test('running it again changes nothing, and `only` limits the PRs', () => {
  const out = join(tmp, 'work');
  assert.deepEqual(materialize(manifest, out).prs, ['X-01']);
  assert.deepEqual(materialize(manifest, out, ['Z-99']).prs, []);
  assert.ok(!existsSync(join(out, 'repos/svc/.git/shallow.lock')));
});

test('a PR whose repository is not in the manifest is an error', () => {
  const bad = { ...manifest, prs: [{ ...manifest.prs[0], repo: 'ghost' }] };
  assert.throws(() => materialize(bad, join(tmp, 'work2')), /ghost is not in the manifest/);
});
