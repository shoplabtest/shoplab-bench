import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './types.ts';

/** What a review run is given for one PR. Never contains the answer: no category, verdict or key. */
export interface ReviewRequest {
  id: string;
  repo: string;
  baseSha: string;
  headSha: string;
  /** Subject line of the head commit, as a reviewer would see it in `git log`. */
  commitSubject: string;
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const head = (dir: string) => {
  try { return git(dir, 'rev-parse', 'HEAD').trim(); } catch { return null; }
};

/** Shallow-fetches `sha` into `dir` (initialising the repository the first time). Does nothing when it is already there. */
function fetchSha(dir: string, url: string, sha: string) {
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', url);
  }
  try {
    git(dir, 'cat-file', '-e', `${sha}^{commit}`);
  } catch {
    git(dir, 'fetch', '-q', '--depth', '1', 'origin', sha);
  }
}

export interface MaterializeResult {
  repos: string[];
  prs: string[];
}

/**
 * Builds the working directory a review run starts from, using nothing but git and the manifest:
 *
 *   <out>/repos/<repo>/        each repository checked out at its pinned SHA
 *   <out>/prs/<id>/diff.patch  `git diff baseSha headSha`
 *   <out>/prs/<id>/request.json
 *
 * shoplab-bench itself is never cloned, so a run cannot read the answer keys.
 */
export function materialize(manifest: Manifest, out: string, only?: string[]): MaterializeResult {
  const repos: string[] = [];
  for (const [name, r] of Object.entries(manifest.repos)) {
    const dir = join(out, 'repos', name);
    if (head(dir) !== r.sha) {
      fetchSha(dir, r.url, r.sha);
      git(dir, 'checkout', '-q', '--detach', r.sha);
    }
    repos.push(name);
  }

  const prs: string[] = [];
  for (const pr of manifest.prs.filter((p) => !only || only.includes(p.id))) {
    const repo = manifest.repos[pr.repo];
    if (!repo) throw new Error(`${pr.id}: repository ${pr.repo} is not in the manifest`);
    const dir = join(out, 'repos', pr.repo);
    fetchSha(dir, repo.url, pr.baseSha);
    fetchSha(dir, repo.url, pr.headSha);
    const prDir = join(out, 'prs', pr.id);
    mkdirSync(prDir, { recursive: true });
    writeFileSync(join(prDir, 'diff.patch'), git(dir, 'diff', '--no-color', pr.baseSha, pr.headSha));
    const request: ReviewRequest = {
      id: pr.id,
      repo: pr.repo,
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      commitSubject: git(dir, 'log', '-1', '--format=%s', pr.headSha).trim(),
    };
    writeFileSync(join(prDir, 'request.json'), JSON.stringify(request, null, 2) + '\n');
    prs.push(pr.id);
  }
  return { repos, prs };
}
