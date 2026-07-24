# Closing the Loop: Preference Geometry and LLM Judgment as a Single System

### On combining decorrelated preference tuning (Blair, Procaccia & Tambe) with the ELJ claim registry

**Authors:** Tal Yaron, Claude (Anthropic) · **Date:** 2026-07-24
**Companion:** `REPORT-1-ELJ-ENGINE.md`
**Subject paper:** Carter Blair, Ariel D. Procaccia, Milind Tambe, *Embeddings for Preferences, Not Semantics.*

---

## Abstract

Two independent lines of work reach the same diagnosis — off-the-shelf sentence
embeddings encode topic and wording, not stance — and adopt opposite remedies.
Blair et al. **repair the geometry**, fine-tuning an encoder on synthetic hard
triplets (48.3% → 80.0% triplet accuracy) or learning a per-topic rank-20
projection from participant votes (81.1%). We **bypass the geometry**, demoting
cosine to a candidate ranker and putting an LLM judge on every decision (95.0% in
isolation, 75.3% in a live corpus replay).

This report argues the two are not competitors but the two halves of one system,
and identifies a **closed loop** neither has alone:

- Their tuned geometry solves our dominant remaining failure — candidate lists
  ordered adversarially, with distractors outranking true matches **98.1%** of
  the time.
- Our claim registry solves their stated open problem — obtaining topic-specific
  supervision without per-topic votes. Their paper names this as future work; our
  engine already emits it as a by-product of normal operation.

We specify four hybrid architectures, give quantitative predictions with the
evidence behind each, and set out the experiments that would test them. We also
identify a shared blind spot: **both methods have been validated only against
adversarial examples engineered to defeat embeddings**, and a combined system
requires an adversary built against LLM judgment.

---

## 1. One diagnosis, two remedies

### 1.1 The agreement is exact

| | Blair et al. | This work |
|---|---|---|
| cosine cannot see stance | base encoders 6.3–48.3% on hard triplets | `text-embedding-3-small`: **0.5%** |
| distractors beat matches | "rank the semantic distractor above the preference match 70–95% of the time" | **863/880 = 98.1%** |
| natural-data signal is illusory | 50pp drop, natural → hard | 99.1% of contradictions score ≥ 0.85 |

Their §4.1 supplies the theory for what we measured empirically. The cosine
margin decomposes as

> s(a,p) − s(a,n) = Δ_S + Δ_T

where Δ_S lies in the stance-relevant subspace and Δ_T is nuisance (wording,
style, topic). Cosine weights both equally. On natural deliberation data the two
correlate; hard triplets break the correlation and cosine collapses.

This explains our operational finding precisely: **0.85 is safe as a fetch floor
and catastrophic as a decision threshold**, because the 0.85 is mostly Δ_T. Their
formalism is the "why" behind our Table 2.

### 1.2 The remedies are orthogonal

```
statement pair
   │
   ├─ EMBED ────► THEIR FIX: change the geometry
   │              DPT fine-tune (§5) or per-topic rank-20 projection (§7)
   │              → cosine itself becomes preference-aware
   │
   └─ DECIDE ───► OUR FIX: never let geometry decide
                  cosine ranks only; LLM returns expresses/opposes/none
```

Orthogonality is the point: **one changes the representation, the other changes
the decision rule.** Nothing prevents doing both.

### 1.3 Comparative performance, read carefully

| system | task | score |
|---|---|---|
| base ST5-XL | rank: cos(a,match) > cos(a,distractor)? | 48.3% |
| base BGE-large / all-mpnet | same | 6.3% / 8.2% |
| our `text-embedding-3-small` | same | 0.5% |
| **DPT-tuned ST5-XL** | same | **80.0%** |
| **per-topic rank-20 projection** | same | **81.1%** |
| **our LLM judge (isolated)** | **decide**: attach match ∧ reject distractor | **95.0%** |
| our full engine (live corpus) | file into correct synth among ~20 rivals | 75.3% |

**These are different tasks.** Theirs is a *ranking* metric — does one similarity
exceed another. Ours is a *decision* metric with a threshold: the match must
clear confidence ≥ 0.6 *and* the distractor must fail to. Ranking is strictly
easier; a system can rank correctly while attaching both or neither. The honest
statement is narrow: **on these instances, LLM judgment decides stance more
reliably than any geometry tested, tuned or not** — at roughly 10⁴× the cost per
comparison.

---

## 2. What each method cannot do

| | DPT / projection | ELJ |
|---|---|---|
| inference cost | **a dot product** | 2–3 LLM calls (~\$0.2–0.5 / 1k statements) |
| latency | negligible | 1–2 s per statement |
| demonstrated scale | 1.46M pairwise preferences | 10³ statements |
| training data | synthetic triplets, or per-topic votes | **none** |
| cold start | projection needs ~50 labelled triplets *for that topic* | works from statement #1 |
| output | continuous metric space | discrete claim graph + counter-edges |
| downstream | facility location, k-median, proportional representation, ideal points, utilities for unvoted statements | dedup, canonical claims, pro/con structure, synthesis |
| explanation | a number | a verdict with a stated reason |

