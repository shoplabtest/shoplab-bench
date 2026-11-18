import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { grepBaseline } from './baseline-grep.ts';
import { coverageReport, formatCoverage } from './coverage.ts';
import { materialize } from './materialize.ts';
import { flagChanges, reflagHard } from './reflag.ts';
import { pinRepos, resolveTags } from './pin.ts';
import { fsEvidenceCheck, perPrCsv, summarizeByCategory, summarizeBySplit } from './score.ts';
import { validateKey, validateManifest, validateResult } from './validate.ts';
import { gitReadAtSha, verifyKeys } from './verify.ts';
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
} else if (cmd === 'validate-run') {
  // validate-run --run results/<run-id>: every result file is well formed, and every PR has one
  const run = arg('run');
  if (!run) throw new Error('usage: validate-run --run <results/run-id>');
  const dir = resolve(run);
  const keys = loadKeys(arg('keys') ? resolve(arg('keys')!) : undefined);
  let bad = 0;
  for (const k of keys) {
    const p = join(dir, `${k.id}.json`);
    if (!existsSync(p)) { console.error(`${k.id}: no result file`); bad++; continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { console.error(`${k.id}: not valid JSON (${(e as Error).message})`); bad++; continue; }
    for (const problem of validateResult(k.id, parsed)) { console.error(`${k.id}: ${problem}`); bad++; }
  }
  console.log(`${keys.length} PRs checked, ${bad} problem(s)`);
  process.exit(bad ? 1 : 0);
} else if (cmd === 'verify-keys') {
  // verify-keys --repos <dir with shoplab-* checkouts>: every site and decoy line must hold its snippet at the pinned SHA
  const reposDir = arg('repos');
  if (!reposDir) throw new Error('usage: verify-keys --repos <dir>');
  const problems = verifyKeys(loadKeys(), readJson<Manifest>(join(root, 'manifest.json')), gitReadAtSha(resolve(reposDir)));
  for (const p of problems) console.error(p);
  console.log(`${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
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
} else if (cmd === 'materialize') {
  // materialize --out <dir> [--only A-01,B-02]: clone every pinned repo and write each PR's diff and review request
  const out = arg('out');
  if (!out) throw new Error('usage: materialize --out <dir> [--only <id,id>]');
  const r = materialize(readJson<Manifest>(join(root, 'manifest.json')), resolve(out), arg('only')?.split(','));
  console.log(`${r.repos.length} repositories and ${r.prs.length} PRs in ${resolve(out)}`);
} else if (cmd === 'reflag-hard') {
  // reflag-hard --run results/baseline-grep-v1.0 [--write]: hard = the grep baseline does not find the site
  const run = arg('run');
  if (!run) throw new Error('usage: reflag-hard --run <results/baseline-run> [--write]');
  let moved = 0;
  for (const k of loadKeys()) {
    const p = join(resolve(run), `${k.id}.json`);
    const next = reflagHard(k, existsSync(p) ? readJson<PrResult>(p) : undefined);
    for (const c of flagChanges(k, next)) (moved++, console.log(`${c.id} ${c.site}: hard ${c.from} -> ${c.to}`));
    if (process.argv.includes('--write')) writeFileSync(join(root, 'keys', `${k.id}.json`), JSON.stringify(next, null, 2) + '\n');
  }
  console.log(`${moved} flag(s) ${process.argv.includes('--write') ? 'rewritten' : 'would change (use --write)'}`);
} else if (cmd === 'baseline-grep') {
  // baseline-grep --work <materialized dir> --out results/<run-id>: the grep baseline, written as an ordinary run
  const work = arg('work');
  const out = arg('out');
  if (!work || !out) throw new Error('usage: baseline-grep --work <dir> --out <results/run-id>');
  const outDir = resolve(out);
  mkdirSync(outDir, { recursive: true });
  const manifest = readJson<Manifest>(join(root, 'manifest.json'));
  for (const pr of manifest.prs) {
    const diffPath = join(resolve(work), 'prs', pr.id, 'diff.patch');
    if (!existsSync(diffPath)) continue;
    const result = grepBaseline(pr.id, readFileSync(diffPath, 'utf8'), { reposDir: join(resolve(work), 'repos'), ownRepo: pr.repo });
    writeFileSync(join(outDir, `${pr.id}.json`), JSON.stringify(result, null, 2) + '\n');
  }
  writeFileSync(join(outDir, 'run.json'), JSON.stringify({ agent: 'grep-baseline', benchmarkVersion: manifest.benchmarkVersion, date: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log(`wrote ${outDir}`);
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
  const evidence = reposDir ? fsEvidenceCheck(resolve(reposDir)) : undefined;
  const summary = {
    ...summarizeBySplit(keys, results, evidence),
    byCategory: {
      dev: summarizeByCategory(keys.filter((k) => k.split === 'dev'), results, evidence),
      holdout: summarizeByCategory(keys.filter((k) => k.split === 'holdout'), results, evidence),
    },
  };
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(runDir, 'per-pr.csv'), perPrCsv(keys, results, evidence));
  // cost.json: what each PR cost, as reported by the run, plus the totals
  const perPr = Object.fromEntries([...results].map(([id, r]) => [id, r.cost ?? null]));
  const sum = (f: 'tokens' | 'toolCalls' | 'seconds') => Object.values(perPr).reduce((n, c) => n + (c?.[f] ?? 0), 0);
  writeFileSync(join(runDir, 'cost.json'), JSON.stringify({ total: { tokens: sum('tokens'), toolCalls: sum('toolCalls'), seconds: sum('seconds') }, perPr }, null, 2) + '\n');
  console.log(JSON.stringify({ dev: summary.dev, holdout: summary.holdout }, null, 2));
} else {
  console.error('commands: validate | validate-run --run <dir> | verify-keys | pin | coverage | materialize | baseline-grep | score --run <dir> [--repos <dir>] [--keys <dir>]');
  process.exit(2);
}
