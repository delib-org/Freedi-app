# Deciding Claim Identity Without Trusting Geometry

### An Embedding-plus-LLM-Judge architecture for online deliberation, evaluated on adversarial stance triplets

**Authors:** Tal Yaron, Claude (Anthropic) · **Date:** 2026-07-24
**Artefacts:** `benchmark/run-sim-e.ts`, `benchmark/compare-sim-e.ts`, `benchmark/results/sim-e*.jsonl`
**Companion:** `REPORT-2-HYBRID-PREFERENCE-GEOMETRY.md`

---

## Abstract

Deliberation platforms must decide when two free-text statements express the
same claim. The standard approach — cosine similarity over sentence embeddings —
fails at this task in a specific and dangerous way: it cannot distinguish a
paraphrase from a contradiction. On 875 adversarial triplets we measure
`text-embedding-3-small` at **0.5%** triplet accuracy, with **99.1%** of
opposite-meaning distractors scoring above the production merge threshold of
0.85, and distractors outranking true matches in **863 of 880** cases.

We describe and evaluate **ELJ (Embedding + LLM Judge)**, an architecture in
which cosine similarity is demoted from decision rule to candidate ranker and an
LLM makes every attach decision. In isolation the judge reaches **95.0%** triplet
accuracy at a 2.1% false-merge rate, a 190× improvement over cosine on the same
instances. We then evaluate the full architecture under realistic conditions — a
*growing corpus* where each statement must find its claim among ~20 live rivals —
and report **75.3%** accuracy at an 8.0% false-merge rate, against 55.8% for the
best prior configuration.

Three findings generalise beyond this system. (i) **Accuracy lives in the judge
prompt, not the architecture**: substituting a plausible hand-written prompt for
the production one cost ~40 percentage points with the architecture held
constant. (ii) **Hard partitioning destroys recall**: routing statements into
topic clusters before searching for their claim caused 59% of all recall loss,
because a mis-routed statement is never compared against its twin. (iii) **The
remedy is to treat a failed router as a failure, not a discovery** — falling back
to an unrestricted search recovers the loss (61.3% → 75.3%, p = 0.00075).

---

## 1. Problem

### 1.1 The task

Given a deliberation question and a corpus of participant statements, decide for
each new statement whether it expresses a claim already present. The decision
drives deduplication, canonical-claim generation, and pro/con structure. Errors
are asymmetric and both costly:

- a **missed merge** fragments the claim space and makes synthesis noisy;
- a **false merge** silently files a statement under a claim its author would
  reject — a representational failure, not merely an accuracy one.

The false-merge case deserves emphasis. If a statement arguing *against* a
proposal is filed as expressing it, the platform has misrepresented a
participant's position. In a system whose purpose is to surface what people
actually think, this is the failure mode that matters most.

### 1.2 Why embeddings fail

We evaluate on the 875 hard triplets of Blair, Procaccia & Tambe (*Embeddings
for Preferences, Not Semantics*). Each triplet is (anchor, **match**, **distractor**):
the match shares the anchor's stance in different words; the distractor keeps the
anchor's wording and flips the stance.

**Table 1 — cosine similarity on hard triplets** (`text-embedding-3-small`, production
context format, n = 875)

| measurement | value |
|---|---|
| triplet accuracy (raw text) | **0.5%** [0.2, 1.2] |
| triplet accuracy (ctx format) | 1.8% [1.1, 2.9] |
| matches ≥ 0.85 (production Pass 1) | 70.7% |
| **distractors ≥ 0.85 (false merge at Pass 1)** | **99.1%** |
| matches ≥ 0.60 (Pass 2) | 100% |
| **distractors ≥ 0.60 (false merge at Pass 2)** | **100%** |
| pipeline-correct (match ≥ 0.6 ∧ distractor < 0.6) | **0.0%** (0/875) |

**Table 2 — cosine distributions**

| population | min | median | max |
|---|---|---|---|
| true matches (n = 880) | 0.734 | 0.871 | 0.962 |
| **distractors** | 0.743 | **0.969** | 0.999 |
| English adversarial rewrites (n = 147) | 0.738 | 0.860 | 0.965 |
| Hebrew paraphrases (n = 125) | 0.574 | 0.702 | **0.822** |

