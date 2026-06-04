# Clustering and Synthesis in Large-Scale Deliberation

**A unified verified-embedding approach with hybrid text–rating vectors**

**Authors:** Tal Yaron · Claude (Anthropic)
**Affiliation:** Freedi — Free Deliberation Platform
**Status:** Draft for scientific review
**Last updated:** 2026-06-01

---

## Abstract

Open-ended deliberation produces hundreds to thousands of proposals per question. Two distinct computational problems emerge. First, the same idea is restated by many participants in different words — a *fragmentation* problem that distributes votes across paraphrases and distorts comparative metrics. Second, the volume of distinct ideas needs to be organized so participants can navigate and compare them — a *clustering* problem that requires grouping proposals into coherent thematic categories.

Standard text-embedding clustering systematically fails on both fronts: modern embeddings encode **topical proximity, not propositional content**. The pair *"raise taxes on wealth"* / *"lower taxes on wealth"* embeds at cosine ≥ 0.92 in `text-embedding-3-small`, despite being semantic opposites. Naive embedding-only methods conflate paraphrases with opposites and amplify the very distortions they are meant to repair.

We describe a unified clustering and synthesis architecture for the Freedi deliberation platform that addresses both problems with a coherent set of techniques over a single embedding space (OpenAI `text-embedding-3-small`, 1 536-d):

1. **Hybrid text–rating clustering** — composite vectors blending text embeddings with an 8-dimensional evaluation-statistics vector via an adaptive weighting parameter $\alpha(n)$, k-means with automatic $k$ selection, and a post-clustering LLM negation-detection step. Resolves the topical-vs-positional confound.
2. **Idea synthesis** — two coexisting pipelines over the same option pool: a *live single-option* decision tree that runs on every option write (five-pass attach / spawn / review tree, cosine as candidacy gate, LLM as synth-vs-topic-cluster judge), and a *bulk* admin-triggered pipeline that clusters all eligible options in one in-memory UMAP→DBSCAN pass and verifies each cluster with a medoid-anchored, cosine-banded two-tier judge (auto-accept ≥ 0.94, gray-band LLM, auto-reject < 0.82) with a hard per-run LLM-call cap. Both pipelines produce two cluster kinds — *synths* (merged paraphrases with a generated proposal) and *topic-clusters* (distinct ideas under a generated theme label) — chosen at spawn time by the LLM.
3. **Shared infrastructure** — per-user-deduplicated evaluation aggregation, a single merge primitive (`performIntegration`), an end-of-run finalization pass over created clusters, and a cached cluster-aggregation layer with event-driven invalidation that closes the linkage gap for hidden synth members via `integratedInto`. Both layers coexist on the same option pool and feed the same evaluation downstream.

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

A single embedding space (OpenAI `text-embedding-3-small`, 1 536-d) underlies both layers. *Hybrid clustering* concatenates each option's text embedding with an 8-dimensional rating vector derived from community evaluations, producing a 1 544-d composite vector that is clustered by k-means with automatic $k$, then post-processed by an LLM negation detector to split cosmetically-similar but positionally-opposed pairs. *Synthesis* runs as two coexisting pipelines on the same option pool: a *live* single-option pipeline that fires on every option write — five-pass tree that ANN-searches the option against existing clusters, attaches above `attachThreshold` (synths) or `clusterThreshold` (topic-clusters), and otherwise asks an LLM whether the top candidate pair can be merged into a synthesized proposal (synth) or only labelled as a shared theme (topic-cluster); and a *bulk* admin-triggered pipeline that performs one in-memory UMAP→DBSCAN clustering pass over all eligible options, then verifies each cluster with a medoid-anchored two-tier judge (cosine bands at 0.94 / 0.82 with gray-band LLM calls and a complete-linkage refinement on dissenters) before generating per-group synthesis proposals or topic labels. Both layers write through a single integration primitive (`performIntegration`), inherit a per-user-deduplicated evaluation aggregation, and trigger an end-of-run finalization pass that recomputes each created cluster's aggregated evaluation.

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

This section addresses the fragmentation problem of §1.1: collapsing paraphrases of the same idea into one canonical proposal whose evaluation is the per-user-deduplicated aggregate of its members'. The same machinery also produces *topic-clusters* — groupings of distinct-but-related ideas under a shared theme label — when an LLM judges that members share a subject but cannot honestly be merged into a single proposal.

Two pipelines coexist on the same option pool:

- A **live single-option pipeline** (`runSinglePipeline`) runs on every option write and on threshold-cross events, making one cluster decision at a time with bounded LLM cost (≤ 2 calls per option).
- A **bulk pipeline** (`synthesizeIdeasPreview` / `synthesizeIdeasExecute`) is admin-triggered and processes all eligible options for a question in one pass, with human-in-loop confirmation before execution.

Both write through the same merge primitive (`performIntegration`, §6.1) and share the same verdict cache (§5.7). They differ in their decision-tree shape; the algorithms below describe each in turn.

### 5.1 Notation and cluster kinds

Let $Q$ be a question with option set $S = \{s_1, \dots, s_N\}$. Each option $s_i$ has a textual statement $\mathrm{text}(s_i)$, a normalized embedding $\mathbf{v}_i \in \mathbb{R}^{1536}$, and an evaluation summary $\mathrm{eval}(s_i)$ including average $\bar e_i$, evaluator count $n_i$, and consensus $c_i$. Synthesis produces a set of disjoint groups $\{G_1, \dots, G_K\}$ with $G_k \subseteq S$, each of one of two kinds:

| Kind | Members | LLM artifact | Predicate |
|---|---|---|---|
| **Synth** | paraphrases of one idea | generated merged proposal title + description | `isSynth()` |
| **Topic-cluster** | distinct ideas on a shared theme | generated topic label only | `isTopicCluster()` |

The choice between synth and topic-cluster is made at spawn time by a single LLM call (`generateSynthesizedProposal`): if a coherent merged proposal can be honestly written from the members, the result is a synth; if the model returns `cannotSynthesize`, the system falls back to `generateTopicLabel` and the result is a topic-cluster. Both shapes use the same `Statement` schema, the same `integratedOptions` member list, and the same aggregation infrastructure (§6); the distinction is purely in what the spawn-time LLM concluded.

### 5.2 The live single-option pipeline

For every option write (creation, edit, evaluation crossing a threshold), `runSinglePipeline` runs a five-pass decision tree against the existing cluster set under the same parent. Cosine is treated as a **candidacy gate**, never as a merge decision rule — the LLM is the synth-vs-topic-cluster judge. This makes spawning robust to embedding-model drift (`text-embedding-3-small` places real paraphrases around 0.78, well below any threshold a human would naïvely set for "near-duplicate").

#### Pre-checks

The pipeline skips work if:
- the option is already a member of some cluster (`integratedOptions.length > 0`);
- the trigger is a continuous source (`onCreate` or `onThresholdCross`) and continuous synthesis is disabled in the parent's `synthesisSettings`;
- the option's evaluator count or consensus falls below configured `minEvaluators` / `minConsensus` (skipped only when `forceProcess = false`; admin-initiated `synthesizeNow` and `selective` bypass the check).

