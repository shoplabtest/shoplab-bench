# shoplab-bench

Manifest, answer keys, scorer and results for the ShopLab benchmark. Design: `../docs/shoplab-benchmark-design.md`.

```
npm install
npm test                                  # scorer unit tests
npm run validate                          # keys and manifest are well formed
npm run verify-keys -- --repos <dir>       # every key site and decoy line holds its snippet at the pinned SHA
npm run coverage                          # every contract kind needs >= 2 key sites
npm run score -- --run results/<run-id> [--repos <dir with cloned repos>]
```

- `manifest.json`: every repo and PR at a full 40-char SHA. Branch names are never used.
- `keys/<id>.json`: one answer key per PR, committed before any agent run.
- `results/<run-id>/<pr-id>.json`: agent output (`verdict`, `sites`, `coverageGaps`, `cost`).
- Scoring always reports `dev` and `holdout` separately. Hold-out keys stay in `shoplab-bench-holdout` until release.
- A reported site matches a key site when consumer and file are equal and the line is within 5.
- Findings in test files (`test/`, `*.test.*`, `*.spec.*`) are ignored: they are neither credited nor counted as false positives. Keys list production consumers only.
- Key sites marked `unsupported` (e.g. the Go service) are reported separately and never counted as misses.

## Pinning the baseline

```
npm run pin -- shoplab-host shoplab-iam ...   # resolves tag bench-v1.0-base on GitHub to full SHAs, writes manifest.json
```

The baseline tag is `bench-v1.0-base`. `shoplab-bench` itself is not listed in its own manifest.
