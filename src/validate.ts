import { CONTRACT_KINDS, type AnswerKey, type Manifest } from './types.ts';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const SHA = /^[0-9a-f]{40}$/;
const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const VERDICTS = ['break', 'at-risk', 'safe'];

/** Returns a list of problems; empty means the key is valid. */
export function validateKey(k: AnswerKey): string[] {
  const e: string[] = [];
  const need = (ok: boolean, msg: string) => ok || e.push(msg);
  need(/^[A-I]-\d{2}$/.test(k.id), `id "${k.id}" must look like B-03`);
  need(k.id?.[0] === k.category, 'id prefix must equal category');
  need(CATEGORIES.includes(k.category), `bad category ${k.category}`);
  need(SHA.test(k.baseSha), 'baseSha must be a 40-char sha');
  need(SHA.test(k.headSha), 'headSha must be a 40-char sha');
  need(k.split === 'dev' || k.split === 'holdout', 'split must be dev or holdout');
  need(VERDICTS.includes(k.expect), `bad expect ${k.expect}`);
  for (const kind of k.kinds) need((CONTRACT_KINDS as readonly string[]).includes(kind), `unknown kind ${kind}`);
  if (k.expect === 'safe') need(k.sites.length === 0, 'safe PRs must have no sites');
  if (k.expect === 'break') need(k.sites.length > 0 || k.category === 'E', 'break PRs need at least one site');
  for (const s of k.sites) need(s.line > 0 && !!s.file && !!s.consumer, `bad site ${JSON.stringify(s)}`);
  return e;
}

export function validateManifest(m: Manifest): string[] {
  const e: string[] = [];
  for (const [name, r] of Object.entries(m.repos)) if (!SHA.test(r.sha)) e.push(`repo ${name}: sha must be 40 chars`);
  for (const p of m.prs) {
    if (!SHA.test(p.baseSha) || !SHA.test(p.headSha)) e.push(`pr ${p.id}: bad sha`);
    if (!m.repos[p.repo]) e.push(`pr ${p.id}: repo ${p.repo} not in manifest`);
  }
  return e;
}

/**
 * Checks one agent result file before it is scored, so a malformed run fails with a clear message
 * instead of silently scoring as "no findings". `id` is the PR id the file is named after.
 */
export function validateResult(id: string, r: unknown): string[] {
  const e: string[] = [];
  const need = (ok: boolean, msg: string) => ok || e.push(msg);
  const o = r as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null) return [`${id}: result must be a JSON object`];
  need(o.id === id, `id must be "${id}", got ${JSON.stringify(o.id)}`);
  need(typeof o.verdict === 'string' && VERDICTS.includes(o.verdict), `verdict must be one of ${VERDICTS.join(', ')}, got ${JSON.stringify(o.verdict)}`);
  if (!Array.isArray(o.sites)) {
    e.push('sites must be an array (use [] for "nothing found")');
  } else {
    o.sites.forEach((s: unknown, i: number) => {
      const x = s as Record<string, unknown>;
      const at = `sites[${i}]`;
      need(typeof x?.consumer === 'string' && /^shoplab-[a-z-]+$/.test(x.consumer as string), `${at}.consumer must be a repository name such as shoplab-cart-api`);
      need(typeof x?.file === 'string' && !!x.file && !(x.file as string).startsWith('/'), `${at}.file must be a path relative to the repository root`);
      need(isInt(x?.line) && (x.line as number) >= 1, `${at}.line must be a positive integer`);
      need(x?.snippet === undefined || typeof x.snippet === 'string', `${at}.snippet must be a string when present`);
    });
  }
  if (o.coverageGaps !== undefined) need(Array.isArray(o.coverageGaps) && o.coverageGaps.every((g) => typeof g === 'string'), 'coverageGaps must be an array of repository names');
  if (o.cost !== undefined) {
    const c = o.cost as Record<string, unknown>;
    for (const f of ['tokens', 'toolCalls', 'seconds']) need(typeof c?.[f] === 'number' && (c[f] as number) >= 0, `cost.${f} must be a non-negative number`);
  }
  return e;
}
