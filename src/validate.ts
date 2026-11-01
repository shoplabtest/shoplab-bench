import { CONTRACT_KINDS, type AnswerKey, type Manifest } from './types.ts';

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
