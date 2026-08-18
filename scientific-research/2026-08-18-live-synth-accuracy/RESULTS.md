# Results log

One row per benchmark run. Change **one** lever at a time; keep the seed fixed when
comparing, and re-check a promising result across seeds {42, 7, 1234} before
believing it, since arrival order matters.

Accuracy = `0.6·F1_synth + 0.4·F1_topic`. See `README.md` for the metric definition
and `score100.mjs` for the implementation.

| run | lang | lever | accuracy | F1 synth | F1 topic | pairs merged | synths | topics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-08-18-2010-en-seed42` | en | shipped defaults | **0.067** | 0.000 | 0.167 | 0/50 | 0 | 1 |

## Finding 1 — the topic-cluster band is a black hole (shipped defaults, English)

The very first run produced **zero syntheses** and **one topic cluster holding all
100 statements**. The audit log tells the whole story: `{"spawn": 1, "attach": 98}`.

What happens:

1. The first two statements land in the `[clusterThreshold 0.60, synthLowerBound
   0.78)` band and spawn a **topic cluster**.
2. Every later statement finds that cluster at ≥ 0.60 and Pass 2 attaches it. The
   pre-flight already measured why this is near-certain: **80% of English
   cross-topic pairs and 100% of Hebrew ones sit above 0.60**, because every
   statement is embedded under the same `"Question: …\nAnswer: …"` prefix, which
   lifts the entire cosine floor (English cross-topic min 0.505, Hebrew 0.639).
3. Once a statement belongs to a cluster, the `findClustersContainingMember` guard
   at the top of `runSinglePipeline` skips it. So when its true paraphrase partner
   arrives, **the pair can never form a synthesis** — the partner just attaches to
   the same growing blob.

The consequence is worse than "topics are too coarse": a single early topic cluster
starves the synthesis layer for the rest of the run. Coverage looks perfect (100/100
clustered) while precision is 0.091 and no actual merging of duplicate ideas
happened at all — the one number that would have looked healthy on a dashboard is
the one that hides the failure.

This is not a corpus artifact. The corpus separability is 100/100 (every
statement's true paraphrase is its nearest neighbour) and the best single cosine
cut reaches F1 0.990, so the information needed to build the 50 correct pairs was
fully present in the embeddings the pipeline had.

**Note on the `clusterThreshold` docstring.** `functions/src/synthesis/pipeline/types.ts`
justifies lowering the gate from 0.65 to 0.60 with the estimate that cross-topic
pairs land at 0.30–0.65. Measured on a real single-question civic corpus they land
at 0.505–0.786 (English) and 0.639–0.912 (Hebrew). The gate was tuned against a
cosine range that the production embedding contract does not actually produce.
