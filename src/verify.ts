import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { AnswerKey, Manifest } from './types.ts';

export type ReadAtSha = (repo: string, sha: string, file: string) => string | null;

/** Does line `line` (1-based) of `content` contain `snippet`? */
export function lineHas(content: string, line: number, snippet: string): boolean {
  const l = content.split('\n')[line - 1];
  return l !== undefined && l.includes(snippet);
}

/** Checks every key site and decoy against the consumer file as it is at the pinned baseline SHA. */
export function verifyKeys(keys: AnswerKey[], manifest: Manifest, read: ReadAtSha): string[] {
  const problems: string[] = [];
  const check = (id: string, kind: string, s: { consumer: string; file: string; line: number; snippet?: string }) => {
    const repo = manifest.repos[s.consumer];
    if (!repo) return void problems.push(`${id}: ${kind} ${s.consumer} is not in the manifest`);
    const content = read(s.consumer, repo.sha, s.file);
    if (content === null) return void problems.push(`${id}: ${kind} ${s.consumer}/${s.file} does not exist at ${repo.sha.slice(0, 7)}`);
    if (!s.snippet) return void problems.push(`${id}: ${kind} ${s.consumer}/${s.file}:${s.line} has no snippet to verify`);
    if (!lineHas(content, s.line, s.snippet)) problems.push(`${id}: ${kind} ${s.consumer}/${s.file}:${s.line} does not contain ${JSON.stringify(s.snippet)}`);
  };
  for (const k of keys) {
    for (const s of k.sites) check(k.id, 'site', s);
    for (const s of k.mustNotFlag) check(k.id, 'decoy', s);
  }
  return problems;
}

/** Reads a file from a sibling checkout at an exact commit; null when it does not exist there. */
export const gitReadAtSha = (reposDir: string): ReadAtSha => (repo, sha, file) => {
  try {
    return execFileSync('git', ['-C', join(reposDir, repo), 'show', `${sha}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
