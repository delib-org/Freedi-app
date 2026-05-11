# Clustering and Synthesis in Large-Scale Deliberation

**A unified verified-embedding approach with hybrid text–rating vectors**

**Authors:** Tal Yaron · Claude (Anthropic)
**Affiliation:** Freedi — Free Deliberation Platform
**Status:** Draft for scientific review
**Last updated:** 2026-05-10

---

## Abstract

Open-ended deliberation produces hundreds to thousands of proposals per question. Two distinct computational problems emerge. First, the same idea is restated by many participants in different words — a *fragmentation* problem that distributes votes across paraphrases and distorts comparative metrics. Second, the volume of distinct ideas needs to be organized so participants can navigate and compare them — a *clustering* problem that requires grouping proposals into coherent thematic categories.

Standard text-embedding clustering systematically fails on both fronts: modern embeddings encode **topical proximity, not propositional content**. The pair *"raise taxes on wealth"* / *"lower taxes on wealth"* embeds at cosine ≥ 0.92 in `text-embedding-3-small`, despite being semantic opposites. Naive embedding-only methods conflate paraphrases with opposites and amplify the very distortions they are meant to repair.

We describe a unified clustering and synthesis architecture for the Freedi deliberation platform that addresses both problems with a coherent set of techniques over a single embedding space (OpenAI `text-embedding-3-small`, 1 536-d):

1. **Hybrid text–rating clustering** — composite vectors blending text embeddings with an 8-dimensional evaluation-statistics vector via an adaptive weighting parameter $\alpha(n)$, k-means with automatic $k$ selection, and a post-clustering LLM negation-detection step. Resolves the topical-vs-positional confound.
2. **Idea synthesis** — a verified-embedding near-duplicate detection pipeline: ANN candidate generation followed by a four-way LLM-as-judge verdict (`same` / `related` / `different` / `opposite`) and complete-linkage refinement. Resolves the fragmentation problem.
3. **Shared infrastructure** — per-user-deduplicated evaluation aggregation, a single merge primitive (`performIntegration`), and a cached cluster-aggregation layer with event-driven invalidation. Both layers coexist on the same option pool and feed the same evaluation downstream.

We give the methods, the algorithmic complexity, empirical capacity targets (≤ 10 000 options per question in roughly two minutes wall-clock at marginal LLM cost on the order of cents), and the limitations that warrant further calibration before broad deployment.

---

## 1. Introduction

### 1.1 The two problems

In open deliberation, participants are not constrained to a fixed list of options — they generate proposals freely. Two regularities follow.

**Repetition is structurally inevitable.** Two participants who share a viewpoint and never communicated will reliably produce semantically identical proposals in different words. Three participants will produce three variants. A thousand participants on a single question can produce dozens of proposals expressing the same underlying idea. Each variant captures only a fraction of the votes the underlying idea would attract if presented unified:

$$
\mathrm{vote}(\mathrm{idea}) = \sum_{v \in \mathrm{variants}(\mathrm{idea})} \mathrm{vote}(v).
$$

Comparative metrics — ranking, top-$k$ selection, consensus scoring — are distorted by the **arbitrary partition** of one idea into $N$ variants.

**Volume exceeds direct comparison.** Even after removing paraphrases, the surviving distinct ideas still number in the hundreds. Participants and facilitators cannot meaningfully rank or compare such a list directly. They need an organizing structure: thematic groups within which proposals share a subject, between which they differ.

These are different problems with different remedies. Synthesis collapses paraphrases of one idea into one canonical proposal. Clustering organizes distinct ideas into navigable groups. Both are needed; neither substitutes for the other.

### 1.2 Why pure embedding similarity is insufficient for either problem

The natural first algorithm for both problems is the same: compute pairwise cosine similarity over text embeddings, threshold, group. This is wrong for the deliberation setting, for the same underlying reason in both cases.

Modern text embeddings encode **lexical and topical proximity** — shared subjects, shared vocabulary, shared sentence structure. They do **not** encode propositional content reliably. The clearest failure modes:

- **Same-topic-opposite-stance.**
  > *A: "Raise taxes on wealth above ten million."*
  > *B: "Lower taxes on wealth above ten million."*

  Nearly identical token distributions, identical syntactic structure, identical subject. Cosine similarity in `text-embedding-3-small` is typically above 0.92. They are semantic opposites. Embedding-only methods treat them as duplicates.

- **Same-topic-different-recommendation.**
  > *C: "Prioritize economic growth over environmental protection."*
  > *D: "Prioritize environmental protection over economic growth."*

  Not strict opposites in the propositional sense, but not duplicates either. Embedding cosine is again high.

- **Same-frame-different-magnitude.**
  > *E: "Add one lane to highway 5."*
  > *F: "Add three lanes to highway 5."*

  Different proposals about the same project. An embedding model will rank them as nearly identical.

These are not edge cases. They are common in deliberative datasets, and an unverified embedding pipeline will systematically generate them. The cost of a false-positive merge or a positionally-mixed cluster is high: it conflates positions, hides minority views, and corrupts the evaluation signal — the very thing the system was supposed to repair.

