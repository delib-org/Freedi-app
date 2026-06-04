# Validation Protocols — Synthesis & Clustering

Validation runs of the Freedi synthesis/clustering pipeline against corpora with
a **known ground-truth structure**. Each run records the input statements, the
produced grouping (synths and topic-clusters), and a short report scoring the
output against the ground truth.

## Layout

Each test lives in its own dated folder:

```
score.mjs                                  # shared scorer (no deps) — verifies a run vs ground truth
<D-M-YYYY>-<options>-<perTopic>-<perSynth>-validation/
  statements.json   # input corpus + ground-truth labels
  embeddings.json   # exact input embedding vectors (the clustering input)
  results.json      # output: synths + topic-clusters + parameter manifest
  report.md         # objective, procedure, env/versions, determinism scope,
                    # results vs ground truth, verdict, reproduction, license;
                    # records the git branch + commit the data was produced at
```

Example: `1-6-2026-40-20-10-validation` = run on 2026-06-01 over 40 options,
20 per topic, 10 per synth.

## Reproducing (three levels)

1. **Verify the verdict** from committed artifacts — no deps, no keys, no emulator:
   `node score.mjs <test-folder>`
2. **Re-derive the clustering** from the shipped embeddings — no OpenAI, no emulator
   (uses the real pipeline primitive):
   `cd functions && npx tsx scripts/verifyFromEmbeddings.ts ../scientific-research/validation/<test-folder>`
3. **Full end-to-end** (regenerate embeddings from text, run the whole pipeline) —
   requires Node 22.17.1, the Firebase emulators, and API keys (`OPENAI_API_KEY`
   for embeddings + Gemini credentials for titles) in `functions/.env`. See each
   run's `report.md` → *Reproduction*.

## License

Part of the Freedi project — **GPL-3.0** (`LICENSE.md` at the repo root). The
validation artifacts and scripts here are released under the same license.

## Seed script & corpus

The seed script and the source corpus that produce these runs are snapshotted in
[`../scripts/`](../scripts/) (see its `README.md`): `cleanRawSeed.ts` (the seed
script) and `seedSynthBenchmark.data.json` (the 40 LLM-authored sentences +
ground-truth labels — `2 topics × 2 synths × 10 paraphrases`). It is the
smallest corpus that exercises every grouping decision (synth merge, topic
grouping, disjoint assignment). Canonical runnable copies live in the repo
(`functions/scripts/`, `scripts/`).

## Runs

| Test | Path under test | Result |
|---|---|---|
| `1-6-2026-40-20-10-validation` | bulk UMAP→DBSCAN | PASS — 4 pure synths, 2 correct topics, 0 overlap |
| `4-6-2026-60-20-5-validation` | production: UMAP→DBSCAN + twoTierJudge | FAIL (partial) — 12 synths, near-duplicate pair correctly split (the judge's core job ✅), but 6/12 fragmented + members lost on a low-cosine synthetic corpus (9/19 checks). Surfaced & fixed 2 production bugs (DBSCAN dedupe; autoRejectBand). |
