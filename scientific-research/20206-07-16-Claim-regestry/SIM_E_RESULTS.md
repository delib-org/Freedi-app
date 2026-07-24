
## Verdict: the cluster step is the bottleneck, and fragmentation is the mechanism

**Comparison to prior art** (full-codebook family — the honest baseline; the 95%
figure is a one-claim codebook with no competing candidates):

| condition | triplet accuracy | distractor false-attach |
|---|---|---|
| A — cosine only, production today | 0.5% | 100% |
| CE2 — best flat 94-claim codebook | 53.8% | 10.3% |
| CH — two-hop hierarchical + flat fallback | 55.8% [51.8–59.7] | 8.2% |
| **E — this engine, corpus replay** | **61.3% [53.3–68.8]** | **8.0%** |

E edges out CH on accuracy at an equal false-merge rate, but the confidence
intervals overlap — on this evidence E is **not yet a significant win**. What it
is, is a win with a diagnosed and fixable bottleneck.

**59% of all recall loss happens at the cluster step, not the synth step.**
Of 49 matches that missed their anchor's synth, 29 never reached the anchor's
*cluster* — the synth judge never got to see them. Only 20 were true synth-step
misses. Precision, by contrast, is excellent: 8.0% false merges, and 94/150
distractors correctly named `opposes`.

**Fragmentation predicts recall loss across datasets.** Pearson r between
clusters-per-statement and:

| metric | r |
|---|---|
| `distractorSameCluster` | **−0.82** |
| `clusterRecall` | **−0.70** |
| `synthRecall` | −0.53 |

Split at the terciles:

| | clusterRecall | synthRecall | distractorSameCluster |
|---|---|---|---|
| low fragmentation (≤0.10 clusters/statement, 4 datasets) | **94%** | **78%** | **85%** |
| high fragmentation (>0.15, 4 datasets) | 66% | 58% | 51% |

`remesh_campus_protests` kept all 51 statements in ONE cluster and scored 100%
clusterRecall / 100% distractorSameCluster. `polis_american_assembly_bowling_green`
split 51 statements across 11 clusters and collapsed to 41% / 35%.

This also explains the weakest headline number, `counterEdgeToAnchor` at 47.3%:
a counter-edge can only be recorded when the distractor lands in its anchor's
cluster. Fragmentation doesn't merely lose recall — it silently destroys the
pro/con structure that motivated the design.

**The fix is at the cluster step, not the judge.** Today a statement creates a new
cluster whenever `routeToTopics` returns empty, with no bias toward joining and no
cost for splitting. Candidates to simulate next, cheapest first:
1. **Join-biased routing** — instruct the router to prefer the closest existing
   topic and reserve new clusters for genuinely uncovered subjects.
2. **Merge pass** — periodically judge cluster-label pairs for redundancy and
   merge. This is the "repair pass" §7 already predicted would be required.
3. **Cap cluster creation** — e.g. require cosine below a floor to the nearest
   centroid before a new cluster may be created (cosine as a *guard on creation*,
   never on matching).

Cost is not a concern: **2.78 LLM calls per statement**, mean candidate lists of
2.7 clusters and 7.5 synths — both far inside the small-list regime where the
judge's accuracy was measured. 33% of calls are label regeneration, which the
lazy-update knob (§7 refinement 2) would mostly eliminate.
