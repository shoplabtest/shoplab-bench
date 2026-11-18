export interface SlateEntry {
  id: string;
  category: string;
  kinds: string[];
}

export interface SplitResult {
  /** 0 is the plain shuffle; a higher number means the first attempts broke a constraint. Recorded so the split can be reproduced. */
  attempt: number;
  holdout: string[];
  dev: string[];
}

/** Same generator as the scorer tests and the seeds. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** What is wrong with a proposed split; empty means it satisfies the design's rules. */
export function splitProblems(existingDev: SlateEntry[], dev: SlateEntry[], holdout: SlateEntry[]): string[] {
  const problems: string[] = [];
  const hold = (f: (e: SlateEntry) => boolean) => holdout.some(f);
  const allDev = [...existingDev, ...dev];
  for (const c of CATEGORIES) {
    const exists = [...allDev, ...holdout].some((e) => e.category === c);
    if (exists && !hold((e) => e.category === c)) problems.push(`category ${c} has no hold-out PR`);
  }
  const kinds = new Set([...allDev, ...holdout].flatMap((e) => e.kinds));
  for (const k of kinds) {
    if (!hold((e) => e.kinds.includes(k))) problems.push(`kind ${k} has no hold-out PR`);
    // A kind that exists only in new PRs must stay visible to the people tuning on dev.
    const onlyNew = !existingDev.some((e) => e.kinds.includes(k));
    const total = [...dev, ...holdout].filter((e) => e.kinds.includes(k)).length;
    if (onlyNew && total >= 2 && !dev.some((e) => e.kinds.includes(k))) problems.push(`kind ${k} has no dev PR`);
  }
  return problems;
}

/**
 * Picks `holdoutCount` of the new PRs for hold-out with a seeded shuffle. If the result breaks a rule the shuffle is
 * repeated with the next seed, so the answer is a pure function of (inputs, seed). PRs already public stay dev.
 */
export function assignSplit(existingDev: SlateEntry[], candidates: SlateEntry[], holdoutCount: number, seed: number, maxAttempts = 100_000): SplitResult {
  if (holdoutCount > candidates.length) throw new Error(`cannot hold out ${holdoutCount} of ${candidates.length} PRs`);
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(ordered, seed + attempt);
    const holdout = shuffled.slice(0, holdoutCount);
    const dev = shuffled.slice(holdoutCount);
    if (splitProblems(existingDev, dev, holdout).length === 0) {
      return { attempt, holdout: holdout.map((e) => e.id).sort(), dev: dev.map((e) => e.id).sort() };
    }
  }
  throw new Error(`no split satisfies the rules within ${maxAttempts} attempts`);
}
