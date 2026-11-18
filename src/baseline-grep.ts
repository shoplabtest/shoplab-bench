import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { FoundSite, PrResult } from './types.ts';

/** Words that are syntax, not symbols. Searching for them would match every file. */
const STOP = new Set(
  ('const let var return function export import from default type interface class extends implements string number boolean void null undefined true false ' +
    'new if else for while switch case break continue try catch finally throw async await as in of typeof instanceof this super public private protected readonly static ' +
    'def self none elif lambda pass raise with yield and not').split(' '),
);

// A name (with dots, dashes or colons inside it) or a URL path such as /cart/items.
const TOKEN = /[A-Za-z_$][A-Za-z0-9_$]*(?:[-.:][A-Za-z0-9_$]+)*|\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*/g;

const tokens = (lines: string[]) => new Set(lines.flatMap((l) => l.match(TOKEN) ?? []).filter((t) => t.length >= 3 && !STOP.has(t)));

/**
 * The symbols a PR took away. Within each block of changed lines, the n-th removed line is paired with the n-th
 * added line, and a name counts when it is on the removed line but not on the line that replaced it. A removed
 * line with no replacement contributes all its names. An additive PR removes nothing, so the baseline stays silent.
 */
export function changedSymbols(diff: string): string[] {
  const symbols = new Set<string>();
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    removed.forEach((line, i) => {
      const kept = tokens([added[i] ?? '']);
      for (const t of tokens([line])) if (!kept.has(t)) symbols.add(t);
    });
    removed = [];
    added = [];
  };
  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) flush();
    else if (line.startsWith('-')) {
      if (added.length) flush();
      removed.push(line.slice(1));
    } else if (line.startsWith('+')) added.push(line.slice(1));
    else flush();
  }
  flush();
  return [...symbols].sort();
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage', '__pycache__', '.pytest_cache', '.venv']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|json|ya?ml|sql|md|py|toml|ini|txt|html|css|sh)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) return [];
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) return sourceFiles(p);
    return TEXT.test(name) && st.size < 512_000 ? [p] : [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface GrepOptions {
  /** Directory holding one checkout per repository, as written by `materialize`. */
  reposDir: string;
  /** The repository the PR changes. It is not searched: the benchmark is about other repositories. */
  ownRepo: string;
  /** Upper bound on reported sites, so a very common symbol cannot produce a huge result. */
  maxSites?: number;
}

/** Every line, in every other repository, that contains one of the symbols as a whole word. */
export function grepSites(symbols: string[], { reposDir, ownRepo, maxSites = 1000 }: GrepOptions): FoundSite[] {
  if (symbols.length === 0) return [];
  // A name must stand alone; a path may follow a host or a template (`${base}/products`), so only its end is checked.
  const pattern = new RegExp(symbols.map((s) => `${s.startsWith('/') ? '' : '(?<![A-Za-z0-9_$-])'}${escape(s)}(?![A-Za-z0-9_$-])`).join('|'));
  const sites: FoundSite[] = [];
  for (const repo of readdirSync(reposDir).sort()) {
    if (repo === ownRepo) continue;
    const root = join(reposDir, repo);
    if (!statSync(root).isDirectory()) continue;
    for (const file of sourceFiles(root).sort()) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!pattern.test(lines[i])) continue;
        sites.push({ consumer: repo, file: relative(root, file), line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        if (sites.length >= maxSites) return sites;
      }
    }
  }
  return sites;
}

/** The whole baseline for one PR: any hit means "break", no hit means "safe". */
export function grepBaseline(id: string, diff: string, opts: GrepOptions): PrResult {
  const started = Date.now();
  const sites = grepSites(changedSymbols(diff), opts);
  return { id, verdict: sites.length ? 'break' : 'safe', sites, cost: { tokens: 0, toolCalls: 0, seconds: (Date.now() - started) / 1000 } };
}
