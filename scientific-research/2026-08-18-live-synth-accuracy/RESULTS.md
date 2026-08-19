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
| `en-seed42-cohesion-pairdebounce` | en | centroid topic gate + per-pair debounce, **shipped thresholds** | **0.207** | 0.077 | 0.401 | 2/50 | 2 | 14 |
| `en-seed42-passorder` | en | + synthesis outranks theming; failed spawns re-queued | **0.711** | 0.926 | 0.388 | 50/50 | 48 | 13 |
| `en-seed42-llm-themes` | en | + LLM theme assignment; themes born from syntheses | **0.730** | 0.895 | 0.481 | 47/50\* | 45 | 18 |
| `en-seed42-consolidated` | en | + theme consolidation; reJudge judged on members; Pass 3b | **0.910** | **1.000** | 0.775 | **50/50** | 50 | 11 |

\* The `llm-themes` run's 47/50 is a **harness artifact, not a pipeline result** —
see Finding 8. That build's true pair recovery was 50/50.

Every run from `en-seed42-cohesion-pairdebounce` onward uses **shipped thresholds**
with no `--set` overrides, unlike the tuned runs above them. All are single-load
emulator runs with HEAD verified before and after and `functions/lib` mtimes
unchanged across the run; the earlier `0.691` intermediate is excluded from this
table because a concurrent rebuild made it unattributable.

## Where it ended up

`en-seed42-consolidated` reproduces the corpus's synthesis ground truth exactly:
**50 syntheses, every one holding precisely its two paraphrases**, P = R = F1 = ARI
= 1.000, zero false merges, 100/100 coverage. The theme layer reaches F1 0.775 with
11 headings against a true 10, and the countable cluster score moves to 0.840 after
sitting at exactly 0.500 for three consecutive rounds.

The headline arc, all at shipped thresholds: **0.067 → 0.207 → 0.711 → 0.730 →
0.910**.

Three caveats worth keeping attached to that number:

- **Single seed.** Every run above uses seed 42. Arrival order decides which theme
  gets created first and what a newcomer's neighbourhood looks like, and Finding 4
  showed cluster-birth timing predicting the outcome in 48 of 50 pairs. Until the
  seed sweep lands, 0.910 is seed 42's accuracy.
- ~~**The reJudge merge gate is unproven.**~~ **Resolved by the seed-7 run.** On
  seed 42 it reported zero refusals only because the pipeline produced no
  duplicate synths for it to consider — nothing to refuse is not the same as
  refusing nothing, and that run could not tell the two apart. Once `pumps.log`
  captured the sweep's own output (Finding 8), seed 7 showed **5 refusals across
  3 sweeps**, including *"Establish Separate Food-Scrap Collection for
  Composting"* ↔ *"Provide Weekly Curbside Recycling Pickup"* — precisely the
  false merge that cost precision in two earlier rounds — and *"Move All
  Municipal Procedures Online"* ↔ *"Open In-Person Help Desks"*. The gate works,
  and it is the reason precision holds at 1.000. Theme consolidation is visible
  in the same log: 9→7, 14→11, 11→10.
- **`attach.titleOnlyRejected` fired once in five rounds**, on a genuinely marginal
  case (title 0.852, members 0.836, gate 0.85). Correctly calibrated, but doing
  almost nothing; do not credit it with the precision recovery.

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
**0.067 to 0.592**, roughly a 9× improvement.

> **Correction (2026-08-19).** An audit of the run artifacts contradicts the
> original claim here that no false merge appeared at any point. The intermediate
> run `en-seed42-cluster078-debouncefix` records **P=0.846 with 4 falsely merged
> pairs**, in its own `scores.md`: one 4-member synth,
> "Establish Separate Food-Scrap Collection for Citywide Composting", mixes
> `compost-organic-waste` with `recycling-pickup`. The raw cross-group cosines are
> 0.808–0.836 — all *below* `attachThreshold` 0.85 — so the attach was carried by
> the synth's own title embedding rather than by member evidence. Precision is
> 1.000 in the best run, but it has not been 1.000 at every stage, and the
> mechanism that broke it (a synth title abstracting far enough to pull in a
> neighbouring idea) is a live risk rather than a one-off.

1.5s is a deliberately aggressive probe chosen to size the headroom, not a
production recommendation. The right window is the time for a committed spawn to
become visible to vector search; the principled fix is to scope the lock to the
cluster being spawned rather than to the whole parent, which would remove the
throughput ceiling without shortening the protection at all.

## What still limits the score

- **Recall, 19 pairs short.**

  > **Correction (2026-08-19).** This was originally read as "37 statements are
  > stranded in `review-queued` and never revisited". That mistakes an event count
  > for a terminal state. Reconstructing roles from the memberships and arrival
  > order (37 spawners + 37 spawn-siblings + 23 attachers + 3 unclustered, which
  > reconciles exactly with the audit counts), **35–36 of those 37 were rescued**
  > when their partner arrived and spawned with them. At most 1–2 ended terminally
  > review-queued.
  >
  > The 19 missed pairs break down as: **17 — the twin was already inside a topic
  > cluster** and therefore foreclosed (D1 residue; twin at rank 1, cosine
  > 0.82–0.93 in all 17); **1 — a silent spawn failure** at cosine 0.898 that was
  > never retried; **1 — a topic attach at 0.777 evidence preempted a synth spawn
  > at 0.895** (pass precedence). **Zero** were below the gate, and **zero** fell
  > outside the 10-neighbour window.
  >
  > So revisiting review-queued options — item 4 in the recommendations below —
  > would have recovered roughly none of them. The sink was cluster membership,
  > silent work-dropping, and pass ordering.
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
4. ~~**Revisit `review-queued` options when a later statement lands near them.**~~
   **Withdrawn 2026-08-19** — see the correction above. Review-queued was not a
   terminal sink; it accounted for at most 1–2 statements and ~0 of the 19 missed
   pairs. The change that belongs in this slot instead is **never dropping a
   failed spawn**: `spawnClusterFromPair` returning `spawned: false` ended the
   pipeline with no audit row and no retry, which cost one pair at cosine 0.898.
