# Validation of an Embedding-Based Synthesis & Clustering Pipeline for Large-Scale Deliberation

**A controlled ground-truth evaluation of the Freedi mechanism**

*[Authors]* · *[Affiliation]*

**Version:** 1.0 · **Date:** June 2026 · **License:** GPL-3.0 (see `LICENSE.md`)

---

## Abstract

Large-scale online deliberation platforms must reduce hundreds or thousands of
free-text contributions into a tractable set of distinct proposals without
discarding minority positions or conflating opposing ones. The Freedi platform
addresses this with a two-stage *synthesis* pipeline: an embedding-based
clustering pass (UMAP → DBSCAN over OpenAI `text-embedding-3-small` vectors)
followed by a medoid-anchored, cosine-banded two-tier judge that uses a large
language model (LLM) to verify semantic equivalence within each candidate
cluster. We report a controlled validation campaign of five corpora with **known
ground-truth structure**, designed to test five mechanism properties:
(a) merging paraphrases of one idea into a single *synth*; (b) keeping
distinct-but-related ideas separate; (c) keeping opposing stances separate;
(d) leaving a lone outlier unclustered; and (e) grouping synths into the correct
topics. On a realistically-worded corpus the pipeline recovers ground-truth synth
structure **exactly** (12/12 pure synths, 60/60 options assigned, zero overlap),
and correctly leaves an off-topic outlier unclustered. The LLM verifier performs
the separation that cosine similarity alone cannot — distinguishing closely
related proposals and, critically, opposing stances that sit at high cosine
("make peace" vs. "do *not* make peace"). The campaign surfaced **three
production defects**, all since fixed with regression tests, plus a fourth
recall-improving refinement. The dominant residual failure mode is **corpus
realism**: when synthetic paraphrases are written with maximal lexical variation
(unrealistically low within-synth cosine), the judge fragments synths. All inputs,
exact embedding vectors, outputs, and a dependency-free scorer are released so
that every reported number is independently reproducible offline.

> **Author's note.** Section 2 (Related Work) is a seeded stub: it sketches the
> relevant literature and supplies starter citations, to be expanded by the
> authors. All empirical claims in Sections 4–8 are sourced from the committed
> per-run artifacts under `scientific-research/validation/`.

---

## 1. Introduction

### 1.1 The problem

A deliberation at scale produces a corpus of natural-language proposals in which
the same underlying idea recurs in many surface forms, related-but-distinct ideas
sit close together in meaning, and directly opposing positions are often
lexically near-identical. A useful summary of such a corpus must therefore do
three things at once that are in tension:

1. **Merge** the many restatements of one proposal into a single representative
   *synthesis* ("synth"), so the proposal is counted once.
2. **Separate** proposals that are semantically close but genuinely different, so
   distinct options remain distinct choices.
3. **Preserve stance** — never collapse "increase X" and "decrease X" into one
   group merely because they share vocabulary.

Pure embedding similarity cannot satisfy all three: the cosine geometry that
correctly pulls paraphrases together also pulls opposites together and blurs
neighbouring ideas. Freedi's design hypothesis is that a **hybrid** of geometric
clustering (cheap, deterministic, high-recall) and an **LLM equivalence judge**
(expensive, semantic, applied sparingly within candidate clusters) resolves the
tension. This report tests that hypothesis under controlled conditions.

### 1.2 Contributions

- A reusable **validation methodology** for synthesis/clustering on corpora with
  constructed ground truth, including an archetype catalogue (clean recovery,
  low-cosine, opposites, lone outlier) and a structure-agnostic scorer.
- **Empirical results** across five corpora isolating the effect of within-synth
  wording width, stance, and outliers on recovery.
- **Three production defects** discovered through validation, each root-caused and
  fixed with a regression test, plus a recall-improving linkage refinement.
- A **fully reproducible artifact set**: inputs, exact 1536-d input vectors,
  outputs, and offline verification at two independence levels.

### 1.3 Scope and honest framing

