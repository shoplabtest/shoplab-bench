# shoplab-bench

Manifest, answer keys, scorer and results for the ShopLab benchmark. Design: `../docs/shoplab-benchmark-design.md`.

```
npm install
npm test                                  # scorer unit tests
npm run validate                          # keys and manifest are well formed
npm run verify-keys -- --repos <dir>       # every key site and decoy line holds its snippet at the pinned SHA
npm run coverage                          # every contract kind needs >= 2 key sites
npm run materialize -- --out <dir>        # pinned repos and one diff + review request per PR (the inputs of a run)
npm run validate-run -- --run results/<run-id>   # agent results are well formed
npm run score -- --run results/<run-id> [--repos <dir>/repos]
npm run baseline-grep -- --work <dir> --out results/<run-id>   # reference baseline, no model
```

See [RUNNING.md](RUNNING.md) for the contract between a review agent and the benchmark.

- `manifest.json`: every repo and PR at a full 40-char SHA. Branch names are never used. Commands that read it accept `--manifest <file>` to use another one (a draft of the next version, for example). Commands that read the keys accept `--keys <dir>` the same way.
- `keys/<id>.json`: one answer key per PR, committed before any agent run.
- `results/<run-id>/<pr-id>.json`: agent output (`verdict`, `sites`, `coverageGaps`, `cost`).
- Scoring always reports `dev` and `holdout` separately. Hold-out keys stay in `shoplab-bench-holdout` until release.
- A reported site matches a key site when consumer and file are equal and the line is within 5.
- Findings in test files (`test/`, `*.test.*`, `*.spec.*`) are ignored: they are neither credited nor counted as false positives. Keys list production consumers only.
- **`hard: true` means the grep baseline does not find the site.** It is set by `npm run reflag-hard -- --run results/baseline-grep-v1.0 --write` from the committed baseline run, not by judgement, so the grep baseline's hard-site recall is 0 by construction and the agent's hard-site recall measures what it adds over a text search. A new PR's keys are flagged the same way before they are committed.
- Key sites marked `unsupported` (e.g. the Go service) are reported separately and never counted as misses.

## Baseline v1.1 (frozen)

`manifest.v1.1.json` pins the Phase 2 baseline: all 16 repositories at tag `bench-v1.1-base`. Five repositories are unchanged from v1.0; the rest add the Phase 2 services and the consumers that give every contract kind a real cross-repository site (the generated contracts client and types, feature flags, deploy outputs). The held PRs in contracts, infra, host, iam and account-mfe are pinned at their branch heads, so merging them changes nothing: the pinned commits stay reachable.

It was verified from the pinned commits alone: `materialize --manifest manifest.v1.1.json`, then the compose stack, `npm run smoke` (30 checks) and the browser e2e. The PRs for v1.1 are not in this manifest yet.

## Pinning the baseline

```
npm run pin -- shoplab-host shoplab-iam ...   # resolves tag bench-v1.0-base on GitHub to full SHAs, writes manifest.json
```

The baseline tag is `bench-v1.0-base`. `shoplab-bench` itself is not listed in its own manifest.
