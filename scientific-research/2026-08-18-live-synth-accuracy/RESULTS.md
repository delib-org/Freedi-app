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
| `en-seed42-cluster078-debounce1500` | en | + `SYNTHESIS_SPAWN_DEBOUNCE_MS=1500` | **0.592** | 0.765 | 0.331 | 31/50 | 31 | 6 |
| `he-seed42-cluster078-debounce1500` | he | same fixes as the English 0.592 run | **0.066** | 0.000 | 0.166 | 0/50 | 0 | 1 |
| `he-seed42-large-cluster084` | he | + `text-embedding-3-large`, `clusterThreshold`/`synthLowerBound=0.84` | **0.369** | 0.380 | 0.352 | 27/50 | 19 | 3 |

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

## Finding 5 — shortening the debounce window confirms it was the recall ceiling

With `SYNTHESIS_SPAWN_DEBOUNCE_MS=1500`, English reaches **0.592**: pair recovery
31/50, precision still **1.000**, coverage 97/100. Spawns rose from 24 to 37 and
debounces fell to zero. Cumulatively the two structural changes take English from
**0.067 to 0.592**, roughly a 9× improvement, without a single false merge appearing
at any point.

1.5s is a deliberately aggressive probe chosen to size the headroom, not a
production recommendation. The right window is the time for a committed spawn to
become visible to vector search; the principled fix is to scope the lock to the
cluster being spawned rather than to the whole parent, which would remove the
throughput ceiling without shortening the protection at all.

## What still limits the score

- **Recall, 19 pairs short.** 37 statements still end in `review-queued`, which
  writes to `_liveSynthCandidates` for admin review and is then never revisited —
  the same "drop the work" shape as the debounce bug, one layer further out. When a
  statement arrives before its partner, that is the correct call at the time; the
  gap is that nothing reconsiders it once the partner shows up.
- **Topic level, F1 0.331.** The live pipeline never nests syntheses under topic
  clusters — `spawnClusterFromPair` only ever attaches plain options — so the
  10-topic layer of the ground truth cannot be fully reconstructed by design. The
  scorer's `synths-only` self-test fixture shows the ceiling this imposes: a run
  with 50/50 perfect syntheses and no topic nesting still scores only 0.680. Closing
  that gap needs a new nesting pass, which is a design decision rather than a tuning
  one.
- **Hebrew is capped by the embedding model**, not by any of the above — see
  README.md. `text-embedding-3-large` is the lever there.

## Finding 6 — the English fixes do not transfer to Hebrew; the embedding model does

Running Hebrew with exactly the settings that took English to 0.592 leaves it at
**0.066** — still one mega-cluster, still zero syntheses. The reason is in the
pre-flight table: Hebrew's cross-topic *median* under `text-embedding-3-small` is
0.779, so a 0.78 gate still admits nearly every unrelated pair and the black hole
survives. **Cosine thresholds are language-specific and an English-tuned value
cannot be assumed to transfer.**

Switching to `text-embedding-3-large` (requested at 1536 dimensions so the existing
Firestore vector indexes stay valid) moves Hebrew to **0.369** — 27/50 pairs, up
from 0. That is a 5.6× gain from one configuration change, and it is the only lever
that moved Hebrew at all.

Precision fell to 0.293 (65 false merges) at the `0.84` band I used, which is a
tuning artifact rather than a model problem: Hebrew's within-pair p10 (0.814) and
cross-topic max (0.850) still overlap under 3-large, so a single 0.84 cut both
merges true pairs and admits some false ones. The pre-flight puts the best possible
single cut at F1 0.774, so a better-chosen band should recover most of the lost
precision. That tuning pass is the obvious next experiment.

## Recommended changes, in order of measured value

1. **Stop the topic-cluster black hole.** Highest impact by far (English
   0.067 → 0.429). Raising `clusterThreshold` is the blunt version; the better fix
   is to stop letting a topic cluster absorb an option whose best evidence comes
   from a single member, since that is what lets one cluster grow without bound.
2. **Rescope the spawn debounce** from per-parent to per-cluster (English
   0.442 → 0.592). The 15s per-parent lock throttles a whole question to roughly one
   spawn per window, which bites hardest exactly when a question is busiest.
   Already landed: debounced spawns are no longer dropped, and the window is
   overridable via `SYNTHESIS_SPAWN_DEBOUNCE_MS`.
3. **Move Hebrew (and any non-English question) to `text-embedding-3-large`**
   at 1536 dimensions (Hebrew 0.066 → 0.369). Embeddings are a rounding error next
   to the synthesis LLM calls, and English improves too (pre-flight F1 0.947 → 0.990).
4. **Revisit `review-queued` options when a later statement lands near them** —
   currently they are written to `_liveSynthCandidates` and never reconsidered.
5. **Add a synth → topic nesting pass.** Without it the composite cannot exceed
   ~0.68 even with every synthesis perfect. This is a design change, not a tuning one.