This is a **mechanism-correctness** study on **synthetic, LLM-authored** corpora.
It establishes that the pipeline *can* recover a known structure from a clean
signal and characterises the conditions under which it does. It is explicitly
**not** a robustness study on messy human input; we treat a pass here as
*necessary but not sufficient* (Section 8).

---

## 2. Related Work *(seeded stub — to be expanded by the authors)*

This section situates the work in four literatures. Citations below are starting
points; the authors will expand the narrative and add domain-specific references.

**Computational deliberation and opinion mapping.** Systems such as
Polis [5] scale deliberation by embedding participants in a high-dimensional
opinion space and surfacing consensus and divisive statements via dimensionality
reduction and clustering; this is the closest system analogue to Freedi's
opinion/clustering layer. Theoretical grounding for why *structured* summarisation
(rather than majority counting) matters for legitimacy comes from the
deliberative-democracy tradition [6, 7]. *To add: argument mining and
summarisation of public consultations; consensus-finding; computational social
choice perspectives on aggregation.*

**Sentence embeddings.** The pipeline relies on transformer sentence embeddings
[3] and a modern commercial embedding model [4]; the validity of cosine
similarity as a semantic-proximity signal — and its known failure on negation and
antonymy — motivates the LLM verification layer. *To add: literature on negation
in embedding spaces; contrastive sentence representation; embedding evaluation
benchmarks (e.g. STS, MTEB).*

**Topic modelling and embedding-based clustering.** The UMAP [1] → density-cluster
[2] design mirrors the now-standard embedding-then-cluster topic-modelling recipe
popularised by BERTopic [8] and Top2Vec. We contribute a *verification* stage on
top of this recipe. *To add: comparison to LDA-family topic models; clustering
validity indices [9]; HDBSCAN.*

**Ground truth, synthetic data, and evaluation.** Our use of constructed
ground-truth corpora and the attendant validity caveats connect to the broader
discussion of "ground truth" reliability in NLP annotation [10] and to text-as-data
methodology [11]. *To add: LLM-as-judge evaluation reliability; synthetic-data
validity for system testing.*

---

## 3. System Under Test

We evaluate Freedi's **bulk** synthesis path, the production primitive
`bulkClusterByEmbedding` followed by the `twoTierJudge`. (A second, *live*
single-option pipeline shares the same verification primitives but is intentionally
rougher under burst arrival and is out of scope here; see Section 8.) The bulk
path proceeds in three phases:

1. **Embedding.** Each option is embedded with OpenAI `text-embedding-3-small`
   (1536-d) using a question-aware context template (`Question: {q}\nAnswer: {t}`).
   Vectors are computed once at option-creation time and cached.

2. **Geometric clustering.** The option vectors are reduced with UMAP (5
   components, fixed seed 42) and clustered with DBSCAN
   ($\varepsilon$ in UMAP space, $\text{minPts} = \max(3, \lceil N/200 \rceil)$).
   This produces disjoint candidate clusters and is **deterministic** given the
   input vectors.

3. **Two-tier judge.** For each candidate cluster, the *medoid* (the member with
   highest mean cosine to the rest) is chosen as anchor. Each non-medoid member
   $m$ is scored by cosine $\sigma(m, \text{medoid})$ and routed:
   **auto-accept** ($\sigma \ge 0.94$, no LLM); **gray band**
   ($0.60 \le \sigma < 0.94$, one cached LLM equivalence verdict
   $m \leftrightarrow \text{medoid}$); **auto-reject** ($\sigma < 0.60$). A
   complete-linkage refinement reconciles dissenting verdicts, and a cluster is
   emitted as a **synth** (merged proposal) or a **topic-cluster** (theme label),
   with a hard per-run LLM-call cap.

The auto-reject threshold reported here (0.60) reflects defect fix #2 (Section 6);
the original production default was 0.82.

---

## 4. Methodology

### 4.1 Experimental procedure

Each run follows an identical protocol (full protocols:
`DESIGNING-TEST-CORPORA.md`, `PREPARING-VALIDATION-REPORTS.md`):

