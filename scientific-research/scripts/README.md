# Seed script & corpus

The seed script and corpus that **produced the validation runs**, surfaced here
so the record is self-contained. To avoid duplication, these are **relative
symlinks** to the single canonical source in the repo — they cannot drift:

```
cleanRawSeed.ts              -> ../../functions/scripts/cleanRawSeed.ts
seedSynthBenchmark.data.json -> ../../scripts/seedSynthBenchmark.data.json
```

The exact content for a given run is pinned by the commit recorded in that run's
`report.md` → *Provenance*. (Symlinks check out as links on macOS/Linux; on
Windows, enable `git config core.symlinks true` or read the canonical paths
above.)

## Files

| File | What it is |
|---|---|
| `cleanRawSeed.ts` | **The seed script.** Writes the corpus as raw options under a question with live-synth **disabled** (so embeddings are generated but the live pipeline does not cluster as options arrive). Idempotent; waits for full embedding coverage. Canonical copy: `functions/scripts/cleanRawSeed.ts`. |
| `seedSynthBenchmark.data.json` | **The corpus** — the 40 LLM-authored sentences (`2 topics × 2 synths × 10 paraphrases`) with their ground-truth grouping. This is the *source of the sentences*; it is also the ground-truth used for scoring. Canonical copy: `scripts/seedSynthBenchmark.data.json`. |

> The sentences are **synthetic, LLM-authored** paraphrases, not real participant
> data — see each run's `report.md` → §2.1 for the construction and the threat to
> validity it implies.

## Running the seed

`cleanRawSeed.ts` depends only on `firebase-admin` (no pipeline internals), so
run it from `functions/` (which has the dependency installed) against a running
emulator:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/cleanRawSeed.ts <questionId> \
    ../scientific-research/scripts/seedSynthBenchmark.data.json "<question text>"
```

Optional env: `SEED_DELAY_MS` (ms between writes; default 1500),
`SEED_USER_UID` (creator uid).

## Companion scripts (not snapshotted here — they import the pipeline)

These must run from `functions/` because they import `functions/src/synthesis`
internals, so they are not copied here. Use them at the recorded commit:

| Script | Role |
|---|---|
| `functions/scripts/bulkRebuild.ts` | Cluster the seeded options (UMAP→DBSCAN) — preview/sweep/execute. |
| `functions/scripts/verifyFromEmbeddings.ts` | Re-derive the clustering from a run's shipped `embeddings.json` (offline verification). |
| `scientific-research/validation/score.mjs` | Verify a run's verdict from its committed artifacts (no deps). |

There is also `functions/scripts/seedSynthBenchmark.ts` — a *different* seeder
that turns live synthesis **on** (used to test the live/incremental path, not the
clean bulk validation here).