The distractor median (0.969) sits *above* the match median (0.871). No threshold
separates them. Blair et al. explain why: the cosine margin decomposes into a
preference component (stance) and a nuisance component (wording, style, topic),
weighted equally. Natural data correlates the two — people who agree tend to
phrase things alike — so cosine appears stance-aware until the correlation is
deliberately broken.

Two operational consequences follow, and they point in opposite directions:

1. **Cosine is unusable as a decision threshold.** 0.85 admits 99.1% of
   contradictions.
2. **Cosine is safe and useful as a fetch floor.** At 0.45 no true match was lost
   in any language tested; the geometry knows what is *relevant* even when it
   cannot tell *which side*.

ELJ is built on exactly this asymmetry.

### 1.3 Cross-language failure

Zero of 125 verified Hebrew paraphrases of English anchors reach cosine 0.85;
95% reach 0.60. Any threshold tuned on English silently excludes cross-language
duplicates. The same judge scores **125/125** on these pairs. For a multilingual
deliberation platform this alone rules out threshold-based merging.

---

## 2. Method

### 2.1 Principle

> **Cosine proposes; the judge disposes.** No attach ever happens on geometry
> alone, and no candidate is ever excluded by geometry that the judge could have
> matched.

The judge is a single LLM call (`gpt-4o-mini`) receiving the question, a list of
candidate claims rendered as **raw statement text**, and the new statement. It
returns `expresses` / `opposes` / `none` with a confidence; attachment requires
`expresses` at confidence ≥ 0.6. An `opposes` verdict is preserved as a
counter-edge rather than discarded — "claim X has contradictors" is precisely the
pro/con structure synthesis needs.

### 2.2 Architecture under test (condition E)

```
new statement
   │
   ├─ 1. EMBED                     (cosine is used only to RANK, never to filter)
   │
   ├─ 2. CLUSTER STEP              routeToTopics() over topic clusters,
   │                               each shown as a living label + 3 centroid
   │                               exemplars, cosine-ranked, top 20.
   │                               Stance-blind: topics, not positions.
   │
   ├─ 3. SYNTH STEP                classifyAgainstClaims() over the synths in
   │                               the chosen cluster, each rendered as RAW
   │                               member text.
   │                                 expresses ≥ 0.6 → join
   │                                 opposes        → new synth + counter-edge
   │                                 none           → new synth
   │
   └─ 4. LIVING LABEL              recompute centroid and top-10 exemplars;
                                   if the exemplar set changed, regenerate the
                                   cluster label FROM the raw exemplars.
```

Two design decisions carry most of the weight.

**Raw text, never summaries.** Claims are represented by actual member
statements. Condition B2 below shows that compressing a claim to a 5–15-word
canonical form costs 25 points of accuracy; the compression discards exactly the
stance nuance the task depends on.

**Labels are regenerated, not edited.** Each label is rewritten *from* the ten
centroid-nearest statements rather than revised from the previous label. This
prevents drift compounding: a label can never wander further from its members
than one regeneration allows.

### 2.3 Why "same-meaning" and "same-topic" are different questions

The cluster step asks about *subject*; the synth step asks about *claim identity*.
Statements on opposite sides of one issue belong in the same cluster and in
different synths. This is what produces pro/con structure as a by-product rather
than a separate analysis.

---

## 3. Experimental setup

**Data.** The 875 hard triplets of Blair et al., spanning 11 datasets from three
platforms (Polis, Remesh, generative social choice). Conditions A–D use all 875;
condition E uses a fixed stratified 150-triplet pilot (`results/pilot-ids.json`),
proportional per dataset, seeded for reproducibility.

**Harness.** All judge calls invoke the **production** functions
(`classifyAgainstClaims`, `routeToTopics`, `orderClaimsForClassification`) from
`functions/src/services/claim-registry-service.ts`. Nothing is reimplemented.
§5.1 explains why this constraint is load-bearing.

**Condition E protocol — corpus replay.** Unlike conditions A–D, which classify
isolated triplets, condition E replays a growing corpus per dataset:

- **Phase A (seed):** all 17 anchors stream through the engine in file order,
  building clusters and synths from nothing.
- **Phase B (probe):** all 34 matches and distractors stream through the same
  engine in a seeded shuffle, filing into the grown structure.

This is a strictly harder and more realistic task than triplet classification: a
match must locate its anchor's synth among ~20 live rivals, and every earlier
filing decision changes the structure later statements meet.