The unifying principle of the approach we describe is to treat **embedding cosine similarity as a candidate generator, not a decision rule**. The decision is delegated either to community evaluation data (in clustering) or to a separate semantic-equivalence judgment (in synthesis).

### 1.3 The Freedi architecture, in one paragraph

A single embedding space (OpenAI `text-embedding-3-small`, 1 536-d) underlies both layers. *Hybrid clustering* concatenates each option's text embedding with an 8-dimensional rating vector derived from community evaluations, producing a 1 544-d composite vector that is clustered by k-means with automatic $k$, then post-processed by an LLM negation detector to split cosmetically-similar but positionally-opposed pairs. *Synthesis* runs an ANN search over the same text embeddings to generate candidate near-duplicate edges, has an LLM judge return one of four verdicts on each pair, applies union-find on the verified-same edges, and refines the resulting components by a complete-linkage post-filter that requires every internal pair to be mutually confirmed. Both layers write through a single integration primitive and inherit a per-user-deduplicated evaluation aggregation.

---

## 2. Embedding infrastructure

### 2.1 Choice of embedding model

We use OpenAI `text-embedding-3-small`, producing L2-normalized 1 536-dimensional vectors. The choice is driven by:

- **Multilingual coverage.** Freedi serves English, Hebrew, Arabic, Spanish, German, and Dutch participants concurrently. `text-embedding-3-small` produces consistent embeddings across these languages.
- **Cost efficiency.** A backfill of 10 000 options costs on the order of $0.02 USD.
- **Established cosine-similarity behaviour at scale.** Empirical thresholds (0.85 for clustering negation candidates, 0.90 for synthesis ANN candidates) generalize across Freedi questions without per-question recalibration.

A previous architecture experimented with Gemini `text-embedding-004` (768-d) for similarity search; the unified architecture standardizes on the OpenAI space, leaving Gemini for LLM-as-judge text generation only.

### 2.2 Context-aware generation

Embeddings are generated with the parent question included as context:

$$
e_{\mathrm{text}}(p_i) = \mathrm{Embed}\big(\text{“Question: } Q \;\backslash n\; \text{Answer: } t_i\text{”}\big) \in \mathbb{R}^{1536}.
$$

This produces representations *relative to the deliberative context* rather than in absolute semantic space, improving intra-question similarity while preserving cross-question distinctiveness.

### 2.3 Storage and retrieval

Each option's embedding is cached on the option document (`embedding` field) and indexed by Firestore's native flat vector index, parameterized by `(parentId, embedding, dimension=1536)`. Approximate-nearest-neighbour queries via `findNearest` return top-$k$ neighbours within a parent in roughly 50–100 ms.

Embeddings are generated asynchronously after option creation. Both clustering and synthesis pipelines pre-flight a *coverage* check before running and offer a backfill action if coverage is insufficient.

### 2.4 Why two clustering layers over one embedding

Hybrid clustering and synthesis both consume the same 1 536-d text embeddings but apply them to different problems. The split lets us use different signals at the right scale: synthesis adds an LLM judgment per candidate pair (high precision per pair, expensive per pair), while clustering adds a low-cost per-option evaluation vector (cheap, less precise on individual pairs but globally adaptive). Each technique is wrong for the other's problem; together they cover the deliberation pipeline.

---

## 3. Hybrid Text–Rating Vector Clustering

This section addresses the clustering problem of §1.1: organizing the surviving distinct ideas into navigable thematic groups while respecting community stance.

### 3.1 The hybrid vector representation

For each proposal $p_i$ with $n_i$ evaluators we form a composite vector

$$
\mathbf{v}_i = \big[\, \alpha(n_i) \cdot \sqrt{D_{\mathrm{text}}/D_{\mathrm{total}}} \cdot \mathbf{e}_i,\;\;
(1-\alpha(n_i)) \cdot \sqrt{D_{\mathrm{rating}}/D_{\mathrm{total}}} \cdot \mathbf{r}_i \,\big] \in \mathbb{R}^{1544},
$$

where $\mathbf{e}_i \in \mathbb{R}^{1536}$ is the option's text embedding, $\mathbf{r}_i \in \mathbb{R}^{8}$ is its rating-statistics vector, and $D_{\mathrm{text}} = 1\,536$, $D_{\mathrm{rating}} = 8$, $D_{\mathrm{total}} = 1\,544$.

The square-root dimensionality correction ensures each component contributes its intended weight to cosine similarity regardless of dimensionality imbalance. Without it, the 1 536-d text component would dominate the 8-d rating component even at low $\alpha$, because cosine sums over all dimensions.

For two hybrid vectors $\mathbf{v}_a, \mathbf{v}_b$ with independently normalized sub-vectors:

$$
\cos(\mathbf{v}_a, \mathbf{v}_b) \approx \alpha^2 \cos(\mathbf{e}_a, \mathbf{e}_b) + (1-\alpha)^2 \cos(\mathbf{r}_a, \mathbf{r}_b).
$$

### 3.2 The 8-dimensional rating vector

All eight components are derived from pre-computed aggregation fields the platform maintains via atomic incremental updates on each evaluation event. No additional database queries are required to construct $\mathbf{r}_i$.