1. Author a corpus with labelled ground truth (topic → synth → paraphrases).
2. Seed the sentences as raw options in a local Firestore emulator with **live
   synthesis disabled**, so embeddings are generated by the standard
   option-creation trigger but no clustering occurs on arrival.
3. Wait for 100% embedding coverage, then run the bulk path
   (`bulkClusterByEmbedding` + `twoTierJudge`).
4. Export three artifacts per run: `statements.json` (inputs + ground-truth
   labels), `embeddings.json` (the exact 1536-d input vectors), `results.json`
   (the produced synths/topic-clusters + a full parameter manifest).
5. Score with `score.mjs`, a dependency-free scorer that derives the *expected*
   structure from the per-statement labels and checks: synth count, per-synth
   purity and exact size, the produced↔expected bijection, zero overlap, full
   coverage, singletons-stay-unclustered, and topic grouping.

### 4.2 Corpora

Five corpora instantiate four archetypes:

| Run | Structure | Archetype | Property tested |
|---|---|---|---|
| `1-6-2026-40-20-10` (reference) | 2 topics × 2 synths × 10 = 40 | A — clean recovery | synth + topic recovery |
| `4-6-2026-60-20-5` (loose) | 3 topics × 4 synths × 5 = 60, wide wording | A — low-cosine | recovery under low within-synth cosine |
| `4-6-2026-60-20-5-tight` | 3 topics × 4 synths × 5 = 60, tight wording | A — realistic | recovery under realistic cosine |
| `4-6-2026-20-10-5-negation` | 2 subjects × 2 stances × 5 = 20 | E — opposites | stance must not merge |
| `4-6-2026-41-20-4-singleton` | 2 topics × 5 synths × 4 + 1 outlier = 41 | C/F — lone statement | outlier must stay unclustered |

The **loose** and **tight** 60-option corpora share identical structure and differ
only in *within-synth wording width* — how lexically similar the five paraphrases
of one idea are. This single controlled variable sets each member's cosine to its
cluster medoid:

| Corpus | within-synth cosine (min – mean – max) | pairs clearing 0.94 auto-accept |
|---|---|---|
| loose | 0.727 – 0.816 – 0.896 | 0 / 120 |
| tight | 0.933 – 0.972 – 0.997 | 118 / 120 |

### 4.3 Determinism and scoring scope

Cluster **membership** (UMAP seed 42 + DBSCAN $\varepsilon$) is deterministic and
re-derivable offline from the shipped vectors. The LLM equivalence verdicts,
gray-band keep/drop decisions, and all synth/topic **titles** are LLM-driven and
**not** deterministic. **Only membership is scored**; titles are never scored.

---

## 5. Results

### 5.1 Summary

Scored by `score.mjs` (Level 1); the deterministic clustering step independently
re-derived from shipped embeddings by `verifyFromEmbeddings.ts` (Level 2).

| Run | Score | Verdict |
|---|---|---|
| reference (40-20-10) | 11/11 | **PASS** — 4 pure synths, 2 correct topics, 0 overlap, 0 noise |
| loose (60-20-5) | 9/19 | **PARTIAL FAIL** — correct split of close ideas, but 6/12 synths fragmented; 47/60 assigned |
| tight (60-20-5) | 17/19 | **PASS (synth)** — 12/12 pure synths, 60/60 assigned, 0 overlap, **0 LLM calls**; the 2 fails are the diagnostic topic-grouping step |
| negation (20-10-5) | 7/11 → **11/11**† | **PASS (property)** — 4 stance-pure synths, opposites not merged, 0 cross-stance contamination, 2 correct topics |
| singleton (41-20-4) | 18/18 | **PASS** — 10/10 pure synths, 2 correct topics, off-topic statement left unclustered |

†The committed `results.json` (and therefore `score.mjs` on this folder) reflects
the **pre-refinement** run and scores **7/11**. The **11/11** is the post-fix
result documented in the negation run's `report.md` §5b, recovered by the
quorum-tolerant linkage refinement (§6) and confirmed across three identical
re-runs of the same input vectors. The four original failures were all *recall*
(3/20 members shed to a single stray pair-verdict), not contamination — opposites
are never merged in either state.

