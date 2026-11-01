import { execFileSync } from 'node:child_process';
import type { Manifest } from './types.ts';

/** Extracts the commit a tag points at from `git ls-remote` output. Prefers the peeled `^{}` line of an annotated tag. */
export function parseTagSha(lsRemote: string, tag: string): string | null {
  const lines = lsRemote.split('\n').map((l) => l.trim().split(/\s+/));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
  const plain = lines.find(([, ref]) => ref === `refs/tags/${tag}`);
  return (peeled ?? plain)?.[0] ?? null;
}

/** Returns a copy of the manifest with the given repos pinned. Repos not mentioned are left alone. */
export function pinRepos(manifest: Manifest, pins: Record<string, { url: string; sha: string }>): Manifest {
  return { ...manifest, repos: { ...manifest.repos, ...pins } };
}

/** Resolves `tag` of each repo in `org` to a full SHA by asking GitHub, never trusting a local checkout. */
export function resolveTags(org: string, repos: string[], tag: string, lsRemote = defaultLsRemote) {
  const pins: Record<string, { url: string; sha: string }> = {};
  for (const name of repos) {
    const url = `https://github.com/${org}/${name}.git`;
    const sha = parseTagSha(lsRemote(url, tag), tag);
    if (!sha) throw new Error(`${name}: tag ${tag} not found`);
    pins[name] = { url, sha };
  }
  return pins;
}

const defaultLsRemote = (url: string, tag: string) =>
  execFileSync('git', ['ls-remote', '--tags', url, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' });