| Dim | Component | Range | Interpretation |
|---|---|---|---|
| 0 | $\mu_i$ | $[-1, 1]$ | Mean evaluation |
| 1 | $A_i$ | $[-1, 1]$ | Bayesian-smoothed deliberative consensus (WizCol) |
| 2 | $A_i^*$ | $[0, 1]$ | Confidence-adjusted agreement: $1 - t \cdot \mathrm{SEM}^*$ |
| 3 | $L_i$ | $[0, 1]$ | Like-mindedness: $1 - \mathrm{SEM}^*$ |
| 4 | $\rho_i$ | $[0, 1]$ | Pro-evaluator ratio: $n_i^+ / n_i$ |
| 5 | $d_i$ | $[0, 1]$ | Density: $n_i / \max_j(n_j)$ |
| 6 | $1-L_i$ | $[0, 1]$ | Polarization (inverse like-mindedness) |
| 7 | $I_i$ | $[0, 1]$ | Intensity: $(\Sigma^+ + \lvert\Sigma^-\rvert) / n_i$ |

The Bayesian-smoothed consensus follows the WizCol formula

$$
A_i = \mu_i - t_{\alpha, n_i + k - 1} \cdot \mathrm{SEM}^*_i
$$

with $k = 2$ phantom prior votes centred at zero.

### 3.3 Adaptive $\alpha$ blending

The weighting parameter

$$
\alpha(n_i) = \frac{1}{1 + \beta \cdot \log_2(1 + n_i)}, \quad \beta = 0.3,
$$

transitions smoothly from text-dominated representation when $n_i = 0$ to rating-dominated representation as $n_i$ grows.

| Evaluators $n_i$ | $\alpha$ | Text weight | Rating weight |
|---|---|---|---|
| 0 | 1.00 | 100 % | 0 % |
| 5 | 0.77 | 77 % | 23 % |
| 20 | 0.57 | 57 % | 43 % |
| 50 | 0.46 | 46 % | 54 % |
| 100 | 0.40 | 40 % | 60 % |

The crossover ($\alpha = 0.5$) occurs around $n \approx 37$. New proposals begin as text-only vectors (indistinguishable from standard embedding-based clustering); heavily evaluated proposals are primarily characterized by their community reception patterns. This is the core design move that lets the clustering system *learn stance from votes* without requiring stance to be encoded in the text.

### 3.4 K-means with automatic $k$

We employ k-means with cosine distance ($1 - \cos$) on the 1 544-d hybrid vectors. K-means is preferred over density-based methods (HDBSCAN) for three reasons: (a) straightforward implementation in server-side JavaScript without native dependencies; (b) deterministic convergence suitable for scheduled background execution; (c) sufficient quality for a domain where cluster boundaries are inherently fuzzy.

Initial centroids are chosen by k-means++. The number of clusters is selected by the elbow method, scanning $k \in [k_{\min}, k_{\max}]$ with $k_{\min} = 3$ and $k_{\max} = \min(20, \lfloor n/2 \rfloor)$, locating the value where within-cluster sum of squares (WCSS) drops most sharply. If no clear elbow exists, the system defaults to $k = \lceil \sqrt{n/2} \rceil$.

**Scaling.** For $n > 5\,000$, k-means runs on a uniformly random sample of 5 000 proposals; the remainder are assigned by single-pass nearest-centroid. Complexity drops from $O(n \cdot k \cdot d \cdot T)$ to $O(s \cdot k \cdot d \cdot T + (n - s) \cdot k \cdot d)$ with $s = 5\,000$.

### 3.5 Post-clustering negation detection

Even with rating-weighted vectors, two cases can leave opposed proposals in the same cluster: (a) early in deliberation, when $\alpha$ is high and text dominates; (b) when opposing proposals coincidentally share evaluation profiles (e.g. both highly controversial).

Within each cluster $C_j$ we compute pairwise cosine on the *original* text embeddings (not the hybrid vectors) and identify pairs $(p_a, p_b)$ with $\cos(\mathbf{e}_a, \mathbf{e}_b) > 0.85$. These are candidate stance-opposed pairs. They are submitted to Gemini 2.5-Flash with a structured prompt that asks specifically whether each pair expresses *opposite positions* — not merely different emphasis or nuance.

For each confirmed opposition, the proposal with fewer evaluations (less established) is moved to the nearest other cluster; if all alternatives are too distant ($\cos$ distance $> 0.8$) a new cluster is spawned with the moved proposal as its initial member.

A typical cluster of 50–200 members yields 0–5 high-similarity pairs and one LLM batch call. Across a 15-cluster framing, 5–10 LLM calls per cycle suffice.

### 3.6 Event-driven re-clustering

Re-clustering on every evaluation event would be prohibitively expensive at scale. Instead, the system uses staleness-marking: each evaluation write sets `hybridEmbeddingStale: true` on the affected proposal — a single field write costing effectively zero.

A scheduled function executes every 15 minutes:

```
Evaluation Event                   Scheduled Sweep (15 min)
       │                                    │
       ▼                                    ▼
  Set hybridEmbeddingStale     Query stale proposals
  on affected proposal         Group by parent question
                                    │
                                    ▼
                             For each parent question:
                             ├── Check enableHybridClustering setting
                             ├── Fetch all options
                             ├── Recompute hybrid vectors
                             ├── K-means clustering
                             ├── Negation detection (Gemini)
                             └── Upsert "hybrid-auto" framing
```

