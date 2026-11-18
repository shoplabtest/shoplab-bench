import { sitesMatch } from './score.ts';
import type { AnswerKey, PrResult } from './types.ts';

/**
 * A site is hard when the grep baseline does not find it. This is objective and reproducible: it depends only on the
 * committed baseline run, never on anyone's judgement of how clever a coupling is.
 * A PR with no baseline result has every site treated as not found, so every site is hard.
 */
export function reflagHard(key: AnswerKey, grep: PrResult | undefined): AnswerKey {
  const found = grep?.sites ?? [];
  return { ...key, sites: key.sites.map((s) => ({ ...s, hard: !found.some((f) => sitesMatch(f, s)) })) };
}

export interface FlagChange { id: string; site: string; from: boolean; to: boolean }

export function flagChanges(before: AnswerKey, after: AnswerKey): FlagChange[] {
  return before.sites.flatMap((s, i) => {
    const from = !!s.hard;
    const to = !!after.sites[i].hard;
    return from === to ? [] : [{ id: before.id, site: `${s.consumer}/${s.file}:${s.line}`, from, to }];
  });
}
