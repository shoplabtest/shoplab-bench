export const CONTRACT_KINDS = [
  'component',
  'function',
  'class',
  'type',
  'value',
  'federation-module',
  'package',
  'http-endpoint',
  'api-operation',
  'event',
  'db-table',
  'db-column',
  'env-var',
  'config-key',
  'deploy-output',
  'browser-state',
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export type Verdict = 'break' | 'at-risk' | 'safe';
export type Split = 'dev' | 'holdout';
export type Category = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface KeySite {
  consumer: string;
  file: string;
  line: number;
  why: string;
  hard?: boolean;
  /** Consumer language the agent does not support; reported separately, never a miss. */
  unsupported?: boolean;
}

export interface MustNotFlag {
  consumer: string;
  file: string;
  line: number;
  why: string;
}

export interface AnswerKey {
  id: string;
  repo: string;
  pr: number;
  baseSha: string;
  headSha: string;
  split: Split;
  category: Category;
  difficulty: 'easy' | 'medium' | 'hard';
  expect: Verdict;
  kinds: ContractKind[];
  sites: KeySite[];
  mustNotFlag: MustNotFlag[];
  /** Category I: consumer repos the agent must report as not registered. */
  coverageGaps?: string[];
  notes?: string;
}

export interface FoundSite {
  consumer: string;
  file: string;
  line: number;
  snippet?: string;
}

export interface Cost {
  tokens: number;
  toolCalls: number;
  seconds: number;
}

/** One agent result per PR: results/<run-id>/<pr-id>.json */
export interface PrResult {
  id: string;
  verdict: Verdict;
  sites: FoundSite[];
  coverageGaps?: string[];
  cost?: Cost;
}

export interface ManifestRepo {
  url: string;
  sha: string;
}

export interface Manifest {
  benchmarkVersion: string;
  shuffleSeed: number;
  repos: Record<string, ManifestRepo>;
  prs: { id: string; repo: string; pr: number; baseSha: string; headSha: string; split: Split }[];
}
