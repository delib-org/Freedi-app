# Unified Clustering & Similarity Architecture

This document consolidates the embedding-based similarity search and multi-framing clustering system for Freedi. It supersedes the individual architecture documents:
- `EMBEDDINGS_CLUSTERING_ARCHITECTURE.md` (merged)
- `FRAMING_CLUSTER_AGGREGATION_ARCHITECTURE.md` (merged)

## Overview

The system provides:
1. **Fast similarity detection** using embeddings + vector search (~50-100ms vs 2.5-4s)
2. **Multi-perspective clustering** with AI-generated "framings"
3. **Accurate aggregation** with unique evaluator counting per cluster

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED CLUSTERING ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: EMBEDDING INFRASTRUCTURE                                           │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Embedding Service (text-embedding-004, 768 dimensions)                    │
│  • Firestore Vector Index for fast similarity queries                        │
│  • Auto-generation on statement creation                                     │
│                                                                              │
│  Layer 2: SIMILARITY & SEARCH                                                │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Vector Search Service (findNearest with COSINE distance)                  │
│  • LLM fallback for statements without embeddings                            │
│  • Hybrid mode: embeddings + LLM supplementation                             │
│                                                                              │
│  Layer 3: MULTI-FRAMING CLUSTERING                                           │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Multiple AI-generated clustering perspectives                             │
│  • Custom admin-requested framings                                           │
│  • Cluster management and snapshots                                          │
│                                                                              │
│  Layer 4: AGGREGATION & DEDUPLICATION                                        │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Unique evaluator counting per cluster                                     │
│  • Per-user average scoring within clusters                                  │
│  • Cached aggregations with TTL                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Embeddings | Gemini `text-embedding-004` | Generate 768-dim vectors |
| Vector Storage | Firestore Vector Search | Store & query embeddings |
| LLM | Gemini `gemini-2.5-flash` | Framing analysis & fallback |
| Caching | Firestore with TTL | Cache aggregations |
| Runtime | Firebase Functions (Node.js 20) | Serverless execution |

---

## Layer 1: Embedding Infrastructure

### Embedding Service
**File**: `functions/src/services/embedding-service.ts`

```typescript
interface EmbeddingService {
  generateEmbedding(text: string, context?: string): Promise<EmbeddingResult>;
  generateBatchEmbeddings(texts: string[], context?: string): Promise<EmbeddingResult[]>;
  cosineSimilarity(a: number[], b: number[]): number;
}
```

**Context-aware embeddings**: Embeddings are generated with the parent question as context, improving semantic relevance:
```
Input: "More affordable housing"
Context: "How should we address homelessness?"
→ Embedding captures meaning relative to the question
```

### Embedding Cache Service
**File**: `functions/src/services/embedding-cache-service.ts`

Embeddings are stored directly on statement documents for Firestore vector search:
```typescript
// Statement document with embedding
{
  statementId: "abc123",
  statement: "Build more shelters",
  embedding: FieldVector([...768 floats...]),
  embeddingModel: "text-embedding-004",
  embeddingContext: "How should we address homelessness?",
  embeddingCreatedAt: 1703001234567
}
```

### Firestore Vector Index

Vector indexes cannot be deployed via `firestore.indexes.json`. Create using one of these methods:

**Option 1: gcloud CLI (Recommended)**
```bash
gcloud firestore indexes composite create \
  --project=wizcol-app \
  --collection-group=statements \
  --field-config=vector-config='{"dimension":"768","flat":"{}"}',field-path=embedding
```

**Option 2: Auto-creation via Console**
When you first run a `findNearest` query, Firestore will return an error with a link to create the required index in the Firebase Console. Click the link to create it automatically.

**Option 3: Firebase Console**
1. Go to Firebase Console → Firestore Database → Indexes
2. Click "Create Index"
3. Collection: `statements`
4. Field: `embedding` (Vector, 768 dimensions, Flat)

**Verify index exists:**
```bash
gcloud firestore indexes composite list --project=wizcol-app
```

---

## Layer 2: Similarity & Search

### Search Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMILARITY SEARCH FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User Input                                                     │
│       │                                                          │
│       ▼                                                          │
│   Check embedding coverage for parent question                   │
│       │                                                          │
│       ├── Coverage ≥ 50%                                         │
│       │       │                                                  │
│       │       ▼                                                  │
│       │   Generate query embedding                               │
│       │       │                                                  │
│       │       ▼                                                  │
│       │   Firestore Vector Search (findNearest)                  │
│       │       │                                                  │
│       │       ├── Results ≥ 3 → Return (method: "embedding")     │
│       │       │                                                  │
│       │       └── Results < 3 → Supplement with LLM              │
│       │                         (method: "hybrid")               │
│       │                                                          │
│       └── Coverage < 50%                                         │
│               │                                                  │
│               ▼                                                  │
│           Fall back to LLM search                                │
│               (method: "llm")                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Vector Search Service
**File**: `functions/src/services/vector-search-service.ts`