Two asymmetries drive everything that follows.

**Scale.** Scoring 1.46M pairwise preferences with an LLM judge is financially
absurd. Producing an auditable pro/con claim graph from a projection is
impossible — a distance never says *"this opposes that, because…"*.

**Cold start.** Their strongest result (81.1%) requires participant votes **on
that topic**. A newly opened question has none. This is exactly the gap the claim
registry was built to close, and it is where the loop closes in §3.2.

---

## 3. Four hybrid architectures

### 3.1 Architecture A — DPT-ranked ELJ (retrieval upgrade)

**Change.** Replace `text-embedding-3-small` with a DPT-tuned encoder *for
ranking only*. The judge, its prompt, and the attach rule are untouched.

**Why it should work.** Report 1 §7 identifies candidate ranking as the dominant
remaining loss. Because distractors outrank matches 98.1% of the time, a
cosine-ordered candidate list is **adversarially ordered**: the top of every list
is populated by the statements most likely to be contradictions. Production caps
retrieval at the top 10 neighbours (`NEIGHBOR_LIMIT = 10`). At corpus scale, the
true match can be pushed out of the window before the judge ever sees it — an
error no judge improvement can recover.

**DPT targets this exact failure.** It moves triplet ranking from 48.3% to 80.0%,
i.e. it promotes the true match above the stance-flip — which is precisely what
top-K truncation needs.

**Predicted effects, with evidence:**

| effect | mechanism | supporting number |
|---|---|---|
| higher recall at fixed K | true match rises in rank | ranking 48.3% → 80.0% |
| lower cost at fixed recall | shorter lists suffice | judge cost \$0.11/1k (short lists) vs \$0.41/1k (94-entry lists) — **3.7×** |
| better cross-language recall | tuned space is stance-, not wording-driven | 0% of Hebrew matches reach cosine 0.85 today |

**Caveat.** At pilot scale this is untestable: mean candidate lists were 9.5
synths and 2.7 clusters, so truncation never binds. **Architecture A is a scaling
intervention and must be evaluated at 10³–10⁴ statements**, where the top-10 cap
becomes active.

### 3.2 Architecture B — Registry-supervised projection (the closed loop)

**This is the most important idea in this report.**

Blair et al. close their paper with an open problem:

> *"the gap between the universal tune and the per-topic projected embedding
> suggests that preferences have both a shared component across topics and a
> topic-specific component that only voting data on that topic recovers. A
> natural next step is to generate hard triplets conditioned on a target topic,
> producing a topic-specific embedding without per-topic votes."*

**The ELJ claim registry is a topic-conditioned hard-triplet generator, and it
runs anyway.** Every judgment it makes is a label:

| judge verdict | supervision produced |
|---|---|
| `expresses` (same synth) | a **positive pair**: same stance, different wording — a *preference match* |
| `opposes` (counter-edge) | a **hard negative**: same subject, opposite stance — a *semantic distractor* |

That is exactly the (anchor, match, distractor) structure DPT trains on. Compare
how each side obtains it:

| | Blair et al. | ELJ registry |
|---|---|---|
| source | 2,000 issues (Habermas Machine + Kialo), GPT-4o-mini filter, Claude Sonnet 4 opinion generation, GPT-4o rewriting | **real participant statements** |
| domain | synthetic, generic political/social | **the actual live question** |
| cost | a dedicated generation pipeline | **zero — a by-product of filing** |
| topic conditioning | none (universal tune) | **inherent** |

In our 150-triplet pilot the engine produced 218 synths and their counter-edges
from 450 statements. A real deliberation of a few thousand statements would yield
triplet counts of the same order as their synthetic corpus — **in-domain, on the
target topic, with no votes required.**

Their Figure 3 shows the rank-20 projection crossing the universal DPT tune at
roughly **50 labelled triplets**. A registry reaches that volume within the first
few hundred statements of a single question.

**The loop:**

```
   registry files statements ──► emits same-meaning + opposes pairs
            ▲                                    │
            │                                    ▼
   shorter, better-ordered            fits a topic-specific rank-20
   candidate lists; cheaper,          projection (no votes needed)
   higher recall                                 │
            └────────────────────────────────────┘
```

Each component supplies the other's missing input. The registry needs a
preference-aware ranker and cannot train one; the projection needs topic-specific
supervision and cannot generate it.

### 3.3 Architecture C — Geometry-gated judging (cost control)

**Change.** Use the tuned geometry to decide *when* to spend a judge call. In an
extreme-confidence band, decide geometrically; call the judge only inside the
ambiguous margin.

**Rationale.** Our objection to geometry-as-decision was measured on *base*
cosine, where confidence is meaningless (distractor median 0.969 *above* match
median 0.871). A preference-tuned space does not share that pathology; Blair et
al. report the tuned/projected geometry tracks continuous Likert ratings better
than the base model.