**Metrics.** Per triplet, resolved against the final structure:

| metric | definition |
|---|---|
| `synthRecall` | match filed into its anchor's synth |
| `clusterRecall` | match filed into its anchor's cluster |
| `falseMerge` | **distractor filed into its anchor's synth** |
| `distractorSameCluster` | distractor in anchor's cluster (pro/con co-location) |
| `counterEdgeToAnchor` | explicit oppose edge recorded |
| `tripletCorrect` | `synthRecall ∧ ¬falseMerge` |

**Statistics.** Wilson score intervals for proportions; exact McNemar tests for
paired configuration comparisons (all configurations see identical triplets).

**Noise floor.** One configuration (§4.3) differed from baseline by a single
structural event yet moved 17 triplets, establishing run-to-run variance at
roughly **±5 percentage points** — LLM nondeterminism at temperature 0 plus
ordering effects. Differences below this are not interpreted.

---

## 4. Results

### 4.1 The judge in isolation

**Table 3 — claim classification, n = 875**

| condition | claim representation | triplet accuracy | match recall | **false merge** |
|---|---|---|---|---|
| A — cosine only | — | 0.5% | — | 100% |
| **B1 — judge** | **raw anchor text** | **95.0%** [93.3, 96.2] | 96.8% | **2.1%** |
| B2 — judge | generated 5–15-word claim | 70.1% | 79.7% | 12.8% |
| B2E — judge | claim + explanation + exemplar | 87.4% | 93.3% | 6.6% |
| B2E2 — judge | B2E + stance-caution prompt | 88.6% | 91.7% | 3.8% |
| D — judge (`gpt-4o`) | raw anchor text | 96.5% | 98.3% | 1.8% |

The judge also names 95.9% of distractors as `opposes` — it does not merely
decline to merge, it correctly identifies the relationship, which is what makes
counter-edges available for free.

**The summary-loss effect (B1 → B2, −24.9pp) is the single largest lever in the
table.** Representing a claim by its canonical summary rather than raw member
text more than doubles the false-merge rate. Enrichment recovers most of it
(B2E, B2E2), but never fully.

**Embedding gates are safe as floors.** Condition A2 applies a cosine gate before
the judge: at both 0.45 and 0.60, matches lost at the gate = **0.0%**, and
accuracy is identical to ungated B1 (95.0%). The geometry can be trusted to
*retrieve*; it cannot be trusted to *decide*.

### 4.2 The judge under competition

Isolation flatters. With a realistic ~94-claim codebook the same judge must
choose among many plausible claims:

**Table 4 — full-codebook conditions, n = 875 (CH: n = 613)**

| condition | triplet accuracy | match → own claim | match → *any* claim | false merge |
|---|---|---|---|---|
| C — 94-claim codebook, raw | 36.0% | 41.3% | 74.4% | 10.3% |
| CE — enriched claims | 49.6% | 62.3% | 92.9% | 19.3% |
| CE2 — enriched + stance caution | 53.8% | 59.0% | 89.8% | 10.3% |
| CH — two-hop hierarchical + flat fallback | **55.8%** | 60.8% | 92.2% | 8.2% |

Note the *"match → any claim"* column at 89–93%. Most apparent misses are the
match attaching to a different but equivalent claim — defensible behaviour, not
error. Competition, not judge quality, accounts for the drop from 95% to ~56%.

**CH (55.8%) is therefore the correct baseline for condition E**, not B1's 95%.

### 4.3 The full engine: corpus replay

**Table 5 — condition E configurations, n = 150 (identical triplets throughout)**

| configuration | tripletCorrect | synthRecall | clusterRecall | falseMerge | distSameCluster | counterEdge | clusters |
|---|---|---|---|---|---|---|---|
| baseline — create cluster on empty routing | 61.3% [53, 69] | 67.3% | 80.7% | 8.0% | 71.3% | 47.3% | 56 |
| merge pass (post-seed repair) | 66.0% [58, 73] | 69.3% | 80.0% | 4.7% | 72.0% | 49.3% | 58 |
| **flat fallback** | **75.3%** [68, 82] | 82.7% | 98.7% | 8.0% | 93.3% | 68.0% | **22** |
| flat fallback + creation guard | 79.3% [72, 85] | 86.7% | 100% | 8.0% | 100% | 71.3% | 11 |
| creation guard (cos ≥ 0.70) | 82.0% [75, 87] | 88.0% | 100% | 7.3% | 100% | 72.0% | 11 |