Otherwise the pipeline computes (or reuses a caller-supplied) embedding and runs an ANN search over the option's parent:

```
vectorSearchService.findSimilarByEmbedding(embedding, parentId, {
  limit: NEIGHBOR_LIMIT = 10,
  threshold: settings.reviewLowerBound,
})
```

If no neighbor returns above `reviewLowerBound`, the option is seeded as a singleton and the pipeline returns.

#### Best-evidence index and full-member expansion

For each candidate cluster appearing in the neighborhood, the pipeline computes a *best-evidence* score:

$$
\mathrm{bestEvidence}(C) \;=\; \max\Big( \sigma(\mathbf{v}, \mathrm{title}(C)),\;\; \max_{m \in C \cap \mathrm{neighbors}} \sigma(\mathbf{v}, m) \Big).
$$

The transitive-via-member term is load-bearing. LLM-merged synth titles are abstracted and shortened, so the cluster *title*'s cosine to a long-form paraphrase often drops well below the cosine of the original *members*' text. Without the transitive bump, a fresh paraphrase at cosine 0.76 to an existing synth's member would be picked as a spawn sibling — producing a duplicate synth that shares a member with the original. With the bump, the original synth gets the member's cosine credited as its own evidence and Pass 1 attaches the paraphrase instead.

A second expansion stage (`expandClusterEvidenceViaFullMembers`) fetches every member's stored embedding for clusters in the candidate set and promotes their `bestEvidence` using the average of the top-2 member cosines. This covers the case where a cluster has many members but only one or two land inside the top-10 ANN window — without expansion the cluster would fall below the attach gate and a duplicate would be spawned.

#### The five passes

| Pass | Action | Condition | LLM cost |
|---|---|---|---|
| 1 — Synth attach | Attach to the highest-evidence synth | `bestEvidence ≥ attachThreshold` | 0 |
| 2 — Topic-cluster attach | Attach to the highest-evidence topic-cluster | `bestEvidence ≥ clusterThreshold` (more lenient than `attachThreshold`) | 0 |
| 3 — Spawn | Run `generateSynthesizedProposal` on the (option, top non-clustered candidate) pair | top *plain* candidate at cosine ≥ `clusterThreshold` | 1 LLM (synth) or 2 LLM (synth attempt + topic-label fallback on `cannotSynthesize`) |
| 4 — Review | Queue pair for admin review | top candidate at cosine ≥ `reviewLowerBound` but no plain option above `clusterThreshold` | 0 |
| 5 — Singleton | Leave option as-is | no candidate above `reviewLowerBound` | 0 |

Pass 3 explicitly skips options that already belong to a candidate cluster — they should have been picked up by Pass 1 or 2 through transitive evidence; if they weren't, spawning from them would only create a duplicate synth. Spawn is debounced per option to prevent flapping when an option oscillates near the threshold; `synthesizeNow` and `selective` sources bypass the debounce window because the admin explicitly asked for the work.

The settings `attachThreshold`, `clusterThreshold`, `reviewLowerBound` are stored on the parent question and inherit down its sub-tree; admins tune them from the synthesis settings panel.

### 5.3 The bulk pipeline

The bulk pipeline is invoked from the synthesis admin panel ("Synthesize now", "Selective synthesis") or from the scheduled `fn_synthesisBulkFlush` re-truth sweep. It runs five phases, each resumable; intermediate state is persisted in Firestore so a Cloud Function chain can pick up after a 9-minute timeout without recomputation.

```
[Phase A] Pre-flight: embedding coverage + pre-filter on engagement
[Phase B] Bulk clustering: in-memory UMAP → DBSCAN
[Phase C] Two-tier judge: medoid-anchored cosine bands + gray-band LLM
[Phase D] Per-cluster synthesis-proposal generation (synth vs topic-cluster)
[Phase E] Preview, admin confirmation, execution
```

### 5.4 Phase A — Pre-flight: coverage and pre-filter

#### Coverage

Synthesis requires a near-complete embedding index. The pipeline aborts unless

