
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

---

# Round 2 — fixing the cluster step (2026-07-24)

Three levers were implemented, all at the cluster step. **The judge prompt was
never varied** (round 1 established that re-rolling it costs ~40pp).

| config | tripletCorrect | synthRecall | clusterRecall | falseMerge | distSameCluster | counterEdge | clusters |
|---|---|---|---|---|---|---|---|
| baseline — create cluster on empty routing | 61.3% [53–69] | 67.3% | 80.7% | 8.0% | 71.3% | 47.3% | 56 |
| merge pass (post-seed repair) | 66.0% [58–73] | 69.3% | 80.0% | 4.7% | 72.0% | 49.3% | 58 |
| **flat fallback (production's rule)** | **75.3% [68–82]** | 82.7% | 98.7% | 8.0% | 93.3% | 68.0% | **22** |
| flat fallback + creation guard | 79.3% [72–85] | 86.7% | 100.0% | 8.0% | 100.0% | 71.3% | 11 |
| creation guard (cos ≥ 0.70) | 82.0% [75–87] | 88.0% | 100.0% | 7.3% | 100.0% | 72.0% | 11 |

Exact McNemar tests (paired, same 150 triplets):

| comparison | fixed | broken | p | |
|---|---|---|---|---|
| baseline → flat fallback | +29 | −8 | **0.00075** | *** |
| baseline → creation guard | +34 | −3 | **1.2e-07** | *** |
| baseline → merge pass | +12 | −5 | 0.14 | ns |
| flat fallback → flat + guard | +9 | −3 | 0.15 | ns |
| flat + guard → guard alone | +9 | −5 | 0.42 | ns |

## What the numbers actually say

**1. The flat fallback captures the entire significant gain.** Everything beyond
it — adding the creation guard, or the guard alone — is statistically
indistinguishable from it (p = 0.15, p = 0.42). Round 1's bottleneck is fixed by
one rule change.

**2. The merge pass does nothing (p = 0.14), and the experiment was mis-designed.**
It runs after seeding, when 17 anchors have produced only 1–4 clusters; the
fragmentation happens during the *probe* phase that follows (ending at 3–12).
Several datasets produced zero candidate pairs. It also has a structural ceiling:
merging clusters deliberately does not merge synths, so a repair pass can never
improve `synthRecall` or `tripletCorrect` — only prevention at file time can. A
periodic (not one-shot) repair pass remains untested.

**3. Accuracy on this pilot is monotone in cluster COLLAPSE:**

| config | clusters | accuracy |
|---|---|---|
| baseline | 56 | 61.3% |
| flat fallback | 22 | 75.3% |
| flat + guard | 11 | 79.3% |
| guard | 11 | 82.0% |

Fewer clusters always scored better, and the two best configs put **every dataset
in a single cluster**. That is the key caveat on the guard's headline 82%: it does
not cluster better, it stops clustering. Each pilot dataset is one deliberation
question on essentially one topic, so the benchmark structurally cannot punish
collapse — a genuinely multi-topic deliberation would. `clusterRecall = 100%` and
`distractorSameCluster = 100%` are trivially true when k = 1; the flat fallback's
98.7% / 93.3% at k = 22 are *earned*.

## Recommendation

**Adopt the flat fallback. Do not adopt the cosine creation guard on this evidence.**

- The flat fallback is significant (p < 0.001), preserves real cluster structure
  (22 vs 11), costs 2.85 LLM calls/statement vs 2.78, and — decisively — is
  **already what production does**. `classifyHierarchical` treats empty routing as
  routing FAILURE and falls back to the full flat codebook; only the simulation
  invented "empty routing means new topic". The 31 logged rescues are 31
  statements saved from spawning junk clusters.
- The guard's extra ~7pp is not statistically significant over flat+guard, and is
  bought by deleting the cluster layer. Re-test it on genuinely multi-topic data
  before considering it.
- Production's `HIERARCHY_MIN_CLAIMS = 30` gate ("below this many claims a flat
  read is already cheap — no routing hop") is the same lesson in a different form,
  and our pilot corpora (17–33 synths) sit right at that boundary.

Net: condition E goes from **61.3% → 75.3%**, versus CH's 55.8% and CE2's 53.8%
at a comparable false-merge rate (8.0% vs 8.2%) — now a clear win over prior art
rather than the overlapping-CI result of round 1.