**Risk — stated plainly.** This reintroduces geometry as a decision-maker, which
Report 1 argues against. At 80–81% triplet accuracy, ~20% of ranking decisions
are still wrong. The defensible version calibrates the bands so that the
geometry-only path carries a measured false-merge rate no worse than the judge's
2.1%, and **fails toward the judge** whenever in doubt. If that calibration is
not achievable, the architecture should be dropped rather than tuned into
plausibility.

**Recommendation:** evaluate only after A and B; treat as an optimisation, never
as an accuracy claim.

### 3.4 Architecture D — Division of labour across the product

Not a merge but a boundary. The two methods answer genuinely different questions:

| question | method | Freedi surface |
|---|---|---|
| *"is this the same claim?"* | ELJ registry | dedup, canonical claims, pro/con, synthesis |
| *"would this participant endorse this?"* | preference geometry | deliberation-group formation, slate selection, proportional representation, participation analytics |

Blair et al.'s §8 targets are grouping participants, selecting slates, fair
representation — social choice, not deduplication. Their own limitations section
cautions that the geometry "should not be used as a basis for binding decisions."
Neither method should be stretched into the other's question.

---

## 4. Experimental programme

Ordered by information gained per unit cost.

**E1 — Rank diagnostic (cheap, no training).**
For every triplet, record the rank of the true match in the candidate list under
(a) `text-embedding-3-small`, (b) an off-the-shelf ST5-XL, (c) the published
DPT-tuned ST5-XL. Report rank-of-match distribution and recall@K for K ∈ {1, 5,
10, 20}. *This alone quantifies how much Architecture A can possibly buy, before
any integration work.* The DPT model is published
(`huggingface.co/cartgr/embeddings-for-preferences-st5-xl`).

**E2 — Condition E with a DPT ranker.**
Re-run the condition E flat-fallback configuration with retrieval swapped to the
DPT encoder; judge unchanged. Primary metric: `synthRecall` at fixed candidate
budget. Secondary: judge tokens per statement. Powered for the ±5pp noise floor —
n = 150 will not resolve small effects; use the full 875.

**E3 — Scale test (the decisive one for Architecture A).**
Build corpora of 10³–10⁴ statements so the top-10 retrieval cap binds. Compare
base vs DPT ranking on recall and cost. **Architecture A's value is invisible
below this scale**, so E2 alone cannot settle it.

**E4 — Registry-as-supervision (Architecture B).**
From registry output on a single question, extract same-synth positives and
counter-edge negatives; fit a rank-20 projection; evaluate on held-out triplets
*from that question*. Key comparisons: registry-supervised projection vs
vote-supervised projection (81.1%) vs universal DPT (80.0%). Sweep supervision
volume to locate the crossover their Figure 3 puts at ~50 triplets.

**E5 — Judge-adversarial triplets (see §5).**
Generate distractors designed to defeat an LLM judge, not an embedding. Re-measure
both methods. This is the highest-value experiment for scientific validity, and
the least likely to flatter either.

---

## 5. The shared blind spot

The 875 hard triplets were generated by **GPT-4o rewriting anchors to maximise
lexical overlap while flipping stance** — an attack engineered against
*embeddings*. Nothing in their construction targets a model that reads the text.

This asymmetry cuts against our numbers specifically. Our judge scores 95% against
an adversary purpose-built to defeat the component we replaced. Blair et al. have
no such asymmetry: their adversary and their solution live in the same
representation, so their 80% is measured against a genuinely matched threat.

An LLM-targeted adversary would look different — negation buried in a subordinate
clause, scope or quantifier shifts ("some" → "all"), conditional hedges,
counterfactual framing, sarcasm, statements that agree on policy but differ on
justification. There is no evidence in this work about how either method performs
there.

**Consequence for the hybrid.** A combined system inherits both evaluation gaps.
Before deployment claims are made, E5 must run. We consider 95% an upper bound
whose tightness is unknown.

---

## 6. Assessment

**The complementarity is real, not rhetorical.** Each method's principal weakness
is the other's output:

| weakness | whose | what fixes it |
|---|---|---|
| candidate lists ordered adversarially (98.1% inversion) | ELJ | DPT ranking (48.3% → 80.0%) |
| judge cost scales with list length (3.7× measured) | ELJ | better ranking → shorter lists |
| best result needs per-topic votes; cold start | theirs | registry-emitted topic-conditioned triplets |
| no explanation, no claim structure | theirs | ELJ verdicts and counter-edges |

**Recommended sequence.** E1 first — it is nearly free and bounds the upside of
the entire programme. If rank-of-match improves materially, proceed to E4
(Architecture B), which is the scientifically novel contribution: a system whose
own operation generates the supervision that makes it cheaper, answering an open
problem the source paper explicitly poses. E3 decides whether Architecture A
matters in production. Architecture C only after A and B, and only if it can be
calibrated to a measured false-merge ceiling. E5 governs how strongly any of it
may be claimed.

**Expected end state.** A deliberation platform where a preference-tuned geometry
retrieves and orders candidates cheaply at scale, an LLM judge makes every
identity decision with a stated reason, and the resulting claim graph feeds back
as topic-specific supervision that continuously sharpens the geometry. Neither
method reaches that alone: one cannot afford to decide, the other cannot afford
to search.