$$
\frac{\#\{i : \mathbf{v}_i \text{ exists}\}}{N} \ge 0.9.
$$

If the threshold is not met, the operator is offered a backfill action. The 90 % threshold is stricter than the platform's 50 % bar for per-idea similarity search, because the per-idea flow tolerates some misses (it surfaces what it can find), while bulk synthesis must approach exhaustiveness or it leaves duplicates undetected.

#### Pre-filter on engagement

Most options under a deliberation question receive little engagement: the long tail of low-quality, joke, or off-topic proposals. Synthesizing them is both wasteful and counterproductive — low-engagement variants of the same noise are not duplicates worth presenting as one.

Three filters are applied before any vector operation:
- $\bar e_i \ge \bar e_{\min}$ (configurable, default unset),
- $c_i \ge c_{\min}$ (configurable, default unset),
- $n_i \ge n_{\min}$ (configurable, default 2).

In observed datasets, $N' = |S'|$ is typically 20–40 % of $N$.

### 5.5 Phase B — Bulk clustering (in-memory UMAP → DBSCAN)

The bulk pipeline replaces the per-option ANN edge graph used in earlier architectures with a single in-process clustering pass over the pre-filtered embedding matrix. This is the same primitive that drives topic-clustering in production (`services/topic-cluster/cluster.ts`); the bulk-synthesis module wraps it with a synthesis-layer API.

1. **UMAP projection.** Project the pre-embedded options from 1 536-d cosine space to a 5-d Euclidean space with a deterministic RNG seed (default 42). Five components is sufficient to separate clusters of 1 536-d embeddings while keeping DBSCAN cheap.
2. **DBSCAN.** Apply DBSCAN with $\varepsilon = 1.0$ (UMAP space) and $\text{minPts} = \max\big(3,\ \lceil N'/200 \rceil\big)$. Small datasets stay at 3 (matching topic-cluster); minPts scales gracefully to ~50 at 10 000 inputs for tighter macro-clusters at scale.
3. **Tiny inputs.** Below `umapMinItems = 10` items the UMAP/DBSCAN step is skipped and each item is its own singleton cluster (UMAP requires at least `nNeighbors + 1` points).
4. **Noise recovery.** Points marked noise by DBSCAN are reassigned to the nearest cluster centroid (cosine in *original* embedding space) when similarity exceeds `nearestCentroidThreshold = 0.6`; otherwise they remain noise and pass through to the next pipeline run.

Complexity drops from $O(N')$ Firestore vector queries (the prior architecture's per-anchor `findNearest`) plus $O(E)$ LLM verdicts (where $E$ scales with $N'$) to a single in-process clustering pass. Empirically: ~30 s on a 1 vCPU Cloud Function for 10 000 items, well under the 540 s function budget. Memory at 100 000 1 536-d embeddings is ≈ 600 MB raw, comfortable on a 2 GiB function once UMAP's working set is added.

This module is pure (no Firestore I/O) and deterministic given the seed, which makes it both testable in isolation (see §5.10) and reproducible across re-runs.

### 5.6 Phase C — Two-tier judge (medoid-anchored cosine bands)

For each DBSCAN-output cluster $C$, the pipeline verifies that members actually belong together. The naïve approach — issue one LLM verdict per internal pair — is $O(|C|^2)$ in LLM cost per cluster and grows with the squared cluster size; in earlier architectures this dominated the wall-clock cost on cold cache.

The two-tier judge replaces all-pairs verification with a **medoid-anchored** scheme:

1. **Compute the medoid.** Pick the member with the highest mean cosine to the rest of the cluster — the most "central" wording. Linear in $|C|$, no LLM.
2. **Score each non-medoid member $m$.** Compute $\sigma(m, \text{medoid})$.
3. **Apply the verification band.**

   | Band | Condition | Action |
   |---|---|---|
   | Auto-accept | $\sigma \ge 0.94$ | treat as equivalent to medoid without LLM |
   | Gray | $0.82 \le \sigma < 0.94$ | LLM-judge `member ↔ medoid` (one cached verdict per member) |
   | Auto-reject | $\sigma < 0.82$ | treat as dissent without LLM |

4. **Tally per cluster.**
   - **Agreement ≥ 80 %**: keep the cluster as-is (`verifiedBy: 'cosine+llm'`).
   - **50–80 %**: keep the agreed subset as the primary cluster; route the dissent subset through `refineComponent` (complete-linkage on the dissent sub-graph) to recover any internal sub-clique. Recovered sub-cliques become their own verified clusters (`verifiedBy: 'cosine+llm'`) on output.
   - **< 50 %**: drop the cluster entirely — cosine alone was not enough signal to assemble it.

A hard run-level cap (`maxLlmCalls`, default `min(2000, |workingSet| × 0.2)`) prevents budget blowouts on pathological inputs. When the cap is hit, remaining clusters are accepted on cosine signal alone with `verifiedBy: 'cosine-only'`; the admin UI surfaces those for manual review before commit.

The reduction in LLM cost is structural. Where all-pairs verification issues $O(|C|^2)$ verdicts per cluster, the two-tier judge issues at most $|C| - 1$ verdicts — and only for gray-band members. Auto-accept and auto-reject members consume zero LLM budget. Complete-linkage refinement is still used, but only on the dissent sub-graph of split clusters, not as a global post-filter on every component. The four-way verdict prompt and the verdict cache (§5.7) are unchanged from the prior architecture.

### 5.7 Verdict cache and the four-way prompt

Both the live and bulk pipelines, and the dissent-subset complete-linkage refinement, share a single verdict cache and prompt.

#### Four-way verdict

The LLM-as-judge returns one of four verdicts, broadening the binary opposite/not-opposite check used in §3.5's negation detection:

| Verdict | Interpretation | Action |
|---|---|---|
| `same` | Paraphrase or near-duplicate of the same proposal | Keep edge as confirmed |
| `related` | Same topic, different stance / recommendation / magnitude | Drop edge |
| `different` | Embeddings happened to be close; proposals are unrelated | Drop edge |
| `opposite` | Explicit contradictions of the same proposition | Drop edge |

The binary check catches explicit negation but cannot distinguish "related but not duplicate" from "duplicate" — which is the dominant false-positive mode for synthesis.

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

The prompt explicitly distinguishes paraphrase (`same`) from any form of disagreement or specification difference, forcing the model to make a deliberate choice rather than collapsing into a permissive "yes-similar" judgment.

#### Batching

Each Gemini 2.5-Flash call processes up to 20 pairs at ~1–3 s wall-clock and on the order of $4 \times 10^{-4}$ USD. A 20-pair call uses roughly the same input tokens as a 1-pair call (the surrounding instructions dominate the prompt), but produces 20 verdicts. Above 20 pairs per call, output JSON becomes unreliable in our measurements (the model truncates or hallucinates `pairIndex` values). The 20-per-call number is inherited from the existing negation-detection service, where it has been observed to be stable in production.

#### Cache key and invalidation

Verdicts are persisted in a `synthesisVerdicts` collection keyed by

$$
\mathrm{pairKey} = \mathrm{sha1}\big(\min(h_A, h_B) \;\Vert\; \text{“|”} \;\Vert\; \max(h_A, h_B)\big),
\qquad h_X = \mathrm{sha1}\big(\mathrm{normalize}(\mathrm{text}(X))\big),
$$

so the entry is symmetric in $(A, B)$ and content-addressable: any text edit on either side mutates the doc id and forces a fresh judgment. Each row stores `(textHashA, textHashB, verdict, reason, modelId, promptVer, createdAt)`. A row is treated as a hit only if the persisted `modelId` and `promptVer` match the running configuration **and** both `textHashA, textHashB` match the incoming pair's freshly-computed hashes. Bumping `promptVer` (or switching model) invalidates the entire cache without a migration.

Cached verdicts are consumed by the two-tier judge's gray-band LLM call, by the dissent-subset complete-linkage refinement (`refineComponent`), and by the live pipeline's Pass 3 LLM call (in spawn-proposal generation). Fallback verdicts (`different` produced by an LLM-call failure or a parse miss) are explicitly **not** written to the cache, so a transient model error never freezes a permanent merge decision.

The dominant practical effect is on **re-runs**. A first bulk synthesis pass on a 500-option question with ~30 gray-band verdicts issues ~2 Gemini calls (batched). A second pass shortly after — typical when an admin tunes thresholds or re-runs after a small batch of new options arrives — issues 0 calls for any pair whose member texts have not changed. The live pipeline's per-option calls similarly hit the cache when an option is re-saved or re-evaluated without text edits. Incremental synthesis becomes cheap by construction: only edges touching new or edited options pay the LLM cost.

### 5.8 Phase D — Per-cluster synthesis-proposal generation

For each verified cluster from the two-tier judge, the bulk pipeline calls `generateSynthesizedProposal` once. Two outcomes:

- **Proposal returned** → the cluster is marked as a candidate **synth**, with a merged title and description constructed from the member texts.
- **`cannotSynthesize`** → fall back to `generateTopicLabel`; the cluster becomes a candidate **topic-cluster** with a theme label only.

This is the same fork as Pass 3 of the live pipeline (§5.2), invoked here in batch over all verified clusters from Phase C. It is the only LLM step in the bulk pipeline that scales with cluster count $K$ rather than cluster size — and $K \ll N'$ in observed datasets.

### 5.9 Phase E — Preview, confirmation, execution

The bulk pipeline now has a candidate set of synthesis groups, each labelled either as a synth (with merged title) or as a topic-cluster (with theme label). Two human-in-the-loop steps follow.

1. **Preview.** Each candidate group is rendered with member previews, the gray-band LLM `reason` strings from §5.6, the synth proposal or topic label from §5.8, and the verification telemetry (`verifiedBy: 'cosine+llm' | 'cosine-only'`, agreement fraction). Cosine-only clusters and clusters that triggered the dissent-split path are surfaced for closer review.
2. **Admin confirmation.** The operator can edit, accept, or reject each group before execution.

On execution, each accepted group passes to `performIntegration` (§6.1), which atomically creates the merged statement (with the `derivedByPipeline` field set to `'synthesis'` or `'topic-cluster'`), hides the originals, and migrates evaluations. An end-of-run finalization pass calls `recomputeClusterEvaluation` for each newly-created cluster, ensuring its stored aggregated evaluation matches the live per-user-deduplicated computation at the moment the run completes (§6.1).

### 5.10 Testing surface

Each step of the bulk pipeline is exposed as a pure function with no Firestore I/O, which makes it directly testable:

- `bulkClusterByEmbedding(items, options)` — unit-tested in `functions/src/synthesis/__tests__/bulkCluster.test.ts` for deterministic output, noise recovery, scaling behavior, and the tiny-input path.
- `twoTierJudge(candidates, members, options)` — unit-tested in `functions/src/synthesis/__tests__/twoTierJudge.test.ts` for the auto-accept / gray / auto-reject branches, the keep / split / drop tally, the LLM-call cap, and the dissent-subset refinement.
- `refineComponent` (complete-linkage) and `runSinglePipeline` have their own test files for chaining-mitigation correctness and the live decision tree respectively.

Two emulator scripts close the loop end-to-end against a local Firestore:

- `scripts/runTopicClusterEmulator.ts` runs the topic-cluster primitive against a real `parentStatementId` for visual inspection.
- `scripts/inspectSynthBenchmark.ts` dumps the live-synth audit log, candidate queue, and statement set for a question, supporting after-the-fact analysis of pipeline decisions.

### 5.11 Live vs bulk: when each runs

| Trigger | Pipeline | LLM cost |
|---|---|---|
| Option created | live, on-create trigger | ≤ 2 calls per option |
| Option edited / evaluation crosses threshold | live, debounced | ≤ 2 calls per option |
| Admin clicks "Synthesize now" | bulk over all eligible options | bounded by `maxLlmCalls`; typically $O(\text{gray-band members across clusters})$ |
| Admin clicks "Selective synthesis" on a chosen set | bulk over the selected option ids | same as above |
| Scheduled re-truth (`fn_synthesisBulkFlush`) | bulk UMAP→DBSCAN over the question | topic-label naming only; reuses the same primitive |

The live pipeline handles steady-state deliberation: every new or edited option gets exactly one bounded-cost decision. The bulk pipeline is reserved for cold-start ingestion of a previously-unprocessed question, for admin-driven recomputes after threshold tuning, and for scheduled re-truth sweeps that re-cluster the population without committing the result.

> **Implementation note.** This row's "Admin clicks 'Synthesize now'" describes the intended *bulk UMAP→DBSCAN* behavior, but the admin panel's "Synthesize" button is wired to the `synthesizeNow` callable, which enqueues a per-option live-pipeline replay rather than running the bulk pass. See §5.14 for the reconciliation of admin entry points, the feature-flag gating of the UMAP→DBSCAN backend, and where member-hiding actually happens.

### 5.12 Benchmark harness

In addition to the unit tests of §5.10, the pipeline ships with an end-to-end **benchmark harness** that runs the live pipeline against a known-truth corpus on a local Firestore emulator and scores the resulting cluster structure against the ground-truth groupings encoded in the seed. The harness is the closest thing the system has to a regression test for behavioral correctness across embedding, ANN, and LLM-judge changes at once.

#### Benchmark dataset

The canonical seed lives at `scripts/seedSynthBenchmark.data.json`. It encodes one question ("How can we all be happy?") with a deterministic structure:

```
2 topics  ×  2 synths per topic  ×  10 paraphrases per synth   =   40 options
```

Each "synth" is a set of ten lexically distinct paraphrases of the same underlying proposal (e.g. *regular-exercise*: "Exercise regularly to stay physically active and feel happier.", "Make regular physical exercise a daily habit for wellbeing.", …). Each "topic" is a set of two synths that share a subject but are distinct ideas (e.g. *physical-health* contains *regular-exercise* and *healthy-eating*). The two top-level topics (physical-health, social-connection) are designed to be cleanly separable in embedding space.

The corpus is therefore the smallest dataset that exercises every decision the live pipeline can make: synth attach (each new paraphrase after the second), topic-cluster attach (the second synth in a topic), synth spawn (the first paraphrase of each synth seen above threshold), topic-cluster spawn (the first synth seen in a topic), and singleton (any below-threshold residue).

#### Seeder

`scripts/seedSynthBenchmark.ts` is the programmatic seeder. It

1. Refuses to run unless `FIRESTORE_EMULATOR_HOST` is set (the script is emulator-only by construction; no production write path exists).
2. Loads the benchmark JSON, creates a parent question with the configured `questionId` and `questionText`, and seeds options under it with a configurable inter-write delay so the live-synth trigger has time to converge between writes.
3. After the final write, waits a configurable settle window for the pipeline to drain, then queries the question's descendants and prints a tally.

| Env var | Default | Purpose |
|---|---|---|
| `SEED_USER_UID` | platform-specific | emulator auth uid for the option creator |
| `SEED_DELAY_MS` | 2000 (benchmark uses 12000) | ms between option writes |
| `SEED_FINAL_WAIT_MS` | 60000 (benchmark uses 120000) | settle window after last write |
| `SEED_ORDERING` | `sequential` | `sequential` writes synth-by-synth; `interleave` mixes paraphrases across synths to stress-test the attach passes |

#### Success criteria

A correctly-functioning pipeline against this seed produces:

- **2 statements** with `derivedByPipeline === 'topic-cluster'`, parented to the question, one per topic.
- **4 statements** with `derivedByPipeline === 'synthesis'`, two inside each topic-cluster, one per synth.
- Each synth's `integratedOptions` array contains ~10 source-option ids (the ten paraphrases that fed it).
- All 40 source options exist; those absorbed into a synth are marked `hide: true, integratedInto: <synthId>`.

Deviations from these counts are diagnostic:

| Symptom | Likely cause |
|---|---|
| > 4 synths | duplicate-synth fragmentation — the best-evidence transitive-via-member index (§5.2) misfired, typically due to synth-title cosine drift |
| < 4 synths | over-merging — `attachThreshold` is too low, or two synths in the same topic are not embedding-distinguishable enough |
| 0 topic-clusters | the second synth in each topic was merged into the first via Pass 1 instead of attached to a topic-cluster via Pass 2 (`clusterThreshold` too lenient relative to `attachThreshold`) |
| > 2 topic-clusters | spurious topic spawn — review the audit log for the LLM `reason` strings |
| Many seeded-singletons | `reviewLowerBound` too high, or the live trigger is not firing (check `enabled` on the parent's `synthesisSettings`) |

#### Inspect and diagnose

After the seeder finishes, three scripts produce the diagnostic surface:

- `scripts/inspectSynthBenchmark.ts <questionId>` dumps `_synthAuditLog`, `_liveSynthCandidates`, statement counts (visible / hidden / cluster / synth), and embedding-cache coverage. This is the first read for any "did it work?" question.
- `scripts/measureSynthCosines.ts <questionId>` measures the post-run cosine distances from each synth's title embedding to (a) its own members, (b) other synths' members, and (c) non-member options. It surfaces synths whose title embedding has drifted below the platform's 0.5 ANN cutoff, which is the canonical root cause of the "duplicate synth shares a member" failure mode (§5.2).
- `scripts/runTopicClusterEmulator.ts <parentStatementId>` re-runs the topic-cluster primitive directly against the seeded data (requires `OPENAI_API_KEY`), useful for isolating whether a failure is in the live pipeline or in the underlying clustering primitive.

`scripts/cleanBenchmarkQuestion.ts <questionId>` deletes all descendants and audit-log entries under the benchmark question so the same seed can be re-run without manual emulator resets.

#### End-to-end loop

```bash
# 0. start the emulator
npm run deve

# 1. clean any previous run
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/cleanBenchmarkQuestion.ts i176fEztCaq5

# 2. seed the benchmark; waits SEED_FINAL_WAIT_MS for the pipeline to settle
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/seedSynthBenchmark.ts scripts/seedSynthBenchmark.data.json

# 3. inspect: audit log, candidate queue, statement counts
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/inspectSynthBenchmark.ts i176fEztCaq5

# 4. measure cosine distances on the produced synths
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/measureSynthCosines.ts i176fEztCaq5
```

#### Larger and production-derived corpora

For load-shape testing the harness has companion seeders that don't carry ground-truth labels but stress different regimes: `scripts/seed100Solutions.ts` (100 options across 10 themes with 3 pre-built synthesis clusters, used for UI-rendering benchmarks), `scripts/seedSimple100.ts`, `scripts/seedFromWizcolDump.ts`, and `scripts/seedCondensationOptions.ts`. For tests against real-world embedding distributions and evaluator patterns, `scripts/exportProdQuestion.ts` exports a production question (with descendants, evaluations, subscriptions, and clusters) and `scripts/importQuestionToEmulator.ts` re-imports it into the emulator with PII anonymized (user ids and emails sha-256 hashed; statement text passes through unchanged as it is the deliberation content under test). The workflow is documented in `scripts/README-test-data.md`.

The benchmark harness is the regression surface we recommend running on any change to: the embedding model or context format (§2), the live-pipeline thresholds or the best-evidence index (§5.2), the bulk pipeline's UMAP/DBSCAN parameters (§5.5), the two-tier judge bands (§5.6), or the four-way verdict prompt (§5.7). Each of those changes is exactly the sort that passes every unit test and silently degrades end-to-end behavior; the seed-and-inspect loop is what makes the degradation visible.

### 5.13 Empirical reproduction: live-only vs. bulk on the benchmark corpus

We ran the §5.12 seed corpus (2 topics × 2 synths × 10 paraphrases) end-to-end on a local Firestore emulator and inspected the produced structure. Three findings bear on both the harness and the architecture.

**The scheduled consolidation layer does not run under the emulator.** The synthesis system is split into a *live* reactive stage (Firestore-triggered, fires on every option write) and a set of *scheduled* consolidation stages: the on-demand queue worker `processSynthesisQueue` (every 1 min), the bulk re-truth `fn_synthesisBulkFlush` (every 2 min), the cross-synth merge `fn_synthesisReJudge` (every 10 min), and the cluster-evaluation flush `fn_clusterRecomputeFlush`. The Firebase emulator executes Firestore triggers but does **not** fire `onSchedule` (cron) functions. Consequently the documented seed-and-inspect loop exercises only the live stage: the admin "Synthesize" action (`synthesizeNow`) enqueues every eligible option and writes a progress document, but the queue never drains and the run sits at "0 / N processed" indefinitely. Reproducing the full pipeline locally requires invoking the scheduled handlers manually or driving the bulk path directly. The live stage also does not hide member options — it records membership only on the cluster document's `integratedOptions`; hiding is performed by `performIntegration` on the bulk-confirm path (§6.1), so a live-only run leaves all source options visible.

**Live-only output is fragmented by design, and the §5.12 count criteria can pass while the interior is wrong.** On a representative run the live stage alone produced the headline-correct counts (2 topic-clusters, 4 synths) over a defective interior: the *regular-exercise* synth fragmented into two synths (8 + 2 members) under the spawn-debounce timing of §5.2; *community-clubs* never formed its own synth (it was absorbed into a topic-cluster); and *friends-time* split across a 2-member synth and a topic-cluster. A topic-cluster spawned at cosine **0.604** — at the floor of the 0.60–0.78 topic band (§5.2), where cross-topic noise (0.30–0.65) overlaps the band — produced an incoherent grab-bag mixing friendship and diet paraphrases. The cross-synth reJudge merge (§5.11) cleanly collapsed the duplicate exercise synth once invoked (cross-member top-2-average cosine 0.851 ≥ the 0.82 merge gate), confirming that the *scheduled* layer is what repairs this fragmentation, not the live stage. The lesson for the harness is that the §5.12 success criteria should test **disjointness and per-synth purity**, not counts alone: the counts matched here only by coincidence (exercise × 2 + eating + friends = 4) while the grouping was wrong.

**The bulk UMAP→DBSCAN path produces the clean disjoint structure by construction.** Seeding the same 40 paraphrases as raw options with synthesis disabled (so embeddings are generated by the standalone option-creation path, independent of the live pipeline) and running the bulk clustering primitive of §5.5 over their embeddings separated the four paraphrase-groups exactly: at DBSCAN $\varepsilon = 0.8$ in the 5-d UMAP space, four clusters of ten members each, **100 % pure** against the ground-truth labels, with zero noise. Within-group cosine landed at 0.86–0.95 and cross-group well below, matching the band assumptions of §5.2. Grouping the four synth centroids by single-linkage agglomeration recovered the two ground-truth topics. Every option landed in exactly one cluster with no cross-cluster overlap — the property the live stage does not guarantee on its own. This is a direct empirical confirmation of §5.5's disjointness claim and of §2.4's rationale for keeping a bulk layer alongside the incremental one.

### 5.14 Implementation reconciliation: admin entry points, clustering backend, and the hide step

The §5.13 reproduction surfaced a divergence between the pipeline taxonomy of §5.2–§5.11 and the admin entry points as currently wired. Three points clarify which code path runs when, and where the member-hiding of §6.1 actually occurs.

**There are two distinct admin "synthesize" callables, and the UI button is not the UMAP→DBSCAN one.** The bulk UMAP→DBSCAN pipeline of §5.3–§5.9 is reached through `synthesizeIdeasPreview` / `synthesizeIdeasExecute` (`fn_synthesizeIdeas.ts`) and through the async-job phases (`synthesisJobStart` → Firestore dispatcher → `phases.ts`, which calls `bulkClusterByEmbedding` in its clustering phase). The admin panel's "Synthesize" button, however, invokes a *different* callable — `synthesizeNow` — which does not cluster in one pass at all: it enqueues one `process-option` work item per eligible option into `synthesisQueue/{questionId}/items` and lets the scheduled worker `processSynthesisQueue` drain them through `runSinglePipeline`. The UI "Synthesize" action is thus a **bulk replay of the live single-option pipeline**, not the bulk UMAP→DBSCAN pass. This is why the §5.13 emulator run produced only live-style output even after the operator clicked "Synthesize": the work was enqueued for a live-pipeline replay that the emulator's absent scheduler additionally never ran. The §5.11 trigger table should be read with this distinction.

**Member hiding happens only on the execute / integration path.** `performIntegration` — which creates the cluster statement, migrates evaluations, and sets `hide: true, integratedInto` on the originals (§6.1) — is called from exactly two places in the codebase: `synthesizeIdeasExecute` (the bulk-confirm step, after the operator accepts a preview) and `fn_integrateSimilarStatements` (the per-idea manual merge). Neither the live pipeline (`runSinglePipeline` / `clusterOps`) nor the `synthesizeNow` queue replay calls it; both only append to the cluster document's `integratedOptions`. The cross-synth reJudge merge (§5.11) hides the *donor synth*, not raw members. So §6.1 and §8.9 are accurate for the bulk-confirm and manual-merge paths, but a question whose clusters were built only by the live pipeline (or by the `synthesizeNow` queue) shows all source options unhidden — the collapsed view is a property of the execute step, not of cluster membership.

**The UMAP→DBSCAN backend is feature-flag-gated on the synchronous path.** `synthesizeIdeasPreview` uses `bulkClusterByEmbedding` (the §5.5 in-memory UMAP→DBSCAN pass) only when `shouldUseBulkSynthesisPath()` returns true — i.e. when both `SYNTHESIS_BULK_CLUSTER` and `SYNTHESIS_TWO_TIER_JUDGE` are enabled (both default OFF). With the flags off it falls back to the legacy N-anchor `buildCandidateEdges` similarity-grouping that §5.3 describes the bulk pass as replacing. The scheduled `fn_synthesisBulkFlush` and the async-job clustering phase, by contrast, call `bulkClusterByEmbedding` unconditionally. A deployment therefore needs the bulk-cluster flags on for the synchronous preview path to match the method this paper presents as the bulk default; otherwise §5.5–§5.6 describe the scheduled and async paths but not the synchronous preview.

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

**Two implementations, one refinement.** The principle above is realized by two functions that differ in mechanism:

- `migrateEvaluationsToNewStatement` (called by `performIntegration` on a manual merge or a bulk-confirm execute) reads the source members' evaluations, averages each user's votes, and **materializes** new evaluation documents on the target cluster. It excludes neutral (zero) votes from the rollup.
- `computeClusterEvaluationFromRawEvals` (called by the live-synth recompute path, §6.3) reads the cluster's direct evaluations plus its members' evaluations on the fly — it does **not** materialize per-user documents — and writes the aggregated `StatementEvaluation` directly onto the cluster document. It includes neutral votes (a zero-voting user still counts as an evaluator).

Both group by `evaluatorId` and reduce to one value per user, so the unique-evaluator invariant holds either way. The live path adds a **direct-vote-wins** refinement (`directVoteWins`): if a user voted on the cluster statement itself — not only its members — that direct vote overrides the member-vote average for that user. The aggregate is the full `StatementEvaluation` — mean sentiment, Bayesian-smoothed consensus (written to both `agreement` and the mirrored `consensus` field), agreement index, like-mindedness, confidence index / standard deviation, and pro/con evaluator counts — so downstream UI selectors read a cluster's stats exactly as they read a plain option's.

### 6.3 Keeping the live cluster aggregate current

The aggregated evaluation is **denormalized onto the cluster document** (`statements/{clusterId}.evaluation`, mirrored in `consensus`) so every existing UI selector reads a cluster's stats with no special-casing. Keeping that denormalized value fresh as membership and member evaluations change is the job of a **queue-and-flush** mechanism, not a read-through cache:

1. **Enqueue on change.** `enqueueClusterRecompute(clusterId)` writes a small marker to a recompute queue whenever a cluster's membership or member text changes — on attach, spawn, cross-synth merge (§5.11), and member unlink/edit. It is *also* called when a member's *evaluation* changes — the `onCreateEvaluation` / `onUpdateEvaluation` triggers resolve the evaluated statement's containing clusters via `findClustersContainingMember` (an `integratedOptions array-contains` query) and enqueue each — but only when the `clusterAwarePolarization` flag is enabled. That flag defaults **off**, so by default the aggregate is refreshed on membership change but not on pure evaluation drift between membership changes (see §8.7).
2. **Scheduled flush.** `fn_clusterRecomputeFlush` runs every minute, drains the queue, and for each queued cluster calls `recomputeSynthCluster`, which (a) re-runs `recomputeClusterEvaluation` (§6.2) against current direct + member evaluations and writes the result onto the cluster doc; (b) fans out a per-evaluator polarization-index entry (`polarizationIndex/{clusterId}`) carrying each evaluator's *effective* vote, so the demographic MAD breakdown stays consistent with the direct-wins model; and (c) for synths, optionally regenerates the AI title and re-embeds when the member count changed. The queue marker is deleted after a successful flush, so the recompute does not re-trigger itself.

Per-(cluster, user) provenance is written to a separate `clusterEvaluationLinks` collection during the recompute, supporting after-the-fact explainability ("this user contributed value $x$ to this cluster via these member options"). The end-of-run finalization pass (§6.1) keeps these links in sync alongside the aggregated evaluation.

*Historical note.* An earlier design maintained per-cluster aggregations in a `clusterAggregations` collection keyed by `${clusterId}--${framingId}`, invalidated lazily by an `onEvaluationChangeInvalidateCache` trigger and recomputed on read. That framing-keyed cache belonged to the now-removed *framing* subsystem; a read-through `clusterAggregations` cache survives only in the separate **condensation** pipeline, which reuses the same `computeClusterEvaluationFromRawEvals` primitive (§6.2) but is otherwise independent of live synthesis.

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

The cost models for the live and bulk pipelines differ in shape because they have different access patterns.

#### Live pipeline (per option write)

Let $|\mathcal{C}|$ be the number of existing clusters under the option's parent.

| Step | Complexity | Bottleneck |
|---|---|---|
| Embedding (if not precomputed) | $O(1)$ OpenAI call | network latency |
| ANN search (`findNearest`, limit 10) | $O(\log N)$ via Firestore vector index | one query |
| Full-member evidence expansion | $O(\sum_{C \in \text{candidates}} |C|)$ Firestore reads | bounded by neighborhood size |
| Pass 1 + Pass 2 (attach) | $O(|\mathcal{C}_{\text{neighborhood}}|)$ in-memory | none |
| Pass 3 (spawn) | $\le 2$ LLM calls (synth attempt + topic-label fallback) | cached when text unchanged |
| `performIntegration` (if spawning) | $O(1)$ Firestore transaction | one write batch |

The live pipeline is bounded at ≤ 2 LLM calls per option write regardless of $N$. The verdict cache short-circuits the spawn LLM call on any re-write that does not change the option's text. End-to-end wall-clock is dominated by the ANN search (~50–100 ms) and, when it fires, the LLM call (~1–3 s).

#### Bulk pipeline (per admin run)

Let $N$ be the total options under a question, $N'$ the surviving subset after pre-filtering, $K$ the cluster count from DBSCAN, $\overline{|C|}$ the average cluster size, $g$ the gray-band fraction (empirically 0.2–0.4 of non-medoid members).

| Phase | Complexity | Bottleneck |
|---|---|---|
| A: coverage + pre-filter | $O(N)$ Firestore reads | linear scan |
| B: bulk clustering (UMAP→DBSCAN) | $O(N')$ in-memory; no Firestore I/O | UMAP fit + DBSCAN density pass |
| C: two-tier judge — cosine scoring | $O(\sum_C |C|)$ in-memory cosine ops | medoid pick is linear per cluster |
| C: two-tier judge — gray-band LLM | $O\big(\lceil g \cdot \sum_C (|C| - 1) / 20 \rceil\big)$ batched LLM calls, capped at `maxLlmCalls` | network latency; cached on re-runs |
| C: dissent-subset complete-linkage | $O(K_{\text{split}} \cdot \overline{|D|}^2 / 20)$ extra LLM calls | only fires for clusters with 50–80 % agreement |
| D: per-cluster proposal generation | $O(K)$ LLM calls | one per verified cluster |
| E: `performIntegration` + finalize | $O(K)$ Firestore writes (parallelized at width 5) + $O(K)$ aggregation recomputes | linear |

The LLM cost in Phase C scales with the **gray-band member count**, not with the candidate-edge count of the prior architecture. Auto-accept and auto-reject members consume zero LLM budget. The hard cap `maxLlmCalls = min(2000, |workingSet| × 0.2)` provides a deterministic budget ceiling per run; over-cap clusters fall through with `verifiedBy: 'cosine-only'` and are surfaced for manual review.

Phase B's UMAP→DBSCAN runs entirely in-memory and is deterministic given the seed (default 42), so re-runs over the same input embeddings produce the same cluster structure. This makes re-truth sweeps idempotent: the scheduled `fn_synthesisBulkFlush` can re-cluster without writing if the cluster topology has not changed.

| Regime | $N$ | Cold-cache wall-clock | Warm-cache wall-clock | Notes |
|---|---|---|---|---|
| Small | up to 500 | ~30 s | ~5 s | Phase B is < 1 s; Phase C dominates with ~5–20 LLM calls |
| Medium | up to 10 000 | ~2 minutes | ~15 s | Phase B ≈ 30 s; Phase C bounded by `maxLlmCalls` (default 2000) |
| Large (deferred) | up to 100 000 | ~30 minutes | ~3 minutes | Requires hierarchical Level-1 macro-clustering + OpenAI Batch API for embedding backfill |

For $N = 10\,000$ (cold cache, default settings):
- Embedding backfill (if needed): ~$0.02 USD on `text-embedding-3-small`.
- Phase C gray-band judging: ~$0.20 USD on Gemini 2.5-Flash, well under the `maxLlmCalls` cap.
- Phase D proposal generation: ~$0.05 USD (one call per verified cluster, $K \ll N'$).

Warm-cache re-runs collapse Phase C's LLM cost to Firestore lookups, with Phase D being the only LLM step that consistently costs something — but it too caches per-cluster on identical member sets.

Total marginal cost per bulk synthesis run is well under one US dollar on a cold cache, and a few cents on a warm one. Synthesis can be re-run on demand without budget pressure.

---

## 8. Limitations and Open Questions

### 8.1 Cold start for hybrid clustering

Until a proposal accumulates evaluations, $\alpha$ is high and the hybrid vector is essentially text-only — subject to the same negation blindness as standard embedding methods. The post-clustering negation check mitigates but does not eliminate this issue. Synthesis, by contrast, is intentionally not cold-start-tolerant: its pre-filter $n_{\min} \ge 2$ already excludes proposals without multiple evaluators.

### 8.2 LLM judge as a single point of trust (synthesis)

The four-way verdict — used by both the live pipeline's Pass 3 spawn judgment and the bulk pipeline's two-tier judge gray-band calls — is trusted as the merge decision rule for the cases it sees. If the model systematically misclassifies a category of pairs — for example, treats sarcastic restatements as `same` rather than `opposite` — those errors propagate. The two-tier judge widens the trust boundary in one direction: members with $\sigma \ge 0.94$ to the medoid are accepted with **no** LLM verification at all, on the assumption that cosine that high reliably indicates paraphrase. The same boundary in the other direction (members with $\sigma < 0.82$) rejects without LLM. Both bands are inherited from prior negation-detection calibration, not from a deliberation-specific study.

Mitigations:

- **Calibration set.** Maintain a held-out, hand-labelled set of pairs and report the four-way confusion matrix on each LLM provider/version change. The auto-accept / auto-reject cosine bands should be re-validated whenever the embedding model changes.
- **Cosine-only telemetry.** When the `maxLlmCalls` cap is hit, affected clusters are tagged `verifiedBy: 'cosine-only'`. The admin UI surfaces these for manual review before execution; the rate of cap-hits is a useful signal that the auto-accept band may be set too high or the gray band too wide.
- **Conservative thresholds at the boundary.** Where the LLM expresses low confidence (currently not captured), prefer non-merge. The dissent-subset complete-linkage refinement (§5.6) is the structural realization of this preference inside a cluster.
- **Human-in-loop preview.** Operators see the LLM `reason` strings, the agreement fraction per cluster, and the verification mode (cosine+llm vs cosine-only), and can reject groups before execution.

### 8.3 Frame-vs-magnitude pairs (the subtler false-positive)

Pairs like *"add one lane"* / *"add three lanes"* are difficult for both embeddings and the LLM judge, because in some deliberation contexts they are different proposals (concrete plans) and in others they are variants of the same direction (raise capacity). The current prompt favours `related` for magnitude differences, which we believe is correct, but this is the most prompt-sensitive boundary. Empirical calibration is recommended before deployment.

### 8.4 Rating-vector dimensionality

The 8-dimensional rating vector was chosen pragmatically from available aggregation fields. A data-driven approach (e.g. PCA on the user–option evaluation matrix projected to a fixed dimensionality) might capture richer evaluative structure. We have not yet observed cases where the 8-d formulation is the bottleneck, but the choice deserves empirical validation.

### 8.5 $\alpha$ calibration

The decay parameter $\beta = 0.3$ was selected by heuristic reasoning about desired crossover points ($\alpha = 0.5$ at $n \approx 37$). Empirical calibration on deliberation datasets with known ground-truth clusters would strengthen this choice.

### 8.6 Cluster stability

Frequent re-clustering can cause proposals to migrate between clusters, potentially confusing users who track a specific cluster over time. A stability-weighted assignment (penalising cluster switches) is a natural extension.

### 8.7 Re-aggregation after evaluation drift (synthesis)

A cluster's aggregated evaluation is denormalized onto the cluster document (§6.3) and recomputed by the queue-and-flush mechanism whenever its membership changes (attach / spawn / merge / unlink) and at the end of a bulk run. The open question is **pure evaluation drift**: between membership changes, a member's evaluation can change while the cluster's stored `evaluation` does not, so direct reads of the cluster doc (cards, lists, search results) see the snapshot from the last recompute rather than the live aggregate.

The trigger that closes this gap **exists** — `onCreateEvaluation` / `onUpdateEvaluation` resolve the evaluated statement's containing clusters and enqueue a recompute, which the 1-minute flush drains — and it is amplification-bounded by construction: bursts of evaluations on a popular member collapse to a single queued marker per affected cluster (deduplicated by the queue), rather than $O(\text{evaluations})$ inline recomputes. But it is gated behind the `clusterAwarePolarization` flag, which defaults **off**. With the flag off, cluster aggregates drift between membership changes (the gap above); with it on, member-evaluation writes refresh the aggregate within one flush interval. Turning the flag on by default — once its cost has been validated on high-traffic questions — would close the drift gap; that validation is the remaining work.

### 8.8 Cross-question synthesis is out of scope

The synthesis pipeline is scoped to one question. Two questions about the same topic are not deduplicated against each other. This is intentional: each question is its own deliberative unit with its own evaluator pool, and merging across questions would conflate distinct epistemic populations.

### 8.9 Reversibility

`performIntegration` is currently not natively reversible — originals are hidden, not deleted, but the platform does not expose an admin "unsynthesize" action. Reversibility should be added before broad deployment so synthesis errors can be corrected without manual data work.

### 8.10 Provenance

Every synthesis decision — live or bulk — is logged with its run / trigger id, threshold settings, the cosine scores that triggered candidacy, the LLM verdicts and `reason` strings (when an LLM was called), the verification mode (`cosine+llm` vs `cosine-only`), and the operator who confirmed the merge (for bulk runs). The live pipeline writes per-decision audit entries via `auditLog` and queues candidates that fell in the review band (`_liveSynthCandidates`); the bulk pipeline persists run state under `synthesisRuns/{runId}` with per-cluster verification telemetry. This provenance is intended to support after-the-fact audit: any synthesis decision should be traceable to (a) which embedding cosine triggered the candidacy, (b) which medoid was picked and which band the member fell into, (c) what verdict the LLM returned with what reason if it was called, and (d) who confirmed the merge. The persistence schema supports the audit; the audit UI is not yet defined.

### 8.11 Live-stage convergence depends on the scheduled consolidation layer

The live pipeline is deliberately bounded — ≤ 2 LLM calls per option, a 15-second per-parent spawn debounce, and cosine treated as a candidacy gate — and therefore leaves residual fragmentation at burst arrival rates: duplicate synths, singletons, and the occasional low-cosine topic spawn (§5.13). Convergence to a clean, disjoint structure relies on the scheduled sweeps (`fn_synthesisBulkFlush`, `fn_synthesisReJudge`, `processSynthesisQueue`, `fn_clusterRecomputeFlush`). In production these run on cron and the structure converges within ~10 minutes; in any environment without a scheduler — notably the Firebase emulator, which does not fire `onSchedule` functions — the live stage's rough output is the terminal state, and the admin "Synthesize" queue never drains (§5.13). The architectural consequence is that the system's correctness guarantee is *eventual* and substrate-dependent: a reader of the data between the live write and the next sweep sees an interim structure that may contain duplicate synths and overlapping membership. A standing follow-up is to expose the consolidation logic as on-demand callables (not only scheduled triggers), so that local reproduction, load-testing, and admin-forced convergence do not depend on the cron substrate.

### 8.12 Live re-processing is not idempotent with respect to cross-cluster membership

`runSinglePipeline`'s original pre-check skipped an option that is "already a member of some cluster" by testing `option.integratedOptions.length > 0`. But membership is recorded on the *cluster* document's `integratedOptions` array, not on the member option — a raw option that already belongs to a cluster still carries an empty `integratedOptions`. Re-processing such an option (e.g. when the admin re-runs "Synthesize", which re-enqueues every eligible option) therefore treated it as fresh: Passes 1–2 attached it to the highest-evidence cluster via `attachOptionToCluster`, whose idempotency guard only checks membership in *that* cluster. The option could thus be added to a second cluster while remaining in the first. We observed this directly: re-draining the work queue over a 40-option corpus raised the count of options claimed by more than one cluster from 1 to 8.

**Fixed.** `runSinglePipeline` now performs an authoritative membership pre-check before the attach/spawn passes: it queries the clusters that actually list the option (`findClustersContainingMember`, the same `integratedOptions array-contains` query the cluster-recompute path uses) and skips when any live, non-hidden cluster already owns it. Membership owned only by a hidden (reverse-integrated) cluster does not block re-processing. Re-running the pipeline — re-evaluation triggers, a "Synthesize" re-run, or a full queue replay — is therefore idempotent with respect to cluster membership: an already-clustered option is a no-op rather than a second attach. The bulk path remains the right tool for *re-clustering* (it assigns each option to exactly one DBSCAN cluster); the live pipeline no longer corrupts membership when replayed.

---

## 9. Conclusion

We have presented a unified clustering and synthesis architecture for a large-scale deliberation platform. Three observations support the design.

First, **two computational problems coexist** in deliberation — fragmentation of paraphrases (synthesis) and organization of distinct ideas (clustering) — and they require different remedies even though they appear to be solvable by the same embedding similarity tool. Treating them separately, with shared infrastructure, lets each layer use the right signal at the right scale.

Second, **embeddings encode topical proximity, not propositional content**. Both layers therefore treat embedding similarity as a *candidate generator*, not a decision rule. Hybrid clustering verifies through community evaluation data (the rating vector) plus an LLM negation check; synthesis verifies through a medoid-anchored cosine-banded two-tier judge in the bulk pipeline (with complete-linkage refinement on dissent subsets) and through a per-spawn LLM judgment in the live pipeline (synth proposal generation, with topic-label fallback). The unifying principle is the same; the mechanisms differ because the questions differ and because the live and bulk regimes have different cost structures.

Third, **per-user deduplicated evaluation aggregation is essential**. Without it, both layers would amplify the engagement of any user who voted on multiple variants, exactly the distortion the system was built to repair. The deduplication is the bridge between the cluster/synthesis structure and the downstream consensus metrics that participants actually see.

The system operates within standard cloud infrastructure — Firebase Cloud Functions, Firestore vector indexes, scheduled background jobs — at marginal cost on the order of cents per run, scaling to tens of thousands of options per question. The mechanism is implemented and deployed in the Freedi platform, where hybrid clustering, synth-style and topic-cluster-style synthesis, taxonomy-based topic clustering, and admin-defined framings coexist over the same option pool, respecting the platform's principle that multiple valid perspectives on the same set of proposals can coexist.

We invite scientific review of:
- the four-way verdict prompt design and category boundaries (§5.7),
- the auto-accept / auto-reject cosine bands and the `keepThreshold` / `splitFloor` in the two-tier judge (§5.6),
- the chaining-mitigation in the dissent-subset complete-linkage refinement (§5.6),
- the synth-vs-topic-cluster fork in `generateSynthesizedProposal` and its `cannotSynthesize` fallback (§5.2, §5.8),
- the per-user evaluation aggregation correctness (§6.2),
- the benchmark harness as a regression surface — the seed corpus, success criteria, and diagnostic scripts of §5.12, and the live-vs-bulk reproduction findings of §5.13,
- the convergence and idempotence limitations the reproduction exposes — the live stage's dependence on the scheduled consolidation layer (§8.11) and the non-idempotence of live re-processing with respect to cross-cluster membership (§8.12),
- the limitations enumerated in §8 — particularly the cold-start (§8.1), the LLM-judge-as-single-point-of-trust under the two-tier scheme (§8.2), frame-vs-magnitude (§8.3), and stability (§8.6) issues.

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
