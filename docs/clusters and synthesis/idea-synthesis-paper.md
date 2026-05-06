# Idea Synthesis: A Verified Embedding Approach to Near-Duplicate Detection in Large-Scale Deliberation

**Author:** Tal Yaron
**Status:** Draft for scientific review
**Last updated:** 2026-05-05

---

## Abstract

Open-ended idea generation in large-scale deliberation produces hundreds to thousands of proposals per question. A substantial fraction of these are **paraphrases of the same proposal** with different wording, which fragments the evaluation signal: ten variants of the same idea each receive 1/10 of the support they would jointly attract, lowering their visibility and distorting comparative judgments.

We describe **Idea Synthesis**, a pipeline that detects and merges these near-duplicates into one canonical proposal whose evaluation is the per-user-deduplicated aggregate of its members' evaluations. Unlike the platform's existing **topic clustering** (which produces broad thematic groupings), synthesis targets fine-grained semantic equivalence.

The central methodological problem is that **text embeddings encode topical proximity, not semantic equivalence**. "Raise taxes on wealth" and "Lower taxes on wealth" embed close in vector space — same topic, same subject, same lexical structure — but are semantic opposites. We address this with a **verified-embedding** pipeline: an approximate-nearest-neighbor (ANN) search over OpenAI `text-embedding-3-small` vectors generates *candidate* edges, and a four-way large-language-model judgment (Gemini 2.5-Flash) — **same / related / different / opposite** — gates which candidates become *confirmed* edges. Only confirmed-same edges feed the union-find clustering step.

