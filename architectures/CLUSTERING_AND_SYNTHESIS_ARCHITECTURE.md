# Clustering & Synthesis Architecture

This document describes how Freedi turns a long, repetitive list of user-submitted options under a question into a smaller, comparable, well-organized set: by **clustering** (grouping options thematically) and by **synthesizing** (merging near-duplicate options into one canonical option).

It supersedes the historical clustering architecture documents now archived in [`docs/clusters and synthesis/`](../docs/clusters%20and%20synthesis/).

---

## 1. Overview — Two Problems, One Data Model

Open deliberation produces hundreds to thousands of options per question. Two distinct problems emerge:

- **Repetition**: many options say the same thing in different words. Each variant captures a fraction of the votes the underlying idea would attract if presented unified. → solved by **synthesis**.
- **Volume / navigation**: even after deduplication, dozens of distinct options need to be organized so participants can navigate and compare them. → solved by **clustering**.

The two are answered by different algorithms but produce the **same kind of artifact**: a `Statement` with `isCluster: true` that points at its source options through `integratedOptions: string[]`. The difference is which sources are gathered together and whether the originals stay visible.

| Layer | Question answered | Granularity | Originals visible? | Output count |
|-------|-------------------|-------------|--------------------|--------------|
| Topic clustering | "What subjects did people raise?" | Broad themes | Yes — members of the cluster | ~10 thematic groups |
| Synthesis | "Which proposals are saying the same thing?" | Fine | No — `hide: true, integratedInto: <newId>` | ~N/k near-duplicate groups |

Both write to the same Firestore collections and reuse the same evaluation-aggregation primitives.

---

## 2. Conceptual Model

### 2.1 Cluster Statement

A cluster is a `Statement` (`packages/shared-types/src/models/statement/StatementTypes.ts:162-193`) extended with these fields:

```ts
{
  isCluster: true;
  integratedOptions?: string[];     // source statement IDs
  derivedByPipeline?: 'topic-cluster' | 'synthesis';
  framingClusters?: Record<string, string>;  // framingId → clusterId
  synthesisRun?: { ... };           // metadata on the parent question
}
```

`derivedByPipeline` discriminates the origin so re-runs are idempotent and views can render the two cases differently.

### 2.2 Framing

A **Framing** is a named perspective on how to cluster options under a question — "group by region", "group by cost vs. speed", "group by stance". A question can host multiple framings simultaneously. Defined in `packages/shared-types/src/models/framing/framingModel.ts:47-97`:

```ts
Framing {
  framingId, parentStatementId, name, description, prompt,
  createdAt, createdBy: 'ai' | 'admin' | 'hybrid-auto' | 'topic-cluster',
  creatorId?, isActive, clusterIds: string[], order
}
```

Synthesis does not produce a Framing; it produces a flat set of merged options under the parent.

### 2.3 ClusterAggregatedEvaluation

A cached per-cluster aggregate that deduplicates evaluators (`packages/shared-types/src/models/framing/framingModel.ts`):

```ts
{
  clusterId, framingId, parentStatementId,
  uniqueEvaluatorCount,           // each user counted once across the cluster
  averageClusterConsensus,
  proEvaluatorCount, conEvaluatorCount, neutralEvaluatorCount,
  sumPro, sumCon, optionCount,
  evaluationsPerOption[],
  calculatedAt, expiresAt, isStale
}
```

Without this dedup, prolific evaluators would dominate cluster consensus.

### 2.4 Provenance

`ClusterEvaluationLink` (`packages/shared-types/src/models/evaluation/ClusterEvaluationLink.ts`) records, per (cluster, user), which member-option evaluations contributed and at what aggregated value. Used for explainability of cluster-level scores.

---

## 3. Pipeline Catalog

Five pipelines write `isCluster: true` statements. All are admin-triggered (one is also user-triggered for creators).

| # | Pipeline | Algorithm | File | Trigger |
|---|----------|-----------|------|---------|
| 1 | **Multi-framing** | Gemini groups options into up to 3 perspectives in one call | `functions/src/fn_multiFramingClusters.ts` | HTTP, "Generate AI Framings" button |
| 2 | **Hybrid k-means** | text embedding (1536-d) + 8-d rating vector → k-means (auto-k) → Gemini negation split | `functions/src/fn_hybridClustering.ts` | HTTP `triggerHybridClustering` (admin) |
| 3 | **Topic cluster** | LLM taxonomy → LLM normalization → embed canonical actions → UMAP → DBSCAN → noise recovery → LLM cluster naming | `functions/src/fn_topicClustering.ts` + `functions/src/services/topic-cluster/cluster.ts:63` | HTTP `triggerTopicClusterPipeline` (admin) |
| 4 | **Condensation** | UMAP + DBSCAN, non-destructive (originals stay visible) | `functions/src/condensation/fn_runCondensation.ts` | onCall `runCondensation` (creator/admin) |
| 5 | **Idea synthesis** | ANN candidates → Gemini four-way LLM-as-judge → union-find → complete-linkage cliques → merge | `functions/src/fn_synthesizeIdeas.ts` | onCall preview + execute (admin) |

