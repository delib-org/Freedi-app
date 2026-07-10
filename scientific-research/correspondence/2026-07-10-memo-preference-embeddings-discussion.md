# Semantic Structure vs. Preference Geometry — 10 July 2026

**Discussion memo on Blair, Procaccia & Tambe, *"Embeddings for Preferences, Not Semantics,"* from the perspective of the Freedi validation campaign**

*Tal Yaron, Deliberative Democracy Institute (delib.org) — 10 July 2026*
*Prepared for a scientific discussion group; comments and corrections welcome.*

---

## Abstract

Blair, Procaccia & Tambe show that raw cosine similarity on off-the-shelf text embeddings confounds *preferential* similarity (mutual endorsability) with *semantic* nuisance (wording and style), and repair this at training time — via decorrelated preference tuning or a per-topic learned projection — so that a participant's authored text can serve as an "ideal point" from which distance predicts their evaluation of unseen statements. The Freedi synthesis pipeline's June 2026 validation campaign independently surfaced the identical failure mode from the opposite direction: cosine-only clustering merges opposing stances that share vocabulary, which is why Freedi routes ambiguous pairs to an LLM equivalence judge at inference time rather than repairing the geometry itself. This memo (a) lays out the two systems' embedding methods side by side — encoder, conditioning, adaptation, and where each places trust in cosine — and (b) examines the inferential chain the paper's prediction use case depends on: that a participant's text faithfully encodes a stable position (the anchor assumption), that the position is a point in a shared low-dimensional space (the ideal-point assumption, importing a spatial-voting framework with a documented weak-constraint problem in mass-public data), that endorsement decays monotonically with distance (single-peakedness), and that this structure holds from the present into a future the deliberation is meant to change. None of these four links is required by Freedi's own approach to estimating support, which samples real votes rather than imputing them. The memo closes with five scope-condition questions and six concrete, low-cost experiments — including cross-benchmarking Freedi's judge on the paper's public hard triplets and re-clustering Freedi's shipped low-cosine corpus with the paper's released DPT encoder — offered as a basis for joint follow-up rather than as a rebuttal.

---

## 1. Purpose

This memo relates the *Embeddings for Preferences* paper to an independent line of work: the Freedi platform's synthesis pipeline and its June 2026 validation campaign (artifacts and reports: `scientific-research/2026-06-14-synthesis-clustering-validation/`, released GPL-3.0 with shipped embedding vectors and a dependency-free scorer). The two projects examined the same instrument — sentence-embedding geometry over deliberation text — from opposite sides, and reached a striking point of agreement along with an instructive divergence. My aim here is to be precise about both, and to end with concrete experiments rather than positions.

## 2. Two systems, two estimands

The systems are best understood as answering different questions, and each design is rational for its own target.

**Freedi** operates in *statement space*. Its question is: *are these two texts the same proposal?* The pipeline embeds contributions (`text-embedding-3-small`, question-conditioned), clusters geometrically (UMAP → DBSCAN), and then applies a medoid-anchored two-tier judge: cosine ≥ 0.94 auto-accepts, < 0.60 auto-rejects, and the gray band between them receives one LLM equivalence verdict per pair. The output is a set of merged proposals ("synths") organized into topics. For the separate question of *how much support each proposal has*, Freedi does not predict: it samples. Options are shown to random subsets of participants, and aggregate support is estimated design-based from actual votes, with quantifiable sampling error.

**Blair–Procaccia–Tambe** operate in *participant space*. Their question is: *how would participant v evaluate statement j, absent a vote?* They fit an ideal-point model — the participant's authored text, embedded, is the anchor; utility is (negative squared) distance in a learned preference subspace — via decorrelated preference tuning (DPT) or a per-topic rank-20 projection learned from votes. The motivation is clear and, I think, correct on its own terms: facility-location, fair-clustering, and slate-selection algorithms require a *complete* participant × statement utility matrix, which no sampling scheme can fill.

So the divergence is not methodological taste; it is the estimand. Freedi's consensus mechanism needs per-statement aggregate distributions, for which sampling is unbiased and cheap. Their algorithmic agenda needs dense individual utilities, for which some imputation is unavoidable. A useful framing question for the group: *for deliberation platforms specifically, which estimand should drive design?*

## 3. The embedding methods themselves, side by side

Before the conceptual questions, it is worth being concrete about how differently the two systems *produce and use* their vectors, because several downstream disagreements trace back to these choices.