The clustering result is stored as a *framing* of type `hybrid-auto`, coexisting alongside other framings (AI-generated thematic clusterings, admin-defined custom groupings, topic-cluster outputs). Each proposal maintains a mapping from framing id to cluster id, supporting multiple simultaneous views.

---

## 4. Topic Clustering (taxonomy + UMAP / DBSCAN)

A second clustering pipeline is available for cases where the facilitator wants a deliberative *taxonomy* rather than rating-driven groupings. Topic clustering is deferred to its own section because it does not interact with evaluations. The pipeline:

1. **Taxonomy derivation (LLM).** A category list is generated for the question, cached by `(parentId, questionHash, promptVersion)`.
2. **Normalization (LLM).** Each option is mapped to canonical actions and assigned to one or more categories, cached by `(statementId, lastUpdate, promptVersion)`.
3. **Per-category clustering.** Embed canonical actions, project from 1 536-d cosine to UMAP_TARGET-d Euclidean via UMAP (deterministic seed = 42), apply DBSCAN with the configured `DBSCAN_EPS` and `DBSCAN_MIN_SAMPLES`.
4. **Noise recovery.** DBSCAN noise points are reassigned to the nearest centroid (cosine in *original* embedding space) if above `NEAREST_CENTROID_THRESHOLD`, else placed in an "uncategorized" group.
5. **Cluster naming (LLM).** Each cluster is named from its members.

Topic clustering and hybrid clustering produce alternative framings that the facilitator can compare side-by-side. Hybrid is the default for evaluations-aware grouping; topic-cluster is preferred when the question requires an explicit taxonomy regardless of how participants have voted.

---

## 5. Idea Synthesis (Verified-Embedding Near-Duplicate Detection)

This section addresses the fragmentation problem of §1.1: collapsing paraphrases of the same idea into one canonical proposal whose evaluation is the per-user-deduplicated aggregate of its members'.

### 5.1 Notation

Let $Q$ be a question with option set $S = \{s_1, \dots, s_N\}$. Each option $s_i$ has a textual statement $\mathrm{text}(s_i)$, a normalized embedding $\mathbf{v}_i \in \mathbb{R}^{1536}$, and an evaluation summary $\mathrm{eval}(s_i)$ including average $\bar e_i$, evaluator count $n_i$, and consensus $c_i$. Synthesis produces a set of disjoint groups $\{G_1, \dots, G_K\}$ with $G_k \subseteq S$, each representing one canonical idea.

### 5.2 Pipeline overview

The pipeline runs in seven phases, each resumable; intermediate state is persisted in Firestore so a Cloud Function chain can pick up after a 9-minute timeout without recomputation.

```
[Phase 1] Pre-flight: embedding coverage check
[Phase 2] Pre-filter on engagement thresholds
[Phase 3] Embedding ANN: candidate edges (sparse graph)
[Phase 4] LLM-as-judge: four-way verdict per edge
[Phase 5] Union-Find on verified-same edges
[Phase 6] Complete-linkage post-filter
[Phase 7] Preview, admin confirmation, execution
```

### 5.3 Phase 1 — Pre-flight: embedding coverage

Synthesis requires a near-complete embedding index. The pipeline aborts unless