```typescript
// Vector search using Firestore's native findNearest
const results = await db
  .collection("statements")
  .where("parentId", "==", parentId)
  .findNearest({
    vectorField: "embedding",
    queryVector: FieldVector.fromArray(queryEmbedding),
    limit: 10,
    distanceMeasure: "COSINE"
  })
  .get();
```

### Performance Comparison

| Metric | Embedding Search | LLM Search |
|--------|-----------------|------------|
| Latency (P50) | 50-100ms | 2,500ms |
| Latency (P95) | 200ms | 4,000ms |
| Cost/query | ~$0.0001 | ~$0.01 |
| Scalability | 10,000+ statements | ~200 statements |

---

## Layer 3: Multi-Framing Clustering

### Concept

Framings are different perspectives for clustering the same set of statements:

```
Question: "How should we improve public transit?"

Framing 1: "By Implementation Cost"
├── Cluster: Low-cost solutions
├── Cluster: Medium investment
└── Cluster: Major infrastructure

Framing 2: "By Target User Group"
├── Cluster: Commuters
├── Cluster: Elderly/disabled
└── Cluster: Students

Framing 3: "By Timeline"
├── Cluster: Immediate fixes
├── Cluster: 1-3 year projects
└── Cluster: Long-term vision
```

### Data Model

```typescript
interface Framing {
  framingId: string;
  parentStatementId: string;  // The question
  name: string;               // "By Implementation Cost"
  description: string;        // AI-generated explanation
  prompt?: string;            // Custom prompt if admin-requested
  createdBy: 'ai' | 'admin';
  clusterIds: string[];       // References to cluster statements
  isActive: boolean;
}
```

### Cloud Functions
**File**: `functions/src/fn_multiFramingClusters.ts`

| Function | Purpose |
|----------|---------|
| `generateMultipleFramings` | Generate 3 AI framings for a question |
| `requestCustomFraming` | Create framing with custom prompt |
| `getFramingsForStatement` | List all framings for a question |
| `getFramingClusters` | Get clusters within a framing |
| `deleteFraming` | Delete framing and clusters |

---

## Layer 4: Aggregation & Deduplication

### The Problem

When a user evaluates multiple options within the same cluster, we need to:
1. Count them as ONE unique evaluator (not multiple)
2. Use their AVERAGE score within the cluster

**Example**:
```
Cluster: "Keep dogs at home" contains:
- Option A: "People should keep dogs at home" (50 evaluators)
- Option B: "Keeping dogs home is important" (40 evaluators)

If 20 users evaluated BOTH options:
- Wrong: 90 evaluators
- Correct: 70 unique evaluators
```

### Deduplication Algorithm

```typescript
function calculateClusterAggregation(clusterId: string) {
  // 1. Get all options in cluster
  const options = await getOptionsInCluster(clusterId);

  // 2. Fetch all evaluations for these options
  const evaluations = await fetchEvaluationsForOptions(options);

  // 3. Group by user - each user counted once
  const byUser = new Map<string, number[]>();
  evaluations.forEach(eval => {
    const existing = byUser.get(eval.evaluatorId) || [];
    existing.push(eval.evaluation);
    byUser.set(eval.evaluatorId, existing);
  });

  // 4. Calculate per-user AVERAGE
  let totalScore = 0;
  let proCount = 0, conCount = 0, neutralCount = 0;

  byUser.forEach((scores, userId) => {
    const userAverage = scores.reduce((a, b) => a + b, 0) / scores.length;
    totalScore += userAverage;

    if (userAverage > 0) proCount++;
    else if (userAverage < 0) conCount++;
    else neutralCount++;
  });

  return {
    uniqueEvaluatorCount: byUser.size,
    averageClusterConsensus: totalScore / byUser.size,
    proEvaluatorCount: proCount,
    conEvaluatorCount: conCount,
    neutralEvaluatorCount: neutralCount
  };
}
```

### Caching Strategy

```typescript
const CACHE_TTL = {
  DEFAULT: 5 * 60 * 1000,   // 5 minutes - active discussions
  LONG: 30 * 60 * 1000,     // 30 minutes - stable clusters
  SHORT: 1 * 60 * 1000,     // 1 minute - high-activity voting
};

// Cache invalidation via Firestore trigger
exports.onEvaluationChangeInvalidateCache = onDocumentWritten(
  "evaluations/{evaluationId}",
  async (event) => {
    // Mark relevant cluster caches as stale
    const statementId = event.data.after.data().statementId;
    const clusters = await findClustersContaining(statementId);
    await markCachesAsStale(clusters);
  }
);
```

