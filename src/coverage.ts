import { CONTRACT_KINDS, type AnswerKey, type ContractKind } from './types.ts';

export const MIN_SITES_PER_KIND = 2;

/** Key sites per contract kind. A PR's sites count toward each kind the PR lists. */
export function coverageReport(keys: AnswerKey[]) {
  const counts = new Map<ContractKind, number>(CONTRACT_KINDS.map((k) => [k, 0]));
  const hold = new Map<ContractKind, number>(CONTRACT_KINDS.map((k) => [k, 0]));
  for (const key of keys) {
    for (const kind of key.kinds) {
      counts.set(kind, counts.get(kind)! + key.sites.length);
      if (key.split === 'holdout') hold.set(kind, hold.get(kind)! + 1);
    }
  }
  const rows = CONTRACT_KINDS.map((kind) => ({
    kind,
    sites: counts.get(kind)!,
    holdoutPrs: hold.get(kind)!,
    ok: counts.get(kind)! >= MIN_SITES_PER_KIND,
  }));
  return { rows, ok: rows.every((r) => r.ok) };
}

export function formatCoverage(r: ReturnType<typeof coverageReport>): string {
  const lines = r.rows.map((x) => `${x.ok ? 'ok  ' : 'FAIL'} ${x.kind.padEnd(18)} sites=${x.sites} holdoutPrs=${x.holdoutPrs}`);
  return lines.join('\n');
}
