# Topic-Grouped Results Export

`scripts/exportQuestionResults.ts` produces a single JSON file describing the
state of a deliberation question — grouped by topic, with synthesized clusters
and surviving standalones, and rich agreement signals attached.

See `plans/topic-grouped-results-export.md` for the full schema and the design
rationale. TypeScript interfaces live in
`packages/shared-types/src/models/results-export/ResultsExport.ts`.

## Quick start

```bash
# From a local snapshot (preferred for development)
npx tsx scripts/exportQuestionResults.ts \
  --input test-data/wizcol-e4Rvr.json \
  --out out/results-e4Rvr.json

# From production Firestore (read-only)
gcloud auth application-default login
GCLOUD_PROJECT=wizcol-app npx tsx scripts/exportQuestionResults.ts \
  --question-id e4RvrhcOzPNt \
  --out out/results-e4Rvr.json
```

Need a fresh local snapshot? Pull one with:

```bash
GCLOUD_PROJECT=wizcol-app npx tsx scripts/exportProdQuestion.ts \
  --question-id <id> --out test-data/<name>.json
```

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--input <path>` | – | Local JSON snapshot (from `exportProdQuestion.ts`). |
| `--question-id <id>` | – | Firestore question id. Requires `GCLOUD_PROJECT`. |
| `--out <path>` | stdout | Output file path. Parent directories are created. |
| `--consensus-floor <n>` | `0.35` | Minimum WizCol consensus for a standalone to survive. |
| `--min-evaluators <n>` | `2` | Minimum evaluators per standalone. |
| `--framing-id <id>` | most-used | Override which topic framing groups the results. |
| `--include-filtered-ids` | off | Inline the IDs of filtered-out solutions. |
| `--no-pretty` | off | Emit single-line JSON. |

Provide either `--input` or `--question-id`, not both.

## What the export contains

- **`summary`** — counts: total options, evaluators, topics, surviving solutions.
- **`agreement.questionLevel`** — average consensus / like-mindedness / polarization
  across all surviving solutions, plus average solutions evaluated per user.
- **`agreement.coalitions`** — empty in v1 (deferred per plan §5.4).
- **`topics[]`** — one block per topic, with synthesized cluster(s) and surviving
  standalones, plus per-topic agreement aggregates.
- **`filteredOut`** — count of solutions dropped, broken down by reason
  (below floor, low evaluators, hidden, unassigned to any topic).

Each solution carries:

- `evaluation` — WizCol consensus, agreementIndex, likeMindedness, proRatio, polarization.
- `agreementProfile` — 5-bin histogram + a coarse `agreementShape` classification
  (`consensus`, `skewed-positive`, `polarized`, `split`, `low-signal`).
- `kind: "synthesis"` carries `provenance` (source IDs + sample titles).
- `kind: "standalone"` carries the `kept.reason` + within-topic rank.

## Notes

- The script computes consensus from **raw evaluations**, not the cached
  `evaluation` aggregate on each statement. For clusters we average each
  evaluator's votes across the cluster's member options before aggregating —
  this de-duplicates evaluators correctly.
- Source data without `derivedByPipeline` set on a cluster is reported as
  `"unknown-cluster"` rather than guessed. Topic-cluster framings produce
  clusters that are still treated as the topic block's "synthesized" entry.
- The WizCol math (`calcAgreement`, `calcLikeMindedness`, etc.) is mirrored
  inline from `packages/shared-types/src/utils/consensusCalculation.ts` to avoid
  the package's dist-ESM extension issue when running under Node ESM via tsx.
  Keep the inlined copy in sync if the canonical formula changes.

## Smoke test

```bash
npx tsx scripts/exportQuestionResults.ts \
  --input test-data/wizcol-e4Rvr.json \
  --out out/results-e4Rvr.json
# Expect: 39 topics, 39 synthesized, 18 standalones above floor,
#         749 filtered out (660 below floor + 25 low-evaluators + 56 hidden + 8 unassigned).
```
