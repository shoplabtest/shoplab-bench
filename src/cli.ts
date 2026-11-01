import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { coverageReport, formatCoverage } from './coverage.ts';
import { pinRepos, resolveTags } from './pin.ts';
import { fsEvidenceCheck, summarizeBySplit } from './score.ts';
import { validateKey, validateManifest } from './validate.ts';
import type { AnswerKey, Manifest, PrResult } from './types.ts';

const root = resolve(import.meta.dirname, '..');
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

function loadKeys(dir = join(root, 'keys')): AnswerKey[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson<AnswerKey>(join(dir, f)));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];

if (cmd === 'validate') {
  const keys = loadKeys();
  let bad = 0;
  for (const k of keys) for (const p of validateKey(k)) (bad++, console.error(`${k.id}: ${p}`));
  const mp = join(root, 'manifest.json');
  if (existsSync(mp)) for (const p of validateManifest(readJson<Manifest>(mp))) (bad++, console.error(`manifest: ${p}`));
  console.log(`${keys.length} keys checked, ${bad} problem(s)`);
  process.exit(bad ? 1 : 0);
} else if (cmd === 'pin') {
  // pin --org shoplabtest --tag bench-v1.0-base <repo> [<repo> ...]
  const org = arg('org') ?? 'shoplabtest';
  const tag = arg('tag') ?? 'bench-v1.0-base';
  const repos = process.argv.slice(3).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!repos.length) throw new Error('usage: pin [--org <org>] [--tag <tag>] <repo> [<repo> ...]');
  const mp = join(root, 'manifest.json');
  const next = pinRepos(readJson<Manifest>(mp), resolveTags(org, repos, tag));
  writeFileSync(mp, JSON.stringify(next, null, 2) + '\n');
  for (const r of repos) console.log(`${r} ${next.repos[r].sha}`);
} else if (cmd === 'coverage') {
  const r = coverageReport(loadKeys());
  console.log(formatCoverage(r));
  process.exit(r.ok ? 0 : 1);
} else if (cmd === 'score') {
  const run = arg('run');
  if (!run) throw new Error('usage: score --run <results/run-id> [--repos <dir>] [--keys <dir>]');
  const runDir = resolve(run);
  const keys = loadKeys(arg('keys') ? resolve(arg('keys')!) : undefined);
  const results = new Map<string, PrResult>();
  for (const k of keys) {
    const p = join(runDir, `${k.id}.json`);
    if (existsSync(p)) results.set(k.id, readJson<PrResult>(p));
  }
  const reposDir = arg('repos');
  const summary = summarizeBySplit(keys, results, reposDir ? fsEvidenceCheck(resolve(reposDir)) : undefined);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.error('commands: validate | pin | coverage | score --run <dir> [--repos <dir>] [--keys <dir>]');
  process.exit(2);
}
