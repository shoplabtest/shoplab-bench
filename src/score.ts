import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnswerKey, FoundSite, KeySite, PrResult, Split } from './types.ts';

export const LINE_TOLERANCE = 5;

/** A reported site matches a key site when consumer and file are equal and the line is within 5. */
export function sitesMatch(found: FoundSite, key: { consumer: string; file: string; line: number }): boolean {
  return found.consumer === key.consumer && found.file === key.file && Math.abs(found.line - key.line) <= LINE_TOLERANCE;
}

/** Test files mirror the contracts they test, so a PR also breaks them. Keys list production consumers only, so findings in test files are ignored. */
export function isTestFile(file: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export interface PrScore {
  id: string;
  split: Split;
  expect: AnswerKey['expect'];
  verdict: PrResult['verdict'] | 'missing';
  matched: KeySite[];
  misses: KeySite[];
  falsePositives: FoundSite[];
  /** Reported sites in test files: neither credited nor counted as false positives. */
  ignoredTestSites: FoundSite[];
  unsupportedSkipped: KeySite[];
  evidenceChecked: number;
  evidenceValid: number;
  gapsOk: boolean | null;
}

export type EvidenceCheck = (found: FoundSite) => boolean | null;

/** Checks that file and line exist in the consumer repo and contain the quoted snippet. */
export function fsEvidenceCheck(reposDir: string): EvidenceCheck {
  return (f) => {
    const path = join(reposDir, f.consumer, f.file);
    if (!existsSync(path)) return false;
    if (!f.snippet) return null;
    const lines = readFileSync(path, 'utf8').split('\n');
    const line = lines[f.line - 1];
    return line !== undefined && line.includes(f.snippet.trim());
  };
}

export function scorePr(key: AnswerKey, res: PrResult | undefined, evidence?: EvidenceCheck): PrScore {
  const allSites = res?.sites ?? [];
  const sites = allSites.filter((f) => !isTestFile(f.file));
  const scored = key.sites.filter((s) => !s.unsupported);
  const matched = scored.filter((k) => sites.some((f) => sitesMatch(f, k)));
  const misses = scored.filter((k) => !matched.includes(k));
  const falsePositives = sites.filter(
    (f) => !key.sites.some((k) => sitesMatch(f, k)),
  );
  let evidenceChecked = 0;
  let evidenceValid = 0;
  if (evidence) {
    for (const f of allSites) {
      const r = evidence(f);
      if (r === null) continue;
      evidenceChecked++;
      if (r) evidenceValid++;
    }
  }
  const gapsOk = key.coverageGaps?.length
    ? key.coverageGaps.every((g) => res?.coverageGaps?.includes(g))
    : null;
  return {
    id: key.id,
    split: key.split,
    expect: key.expect,
    verdict: res?.verdict ?? 'missing',
    matched,
    misses,
    falsePositives,
    ignoredTestSites: allSites.filter((f) => isTestFile(f.file)),
    unsupportedSkipped: key.sites.filter((s) => s.unsupported),
    evidenceChecked,
    evidenceValid,
    gapsOk,
  };
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
}

export interface Summary {
  prs: number;
  prDetectionRecall: number | null;
  siteRecall: number | null;
  hardSiteRecall: number | null;
  sitePrecision: number | null;
  safeQuietRate: number | null;
  verdictAccuracy: number | null;
  evidenceValidity: number | null;
  coverageGapReport: number | null;
  cost: Record<'tokens' | 'toolCalls' | 'seconds', { median: number | null; p90: number | null }>;
}

export function summarize(keys: AnswerKey[], results: Map<string, PrResult>, evidence?: EvidenceCheck): Summary {
  const scores = keys.map((k) => scorePr(k, results.get(k.id), evidence));
  const byId = new Map(keys.map((k) => [k.id, k]));
  const breaks = scores.filter((s) => s.expect === 'break' && byId.get(s.id)!.sites.some((x) => !x.unsupported));
  const keySites = scores.flatMap((s) => [...s.matched, ...s.misses]);
  const hardSites = keySites.filter((k) => k.hard);
  const hardMatched = scores.flatMap((s) => s.matched).filter((k) => k.hard);
  const reported = scores.reduce((n, s) => n + s.matched.length + s.falsePositives.length, 0);
  const safe = scores.filter((s) => s.expect === 'safe');
  const quiet = safe.filter((s) => s.verdict === 'safe' && s.falsePositives.length === 0);
  const gaps = scores.filter((s) => s.gapsOk !== null);
  const costs = keys.map((k) => results.get(k.id)?.cost).filter((c) => !!c);
  const col = (f: 'tokens' | 'toolCalls' | 'seconds') => ({
    median: percentile(costs.map((c) => c![f]), 0.5),
    p90: percentile(costs.map((c) => c![f]), 0.9),
  });
  return {
    prs: keys.length,
    prDetectionRecall: ratio(breaks.filter((s) => s.matched.length > 0).length, breaks.length),
    siteRecall: ratio(scores.reduce((n, s) => n + s.matched.length, 0), keySites.length),
    hardSiteRecall: ratio(hardMatched.length, hardSites.length),
    sitePrecision: ratio(scores.reduce((n, s) => n + s.matched.length, 0), reported),
    safeQuietRate: ratio(quiet.length, safe.length),
    verdictAccuracy: ratio(scores.filter((s) => s.verdict === s.expect).length, scores.length),
    evidenceValidity: ratio(
      scores.reduce((n, s) => n + s.evidenceValid, 0),
      scores.reduce((n, s) => n + s.evidenceChecked, 0),
    ),
    coverageGapReport: ratio(gaps.filter((s) => s.gapsOk).length, gaps.length),
    cost: { tokens: col('tokens'), toolCalls: col('toolCalls'), seconds: col('seconds') },
  };
}

/** Always reported separately so tuning on dev cannot inflate the hold-out number. */
export function summarizeBySplit(keys: AnswerKey[], results: Map<string, PrResult>, evidence?: EvidenceCheck) {
  return {
    dev: summarize(keys.filter((k) => k.split === 'dev'), results, evidence),
    holdout: summarize(keys.filter((k) => k.split === 'holdout'), results, evidence),
  };
}