Pipelines 1–3 produce **Framings + clusters** (members visible inside each cluster). Pipeline 4 (condensation) produces grouping statements without hiding originals. Pipeline 5 (synthesis) produces canonical merged options with originals hidden.

---

## 4. Synthesis Pipeline (Detail)

Synthesis answers: *"Are these N options effectively the same idea?"* If yes, merge them into one canonical option whose evaluation is the per-user-deduplicated aggregate of its members'.

The methodologically distinctive choice — and the source of the pipeline's correctness — is that **embeddings are used as a candidate generator, not a decision rule**. An LLM-as-judge gates which candidates become confirmed merges.

### 4.1 Why pure embedding similarity is insufficient

Modern text embeddings encode lexical and topical proximity, not propositional content. The clearest failure modes in deliberation:

- **Same-topic-opposite-stance**: "Raise taxes on wealth above ten million" / "Lower taxes on wealth above ten million" — cosine similarity ≈ 0.92 in `text-embedding-3-small`. Embedding-only synthesis would merge two opposing factions into one indistinguishable lump.
- **Same-frame-different-magnitude**: "Add one lane to highway 5" / "Add three lanes to highway 5" — different proposals about the same project, but embeddings rank them as nearly identical.

See `docs/clusters and synthesis/idea-synthesis-paper.md` §1.3 for the full analysis.

### 4.2 Phases

`functions/src/fn_synthesizeIdeas.ts` exposes two callables: `synthesizeIdeasPreview` (line 198) runs phases 1–6 and returns groups for admin review without writes; `synthesizeIdeasExecute` (line 404) merges admin-confirmed groups via `performIntegration`.

```
Eligible options
   │
   ▼
1. Embedding coverage check (≥90%) ──fail──▶ return 'needs-embeddings'
   │
   ▼
2. Eligibility filter (minAverage, minConsensus, minEvaluators)
   │
   ▼
3. ANN candidate edges  ◄── services/similarity-grouping-service.ts
   │   (high-cosine pairs from Firestore vector index, threshold default 0.9)
   ▼
4. LLM-as-judge (Gemini 2.5-Flash, batches of 20 pairs)
   │   verdict ∈ {same, related, different, opposite}
   │   services/semantic-equivalence-service.ts:67
   ▼
5. Union-find on confirmed-same edges  ◄── utils/unionFind.ts
   │
   ▼
6. Complete-linkage clique refinement  ◄── synthesis/completeLinkage.ts:73
   │   (greedy clique cover; eliminates A=B, B=C, A≠C chaining)
   ▼
7. Preview (admin reviews) → confirm → performIntegration per group
```

### 4.3 Cost & scale

`docs/clusters and synthesis/idea-synthesis-paper.md` §3 estimates: 10 000 options per question process in ≈ 2 minutes wall-clock at a marginal LLM cost on the order of $0.20.

---

## 5. Topic-Cluster Pipeline (Detail)

The most sophisticated path. Produces a Framing whose clusters are organized by an LLM-derived taxonomy, with embeddings + UMAP + DBSCAN doing the within-category grouping.

### 5.1 Phases

`functions/src/services/topic-cluster/cluster.ts:63` (`clusterCategory`):

1. **Taxonomy derivation** (LLM) — produces a question-specific category list. Cached by `(parentId, questionHash, promptVersion)` in `clusteringCacheModel`.
2. **Normalization** (LLM) — maps each option to canonical actions and assigns it to ≥1 categories. Cached by `(statementId, lastUpdate, promptVersion)`.
3. **Per-category clustering**:
   - Embed canonical actions (1536-d).
   - **UMAP** projects to `UMAP_TARGET_COMPONENTS`-d (deterministic seed=42).
   - **DBSCAN** with `DBSCAN_EPS`, `DBSCAN_MIN_SAMPLES` runs in projected space.
   - Centroids computed in **original** embedding space, not projected.
4. **Noise recovery** — reassigns DBSCAN noise points to the nearest centroid if cosine ≥ `NEAREST_CENTROID_THRESHOLD`; otherwise places them in an "uncategorized" group.
5. **Centroid recomputation** after reassignment.
6. **Cluster naming** (LLM) — `services/topic-cluster/prompts.ts:90-99`.
7. **Write** — Framing + cluster Statements via `services/topic-cluster/writer.ts`.