**Table 6 — exact McNemar tests**

| comparison | fixed | broken | p | |
|---|---|---|---|---|
| baseline → flat fallback | +29 | −8 | **0.00075** | *** |
| baseline → creation guard | +34 | −3 | **1.2 × 10⁻⁷** | *** |
| baseline → merge pass | +12 | −5 | 0.14 | ns |
| flat fallback → flat + guard | +9 | −3 | 0.15 | ns |
| flat + guard → guard alone | +9 | −5 | 0.42 | ns |

**The flat fallback captures the entire statistically significant gain.**
Everything beyond it is indistinguishable from it.

**Cost.** 2.85 LLM calls per statement; mean candidate lists of 9.5 synths and
2.7 clusters — both well inside the short-list regime where the judge's 95% was
measured. Approximately \$0.2–0.5 per 1,000 statements at `gpt-4o-mini` rates.

---

## 5. Analysis

### 5.1 Accuracy lives in the judge prompt

The first implementation of the harness used hand-written cluster and synth
prompts rather than the production classifier. Measured on the same 14 triplets,
with the architecture held constant:

| | hand-written prompt | production prompt |
|---|---|---|
| tripletCorrect | 36% | **79%** |
| **falseMerge** | **43%** | **7%** |
| counterEdge | 36% | 79% |

The production prompt carries two defences the hand-written one lacked:

> *CAUTION: a statement may reuse an example's exact wording while taking the
> OPPOSITE stance… Shared phrasing is never evidence of a match.*
> *When in doubt between "expresses" and "none", answer "none".*

plus the ≥ 0.6 confidence gate. **A plausible-looking substitute prompt cost ~40
percentage points.** This is the largest single effect measured anywhere in this
work — larger than every architectural change combined — and it is invisible
without an adversarial test set. We retain the failed run
(`results/sim-e-handrolled-prompt.jsonl`) as evidence.

*Methodological consequence:* an evaluation harness must import the production
classifier, never approximate it.

### 5.2 Hard partitioning is the architecture's dominant failure mode

In the baseline, of 49 matches that failed to reach their anchor's synth,
**29 (59%) never reached the anchor's cluster at all.** The synth judge — the
accurate component — never saw them. Only 20 were genuine synth-step misses.

Fragmentation predicts this loss across datasets:

| Pearson r vs clusters-per-statement | |
|---|---|
| `distractorSameCluster` | **−0.82** |
| `clusterRecall` | **−0.70** |
| `synthRecall` | −0.53 |

| | clusterRecall | synthRecall | distSameCluster |
|---|---|---|---|
| low fragmentation (≤ 0.10 clusters/statement) | 94% | 78% | 85% |
| high fragmentation (> 0.15) | 66% | 58% | 51% |

One dataset kept all 51 statements in a single cluster and scored 100% on both
co-location metrics; another split 51 statements across 11 clusters and fell to
41% / 35%.

Fragmentation also silently destroys the design's structural payoff:
`counterEdgeToAnchor` was only 47.3% in the baseline because a counter-edge can
only form when the distractor lands in its anchor's cluster. **The pro/con
structure is the first thing fragmentation takes.**

### 5.3 The mechanism: a failed router is not a discovery

The baseline created a new cluster whenever routing returned empty. This is the
error. Empirically the statements triggering it were predominantly **matches** —
paraphrases of anchors already in the corpus. Seeding 17 anchors produced 1–4
clusters; the probe phase inflated this to 3–12.

The correct rule already existed in the production code
(`classifyHierarchical`): empty routing means the *router* failed, not that a new
topic was found, so the system falls back to an unrestricted flat search before
concluding anything is new. The source comment states the principle exactly:

> *a gate that filters can misfile; a gate with an ungated second look cannot.*

Reproducing this rule in the simulation yields 61.3% → 75.3% (p = 0.00075), with
31 statements rescued from spawning spurious clusters. Production further skips
routing entirely below 30 claims (`HIERARCHY_MIN_CLAIMS`); our corpora (17–33
synths) sit at that boundary.

### 5.4 Why the highest-scoring configuration is not recommended

Accuracy on this pilot is **monotone in cluster collapse**:

| configuration | clusters | accuracy |
|---|---|---|
| baseline | 56 | 61.3% |
| flat fallback | 22 | 75.3% |
| flat + guard | 11 | 79.3% |
| creation guard | 11 | 82.0% |

The two best configurations place **every dataset in exactly one cluster**. They
do not cluster better; they stop clustering. Since each pilot dataset is a single
deliberation question on essentially one topic, the benchmark *cannot penalise
this*, whereas a genuinely multi-topic deliberation would. Reported
`clusterRecall = 100%` and `distractorSameCluster = 100%` are trivially true at
k = 1; the flat fallback's 98.7% and 93.3% at k = 22 are earned.

We therefore recommend the **flat fallback** — significant, structure-preserving,
and already production's rule — and reject the cosine creation guard on this
evidence, despite its higher raw score. Adopting it would be fitting to a
property of the test set.

### 5.5 A failed experiment, reported

The merge pass (periodically judging cluster pairs for redundancy and merging)
showed no effect (p = 0.14), and the experiment was **mis-designed**: it ran once
after seeding, when only 1–4 clusters existed, whereas fragmentation occurs
during the probe phase that follows. Several datasets generated zero candidate
pairs. It also has a structural ceiling — merging clusters deliberately does not
merge synths, so a repair pass can never improve `synthRecall` or
`tripletCorrect`. **Periodic repair remains untested; this result should not be
read as evidence against it.**

---

## 6. Limitations

1. **The adversary was built for the opponent we replaced.** The distractors were
   generated by GPT-4o to defeat *embeddings*: maximum lexical overlap, flipped
   stance. Nothing in their construction targets an LLM reading the text. Our 95%
   is measured against an attack our method is structurally well-suited to
   resist. Distractors generated adversarially *against a judge* — buried
   negations, scope shifts, conditional hedges, sarcasm — could score materially
   worse. **95% should not be treated as the judge's ceiling.**

2. **Condition E is n = 150,** against n = 875 for conditions A–D. Wilson
   intervals are correspondingly wide (±7pp) and the noise floor is ±5pp.

3. **Single-topic corpora.** Every pilot dataset is one deliberation question.
   The benchmark cannot distinguish good coarse clustering from no clustering,
   which is precisely why §5.4 declines to recommend the highest scorer.

4. **Scale untested.** Corpora reach 51 statements. The candidate-list growth
   that motivates hierarchical routing has not been exercised; conclusions about
   the cluster layer's value at 10³–10⁴ statements do not follow from this data.

5. **Order dependence unmeasured.** Structure depends on arrival order. We used
   one seeded shuffle; order-shuffled replicates were not run.

6. **English-dominant evaluation.** Cross-language results (125/125) come from a
   separate, smaller Hebrew set and were not replayed through the full engine.

7. **Question text is approximate.** The triplet files carry no question; ours
   are reconstructed from the source paper's dataset descriptions.

---

## 7. Conclusions

1. **Cosine similarity cannot decide claim identity.** 0.5% triplet accuracy;
   99.1% of contradictions above the production merge threshold; 0% pipeline
   accuracy. This is not a tuning problem — no threshold exists.

2. **An LLM judge can.** 95.0% in isolation, 2.1% false merges, 95.9% of
   contradictions correctly identified as opposition, and 100% on cross-language
   paraphrases where cosine reaches 0% — at roughly \$0.2–0.5 per 1,000
   statements.

3. **Geometry remains valuable as retrieval.** A 0.45 fetch floor lost no true
   match in any language. The correct division of labour is *cosine retrieves,
   the judge decides*.

4. **Represent claims by raw text.** Summarisation costs 25 points and doubles
   false merges.

5. **Never let a routing layer filter without an ungated second look.** Hard
   partitioning caused 59% of recall loss; treating empty routing as failure
   rather than discovery recovers it (p = 0.00075).

6. **The judge prompt is the single largest lever.** A plausible substitute cost
   ~40 points with architecture held constant.

The recommended configuration reaches **75.3%** on a corpus-replay task, versus
55.8% for the best prior configuration at a comparable false-merge rate — while
preserving the cluster structure that carries pro/con relationships. The dominant
remaining loss is candidate ranking: distractors outrank matches 98.1% of the
time, so a cosine-ordered candidate list is adversarially ordered. Report 2
addresses that directly.