---

## File Structure

```
packages/shared-types/src/models/
├── embedding/
│   └── embeddingModel.ts         # Embedding type definitions
└── framing/
    └── framingModel.ts           # Framing/aggregation types

functions/src/
├── config/
│   └── gemini.ts                 # Model configuration
├── services/
│   ├── embedding-service.ts      # Embedding generation
│   ├── embedding-cache-service.ts # Embedding storage
│   ├── vector-search-service.ts  # Vector similarity search
│   └── ai-service.ts             # LLM operations
├── fn_findSimilarStatements.ts   # Similarity search endpoint
├── fn_statementCreation.ts       # Auto-generate embeddings
├── fn_embeddingOperations.ts     # Backfill & admin operations
├── fn_multiFramingClusters.ts    # Multi-framing generation
├── fn_clusterAggregation.ts      # Aggregation with deduplication
└── index.ts                      # Function exports

src/controllers/db/framing/
└── framingController.ts          # Client API layer

src/view/.../ClusteringAdmin/
├── ClusteringAdmin.tsx           # Main admin container
├── FramingList.tsx               # Framing selection
├── FramingDetail.tsx             # Cluster display
├── ClusterCard.tsx               # Individual cluster
└── RequestFramingModal.tsx       # Custom framing form
```

---

## API Reference

### Embedding Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `generateBulkEmbeddings` | POST | Backfill embeddings for a question |
| `getEmbeddingStatus` | GET | Check embedding coverage |
| `regenerateEmbedding` | POST | Regenerate single embedding |
| `deleteEmbedding` | POST | Remove embedding from statement |

### Similarity Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `checkForSimilarStatements` | POST | Find similar (embeddings-first) |

Response includes `method` field: `"embedding"`, `"llm"`, or `"hybrid"`

### Multi-Framing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `generateMultipleFramings` | POST | Generate 3 AI framings |
| `requestCustomFraming` | POST | Create custom framing |
| `getFramingsForStatement` | GET | List framings |
| `getFramingClusters` | GET | Get clusters in framing |
| `deleteFraming` | POST | Delete framing |

### Cluster Aggregation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `getClusterAggregations` | GET | Get aggregated stats for framing |
| `recalculateClusterAggregation` | POST | Force recalculate cluster |
| `getFramingAggregationSummary` | GET | Summary stats for framing |

---

## Migration & Rollout

### Phase 1: Shadow Mode
- Generate embeddings for new statements (automatic)
- Log both embedding and LLM results for comparison
- No user-facing changes

### Phase 2: Hybrid Mode
- Use embeddings when coverage ≥ 50%
- Fall back to LLM otherwise
- Monitor error rates and latency

### Phase 3: Primary Mode
- Embeddings as primary method
- LLM only as fallback
- Backfill old statements with `generateBulkEmbeddings`

### Backfill Command
```bash
# Generate embeddings for all options under a question
curl -X POST https://your-project.cloudfunctions.net/generateBulkEmbeddings \
  -H "Content-Type: application/json" \
  -d '{"parentStatementId": "question-id-here"}'
```

---

## Monitoring

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Embedding coverage | >80% | <50% |
| Vector search latency | <100ms | >500ms |
| Fallback rate | <10% | >20% |
| Embedding generation errors | <1% | >5% |

### Logging

All operations log with context:
```typescript
logger.info("Similarity search complete", {
  parentId,
  method: "embedding" | "llm" | "hybrid",
  resultsFound: 5,
  durationMs: 87,
  coveragePercent: 92
});
```

---

## Cost Analysis

### Per-Query Costs

| Approach | Cost |
|----------|------|
| Embedding generation | ~$0.00001 |
| Vector search | ~$0.00001 |
| LLM similarity (fallback) | ~$0.01 |

### Monthly Projection (10,000 queries/day)

| Scenario | Estimated Cost |
|----------|---------------|
| 100% embeddings | ~$6/month |
| 80% embeddings, 20% LLM | ~$66/month |
| 100% LLM (current) | ~$300/month |

---

## Deprecated Documents

The following documents are superseded by this unified architecture:
- `EMBEDDINGS_CLUSTERING_ARCHITECTURE.md`
- `FRAMING_CLUSTER_AGGREGATION_ARCHITECTURE.md`
- `plans/embeddings-based-clustering-plan.md`

These files can be archived or deleted.