### 5.2 Idempotence

Re-runs with unchanged inputs hit caches at every LLM step; only the embedding/UMAP/DBSCAN computation re-executes (deterministically, given seed=42). Re-runs tear down the prior framing's clusters before writing new ones.

---

## 6. Hybrid k-means Pipeline (Brief)

`functions/src/fn_hybridClustering.ts:74-250`. Builds **hybrid vectors** per option:
- text embedding (1536-d) — semantic axis
- rating vector (8-d) — derived from evaluation stats

Runs k-means with automatic k selection (`selectOptimalK`), then a Gemini pass that splits any cluster containing semantic opposites (e.g. "raise taxes" + "lower taxes"). Output: Framing + clusters; post-clustering aggregation runs immediately.

Backed by `docs/clusters and synthesis/hybrid-clustering-paper.html`.

---

## 7. Condensation Pipeline (Brief)

`functions/src/condensation/fn_runCondensation.ts:27-165`. Same UMAP + DBSCAN math as the topic-cluster pipeline, but **non-destructive**: originals are not hidden. Used when grouping is wanted as a navigation aid without committing to a merge.

---

## 8. Multi-framing Pipeline (Brief)

`functions/src/fn_multiFramingClusters.ts`. Calls Gemini directly with prompts that produce up to **3 distinct framings** in one shot. Useful when an admin wants to compare alternative ways of organizing the same option pool side by side.

---

## 9. Shared Primitives

### 9.1 The merge primitive — `performIntegration`

`functions/src/integrate/performIntegration.ts:42`. Called by both per-idea integration and bulk synthesis. Effects:

1. Create new `Statement` with `isCluster: true`, `integratedOptions: selectedStatementIds`, `derivedByPipeline`.
2. Migrate member evaluations via `migrateEvaluationsToNewStatement` (deduplicates per user).
3. Hide originals: `hide: true, integratedInto: <newId>`.
4. Bump parent's `lastChildUpdate`.

### 9.2 Embedding cache

`functions/src/services/embedding-cache-service.ts` stores option embeddings keyed by `(statementId, contentHash, modelVersion)`. New options are embedded asynchronously after creation; the cache reaches the 90 %-coverage threshold required by synthesis within seconds-to-minutes.

### 9.3 Per-user deduplication

`functions/src/fn_clusterAggregation.ts:96-138` (`calculateClusterAggregation`). Groups evaluations by `userId`, averages each user's evals across the cluster's options, then aggregates the per-user averages. Without this, a user who evaluated 5 options in a cluster would count 5×.

### 9.4 Cache invalidation

`functions/src/fn_clusterAggregation.ts:388` — the `onEvaluationChangeInvalidateCache` Firestore trigger marks affected `clusterAggregations` stale on every evaluation write. The next read recomputes.

---

## 10. End-to-End Data Flow

```
                       Question (parent Statement)
                                  │
                ┌─────────────────┼──────────────────┐
                │                                    │
            many Options                      Embedding cache
                │                                    │
   ┌────────────┼─────────────┐                      │
   │            │             │                      │
   ▼            ▼             ▼                      ▼
Topic-cluster  Hybrid k-means  Synthesis (ANN + LLM-as-judge)
(taxonomy →    (text+rating →  → union-find
 UMAP/DBSCAN)   k-means)         → complete-linkage cliques
   │            │                  │
   └─────┬──────┘                  ▼
         ▼                  performIntegration
    Framing +                (derivedByPipeline:
    cluster Statements         'synthesis')
    (isCluster=true,
     framingClusters map)         │
         │                        ▼
         └────► clusterAggregations ◄── evaluations trigger
                (per-user dedup)        invalidate-cache
```

---

## 11. Storage Schema

| Collection | Purpose |
|------------|---------|
| `statements` | All options, including clusters (`isCluster: true`) |
| `framings` | One doc per framing; owns a list of `clusterIds` |
| `clusterAggregations` | Per-cluster cached aggregate; key `${clusterId}--${framingId}` |
| `framingRequests` | Audit log for admin-requested custom framings |
| `framingSnapshots` | Recovery snapshots of framings for undo |
| `evaluations` | Source data; trigger updates `clusterAggregations.isStale` |

Key fields on `Statement` for clustering/synthesis:
- `isCluster: boolean`
- `integratedOptions: string[]`
- `derivedByPipeline: 'topic-cluster' | 'synthesis'`
- `framingClusters: Record<framingId, clusterId>`
- `hide: boolean` + `integratedInto: string` (set on synthesized originals)
- `synthesisRun: { ... }` (set on parent question after a synthesis run)