$$
\frac{\#\{i : \mathbf{v}_i \text{ exists}\}}{N} \ge 0.9.
$$

If the threshold is not met, the operator is offered a backfill action. The 90 % threshold is stricter than the platform's 50 % bar for similarity search (used in the per-idea suggestion flow), because the per-idea flow tolerates some misses (it surfaces what it can find), while bulk synthesis must approach exhaustiveness or it leaves duplicates undetected.

### 5.4 Phase 2 — Pre-filter on engagement

Most options under a deliberation question receive little engagement: the long tail of low-quality, joke, or off-topic proposals. Synthesizing them is both wasteful and counterproductive — low-engagement variants of the same noise are not duplicates worth presenting as one.

Three filters are applied before any vector operation:
- $\bar e_i \ge \bar e_{\min}$ (configurable, default unset),
- $c_i \ge c_{\min}$ (configurable, default unset),
- $n_i \ge n_{\min}$ (configurable, default 2).

In observed datasets, $N' = |S'|$ is typically 20–40 % of $N$.

### 5.5 Phase 3 — Embedding ANN: candidate edge graph

For each $s_i \in S'$ we query Firestore's native `findNearest`:

```
WHERE parentId == Q
ORDER BY <cosine distance to v_i>
LIMIT 20
```

The query is server-side-filtered to the question and uses the existing flat vector index on `(parentId, embedding)`. Each returned match $s_j$ with cosine similarity $\sigma(\mathbf{v}_i, \mathbf{v}_j) \ge \tau_{\mathrm{cand}}$ becomes a candidate edge $(i, j, \sigma)$.

The default $\tau_{\mathrm{cand}} = 0.90$ is intentionally aggressive. It functions as a recall ceiling: pairs below 0.90 are not even considered for verification. We choose a high candidate threshold because the verification step is more expensive per pair than the ANN step, and false negatives at this stage are recoverable in subsequent runs at lower thresholds, while false positives cascade.

Edges are persisted in `statements/{Q}/synthesisRuns/{runId}/edges` with status `unverified`, alongside a cursor on the run document so the chunked Cloud Function chain can resume after a timeout. In practice $E$ is sublinear in $N'$ for typical deliberation datasets.

### 5.6 Phase 4 — LLM-as-judge: four-way verdict

This is the central methodological step. For each unverified candidate edge, we run a semantic-equivalence judgment via Gemini 2.5-Flash, batched at 20 pairs per call, using a four-way verdict:

| Verdict | Interpretation | Action |
|---|---|---|
| `same` | Paraphrase or near-duplicate of the same proposal | Keep edge as confirmed |
| `related` | Same topic, different stance / recommendation / magnitude | Drop edge |
| `different` | Embeddings happened to be close; proposals are unrelated | Drop edge |
| `opposite` | Explicit contradictions of the same proposition | Drop edge |

The four-way verdict broadens the binary opposite/not-opposite check used in negation detection (§3.5). The existing binary check catches explicit negation but cannot distinguish "related but not duplicate" from "duplicate" — which is the dominant false-positive mode for synthesis.

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

Each Gemini 2.5-Flash call processes 20 pairs at ~1–3 seconds wall-clock and on the order of $4 \times 10^{-4}$ USD. For $E = 10\,000$ candidate edges this gives ~500 calls, ~$0.20 total cost, and ~1–2 minutes total wall-clock at modest parallelism.

#### Why batch at 20 pairs

Batching is the dominant cost control. A single LLM call carrying 20 pairs uses roughly the same input tokens as a single-pair call (the surrounding instructions dominate the prompt) but produces 20 verdicts. Above 20 pairs per call, output JSON becomes unreliable in our measurements (the model truncates or hallucinates pairIndex values). The 20-per-call number is inherited from the existing negation-detection service, where it has been observed to be stable in production.

#### Verdict cache (content-addressable)

Verdicts are persisted in a `synthesisVerdicts` collection keyed by

$$
\mathrm{pairKey} = \mathrm{sha1}\big(\min(h_A, h_B) \;\Vert\; \text{“|”} \;\Vert\; \max(h_A, h_B)\big),
\qquad h_X = \mathrm{sha1}\big(\mathrm{normalize}(\mathrm{text}(X))\big),
$$

so the entry is symmetric in $(A, B)$ and content-addressable: any text edit on either side mutates the doc id and forces a fresh judgment. Each row stores `(textHashA, textHashB, verdict, reason, modelId, promptVer, createdAt)`. A row is treated as a hit only if the persisted `modelId` and `promptVer` match the running configuration **and** both `textHashA, textHashB` match the incoming pair's freshly-computed hashes. Bumping `promptVer` (or switching model) invalidates the entire cache without a migration.

Phase 4 then becomes: for $E$ candidate edges, batch-fetch verdicts in chunks of 30 via Firestore `where(documentId, 'in', …)`, route only the misses to the LLM batches of 20, and persist the new verdicts back. Fallback verdicts (`different` produced by an LLM-call failure or a parse miss) are explicitly **not** written to the cache, so a transient model error never freezes a permanent merge decision.

The dominant practical effect is on **re-runs**. A first synthesis pass on a 500-option question with $\sim 50$ candidate edges still issues $\sim 3$ Gemini calls. A second pass shortly after — typical when an admin tunes thresholds or re-runs after a small batch of new options arrives — issues $0$ calls for any pair whose member texts have not changed. Incremental synthesis becomes cheap by construction: only edges touching new or edited options pay the LLM cost.

### 5.7 Phase 5 — Union-Find on verified-same edges

Once all edges have a verdict, we restrict to $E_{\mathrm{same}} = \{(i,j) : \mathrm{verdict}(i,j) = \mathrm{same}\}$ and apply a standard disjoint-set union-find with path compression and union-by-rank. Each connected component of the verified graph $(S', E_{\mathrm{same}})$ is a candidate synthesis group. This step is $O(E\, \alpha(N'))$ — effectively linear.

### 5.8 Phase 6 — Complete-linkage post-filter

Single-linkage clustering (which union-find on a thresholded graph effectively performs) suffers from **chaining**: $A$ is `same` as $B$, $B$ is `same` as $C$, but $A$ and $C$ may be unrelated. Naive union-find would merge $\{A, B, C\}$ — a real failure mode that produces oversized "duplicate" groups containing genuinely different proposals connected only through a chain of borderline judgments.

We apply a complete-linkage post-filter. For each component $G$ of size $> 2$:

1. Compute all internal pairs $\{(i, j) : i, j \in G, i < j\}$.
2. For any internal pair without a verdict yet, run one more LLM-as-judge batch.
3. If any internal pair has verdict $\ne \mathrm{same}$, split $G$ at the weakest such pair and recurse.

After this filter, every group $G$ satisfies $\forall i, j \in G : \mathrm{verdict}(i,j) = \mathrm{same}$ — every member is mutually confirmed as a paraphrase of every other member. This adds at most $\binom{|G|}{2}$ additional verifications per group, which is small for typical group sizes (most groups are 2–5 members).

