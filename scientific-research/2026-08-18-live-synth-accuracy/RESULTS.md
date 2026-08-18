# Results log

One row per benchmark run. Change **one** lever at a time; keep the seed fixed when
comparing, and re-check a promising result across seeds {42, 7, 1234} before
believing it, since arrival order matters.

Accuracy = `0.6·F1_synth + 0.4·F1_topic`. See `README.md` for the metric definition
and `score100.mjs` for the implementation.

| run | lang | lever | accuracy | F1 synth | F1 topic | pairs merged | synths | topics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-08-18-2010-en-seed42` | en | shipped defaults | **0.067** | 0.000 | 0.167 | 0/50 | 0 | 1 |
| `he-seed42-defaults` | he | shipped defaults | **0.066** | 0.000 | 0.165 | 0/50 | 0 | 1 |
| `en-seed42-cluster078` | en | `clusterThreshold=0.78` | **0.429** | 0.571 | 0.215 | 20/50 | 20 | 4 |
| `en-seed42-cluster078-debouncefix` | en | + defer debounced spawns to queue | **0.442** | 0.579 | 0.237 | 22/50 | 21 | 4 |

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

## Finding 2 — Hebrew fails identically at defaults, which hides the language effect

The Hebrew baseline scores 0.066 against English's 0.067: same single mega-cluster,
same zero syntheses. At shipped defaults the black hole dominates so completely that
it **masks** the large embedding-quality gap the pre-flight measured (separability
100/100 English vs 56/100 Hebrew). The EN/HE comparison only becomes meaningful once
synthesis actually happens, so fix the structural problem first and treat the
language question as a second, separate measurement.

## Finding 3 — raising `clusterThreshold` restores synthesis, at perfect precision

Setting `clusterThreshold = 0.78` (collapsing the topic-spawn band into the synth
band) lifts English from 0.067 to **0.429**. Every one of the 20 produced syntheses
holds exactly 2 members, precision is **1.000**, and there are zero false merges —
the pairs it does find are perfectly clean. Recall is the whole problem: 20/50.

## Finding 4 — the spawn debounce throttles a busy question to ~1 spawn per window

The recall ceiling is not the thresholds. The audit accounting is exact:

```
45 spawn attempts  =  24 spawned  +  21 debounced
```

and 45 is precisely the number of pairs the pre-flight put above 0.85. So the
pipeline *found* almost every pair and then threw half of them away.

`SPAWN_DEBOUNCE_MS` is 15s and the lock is **per parent, not per cluster**, so a
spawn of one pair blocks the spawn of a completely unrelated pair. Its stated
purpose — stopping a burst of near-identical options from each spawning their own
2-member cluster — only needs to cover the moment between a spawn committing and
the new cluster becoming visible to vector search; after that Pass 1/2 attach
handles duplicates on its own.

Worse, a debounced spawn was **silently dropped**. `runSinglePipeline` runs once per
option create and nothing re-triggered a debounced option, so the comment's premise
that such options "fall through to the attach path on the next tick" did not hold.
Fixed in `deferSpawnAfterDebounce` by enqueuing the option for the queue worker.

That fix is mechanically correct — the queue visibly receives ~20 deferred items —
but only bought +2 pairs (0.429 → 0.442), because `drainSynthesisQueue` processes a
batch in a tight loop: the first retry spawns, re-arms the 15s window, and
re-blocks the rest of its own batch. The window length itself is the binding
constraint, so `SPAWN_DEBOUNCE_MS` is now overridable via
`SYNTHESIS_SPAWN_DEBOUNCE_MS` to make it measurable rather than a guess.