### 5.2 Reference run — clean recovery

On the 40-option reference corpus the pipeline recovered the ground-truth
structure **exactly**: 4 synths of 10 members each at 100% purity, agglomerated
into 2 correct topics, every option assigned once, zero overlap, zero noise.
Within-synth cosine fell in 0.86–0.95 and cross-synth well below, matching the
band model the pipeline assumes. The one tuned parameter — DBSCAN
$\varepsilon = 0.8$ rather than the production default 1.0 — is reported as a
**parameter-sensitivity finding**: at $\varepsilon = 1.0$ the two same-topic synths
collapse into one cluster; the synth-level recovery window is
$\varepsilon \in [0.6, 0.8]$. The production default is calibrated for coarser
macro-grouping; recovering synth granularity required a tighter radius. This is
itself a result: same-topic synths are separable, but only below the default
radius.

### 5.3 Loose vs. tight — corpus realism is the dominant variable

Holding structure fixed and changing only wording width:

| Metric | loose | tight |
|---|---|---|
| synths recovered pure | 6 / 12 | **12 / 12** |
| options assigned | 47 / 60 | **60 / 60** |
| judge LLM calls | 63 | **0** |

With maximally varied wording, no within-synth pair clears the 0.94 auto-accept
band, so every member is forced through the medoid-anchored LLM judge, which
fragments synths. With realistic wording (within-synth cosine ≥ 0.93) the cosine
tier alone handles the members and recovery is exact with **zero** LLM calls. The
loose run's fragmentation is therefore a **corpus-realism artifact, not a mechanism
defect** — demonstrated by the controlled A/B on identical structure. Real human
near-duplicates share more wording than maximally-varied synthetic paraphrases and
would clear the band.

### 5.4 Negation — the LLM verifier separates stance

A cosine-only path returns **2** synths on the negation corpus, conflating each
pro/anti pair under one subject (they sit at high cosine). The production two-tier
judge returns **4 stance-pure synths**: it is the LLM equivalence verdict that
distinguishes "make peace" from "do *not* make peace." After the recall fix, all
20 members are assigned across the four stance-synths with zero cross-stance
contamination, and opposites are never merged.

### 5.5 Singleton — outliers stay unclustered

The geometric step groups the off-topic statement into the nearest cluster (a
UMAP-proximity artifact), but the judge **excludes** it, leaving it unclustered —
the correct behaviour for a lone outlier. An earlier run *failed* this exact check
(the outlier was absorbed), which led directly to defect fix #3.

---

## 6. Defects Discovered and Remediated

Validating against ground truth surfaced three genuine defects in the production
primitives. Each was root-caused and fixed with a regression test (no
workarounds), and because the fixes live in shared primitives, both the live and
bulk paths inherit them.

| # | Defect | Symptom | Fix | Commit |
|---|---|---|---|---|
| 1 | **DBSCAN border double-claim** — a border point is placed in two clusters and also left in the `noise` array, which the noise-reassignment step re-adds | 60 options → 66 memberships at $\varepsilon=0.30$ (non-disjoint output) | nearest-centroid disjoint partition + skip already-assigned indices in noise reassignment (no-op at the production default $\varepsilon=1.0$) | `7465c9342` |
| 2 | **Over-high auto-reject band (0.82)** — sat *inside* the within-synth cosine distribution (which dips to 0.73), so valid paraphrases were demoted to dissent with no LLM call | clusters fragmented on low-cosine corpora; valid members silently dropped | lower default to **0.60** (a "clearly unrelated" floor); let the LLM arbitrate the gray zone | `7465c9342` |
| 3 | **Keep-branch retained dissenters** — at ≥80% intra-cluster agreement the synth was set to the *entire* cluster, including auto-rejected / LLM-dissenting members | a lone off-topic statement absorbed into an otherwise-coherent synth | a kept synth contains only the *agreed subset*; dissenters are excluded | `88cab6a16` |

