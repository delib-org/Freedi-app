# Topic-Cluster Pipeline (`recluster.ts`)

Admin-triggered, on-demand clustering pipeline that produces a **`topic-cluster`** Framing for a given parent question.

It plugs into the existing Framing model (alongside `hybrid-auto`) — no parallel cluster system. Pipeline:

> filter → derive a per-question taxonomy via gpt-4o → LLM-normalize each response into canonical action(s) + category via gpt-4o-mini → embed canonical sentences (OpenAI multilingual) → UMAP→DBSCAN per category → name clusters in the response language → write back as a Framing.

## Setup

1. Make sure `functions/.env` has `OPENAI_API_KEY` from `env/.env.example`:
   - Used for embeddings (`text-embedding-3-small`, 1536-d, multilingual) AND for the LLM calls (taxonomy + normalization + naming).
   - Optional overrides:
     - `OPENAI_TAXONOMY_MODEL` (default `gpt-4o`)
     - `OPENAI_WORKER_MODEL` (default `gpt-4o-mini`)
     - `LLM_CONCURRENCY` (default `10`)
2. Service account: place `serviceAccountKey.json` next to this script, or set `GOOGLE_APPLICATION_CREDENTIALS`.
3. Install deps once: `cd functions && npm install`.

## Run

```bash
# Live run against a parent (writes to Firestore — creates topic-cluster Framing)
npx tsx functions/scripts/recluster.ts <parentStatementId>

# Dry run — runs full pipeline, prints summary, NO Firestore writes
npx tsx functions/scripts/recluster.ts <parentStatementId> --dry-run

# Force re-derivation of the per-question taxonomy
npx tsx functions/scripts/recluster.ts <parentStatementId> --rebuild-taxonomy

# Force re-normalization of every response (ignore normalization cache)
npx tsx functions/scripts/recluster.ts <parentStatementId> --rebuild-cache

# Offline mode — load from a JSON export, no Firestore reads/writes
npx tsx functions/scripts/recluster.ts --from-file path/to/export.json --dry-run
```

### `--from-file` JSON shape

```json
{
  "parent": { /* Statement */ },
  "responses": [ /* Statement[] — direct children of parent */ ]
}
```

## HTTP endpoint (admin button)

The same pipeline is exposed at `triggerTopicClusterPipeline` (admin-auth-wrapped). POST body:

```json
{
  "parentStatementId": "abc123",
  "opts": { "dryRun": false, "rebuildCache": false, "rebuildTaxonomy": false }
}
```

Use this from any admin UI button that wants to recluster on demand.

## When to pass `--rebuild-taxonomy`

The taxonomy cache is keyed by `(parentId, sha256(question_text))`. Editing the question's text invalidates it automatically. Pass `--rebuild-taxonomy` only when:
- The prompt template has changed (we bumped `PROMPT_VERSION_TAXONOMY` in `constants.ts`).
- You want a different taxonomy size or shape and have edited the prompt.
- The dataset has shifted dramatically (e.g., bulk import of off-topic responses).

## Cost (per 1000 responses)

| Step | Model | Calls | Approx cost |
|---|---|---|---|
| Taxonomy | gpt-4o | ~1 | $0.05 |
| Normalize | gpt-4o-mini, batch=8 | 125 | $0.10 |
| Embed canonical | text-embedding-3-small | batched | $0.001 |
| Cluster naming | gpt-4o-mini | ~12 | $0.003 |
| **Total** | | | **~$0.15 per 1k responses** |

Cheaper than the original Anthropic-based pipeline by ~6x. The pipeline ships with `NORMALIZE_BATCH_SIZE = 8` (in `constants.ts`); on per-batch JSON parse failure it falls back to size-1 calls automatically.

## Runtime

A 500-response parent typically completes in **30–90 s** with a warm cache (most cost is the Anthropic round-trips). Cold-cache is **2–5 min** depending on Anthropic latency.

## Idempotency contract

Reruns on the same parent are safe:

1. Existing `topic-cluster` Framing for the parent is found.
2. Its prior cluster Statements are deleted; `framingClusters[<oldId>]` references are cleared from option Statements.
3. Prior synthetic options (with `derivedByPipeline === 'topic-cluster'`) are deleted before re-decomposition.
4. New cluster Statements + new synthetics are written.
5. The Framing doc keeps its original `framingId`/`createdAt`/`order`.

Cache hits keep cost near-zero. The normalization cache is keyed by `(statementId, lastUpdate)` so editing a response auto-invalidates its cache row.

## Compound responses → synthetic options

When a response contains multiple distinct actions (e.g., "establish bus service AND a tourism trail"), the LLM normalize step returns multiple `actions[]`. The writer:

- Maps the **original** Statement to the cluster of the **first** action (so it stays in evaluations).
- Creates **synthetic** option Statements (one per additional action), each with `derivedFromStatementId = <original>` and `derivedByPipeline = 'topic-cluster'`. They map to their respective clusters.
- On rerun, prior synthetics are deleted before new ones are created (idempotent).

### Known follow-up

Synthetic options inflate `totalSubStatements` / `optionContributors` rollups computed by `fn_clusterAggregation.ts`. If you observe double-counting, add a `derivedByPipeline` filter there. Not yet shipped — surfaced only when synthesis is in active use.

## Disabled scheduler

The 15-min `hybridClusteringSweepScheduled` (legacy hybrid k-means) was disabled in `functions/src/index.ts` when this pipeline shipped. Existing `hybrid-auto` framings stay readable in Firestore but stop updating. To re-enable, uncomment the export. The two pipelines write to **different** Framings (`hybrid-auto` vs `topic-cluster`) and never collide.

## Tests

```bash
cd functions && npm test -- topic-cluster
```

The smoke suite runs the full pipeline against two fixtures (Hebrew civic + English short-answer) with mocked Anthropic + OpenAI, asserting ≥70% of items get a cluster. There's also a **library spike** at `src/services/topic-cluster/__tests__/spike.ts` that verifies UMAP + DBSCAN work on synthetic blobs:

```bash
npx tsx functions/src/services/topic-cluster/__tests__/spike.ts
```

## Tunables (`src/services/topic-cluster/constants.ts`)

- `MIN_TEXT_CHARS = 30` / `MIN_TEXT_WORDS_CJK = 6` — short-pool threshold.
- `NOISE_POOL_MIN_COUNT = 50` — only quarantine zero-evaluator responses if there are >50 of them.
- `TAXONOMY_SAMPLE_MAX = 80` / `TAXONOMY_MIN_CATEGORIES = 8` / `TAXONOMY_MAX_CATEGORIES = 20`.
- `NORMALIZE_BATCH_SIZE = 8` — drop to 1 to test single-response quality.
- `DBSCAN_EPS = 1.0` / `DBSCAN_MIN_SAMPLES = 3` — looser eps catches more density variation; tune empirically.
- `NEAREST_CENTROID_THRESHOLD = 0.6` — DBSCAN noise rescue threshold (cosine on 1536-d embedding).
- `POOL_REATTACH_THRESHOLD = 0.5` — looser threshold for short/noise pool reattach (raw text has more noise).

## Risks (live)

- `franc-min` mislabels strings <40 chars; the language module overrides with Unicode-block sniffing for he/ar/zh/ru.
- Sonnet may produce a taxonomy outside [8, 20] categories — the code retries once with a stricter system message.
- DBSCAN produces fewer/larger clusters than HDBSCAN would on highly variable-density data. We chose DBSCAN because the only TS HDBSCAN port (`hdbscanjs`) only supports 2-D points (verified via spike).