5. **Add a synth → topic nesting pass.** Without it the composite cannot exceed
   ~0.68 even with every synthesis perfect. This is a design change, not a tuning one.

## Finding 6 — passes must run most-specific-first, or the general claim wins on the specific claim's evidence

Cohesion-gating the topic attach (Finding 1's fix) worked exactly as intended and
took the score to **0.207** — worse than the tuned run it replaced. The cluster half
improved as designed; the synth half collapsed to 2 of 50 pairs, with the synthesis
LLM consulted 4 times in a 100-statement run.

The cause was pass ordering, and it was not introduced by the gate — the gate merely
exposed it by making themes form early and cleanly. Topic attach ran before synth
spawn, and **a theme that already holds your twin will always look cohesive to you,
because your twin is inside its centroid.** Measured on the earlier runs: in 17 of 23
topic attaches, the member whose cosine justified the attach *was the statement's own
twin*. The pipeline used the twin to file the statement away from it.

Saying two statements are the same idea is a stronger claim than saying they share a
theme, so the specific claim now gets first refusal:

```
1 synth attach → 2 SYNTH SPAWN → 3 topic attach → 4 registry → 5 topic spawn → 6 review
```

A `cannotSynthesize` refusal is no longer terminal at the spawn site — "these are
distinct ideas" is precisely the case *for* theming them. Result: **0.711**, pair
recovery 50/50, at shipped thresholds for the first time.

## Finding 7 — theme membership is not in the geometry, at any threshold or model

With the synth layer solved, the theme layer was the entire remaining gap. It is not
a tuning gap. Measured on the 50 ground-truth synthesis centroids:

|  | same-theme pairs | different-theme pairs |
| --- | --- | --- |
| median cosine | 0.743 | 0.670 |

| mechanism | best achievable F1 |
| --- | --- |
| best single pairwise cut, `text-embedding-3-small` | 0.480 |
| best single pairwise cut, `text-embedding-3-large` @1536 | 0.535 |
| global agglomerative clustering to the true k=10 | 0.432 |
| *what the shipped greedy pipeline actually reached* | *0.388* |

So the pipeline was already at ~90% of its mechanism's ceiling, a better embedding
model buys ~0.05, and a global re-clustering sweep buys **nothing** — it scores below
what greedy attach already achieves. The bands overlap; theme membership is a
semantic judgement that embedding distance does not encode on a single-question
corpus, where every statement shares the question's vocabulary.

Moving the decision to an LLM took topic F1 to 0.481 and then, with consolidation,
to **0.775**. This is the same conclusion the claim registry reached one layer down
(95% vs embeddings' 0.5%) and the same one the cross-synth merge gate reached: cosine
proposes, judgement disposes.

Two structural consequences, both measured:

- **Themes must be born from syntheses, not from pairs of raw options.** Cosine
  cannot tell whether two raw options share a theme, so that path spawned themes it
  could not see were redundant — one run produced "Public Service Access",
  "Essential service accessibility", "Public access and mobility" and "Community
  Support Services" side by side.
- **Themes need consolidating afterwards.** They are created in arrival order, so
  the first synthesis under a question *must* create one, which makes early headings
  narrower than the topic they end up representing. Left alone this produced 18
  headings for 10 topics with ten holding a single synthesis. One judge call per
  sweep over the whole heading set brought 20 created → 11 final, and moved the
  countable cluster score off 0.500 to **0.840**.

## Finding 8 — two measurement bugs that each inverted a conclusion

Both were found by auditing artifacts rather than by reading code, and each had
already caused a wrong call to be reported.

**The harness re-implemented the code under test.** `functions/scripts/runReJudgeMerge.ts`
described itself as a "faithful re-implementation" of the scheduled cross-synth merge.
It was faithful when written and stopped being so the moment the production sweep
gained an LLM merge gate — the pump kept merging on cosine alone. The only symptom
was a diagnostic counter reading 0, which is indistinguishable from a gate that ran
and approved. A harness that re-implements the code under test measures the copy, and
the divergence appears exactly when it matters: right after a fix lands. The pump now
calls the production function.

**Silence is not the same as done.** `waitForSettle` waits for a quiet window, but
the functions emulator serialises trigger executions, so a spawn that is queued but
not started writes nothing and looks identical to a finished run. A 2.5s window was
ample when the pipeline was pure cosine; a spawn now costs 8-10s. On the `llm-themes`
run the last three arrivals' spawns landed 3-29 seconds *after* the exporter
snapshotted, and the run reported 47/50 for a pipeline that had achieved 50/50 — with
three ground-truth pairs scored as failures and a fourth cluster lost entirely. The
window is now 12s, two consecutive quiet windows are required, and the final export is
taken twice and trusted only when unchanged.

Both bugs share a shape worth naming: **a measurement that fails silently in the
direction of looking plausible.** Neither produced an error; both produced a number.