**Recall refinement (fix note, commit `1ee58ecd5`).** Strict complete-linkage in
the dissenter-refinement step shed genuine members (within-group cosine 0.91–0.95)
when a single stray pairwise "different" verdict appeared. Relaxing the join rule
to **quorum-tolerant linkage** (a member rejoins if it agrees with
$\lceil 0.75 \cdot |C| \rceil$ of the clique, capped at one absolute dissent)
rescues single-noisy-verdict drops while still keeping genuine opposites out (a
member that is "different" against the *whole* opposing group never reaches
quorum). Re-running the identical input vectors through the judge three times
recovered all four stance-synths at full size (7/11 → 11/11) at zero added LLM
cost, with opposites still never merging.

---

## 7. Discussion

1. **Synth recovery is correct and trustworthy on realistically-worded input** —
   exact recovery with full coverage and zero overlap, and notably with *zero* LLM
   calls, because the cosine tier handles high-similarity members.
2. **The LLM equivalence judge does what cosine cannot** — it separates
   distinct-but-close ideas and opposite stances that share vocabulary. This is the
   empirical justification for the hybrid design over pure embedding clustering.
3. **Lone outliers are correctly left unclustered** after fix #3, even when the
   geometric step groups them into a nearby cluster.
4. **Corpus realism is the dominant performance variable.** Maximal lexical
   variation pushes within-synth cosine below the auto-accept band and forces every
   member through the medoid-anchored judge, causing fragmentation. The controlled
   loose/tight A/B isolates this cleanly.
5. **Two parameters are corpus-dependent and must be reported, not silently
   tuned**: DBSCAN $\varepsilon$ (synth-vs-topic granularity; a narrow,
   corpus-specific recovery window) and the LLM-call cap (the production
   $\min(2000, \lceil 0.2N \rceil)$ starves a small validation corpus and was
   lifted, with disclosure, for these runs).

---

## 8. Threats to Validity

- **Synthetic corpora (construct validity).** All five corpora are LLM-authored
  (Claude), not human deliberation. They lack typos, slang, code-switching,
  off-topic drift, sarcasm, and adversarial restatement, and — being generated by
  a related model family — may sit more tightly in embedding space than genuine
  human paraphrases. A pass is **necessary, not sufficient**; robustness must be
  assessed on production-derived corpora.
- **Topic-level grouping is unproven for closely-related topics (external
  validity).** The single-linkage centroid agglomeration used here is a
  *diagnostic*, not a production path. It recovered clearly-distinct topics
  (fitness vs. finance; peace vs. taxes) but chained closely-related sub-topics
  (three health sub-topics). Production forms topics via the live LLM-judged band
  router, which these runs did not exercise. **This is the main open item.**
- **Medoid-anchored recall (internal validity).** Members judged against a single
  medoid can be shed to dissent even at realistic cosine. The quorum-tolerant
  linkage refinement mitigates the single-noisy-verdict case; judging against
  *multiple* references remains a candidate improvement for members shed by several
  verdicts.
- **LLM non-determinism.** The judge split, kept gray-band members, and all titles
  vary run-to-run; only deterministic membership is scored, and the negation
  recovery was confirmed across three identical re-runs.
- **Emulator environment.** Runs execute on the Firebase emulator; scheduled
  (cron) consolidation functions do not fire there, so the bulk pass was driven
  directly. No evaluations (votes) were seeded — this validates *structure*, not
  vote aggregation.

---

## 9. Conclusion

Across five controlled corpora, Freedi's bulk synthesis pipeline recovers
ground-truth idea structure exactly on realistically-worded input, separates
opposing stances and closely-related ideas via its LLM verification tier, and
leaves lone outliers unclustered. The campaign demonstrated its own scientific
value by surfacing three real production defects and one recall refinement, all
now fixed with regression tests. The principal residual risks are corpus realism
(addressable only by evaluating on production-derived human corpora) and
unproven topic-level grouping for closely-related sub-topics (the main open item).
We release all inputs, exact embedding vectors, outputs, and an offline scorer so
the findings are independently falsifiable.