We analyze the algorithmic complexity (O(N log N) per question via Firestore's native `findNearest` flat vector index, plus O(E) LLM-as-judge calls where E is the number of high-cosine candidate edges, batched at 20 pairs per call) and present capacity estimates: 10,000 options per question process in approximately two minutes wall-clock at a marginal LLM cost on the order of $0.20.

We also document the limitations: residual false positives at the boundary between "near-duplicate" and "complementary refinement," the dependence on prompt design for the LLM judge, and the absence of automatic re-aggregation when underlying evaluations change after synthesis.

This document is a methodological description for review prior to deployment in the Freedi platform.

---

## 1. Introduction

### 1.1 The fragmentation problem

In open deliberation, participants are not constrained to a fixed list of options. They generate proposals freely. Repetition is not a sign of poor participation — it is structurally inevitable. Two participants who share a viewpoint and never communicated will reliably produce semantically identical proposals in different words. Three participants will produce three variants. A thousand participants on a single question can produce dozens of proposals expressing the same underlying idea.

Each variant captures a fraction of the votes that the underlying idea would attract if presented unified:

$$
\text{vote}(\text{idea}) = \sum_{v \in \text{variants}(\text{idea})} \text{vote}(v)
$$

When we display variants separately, comparative metrics — ranking, top-k selection, "consensus" scoring — are distorted by the **arbitrary partition** of one idea into N variants.

The remedy is to detect that the variants are variants and present them as one. This is the synthesis problem.

### 1.2 Synthesis vs. topic clustering

The Freedi platform already performs **topic clustering** (see `functions/src/services/topic-cluster/`), which groups proposals into broad themes — "transportation," "housing," "education." This is a useful organizing layer but operates at the wrong granularity for the fragmentation problem: ten variants of "Add a third lane to highway 5" all sit inside the "transportation" topic cluster, undifferentiated from "Subsidize bus fares" or "Build a bike network."

Synthesis is a finer layer applied **within the same option pool** as topic clustering. The two layers coexist (an option is a member of one topic cluster and possibly one synthesis), and they answer different questions:

| Layer | Question answered | Granularity | Output |
| --- | --- | --- | --- |
| Topic cluster | "What subjects did people raise?" | Broad | ~10 thematic groups |
| Synthesis | "Which proposals are saying the same thing?" | Fine | ~N/k near-duplicate groups |

### 1.3 Why pure embedding similarity is insufficient

The natural first algorithm for detecting near-duplicates is to compute pairwise cosine similarity over text embeddings and merge pairs above some threshold. This is wrong for the deliberation setting.

Modern text embeddings encode **lexical and topical proximity**: shared subjects, shared vocabulary, shared sentence structures. They do **not** encode propositional content reliably. The clearest failure mode in deliberation is the **same-topic-opposite-stance pair**:

> A: "Raise taxes on wealth above ten million."
>
> B: "Lower taxes on wealth above ten million."

A and B have nearly identical token distributions, identical syntactic structure, identical subject. Their embedding cosine similarity in `text-embedding-3-small` is typically above 0.92. They are **semantic opposites**. An embedding-only synthesis pipeline will merge them and report a single "synthesized" idea that aggregates the votes of two opposing factions into one indistinguishable lump.

A second failure mode is the **same-topic-different-recommendation pair**:

> C: "Prioritize economic growth over environmental protection."
>
> D: "Prioritize environmental protection over economic growth."

C and D are not opposites in the strict propositional sense (both are positive recommendations), but they are not duplicates either. Embedding cosine similarity is again high.

A third, subtler failure is the **same-frame-different-magnitude pair**:

> E: "Add one lane to highway 5."
>
> F: "Add three lanes to highway 5."

These are **different proposals** about the same project. An embedding model will rank them as nearly identical.

These are not edge cases. They are common in deliberative datasets, and an unverified embedding pipeline will systematically generate them. The cost of a false-positive merge is high: it conflates positions, hides minority views, and corrupts the evaluation signal — the very thing synthesis was supposed to repair.

We therefore treat embedding cosine similarity as a **candidate generator**, not a decision rule. The decision is delegated to a separate semantic-equivalence judgment.

---

## 2. Methods

### 2.1 Notation

Let $Q$ be a question with option set $S = \{s_1, \dots, s_N\}$. Each option $s_i$ has:
- a textual statement $\text{text}(s_i)$,
- an embedding $\mathbf{v}_i \in \mathbb{R}^{1536}$ produced by `text-embedding-3-small` and L2-normalized,
- an evaluation summary $\text{eval}(s_i)$ including the average evaluation $\bar e_i$, evaluator count $n_i$, and consensus score $c_i$.

Synthesis produces a set of disjoint groups $\{G_1, \dots, G_K\}$ with $G_k \subseteq S$, each representing one canonical idea.

### 2.2 Pipeline overview

The pipeline runs in seven phases. Each is resumable; intermediate state is persisted in Firestore so a Cloud Function chain can be picked up after a timeout without recomputation.

```
[Phase 1] Pre-flight: embedding coverage check
[Phase 2] Pre-filter on engagement thresholds
[Phase 3] Embedding ANN: candidate edges (sparse graph)
[Phase 4] LLM-as-judge: four-way verdict per edge
[Phase 5] Union-Find on verified-same edges
[Phase 6] Complete-linkage post-filter
[Phase 7] Preview, admin confirmation, execution
```

We describe each in turn.

### 2.3 Phase 1 — Pre-flight: embedding coverage

Synthesis requires a near-complete embedding index. The pipeline aborts unless

$$
\frac{\#\{i : \mathbf{v}_i \text{ exists}\}}{N} \ge 0.9.
$$

If the threshold is not met, the operator is offered a backfill action that calls the existing `generateBulkEmbeddings` (`functions/src/fn_embeddingOperations.ts`). Synthesis is paused until coverage is sufficient. The 90% threshold is stricter than the platform's existing 50% bar for similarity search (used in the per-idea suggestion flow), because the per-idea flow tolerates some misses (it surfaces what it can find), while bulk synthesis must approach exhaustiveness or it leaves duplicates undetected.

### 2.4 Phase 2 — Pre-filter on engagement

Most options under a deliberation question receive little engagement: the long tail of low-quality, joke, or off-topic proposals. Synthesizing them is both wasteful (they would not affect outcomes) and counterproductive (low-engagement variants of the same noise are not "duplicates" worth presenting as one).

We apply three filters before any vector operation:
- $\bar e_i \ge \bar e_{\min}$ (configurable, default unset)
- $c_i \ge c_{\min}$ (configurable, default unset)
- $n_i \ge n_{\min}$ (configurable, default 2)

Let $S' \subseteq S$ be the surviving subset of size $N'$. In observed datasets, $N'$ is typically 20–40% of $N$.

### 2.5 Phase 3 — Embedding ANN: candidate edge graph

For each $s_i \in S'$ we query Firestore's native `findNearest`:

```
WHERE parentId == Q
ORDER BY <cosine distance to v_i>
LIMIT 20
```

The query is server-side-filtered to the question and uses the existing flat vector index on `(parentId, embedding)`. Each returned match $s_j$ with cosine similarity $\sigma(\mathbf{v}_i, \mathbf{v}_j) \ge \tau_{\text{cand}}$ becomes a *candidate edge* $(i, j, \sigma)$.

The default $\tau_{\text{cand}} = 0.90$ is intentionally aggressive (high). It functions as a recall ceiling: pairs below 0.90 are not even considered for verification. We choose a high candidate threshold because the verification step is more expensive per pair than the ANN step, and false negatives at this stage (missed near-duplicates) are recoverable in subsequent runs at lower thresholds, while false positives cascade.

Edges are persisted in a subcollection `statements/{Q}/synthesisRuns/{runId}/edges` with status `unverified`, alongside a cursor on the run document so the chunked Cloud Function chain can resume after a 9-minute timeout.

The total number of candidate edges $E$ is bounded by $20 N'$ in the worst case but is usually much smaller because of the threshold; in practice $E$ is sublinear in $N'$ for typical deliberation datasets.

### 2.6 Phase 4 — LLM-as-judge: four-way verdict

This is the central methodological step. For each unverified candidate edge, we run a semantic-equivalence judgment via Gemini 2.5-Flash, batched at 20 pairs per call, using the following four-way verdict:

| Verdict | Interpretation | Action |
| --- | --- | --- |
| `same` | Paraphrase or near-duplicate of the same proposal | Keep edge as confirmed |
| `related` | Same topic, different stance or recommendation | Drop edge |
| `different` | Embeddings are close by accident; proposals are unrelated | Drop edge |
| `opposite` | Explicit contradictions of the same proposition | Drop edge |

The four-way verdict broadens the existing `negation-detection-service` (which returns binary opposite/not-opposite, see `functions/src/services/negation-detection-service.ts`). The existing service catches explicit negation but cannot distinguish "related but not duplicate" from "duplicate," which is the dominant false-positive mode.

#### Prompt design

```
You will receive pairs of proposals (A, B) from the same deliberation question.
For each pair, decide which ONE of these four verdicts best applies:

  same     — A and B are paraphrases of essentially the same proposal.
             Their authors would probably agree they meant the same thing.
  related  — A and B are about the same topic but propose
             different actions, stances, or magnitudes.
  different — A and B are about different things; only their wording is similar.
  opposite — A and B propose contradictory actions on the same subject.

Return JSON: [{"pairIndex": N, "verdict": "...", "reason": "..."}]
```

The prompt explicitly distinguishes paraphrase (`same`) from any form of disagreement or specification difference. The four-way structure forces the model to make a deliberate choice rather than collapsing into a permissive "yes-similar" judgment.

#### Cost and latency

Each Gemini 2.5-Flash call processes 20 pairs at ~1–3 seconds wall-clock and on the order of $4 \times 10^{-4}$ USD. For an empirical run with $E = 10{,}000$ candidate edges this gives ~500 calls, ~$0.20 total cost, and ~1–2 minutes total wall-clock at modest parallelism.

#### Why batch at 20 pairs

Batching is the dominant cost control. A single LLM call carrying 20 pairs uses roughly the same input tokens as a single-pair call (the surrounding instructions dominate the prompt), but produces 20 verdicts. Above 20 pairs per call, output JSON becomes unreliable in our measurements (the model truncates or hallucinates pairIndex values). The 20-per-call number is inherited from the existing `negation-detection-service`, where it has been observed to be stable in production.

### 2.7 Phase 5 — Union-Find on verified-same edges

Once all edges have a verdict, we restrict to the subset $E_{\text{same}} = \{(i,j) : \text{verdict}(i,j) = \text{same}\}$ and apply a standard disjoint-set union-find with path compression and union-by-rank.

Each connected component of the verified graph $(S', E_{\text{same}})$ is a *candidate synthesis group*.

This is O(E α(N')) where α is the inverse Ackermann function — effectively linear.

### 2.8 Phase 6 — Complete-linkage post-filter

Single-linkage clustering (which is what union-find effectively does on a thresholded graph) suffers from **chaining**: A is `same` as B, B is `same` as C, but A and C may be unrelated. Naive union-find would merge {A, B, C}. This is a real failure mode for synthesis: it produces oversized "duplicate" groups that include genuinely different proposals connected only through a chain of borderline judgments.

We apply a complete-linkage post-filter. For each component $G$ of size $> 2$:

1. Compute all internal pairs $\{(i, j) : i, j \in G, i < j\}$.
2. For any internal pair without a verdict yet, run one more LLM-as-judge batch.
3. If any internal pair has verdict $\ne \text{same}$, split $G$ at the weakest such pair and recurse.

After this filter, every group $G$ satisfies $\forall i, j \in G : \text{verdict}(i,j) = \text{same}$ — every member is mutually confirmed as a paraphrase of every other member.

This adds at most $\binom{|G|}{2}$ additional verifications per group, which is small for typical group sizes (most groups are 2–5 members).

### 2.9 Phase 7 — Preview, confirmation, and execution

The pipeline now has a candidate set of synthesis groups. Two human-in-the-loop steps follow:

1. **Title generation.** For each group, the existing `findSimilarAndGenerateSuggestion` (in `functions/src/services/integration-ai-service.ts`) generates a merged title and description. This function is reused without modification.
2. **Admin confirmation.** The operator sees each group with member previews, the LLM `reason` strings ("merging because: ..."), and the suggested merged title. They can edit, accept, or reject per group before execution.

On execution, each accepted group is passed to the existing `executeIntegration` function (in `functions/src/fn_integrateSimilarStatements.ts`), which:
- creates a new Statement marked `isCluster: true`, `integratedOptions: [memberIds]`,
- hides the member originals with `hide: true, integratedInto: <newId>`,
- migrates all evaluations via `migrateEvaluationsToNewStatement`.

The bulk synthesis pipeline therefore writes data through the same path as the existing per-idea integration flow, ensuring consistency across the two entry points.

### 2.10 Evaluation aggregation with per-user deduplication

When a synthesis group is executed, member evaluations are not summed naively. A user who voted on three variants of the same idea must count once, not three times. The aggregation in `functions/src/condensation/aggregation.ts` and `functions/src/evaluation/evaluationMigration.ts` already implements this correctly.

Formally: for each user $u$ who evaluated any member of $G$, define their per-group evaluation as

$$
\hat e_{u,G} = \frac{1}{|G \cap \text{evaluated}(u)|} \sum_{s \in G \cap \text{evaluated}(u)} e_{u,s}
$$

and the aggregated group evaluation as the standard mean of $\hat e_{u,G}$ over the unique users who evaluated any member. The number of evaluators on the synthesis is the number of unique users, not the sum of per-member evaluator counts.

This deduplication is essential. Without it, synthesis would *amplify* the engagement signal of any user who happened to vote on multiple variants — which is exactly the kind of distortion synthesis was designed to remove.

---

## 3. Scaling analysis

### 3.1 Asymptotic complexity

Let $N$ be the total options under a question, $N'$ the number surviving the engagement pre-filter, $E$ the number of candidate edges, $K$ the number of final groups, $|G|$ the average group size, and $J$ the number of LLM calls.

| Phase | Complexity | Bottleneck |
| --- | --- | --- |
| 1: coverage check | $O(1)$ | one Firestore aggregate read |
| 2: pre-filter | $O(N)$ | linear scan |
| 3: ANN edge building | $O(N' \log N)$ via Firestore `findNearest` | $N'$ vector queries |
| 4: LLM verdict | $O(E / 20)$ batched LLM calls | network latency |
| 5: union-find | $O(E \alpha(N'))$ | effectively linear |
| 6: complete-linkage | $O(K \cdot \overline{|G|}^2 / 20)$ extra LLM calls | small |
| 7: title + execute | $O(K)$ LLM calls + $O(K)$ Firestore writes | linear |

Total wall-clock is dominated by phase 3 (network bound, parallelizable) and phase 4 (LLM round-trips, parallelizable).

### 3.2 Empirical capacity targets

We target two operational regimes:

| Regime | $N$ | Wall-clock | Notes |
| --- | --- | --- | --- |
| v1 (deployed) | up to 10,000 | ~2–3 minutes | Single Cloud Function chain, sufficient for most deliberation questions |
| v2 (deferred) | up to 100,000 | ~30 minutes | Requires OpenAI Batch API for embedding backfill and a Cloud Tasks queue for parallelism |

The 10,000-option ceiling is a deliberate engineering choice — questions with more than 10,000 options are rare, and the marginal complexity of supporting them does not justify the additional infrastructure (Cloud Tasks, multi-stage backfill, progress UI) before observing real demand.

### 3.3 Cost

The dominant marginal cost is LLM calls. For $N = 10{,}000$:

- Embedding backfill (if needed): ~$0.02 USD on `text-embedding-3-small`.
- LLM-as-judge: ~$0.20 USD on Gemini 2.5-Flash (500 batched calls, 20 pairs each).
- Title generation: ~$0.05 USD on Gemini 2.5-Flash (one call per final group).

Total marginal cost per synthesis run: well under one US dollar. This is small enough that synthesis can be re-run on demand without budget pressure.

---

## 4. Implementation map

The pipeline composes existing platform primitives. New code is limited to the orchestration, the four-way LLM judge, and a small union-find utility.

### 4.1 Reused (no modification)

- `functions/src/services/embedding-service.ts` — OpenAI `text-embedding-3-small` generation
- `functions/src/services/embedding-cache-service.ts` — coverage check, cached embedding storage
- `functions/src/services/vector-search-service.ts` — Firestore `findNearest` wrapper
- `functions/src/services/integration-ai-service.ts` — merged title/description generation
- `functions/src/condensation/aggregation.ts` — per-user-deduplicated evaluation aggregation
- `functions/src/evaluation/evaluationMigration.ts` — applies aggregation when a synthesis is created
- `functions/src/fn_integrateSimilarStatements.ts` `executeIntegration` — atomically writes the synthesis Statement and hides originals

### 4.2 New

- `functions/src/utils/unionFind.ts` — disjoint-set utility (path compression + union-by-rank)
- `functions/src/services/semantic-equivalence-service.ts` — four-way LLM-as-judge, batched
- `functions/src/synthesis/completeLinkage.ts` — post-filter splitting under-verified components
- `functions/src/fn_synthesizeIdeas.ts` — pipeline orchestration: `start`, chunk worker, `getPreview`, `execute`

### 4.3 Reference: existing related pipelines

| Pipeline | Granularity | Algorithm | Verification |
| --- | --- | --- | --- |
| `topic-cluster` | broad themes | LLM taxonomy + UMAP + DBSCAN | none |
| `fn_hybridClustering` | mid (rating-aware) | K-means on 1544-d hybrid vectors | `negation-detection-service` (binary) |
| `fn_findSimilarStatements` | per-suggestion | embedding ANN + LLM fallback | none (human-in-loop) |
| `fn_integrateSimilarStatements` | per-statement merge | embedding ANN + Gemini 60% rule | none |
| **Idea Synthesis** (this paper) | per-question, fine | embedding ANN + four-way LLM judge | yes (per-edge, four-way) |

---

## 5. Limitations and open questions

We identify the following limitations for review.

### 5.1 LLM judge as a single point of trust

The four-way verdict is trusted as the merge decision rule. If the model systematically misclassifies a category of pairs — for example, treats sarcastic restatements as `same` rather than `opposite` — those errors propagate to the synthesis. Mitigations:

- **Calibration set.** Maintain a held-out, hand-labeled set of pairs and report the four-way confusion matrix on each LLM provider/version change.
- **Conservative thresholds at the boundary.** Where the LLM expresses low confidence (which we currently do not capture), prefer non-merge.
- **Human-in-loop preview.** Operators see the LLM `reason` strings and can reject groups before execution.

### 5.2 Frame-vs-magnitude pairs (the subtler false-positive)

Pairs like "Add one lane" / "Add three lanes" are difficult for both embeddings and the LLM judge, because in some deliberation contexts they are different proposals (concrete plans) and in others they are variants of the same direction (raise capacity). The current prompt favors `related` for magnitude differences, which we believe is correct, but this is the most prompt-sensitive boundary. Empirical calibration is recommended before deployment.

### 5.3 Re-aggregation after evaluation drift

When a synthesis is created, the aggregated evaluation is computed once and stored on the synthesis Statement. If member evaluations subsequently change (new votes, retracted votes), the synthesis evaluation does not auto-refresh. The current design relies on the operator re-running synthesis to refresh aggregations. A Firestore trigger that refreshes synthesis evaluations on member-evaluation writes is straightforward to add but is deferred to a follow-up to avoid trigger amplification on high-traffic questions.

### 5.4 Cross-question synthesis is out of scope

The pipeline is scoped to one question. Two questions about the same topic are not deduplicated against each other. This is intentional: each question is its own deliberative unit with its own evaluator pool, and merging across questions would conflate distinct epistemic populations.

### 5.5 Reversibility

`executeIntegration` is currently not natively reversible — the originals are hidden, not deleted, but the platform does not expose an admin "unsynthesize" action. Reversibility should be added before broad deployment so synthesis errors can be corrected without manual data work.

### 5.6 Provenance

Every synthesis run is logged with its run id, threshold, filters, the candidate edge set, the LLM verdicts, and the operator who confirmed it. This provenance is intended to support after-the-fact audit: any synthesis decision should be traceable to (a) which embedding cosine triggered the candidacy, (b) what verdict the LLM returned with what reason, and (c) who confirmed the merge. The persistence schema (`synthesisRuns/{runId}/edges`) is designed to support this audit. We have not yet defined the audit UI; this is left for a follow-up.

---

## 6. Summary

Idea Synthesis is a near-duplicate detection and merging layer for deliberation. It complements topic clustering by operating at a finer granularity. Its central methodological commitment is that **embeddings generate candidates, an LLM judge decides**, with a four-way verdict that distinguishes paraphrase from related-but-different and opposite. Aggregation uses per-user deduplicated evaluations to avoid amplifying any user's influence merely because they evaluated multiple variants. The pipeline scales to tens of thousands of options per question through approximate-nearest-neighbor search and a small union-find on the verified-edge graph, at a marginal LLM cost on the order of cents per run.

We invite scientific review of:
- the four-way verdict prompt design and category boundaries (§2.6),
- the chaining-mitigation in the complete-linkage post-filter (§2.8),
- the per-user evaluation aggregation correctness (§2.10),
- the limitations enumerated in §5, particularly §5.2.