See `packages/shared-types/src/models/statement/StatementTypes.ts:162-193` and `packages/shared-types/src/models/statement/StatementSettings.ts` for full schemas.

---

## 12. Admin UI Layer

The facilitator surface lives in the question's **Advanced Settings**:

- `src/view/pages/statement/components/settings/components/ClusteringAdmin/ClusteringAdmin.tsx:27` — main container. Buttons for: Generate AI Framings, Request Custom Framing, Run Semantic Clustering, Run Topic Clustering, Summarize Clusters, Synthesize Ideas.
- `FramingList.tsx` — tabs of all framings for the statement
- `FramingDetail.tsx` — shows clusters within the selected framing
- `ClusterCard.tsx` — cluster name, member count, aggregated consensus, pro/con breakdown
- `src/view/components/synthesizeIdeas/SynthesizeIdeasModal.tsx` — preview & confirm flow for bulk synthesis

Redux: `src/redux/clusterEvaluationLinks/clusterEvaluationLinksSlice.ts` exposes per-(cluster, user) provenance via memoized selectors.

---

## 13. Two Embedding Spaces (Note)

The codebase uses **two embedding models** for two different purposes:

| Space | Model | Dim | Used by |
|-------|-------|-----|---------|
| Gemini | `text-embedding-004` | 768 | Hybrid k-means, multi-framing pre-clustering, similarity search via Firestore vector index |
| OpenAI | `text-embedding-3-small` | 1536 | Idea synthesis ANN, topic-cluster category embeddings |

Both spaces coexist; an option may have both embeddings cached. The split is historical — synthesis and topic-cluster were built later on OpenAI for its higher-dim semantic separation. Unifying on one provider is a possible future cleanup but not a blocker.

---

## 14. Configuration

| Setting | Location | Purpose |
|---------|----------|---------|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | env (`gemini-2.5-flash` default) | Semantic equivalence judge, framing/negation prompts |
| `OPENAI_API_KEY`, `WORKER_MODEL` | env (`gpt-4o`, `gpt-4o-mini`) | Taxonomy, normalization, summarization |
| `LLM_CONCURRENCY` | env (default 10) | Cap on parallel LLM calls |
| `DBSCAN_EPS`, `DBSCAN_MIN_SAMPLES`, `NEAREST_CENTROID_THRESHOLD`, `UMAP_TARGET_COMPONENTS`, `UMAP_MIN_ITEMS` | `functions/src/services/topic-cluster/constants.ts` | Topic-cluster tuning |
| `DEFAULT_THRESHOLD` (0.9), `REQUIRED_EMBEDDING_COVERAGE` (90) | `functions/src/fn_synthesizeIdeas.ts` | Synthesis tuning |
| `enableHybridClustering`, synthesis filters | per-statement settings (`StatementSettings.ts`) | Per-question control |

All Cloud Functions deploy to **`me-west1`** (Tel Aviv).

---

## 15. Related Documents

All historical and supporting documents now live in [`docs/clusters and synthesis/`](../docs/clusters%20and%20synthesis/):

- **[`idea-synthesis-paper.md`](../docs/clusters%20and%20synthesis/idea-synthesis-paper.md)** — full methodology paper for the verified-embedding synthesis pipeline (Tal Yaron). Code-resident references to this paper exist in `fn_synthesizeIdeas.ts`, `unionFind.ts`, `completeLinkage.ts`, `semantic-equivalence-service.ts`, `similarity-grouping-service.ts`, `StatementTypes.ts`, `StatementSettings.ts`.
- **[`hybrid-clustering-paper.html`](../docs/clusters%20and%20synthesis/hybrid-clustering-paper.html)** / `.pdf` — paper backing the hybrid k-means pipeline.
- **[`UNIFIED_CLUSTERING_ARCHITECTURE.md`](../docs/clusters%20and%20synthesis/UNIFIED_CLUSTERING_ARCHITECTURE.md)** — earlier consolidated arch (predates synthesis & topic-cluster); kept for the embedding-infrastructure and dedup detail.
- **[`EMBEDDINGS_CLUSTERING_ARCHITECTURE.md`](../docs/clusters%20and%20synthesis/EMBEDDINGS_CLUSTERING_ARCHITECTURE.md)** — historical hybrid embeddings + LLM design.
- **[`FRAMING_CLUSTER_AGGREGATION_ARCHITECTURE.md`](../docs/clusters%20and%20synthesis/FRAMING_CLUSTER_AGGREGATION_ARCHITECTURE.md)** — historical multi-framing + dedup design.
- **[`look-for-similarties-scaling-up.md`](../docs/clusters%20and%20synthesis/look-for-similarties-scaling-up.md)** — the pre-implementation investigation that fed into the current design.

---

*Last updated: 2026-05-06.*
