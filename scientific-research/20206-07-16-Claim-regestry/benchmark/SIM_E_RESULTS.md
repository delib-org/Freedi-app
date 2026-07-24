# Condition E — hierarchical LLM routing, corpus replay

Engine: SIMULATED-ENGINE.md §7 (living labels, cosine-ranked cluster step via production `routeToTopics`, synth step via production `classifyAgainstClaims` at confidence ≥ 0.6).
Judge model: `gpt-4o-mini` · n = 150 triplets · 11 datasets.

Unlike conditions A–D this is a **growing corpus**: anchors seed the structure, then
matches + distractors are filed into it in shuffled order. Scores are the state at probe time.

## Headline

| metric | value (Wilson 95% CI) |
|---|---|
| **tripletCorrect** (match in anchor's synth AND distractor not) | 61.3% (92/150) [53.3–68.8] |
| synthRecall (match filed into anchor's synth) | 67.3% (101/150) [59.5–74.3] |
| clusterRecall (match filed into anchor's cluster) | 80.7% (121/150) [73.6–86.2] |
| **falseMerge** (distractor filed into anchor's synth) | 8.0% (12/150) [4.6–13.5] |
| distractorSameCluster (pro/con inside one topic) | 71.3% (107/150) [63.6–78.0] |
| counterEdgeToAnchor (explicit oppose edge recorded) | 47.3% (71/150) [39.5–55.3] |

Reference points (§3): judge-on-raw-text ceiling 95.0% triplet accuracy / 2.1% false-accept;
production cosine-only fast paths ≈ 0.5% triplet accuracy.

## Where recall is lost

- match missed its synth: **49** of 150
  - but landed in the right cluster (synth-step miss): 20
  - and landed in the wrong cluster (cluster-step misroute): 29

- match verdicts: same-meaning 120 · new-cluster 15 · opposes 8 · new-synth 7
- distractor verdicts: opposes 94 · same-meaning 32 · new-cluster 21 · new-synth 3

## Per dataset

| dataset | n | tripletCorrect | synthRecall | falseMerge | clusters | synths |
|---|---|---|---|---|---|---|
| gsc_abortion_gen | 17 | 71% | 82% | 12% | 3 | 18 |
| gsc_abortion_val | 17 | 71% | 76% | 12% | 3 | 24 |
| gsc_chatbot_gen | 17 | 59% | 59% | 0% | 9 | 30 |
| polis_15_per_hour_seattle | 3 | 33% | 67% | 33% | 1 | 6 |
| polis_american_assembly_bowling_green | 17 | 41% | 41% | 0% | 11 | 43 |
| polis_brexit_consensus | 8 | 88% | 88% | 0% | 4 | 17 |
| polis_canadian_electoral_reform | 17 | 59% | 59% | 0% | 12 | 27 |
| polis_scoop_hivemind_ubi | 3 | 100% | 100% | 0% | 1 | 6 |
| remesh_campus_protests | 17 | 65% | 76% | 12% | 1 | 20 |
| remesh_foreign_intervention | 17 | 41% | 53% | 24% | 6 | 23 |
| remesh_right_to_assemble | 17 | 71% | 76% | 6% | 5 | 25 |

## Structure & cost

- statements filed: **450** → **56** clusters, **239** synths
- compression: 1.88 statements per synth, 8.0 per cluster
- LLM calls: 1252 total (439 cluster · 394 synth · 419 label) = **2.78 per statement**
- mean candidate list: 2.7 clusters (cluster step) · 7.5 synths (synth step)
- label calls are 33% of all calls — the lazy-update knob (§7 refinement 2) targets this.

