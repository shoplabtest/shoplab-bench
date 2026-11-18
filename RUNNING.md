# Running a review agent on the benchmark

This is the contract between the benchmark and a review agent. The agent's own repository implements the run (the design calls it `bench:run`); this repository supplies the inputs, checks the outputs and scores them.

## 1. Build the inputs

```
npm install
npm run materialize -- --out <work-dir>
```

This clones every ShopLab repository at the SHA pinned in `manifest.json` (shallow, by SHA, no branch names) and writes, for each PR:

```
<work-dir>/repos/<repo>/             the repository at its pinned baseline
<work-dir>/prs/<id>/diff.patch       git diff baseSha headSha
<work-dir>/prs/<id>/request.json     { id, repo, baseSha, headSha, commitSubject }
```

`request.json` is everything a reviewer is told about a PR. It holds no category, split, verdict or key.

## 2. Rules for a run

- **Never clone `shoplab-bench`** and never read `keys/`. They hold the answers. The runner reads only the work directory.
- **Onboard the repositories into a fresh brain** for each run, then review each PR from its `request.json`. Nothing from an earlier run may be carried over.
- **Use dev PRs only** while the agent is under development. Hold-out keys are in a private repository until release.
- **No network access to GitHub PR pages or comments.** The review is replayed from the SHAs, not from the open PRs.
- Record the agent commit, model name, prompt version and benchmark version in `run.json`.

## 3. Write the results

One file per PR, `results/<run-id>/<pr-id>.json`:

```json
{
  "id": "B-03",
  "verdict": "break",
  "sites": [
    { "consumer": "shoplab-cart-api", "file": "src/consumer.ts", "line": 9, "snippet": "Number.isInteger(ev.price)" }
  ],
  "coverageGaps": [],
  "cost": { "tokens": 12000, "toolCalls": 14, "seconds": 38.5 }
}
```

| Field | Meaning |
| --- | --- |
| `id` | The PR id, equal to the file name. |
| `verdict` | `break`, `at-risk` or `safe`. |
| `sites` | Every consumer location the PR affects. `[]` when there are none. `consumer` is a repository name, `file` is relative to that repository, `line` is 1-based. `snippet` is the text on that line; it is used to check the evidence. |
| `coverageGaps` | Category I only: consumer repositories the agent found but that are not registered. |
| `cost` | Optional. Tokens, tool calls and wall-clock seconds for this PR. |

A reported site matches a key site when `consumer` and `file` are equal and the line is within 5 lines. Findings in test files are ignored.

## 4. Check and score

```
npm run validate-run -- --run results/<run-id>               # every file is well formed, every PR has one
npm run score -- --run results/<run-id> --repos <work-dir>/repos
```

`score` writes into the run folder:

- `summary.json`: the metrics, split into `dev` and `holdout`, and by category under `byCategory`
- `per-pr.csv`: verdict, matched, missed and extra sites for every PR, and the missed sites by name
- `cost.json`: tokens, tool calls and seconds, in total and per PR

The scorer is deterministic: the same results always give the same numbers. Model output is not, so official numbers are the median of three runs.

## 5. Reference baselines

```
npm run baseline-grep -- --work <work-dir> --out results/baseline-grep-v1.0
```

The grep baseline searches every other repository for the names a PR removed and reports every hit. It needs no model. A key site is `hard` exactly when this baseline does not find it. Its scores are in `results/baseline-grep-v1.0/` and are the floor an agent has to beat, mainly on precision.