### 5.9 Phase 7 — Preview, confirmation, execution

The pipeline now has a candidate set of synthesis groups. Two human-in-the-loop steps follow.

1. **Title generation.** For each group, an existing title-generation service produces a merged title and description.
2. **Admin confirmation.** The operator sees each group with member previews, the LLM `reason` strings ("merging because: …"), and the suggested merged title. They can edit, accept, or reject per group before execution.

On execution, each accepted group is passed to `performIntegration` (§6.1), which atomically creates the merged statement, hides the originals, and migrates evaluations. The bulk synthesis pipeline therefore writes data through the same path as the per-idea integration flow, ensuring consistency across the two entry points.

---

## 6. Shared Infrastructure

### 6.1 The merge primitive — `performIntegration`

Both per-idea integration (admin merges two proposals manually) and bulk synthesis (admin confirms a synthesis group) call the same primitive. Effects:

1. Create a new `Statement` with `isCluster: true`, `integratedOptions: [memberIds]`, `derivedByPipeline: 'synthesis' | 'topic-cluster'`.
2. Migrate member evaluations via per-user deduplication (§6.2).
3. Hide originals: `hide: true, integratedInto: <newId>`.
4. Bump the parent's `lastChildUpdate` so client subscriptions invalidate.

This is why a hybrid cluster, a topic cluster, and a synthesized solution share the same data shape — they ARE the same shape; they got there by different algorithms.

At the **end of every synthesis run**, an explicit finalization pass calls `recomputeClusterEvaluation` for each newly-created cluster. This re-runs the per-user-deduplicated aggregation of §6.2 against current member evaluations, writes the canonical `StatementEvaluation` (mean, agreement, like-mindedness, confidence index, distribution counts) to the cluster doc, syncs `clusterEvaluationLinks` provenance, and emits an audit log per cluster. The pass is O(K) reads + writes for K created clusters and provides a single, observable point of truth: after the run returns, every produced cluster carries the augmented evaluation it would compute from the live evaluation table. Hybrid clustering performs the equivalent step inline, computing each cluster's aggregated evaluation before writing the cluster statement (§3.6).

### 6.2 Per-user-deduplicated evaluation aggregation

When a synthesis group (or any cluster) is built, member evaluations are not summed naively. A user who voted on three variants of the same idea must count once, not three times.

For each user $u$ who evaluated any member of $G$, define their per-group evaluation as

$$
\hat e_{u,G} = \frac{1}{|G \cap \mathrm{evaluated}(u)|} \sum_{s \in G \cap \mathrm{evaluated}(u)} e_{u,s},
$$

and the aggregated group evaluation as the standard mean of $\hat e_{u,G}$ over the unique users who evaluated any member. The number of evaluators on the cluster is the number of unique users, **not** the sum of per-member evaluator counts.

This deduplication is essential. Without it, both clustering and synthesis would *amplify* the engagement signal of any user who happened to vote on multiple variants — which is exactly the kind of distortion the system was designed to remove.

### 6.3 Cluster aggregation cache and invalidation

Per-cluster aggregations (`uniqueEvaluatorCount`, `averageClusterConsensus`, pro/con/neutral counts, etc.) are cached in a `clusterAggregations` collection keyed by `${clusterId}--${framingId}`. A Firestore `onWrite` trigger on the `evaluations` collection marks affected aggregations stale. The next read recomputes via the deduplication of §6.2.

The trigger marks three potentially-affected aggregations stale, in this order:

1. **Per-framing aggregations.** Every entry of `statement.framingClusters[framingId] = clusterId` on the changed statement.
2. **Direct-parent clusters.** When `statement.parentId` is itself a cluster (legacy / direct-child clustering paths).
3. **Synthesized-cluster aggregations.** When `statement.integratedInto` is set — i.e. the statement is a hidden member of a synthesized cluster. This branch closes the linkage gap that motivated §8.7: a hidden member's `parentId` is the original question, not the synthesized cluster, so without an explicit `integratedInto` lookup the synthesized cluster's aggregation would never invalidate when its members' evaluations changed.

Each branch is an idempotent fast-exit: the trigger reads the candidate aggregation doc first and skips the write if `isStale` is already `true`. Bursts of evaluations on a popular member therefore collapse to one stale-write per affected aggregation rather than one write per evaluation.

Per-(cluster, user) provenance lives in a separate `clusterEvaluationLinks` collection, supporting after-the-fact explainability ("this user contributed value $x$ to this cluster via these member options"). The end-of-run finalization pass (§6.1) keeps these links in sync alongside the aggregated evaluation.

---

## 7. Scaling Analysis

### 7.1 Hybrid clustering

| Scale | $n$ | Firestore reads | k-means | Total time | Est. monthly cost |
|---|---|---|---|---|---|
| Small | 100 | ~100 | < 100 ms | < 1 s | < $1 |
| Medium | 5 000 | ~5 000 | < 2 s | < 20 s | ~$7 |
| Large | 50 000 | ~50 000 | < 3 s* | < 2 min | ~$72 |

*With 5 000-sample k-means + nearest-centroid assignment for the remainder.*