| Dimension | Freedi | Blair–Procaccia–Tambe |
|---|---|---|
| **Base encoder** | OpenAI `text-embedding-3-small` (1536-d), consumed as an API — no model weights held | sentence-T5-XL (~3B params), self-hosted, weights modified |
| **Conditioning** | Question-aware context template (`Question: {q}\nAnswer: {t}`) — each vector encodes the statement *relative to the deliberation question* | Statement embedded standalone; topic-specificity added later via the per-topic projection, learned from votes |
| **Adaptation** | None. The encoder is used off-the-shelf, frozen | Two variants: (a) DPT — LoRA fine-tuning on ~synthetic counterfactual hard triplets, Bradley-Terry loss over cosine differences; (b) rank-20 linear projection fit on a frozen encoder from participant votes |
| **What the geometry is asked to capture** | *Semantic identity* — "same proposal?" High cosine is a candidate for merging, nothing more | *Preferential similarity* — "mutually endorsable?" Distance is the utility estimate itself |
| **Where stance is handled** | Outside the geometry, at inference time: a gray-band (0.60–0.94) LLM equivalence verdict per candidate pair | Inside the geometry, at training time: hard triplets teach cosine to down-weight the wording/nuisance subspace (Theorem 1) |
| **Trust placed in cosine** | Deliberately low — cosine only *routes* (auto-accept / ask the judge / auto-reject); it never decides a hard case alone | Deliberately high — after tuning, cosine (or projected distance) *is* the decision, with no per-pair verification |
| **Determinism** | Clustering deterministic (fixed UMAP seed, shipped vectors); LLM verdicts non-deterministic and excluded from scoring | Fully deterministic at inference once trained; training variance reported across seeds |
| **Domain/language reach** | Whatever the API model and the judge LLM cover — zero-shot on new topics and languages | Tuned on English political/social issues; transfer beyond that distribution untested |

The philosophical difference is in the "trust placed in cosine" row. Freedi's design treats embedding geometry as a *cheap candidate generator* whose known failure modes (stance inversion, paraphrase drift) are caught by a stronger reader downstream. The paper's design treats geometry as *repairable* — invest once in training so the space itself becomes trustworthy, because their downstream algorithms cannot afford a per-pair oracle. Both are coherent responses to the same diagnosed defect; they differ in where the correction budget is spent (inference-time tokens vs. training-time gradient steps), and consequently in marginal cost, determinism, and domain generality, as the table shows.

One further asymmetry deserves note: Freedi's question-conditioned embedding means its vectors are *already* topic-specific at creation time, at zero training cost — arguably a lightweight cousin of what the per-topic projection achieves with votes. Whether question-conditioning alone recovers part of the projection's gain is an easy ablation neither project has run (added to §8 below).

## 4. Where the two projects converge — and this deserves emphasis

Both projects independently discovered, and documented in the same month, the same failure mode of raw cosine similarity on deliberation text.

- The paper's Table 1: a stance-reversed rewording of an anchor scores cosine **0.87**, while a stance-preserving restatement in fresh words scores **0.82** — the distractor wins. On 875 engineered hard triplets, base encoders score between **6.3% and 48.3%**, at or below chance.
- Freedi's negation validation run (4 June 2026): the cosine-only clustering path conflated each pro/anti pair ("make peace" / "do *not* make peace") into a single cluster; only the LLM equivalence tier separated them, yielding 4 stance-pure synths with zero cross-stance contamination (20/20 members assigned after a linkage refinement).

These are the same phenomenon observed from two directions, and I want to acknowledge plainly that the paper's formal account of it — the decomposition of the cosine margin into a preference-subspace term and a nuisance term, with Theorem 1 showing that hard-triplet training provably down-weights the nuisance — is the cleanest explanation I have seen of *why* Freedi's LLM-judge tier is necessary at all. Our validation reports assert the failure empirically; the paper explains it. That is a genuine contribution from our vantage point, independent of everything below.

It is also worth noting that the paper's own limitations section already concedes the key boundary — that the geometry "should not be treated as a perfect representation of any individual's considered judgment and should not be used as a basis for binding decisions." The questions in §4 are therefore offered in the spirit of mapping scope conditions the authors have themselves signposted, not of contesting claims the paper does not make.

## 5. The user-prediction question: what licenses "distance → future evaluation"?

This is the crux of the memo, so I want to state it carefully before itemizing.

The claim "embedding distance estimates how a participant will evaluate a statement" is not one assumption but a **chain of four**, each of which must hold for the next to matter:

1. **Text → mind.** The participant's authored comment faithfully encodes their position (the anchor assumption).
2. **Mind → point.** That position is representable as a location in a low-dimensional shared space (the ideal-point assumption).
3. **Agreement → proximity.** Endorsement decays monotonically with distance from that point (single-peakedness).
4. **Present → future.** The location is stable enough that distances computed today predict evaluations tomorrow — including *after* deliberation, whose explicit purpose is to move positions.

The paper's evaluation validates the chain only *retrodictively*: triplet accuracy against votes already cast, in the same period, under participant splits — never a temporal split. The empirical support for the chain on natural data is real but modest (68.6% without votes, 77.6% with), and the mechanism supplying it is worth naming plainly: **people who share a stance tend to share vocabulary**, so textual proximity correlates with agreement sociologically, not semantically. The paper's own hard-triplet result is the proof — when wording and stance are decoupled by construction, untuned cosine collapses to 6–48%, showing the natural-data signal rides substantially on the wording coincidence. DPT strengthens link 3's geometry but leaves links 1, 2, and 4 untouched: a single pre-deliberation text still anchors the person, and no test spans opinion change.

Freedi's architecture, for contrast, needs none of the four links: support for each proposal is estimated from sampled *actual* evaluations, so the "prediction" is a design-based statistical inference with quantifiable error, valid regardless of whether minds are points or texts are faithful. The cost of that luxury is stated in §2 — sampling cannot fill a complete person × statement matrix, which is what the paper's algorithmic agenda requires. The chain above is the price of the matrix.

With the chain explicit, the five questions below each probe one link.

## 6. Questions about the preference-geometry assumptions