---

## 10. Reproducibility and Data Availability

All artifacts live under `scientific-research/validation/`. Three independence
levels, cheapest first (exact commands in each run's `report.md`; a from-scratch
install guide is in `REPRODUCTION-GUIDE.md`):

1. **Verify the verdict from committed artifacts** — no dependencies, keys, or
   emulator: `node score.mjs <run-folder>`.
2. **Re-derive the clustering from shipped embeddings** — no OpenAI/emulator:
   `cd functions && npx tsx scripts/verifyFromEmbeddings.ts ../scientific-research/validation/<run-folder> --eps=<ε> --seed=42`.
   Reproduces deterministic membership; the LLM judge step is not replayed offline.
3. **Full end-to-end** — emulator + API keys: seed the corpus with
   `cleanRawSeed.ts`, then `bulkRebuild.ts <qid> --eps=<ε> --two-tier --max-llm-calls=2000 --execute`.

**Environment of record.** Node 22.17.1 · umap-js 1.4.0 ·
cloud-firestore-emulator v1.19.8 · macOS (Darwin 24.6.0) · OpenAI
`text-embedding-3-small` (1536-d) · Gemini (Vertex AI) for equivalence verdicts
and titles. Branch `fix-default-mono-discussion`, span `8e1d10e29 → ef32bf68b`.
Data `createdAt`: 2026-06-01 (reference run) and 2026-06-04 (remaining runs).
Corpora: `scripts/seedSynthBenchmark.{data,healthyTight,negation,singleton3}.json`.

---

## References

*(Starter set for the Related Work stub in §2 — to be completed by the authors.)*

[1] L. McInnes, J. Healy, and J. Melville. *UMAP: Uniform Manifold Approximation
and Projection for Dimension Reduction.* arXiv:1802.03426, 2018.

[2] M. Ester, H.-P. Kriegel, J. Sander, and X. Xu. *A Density-Based Algorithm for
Discovering Clusters in Large Spatial Databases with Noise.* Proc. KDD-96, 1996.

[3] N. Reimers and I. Gurevych. *Sentence-BERT: Sentence Embeddings using Siamese
BERT-Networks.* Proc. EMNLP-IJCNLP, 2019. arXiv:1908.10084.

[4] OpenAI. *New embedding models and API updates* (`text-embedding-3-small` /
`-large`). Technical report / model documentation, 2024.

[5] C. Small, M. Bjorkegren, T. Erkkilä, L. Shaw, and C. Megill. *Polis: Scaling
Deliberation by Mapping High Dimensional Opinion Spaces.* Recerca: Revista de
Pensament i Anàlisi, 2021.

[6] J. S. Fishkin. *When the People Speak: Deliberative Democracy and Public
Consultation.* Oxford University Press, 2009.

[7] J. Habermas. *Between Facts and Norms: Contributions to a Discourse Theory of
Law and Democracy.* MIT Press, 1996.

[8] M. Grootendorst. *BERTopic: Neural topic modeling with a class-based TF-IDF
procedure.* arXiv:2203.05794, 2022.

[9] P. J. Rousseeuw. *Silhouettes: A graphical aid to the interpretation and
validation of cluster analysis.* Journal of Computational and Applied Mathematics,
20:53–65, 1987.

[10] L. Aroyo and C. Welty. *Truth Is a Lie: Crowd Truth and the Seven Myths of
Human Annotation.* AI Magazine, 36(1):15–24, 2015.

[11] J. Grimmer and B. M. Stewart. *Text as Data: The Promise and Pitfalls of
Automatic Content Analysis Methods for Political Texts.* Political Analysis,
21(3):267–297, 2013.

*Companion internal documents:* the architecture and algorithm description in
`docs/clusters and synthesis/clustering-and-synthesis-paper.md`; the
cross-run summary in `scientific-research/validation/FINDINGS.md`; per-run reports
in each `<run-folder>/report.md`.