The system operates within standard Firebase Cloud Functions (Node.js, 1 GiB) without dedicated ML infrastructure. Embeddings are generated once at proposal creation and cached on the document. The only recurring API cost is for Gemini cluster naming and negation detection — 5–15 LLM calls per clustering cycle.

### 7.2 Idea synthesis

Let $N$ be the total options under a question, $N'$ the surviving subset after pre-filtering, $E$ the candidate-edge count, $K$ the final group count, $\overline{|G|}$ the average group size.

| Phase | Complexity | Bottleneck |
|---|---|---|
| 1: coverage check | $O(1)$ | one Firestore aggregate read |
| 2: pre-filter | $O(N)$ | linear scan |
| 3: ANN edge building | $O(N' \log N)$ via Firestore `findNearest` | $N'$ vector queries (parallelized) |
| 4: LLM verdict | $O(E_{\mathrm{miss}} / 20)$ batched LLM calls | network latency, dominated by cache misses |
| 5: union-find | $O(E\, \alpha(N'))$ | effectively linear |
| 6: complete-linkage | $O(K \cdot \overline{|G|}^2 / 20)$ extra LLM calls (cache-hit on re-runs) | small |
| 7: title + execute | $O(K)$ LLM calls + $O(K)$ Firestore writes (parallelized at width 5) | linear |

The Phase 3 vector queries and Phase 7 integration writes are independent across candidates / groups and run under bounded `Promise.all` (concurrency 30 and 5 respectively). On the small-question regime (≤500 options) this is the dominant wall-clock optimization; the 1 GiB Cloud Function instance handles the parallelism without quota pressure. Phase 4's complexity is over **misses** ($E_{\mathrm{miss}}$): the verdict cache (§5.6) collapses re-runs to near-zero LLM cost.

| Regime | $N$ | Wall-clock | Notes |
|---|---|---|---|
| v1 (deployed) | up to 10 000 | ~2–3 minutes (cold cache) | Single Cloud Function chain, parallel ANN + integrations |
| v1 re-run | up to 10 000 | ~10–20 seconds | Verdict cache turns Phase 4 into Firestore lookups |
| v2 (deferred) | up to 100 000 | ~30 minutes | Requires OpenAI Batch API for embedding backfill and Cloud Tasks for parallelism |

For $N = 10\,000$:
- Embedding backfill (if needed): ~$0.02 USD on `text-embedding-3-small`.
- LLM-as-judge (cold cache): ~$0.20 USD on Gemini 2.5-Flash (500 batched calls of 20 pairs).
- LLM-as-judge (warm cache, no edits): ≈$0.00 — every pair hits the cache.
- Title generation: ~$0.05 USD (one call per final group).

Total marginal cost per synthesis run: well under one US dollar on a cold cache, and effectively the cost of Firestore lookups on a warm one. Synthesis can be re-run on demand without budget pressure.

---

## 8. Limitations and Open Questions

### 8.1 Cold start for hybrid clustering

Until a proposal accumulates evaluations, $\alpha$ is high and the hybrid vector is essentially text-only — subject to the same negation blindness as standard embedding methods. The post-clustering negation check mitigates but does not eliminate this issue. Synthesis, by contrast, is intentionally not cold-start-tolerant: its pre-filter $n_{\min} \ge 2$ already excludes proposals without multiple evaluators.

### 8.2 LLM judge as a single point of trust (synthesis)

The four-way verdict is trusted as the merge decision rule. If the model systematically misclassifies a category of pairs — for example, treats sarcastic restatements as `same` rather than `opposite` — those errors propagate. Mitigations:

- **Calibration set.** Maintain a held-out, hand-labelled set of pairs and report the four-way confusion matrix on each LLM provider/version change.
- **Conservative thresholds at the boundary.** Where the LLM expresses low confidence (currently not captured), prefer non-merge.
- **Human-in-loop preview.** Operators see the LLM `reason` strings and can reject groups before execution.

### 8.3 Frame-vs-magnitude pairs (the subtler false-positive)

Pairs like *"add one lane"* / *"add three lanes"* are difficult for both embeddings and the LLM judge, because in some deliberation contexts they are different proposals (concrete plans) and in others they are variants of the same direction (raise capacity). The current prompt favours `related` for magnitude differences, which we believe is correct, but this is the most prompt-sensitive boundary. Empirical calibration is recommended before deployment.

### 8.4 Rating-vector dimensionality

The 8-dimensional rating vector was chosen pragmatically from available aggregation fields. A data-driven approach (e.g. PCA on the user–option evaluation matrix projected to a fixed dimensionality) might capture richer evaluative structure. We have not yet observed cases where the 8-d formulation is the bottleneck, but the choice deserves empirical validation.

### 8.5 $\alpha$ calibration

The decay parameter $\beta = 0.3$ was selected by heuristic reasoning about desired crossover points ($\alpha = 0.5$ at $n \approx 37$). Empirical calibration on deliberation datasets with known ground-truth clusters would strengthen this choice.

### 8.6 Cluster stability

Frequent re-clustering can cause proposals to migrate between clusters, potentially confusing users who track a specific cluster over time. A stability-weighted assignment (penalising cluster switches) is a natural extension.

### 8.7 Re-aggregation after evaluation drift (synthesis)

When a synthesis is created, the aggregated evaluation is computed once and stored on the synthesized statement document. The framing-aware **cache layer** is now kept current: the `onEvaluationChangeInvalidateCache` trigger marks the synthesized cluster's `clusterAggregations` row stale via the `integratedInto` linkage (§6.3), so any read through `getClusterAggregations` recomputes against current evaluations. The end-of-run finalization pass (§6.1) further guarantees the cluster doc itself reflects truth at the moment a run completes.

Between runs, the cluster statement's stored `evaluation` field can still drift relative to live member evaluations — direct reads of the doc (cards, lists, search results) see the snapshot from the last finalize, not the live aggregate. A Firestore trigger that re-runs `recomputeClusterEvaluation` on member-evaluation writes would close this gap completely; it is deferred until trigger-amplification budgeting is in place on high-traffic questions, since a single popular member could otherwise drive O(evaluations) recomputes per second. The cache-and-finalize approach is the chosen interim: the gap is observable only in non-cache reads, and the existing fast-exit on `isStale` keeps trigger work bounded for the cache layer.

### 8.8 Cross-question synthesis is out of scope

The synthesis pipeline is scoped to one question. Two questions about the same topic are not deduplicated against each other. This is intentional: each question is its own deliberative unit with its own evaluator pool, and merging across questions would conflate distinct epistemic populations.

### 8.9 Reversibility

`performIntegration` is currently not natively reversible — originals are hidden, not deleted, but the platform does not expose an admin "unsynthesize" action. Reversibility should be added before broad deployment so synthesis errors can be corrected without manual data work.

### 8.10 Provenance

Every synthesis run is logged with its run id, threshold, filters, candidate-edge set, LLM verdicts, and the operator who confirmed it. This provenance is intended to support after-the-fact audit: any synthesis decision should be traceable to (a) which embedding cosine triggered the candidacy, (b) what verdict the LLM returned with what reason, and (c) who confirmed the merge. The persistence schema (`synthesisRuns/{runId}/edges`) supports this audit; the audit UI is not yet defined.

---

## 9. Conclusion

We have presented a unified clustering and synthesis architecture for a large-scale deliberation platform. Three observations support the design.

First, **two computational problems coexist** in deliberation — fragmentation of paraphrases (synthesis) and organization of distinct ideas (clustering) — and they require different remedies even though they appear to be solvable by the same embedding similarity tool. Treating them separately, with shared infrastructure, lets each layer use the right signal at the right scale.

Second, **embeddings encode topical proximity, not propositional content**. Both layers therefore treat embedding similarity as a *candidate generator*, not a decision rule. Hybrid clustering verifies through community evaluation data (the rating vector) plus an LLM negation check; synthesis verifies through a four-way LLM-as-judge plus complete-linkage refinement. The unifying principle is the same; the mechanisms differ because the questions differ.

Third, **per-user deduplicated evaluation aggregation is essential**. Without it, both layers would amplify the engagement of any user who voted on multiple variants, exactly the distortion the system was built to repair. The deduplication is the bridge between the cluster/synthesis structure and the downstream consensus metrics that participants actually see.

The system operates within standard cloud infrastructure — Firebase Cloud Functions, Firestore vector indexes, scheduled background jobs — at marginal cost on the order of cents per run, scaling to tens of thousands of options per question. The mechanism is implemented and deployed in the Freedi platform, where hybrid clustering and synthesis coexist with topic clustering and admin-defined framings, respecting the platform's principle that multiple valid perspectives on the same set of proposals can coexist.

We invite scientific review of:
- the four-way verdict prompt design and category boundaries (§5.6),
- the chaining-mitigation in the complete-linkage post-filter (§5.8),
- the per-user evaluation aggregation correctness (§6.2),
- the limitations enumerated in §8 — particularly the cold-start (§8.1), frame-vs-magnitude (§8.3), and stability (§8.6) issues.

---

## References

Arthur, D., & Vassilvitskii, S. (2007). K-means++: The Advantages of Careful Seeding. *Proceedings of SODA 2007*, 1027–1035.

Fishkin, J. S. (2018). *Democracy When the People Are Thinking: Revitalizing Our Politics Through Public Deliberation*. Oxford University Press.

McInnes, L., Healy, J., & Astels, S. (2017). hdbscan: Hierarchical density based clustering. *Journal of Open Source Software*, 2(11), 205.

Niklaus, J., Chalkidis, I., & Stötzer, M. (2023). An Empirical Study on the Robustness of Transformer-based Embeddings to Negation. *Findings of ACL 2023*.

Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. *Proceedings of EMNLP-IJCNLP 2019*, 3982–3992.

Small, C., Bjorkegren, M., Erkkilä, T., Shaw, L., & Megill, C. (2021). Polis: Scaling Deliberation by Mapping High-Dimensional Opinion Spaces. *Recerca: Revista de Pensament i Anàlisi*, 26(1).

Tessler, M. H., Bakker, M. A., Jarrett, D., et al. (2024). AI Can Help Humans Find Common Ground in Democratic Deliberation. *Science*, 386(6719).

Freedi Project (2026). WizCol: Weighted Consensus Calculation for Collective Intelligence. *Freedi Technical Report*.