I organize these as five scope-condition questions, roughly from the most operational to the most conceptual. (Q1 probes link 4, Q2 link 1, Q3 link 2, Q4 the chain's error structure, Q5 link 3.)

**Q1 — Temporal scope.** The triplet evaluation is retrodictive: it checks consistency with held-out votes cast in the same period, under participant-level splits. There is, as far as I can tell, no temporal split — no "train on early votes, predict later votes." For deliberation this matters more than usual, because opinion change is not noise in the data; it is the intended product of the process. A geometry anchored to a participant's pre-deliberation text is structurally committed to their pre-deliberation position. *Question: how does triplet accuracy behave under a temporal split, especially across documented deliberation events?*

**Q2 — The anchor assumption.** A single authored comment stands in for the participant's ideal point. Two concerns: coverage (in our deployments, most participants evaluate but never author — the method is silent about them) and facets (one comment addresses one aspect of an issue, yet anchors predictions across all of it). *Question: how sensitive are the results to anchor choice when a participant has authored multiple texts, and what is proposed for non-authors?*

**Q3 — Attitude constraint.** The ideal-point model inherits an assumption with a long history: that positions bundle, so agreement with one statement from a "camp" predicts agreement with its neighbors. Converse's classic finding (1964) is that mass publics exhibit far less of this constraint than elites; spatial models that explain ~90% of legislative roll-call votes degrade substantially on ordinary citizens. The paper's own numbers — **68.6%** triplet accuracy without votes, **77.6%** with per-topic votes — sit exactly where that literature would predict for citizen data. A rank-20 subspace can in principle represent cross-cutting positions (a participant who affirms bodily autonomy *and* is troubled by ending fetal life occupies a quadrant, not a contradiction), but a single text anchor cannot locate a person on dimensions they did not write about. *Question: do the authors read their ~70–78% ceiling as measurement noise, or as the Converse constraint gap? The distinction matters for what more training data can buy.*

**Q4 — Error structure (I believe this is the most consequential question for deliberative applications).** If the errors were random, a ~75%-accurate prior would be unambiguously useful. But there is a specific reason to suspect they are systematic: the participants who best fit a spatial model are the most ideologically constrained — the predictable partisans — while the participants who break it are the cross-pressured, ambivalent, bridge-building ones. If per-participant accuracy is negatively correlated with ambivalence, then downstream uses (room composition, representative slates) would be most accurate about the participants who least need deliberation and least accurate about precisely those a deliberative process exists to surface. This is testable with data the authors already have: *correlate per-participant triplet accuracy with an ambivalence index computed from that participant's observed vote pattern (e.g., cross-cluster approval entropy).* If the correlation is near zero, my concern dissolves; if it is strongly negative, it defines the method's safe operating envelope.

**Q5 — Single-peakedness.** Distance-based utility assumes support decays monotonically from the ideal point. Deliberation data plausibly contains the opposite pattern — participants who prefer either of two coherent, complete proposals over an averaged midpoint ("compromise aversion"). A distance scorer cannot express this preference structure at any rank. *Question: is there evidence in the Polis/Remesh vote matrices for or against single-peakedness at the individual level?*

For symmetry, the standing limitation on Freedi's side of the ledger: our validation corpora are LLM-authored synthetic sentences, disclosed in every report as a threat to validity — clean recovery there is necessary, not sufficient, and robustness on production-derived human text remains our main open item. The paper's evaluation, on 11 real datasets, 1,462 participants, and 1.46M triplets, is considerably stronger on exactly the dimension where ours is weakest. Neither project should be shy about saying what the other does better.

## 7. A brief note on deployment economics

For completeness, since the question arises whenever LLM-in-the-loop designs are compared with trained geometries: at deliberation scale (10²–10⁴ statements), Freedi's marginal costs are small — embeddings are fractions of a cent per corpus, and gray-band judge calls (capped at min(2000, 0.2N)) cost on the order of $10⁻⁵ each, so a full bulk pass runs to pennies with zero idle cost on serverless infrastructure. Self-hosting a 3B-parameter tuned encoder costs roughly $200–500/month regardless of traffic; the break-even against per-call judging sits in the millions of comparisons per month, far above deliberation-platform volumes. Two exceptions cut the other way, though: (a) the per-topic projection is encoder-agnostic and essentially free to fit, and (b) at Polis-like scale with dense routing decisions, a geometry's zero marginal cost begins to matter. The economics, like the estimands, are use-case-relative.

## 8. Proposed experiments

Each of these is cheap, and several could be run jointly.

1. **Cross-benchmark the judge.** Run Freedi's LLM equivalence judge over the paper's 875 public hard triplets and report the score alongside the tuned encoders' 80%. This replaces my mechanism-level argument (cross-encoders beat bi-encoders on pair judgments) with a measured number on the authors' own benchmark, real-participant anchors included. Estimated cost: under one dollar.
2. **DPT vectors into Freedi's pipeline.** Re-cluster Freedi's shipped loose-corpus embeddings (within-synth cosine 0.727–0.896; 6/12 synths fragmented under the base geometry) using the released DPT-tuned encoder. If DPT pulls same-stance/different-wording pairs together as designed, fragmentation should drop and Freedi's gray band — its only per-run LLM cost — should shrink. This is a direct, artifact-level test of whether the paper's training objective helps a synthesis pipeline it was not designed for.
3. **Projection portability.** Fit the paper's rank-r projection on frozen *API* embeddings using Freedi's evaluation votes, testing whether the recipe transfers off self-hosted encoders. If it does, the projection becomes deployable at near-zero cost on any platform.
4. **Temporal-split evaluation** (Q1) on any of the Polis conversations with timestamps.
5. **Error-structure audit** (Q4): per-participant triplet accuracy against vote-pattern ambivalence, on data already in hand.
6. **Question-conditioning ablation** (§3): embed the paper's evaluation statements with Freedi's `Question: {q}\nAnswer: {t}` template on the same base encoder and measure how much of the per-topic projection's gain the conditioning alone recovers — a zero-training baseline neither project has reported.

Freedi can contribute its validation artifacts (all committed, with exact input vectors), and — subject to privacy review — production-derived corpora as a shared testbed for both projects' open items.

## 9. Summary

The paper and the Freedi campaign agree on the central empirical fact: raw embedding cosine confounds stance with wording, and any deliberation system that trusts it unrepaired will merge opposites and scatter paraphrases. The projects then repair it in opposite places — the paper at training time, so that geometry alone can serve algorithms needing dense utility matrices; Freedi at inference time, with an LLM tier for semantic verdicts and design-based sampling for support estimation. The open questions above are not objections to the paper's program but attempts to locate its boundary: retrodiction versus prediction under opinion change, single-text anchors, the constraint assumption, the structure of the residual error, and single-peakedness. Several are answerable with existing data, and I would welcome the chance to answer them together.

---

*References informally cited: Converse (1964), "The Nature of Belief Systems in Mass Publics"; Poole & Rosenthal spatial roll-call models; Alvarez & Brehm on ambivalence; the paper's own §8 limitations. Freedi artifacts: `scientific-research/2026-06-14-synthesis-clustering-validation/` (validation reports, shipped vectors, scorer). Paper artifacts: github.com/cartgr/Embeddings-for-Preferences; hf.co/cartgr/embeddings-for-preferences-st5-xl.*
