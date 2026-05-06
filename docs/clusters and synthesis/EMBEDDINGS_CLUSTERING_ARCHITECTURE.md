# Embeddings-Based Clustering & Similarity Architecture

This document describes the hybrid architecture for statement similarity detection and clustering in Freedi, using embeddings for scalable similarity search and LLM for semantic framing analysis.

## Overview

The system uses a **hybrid approach** that leverages:
- **Embeddings + Vector Search**: For fast, scalable similarity detection
- **LLM (Gemini)**: For nuanced framing-based clustering and semantic understanding

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID SIMILARITY & CLUSTERING SYSTEM                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                      STATEMENT INGESTION                            │     │
│  │  ────────────────────────────────────────────────────────────────  │     │
│  │                                                                     │     │
│  │   Statement Created                                                 │     │
│  │        │                                                            │     │
│  │        ▼                                                            │     │
│  │   Generate Embedding (Gemini text-embedding-004)                    │     │
│  │        │                                                            │     │
│  │        ▼                                                            │     │
│  │   Store in Firestore with Vector Index                              │     │
│  │                                                                     │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    SIMILARITY DETECTION                             │     │
│  │  ────────────────────────────────────────────────────────────────  │     │
│  │                                                                     │     │
│  │   User Input ──▶ Generate Embedding ──▶ Vector Search               │     │
│  │                                              │                      │     │
│  │                                              ▼                      │     │
│  │                                    Top K Similar Statements         │     │
│  │                                                                     │     │
│  │   Speed: <500ms | Scale: Unlimited | Cost: ~$0.0001/query           │     │
│  │                                                                     │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    CLUSTERING BY FRAMING                            │     │
│  │  ────────────────────────────────────────────────────────────────  │     │
│  │                                                                     │     │
│  │   Small Dataset (<100)          │    Large Dataset (100+)           │     │
│  │   ─────────────────────         │    ─────────────────────          │     │
│  │                                 │                                   │     │
│  │   Direct LLM Analysis           │    1. Embeddings Pre-Cluster      │     │
│  │   - Full semantic understanding │    2. K-Means/HDBSCAN grouping    │     │
│  │   - Framing detection           │    3. LLM analyzes each group     │     │
│  │   - Named clusters              │    4. LLM names clusters          │     │
│  │                                 │                                   │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Embeddings Model | Gemini `text-embedding-004` | Generate 768-dim vectors |
| Vector Storage | Firestore Vector Search | Store & query embeddings |
| Vector Index | Firestore Native | Cosine similarity search |
| LLM | Gemini `gemini-2.5-flash` | Framing analysis & clustering |
| Runtime | Firebase Functions (Node.js 20) | Serverless execution |

## Why This Hybrid Approach?

### The Problem with Pure LLM Clustering

| Dataset Size | LLM Performance | Issues |
|-------------|-----------------|--------|
| <50 | Excellent | Works well, good semantic understanding |
| 50-200 | Degraded | Slower, context window pressure |
| 200+ | Poor/Fails | Token limits, high cost, inconsistent |

### The Problem with Pure Embeddings

Embeddings cluster by **semantic similarity** (what is said), not by **framing** (how it's said):

```
Topic: "Add bike lanes to the city"

These would ALL cluster together with embeddings:
├── "Bike lanes will reduce accidents" (Safety framing)
├── "Bike lanes will boost businesses"  (Economic framing)
├── "Bike lanes will cut emissions"     (Environmental framing)
└── "Bike lanes will improve livability"(Social framing)

But they represent DIFFERENT perspectives/framings!
```

### The Hybrid Solution

| Task | Approach | Why |
|------|----------|-----|
| **Find Similar** | Embeddings | Fast, accurate for "same meaning" |
| **Cluster by Topic** | Embeddings (any size) | Scalable, groups related content |
| **Cluster by Framing** | LLM (small) or Hybrid (large) | Understands perspective/values |
| **Name Clusters** | LLM | Generates meaningful labels |

## Core Components

### 1. Embedding Service

Generates vector embeddings using Gemini's text-embedding-004 model.

```typescript
// Location: functions/src/services/embedding-service.ts

interface EmbeddingService {
  // Generate embedding for single text (with optional context)
  generateEmbedding(
    text: string,
    context?: string
  ): Promise<number[]>;

  // Generate embeddings for multiple texts (batch)
  generateBatchEmbeddings(
    texts: string[],
    context?: string
  ): Promise<number[][]>;
}
```

**Context-Aware Embeddings:**
```typescript
// Without context - general semantic meaning
const embedding = await generateEmbedding("More affordable housing");

// With context - meaning relative to question
const embedding = await generateEmbedding(
  "More affordable housing",
  "How should we address homelessness in our city?"
);
```

### 2. Statement Schema with Embedding

```typescript
// Updated Statement document structure
interface StatementWithEmbedding {
  // Existing fields
  statementId: string;
  statement: string;
  parentId: string;
  topParentId: string;
  statementType: StatementType;
  // ... other existing fields

  // NEW: Embedding fields
  embedding?: number[];           // 768-dimensional vector
  embeddingModel?: string;        // "text-embedding-004"
  embeddingContext?: string;      // Question context used
  embeddingCreatedAt?: number;    // When embedding was generated
}
```

### 3. Firestore Vector Index

```
// Firestore index configuration
Collection: statements
Vector Field: embedding
Dimensions: 768
Distance Measure: COSINE
```

### 4. Similarity Search Service

```typescript
// Location: functions/src/services/similarity-service.ts

interface SimilarityService {
  // Find similar statements using vector search
  findSimilar(
    queryEmbedding: number[],
    parentId: string,
    limit?: number,
    threshold?: number
  ): Promise<SimilarStatement[]>;

  // Find similar to user input text
  findSimilarToText(
    userInput: string,
    parentId: string,
    questionContext: string,
    limit?: number
  ): Promise<SimilarStatement[]>;
}

interface SimilarStatement {
  statement: Statement;
  similarity: number;  // 0-1 cosine similarity score
}
```

### 5. Clustering Service

```typescript
// Location: functions/src/services/clustering-service.ts

interface ClusteringService {
  // Cluster statements - automatically chooses approach
  clusterStatements(
    parentId: string,
    clusterBy: 'topic' | 'framing'
  ): Promise<Cluster[]>;

  // Force specific approach
  clusterWithLLM(statements: Statement[]): Promise<Cluster[]>;
  clusterWithEmbeddings(statements: Statement[]): Promise<Cluster[]>;
  clusterHybrid(statements: Statement[]): Promise<Cluster[]>;
}

interface Cluster {
  clusterId: string;
  name: string;
  description: string;
  framing?: FramingType;  // For framing-based clusters
  statementIds: string[];
  representative: string; // Most central statement
}

type FramingType =
  | 'economic'
  | 'safety'
  | 'environmental'
  | 'social'
  | 'rights'
  | 'practical'
  | 'moral'
  | 'other';
```

## Data Flow

### Flow 1: Statement Creation (Embedding Generation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ON STATEMENT CREATE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Statement Created (Firestore trigger)                       │
│         │                                                        │
│         ▼                                                        │
│   2. Check: Is this an option/suggestion?                        │
│         │                                                        │
│         ├── No ──▶ Skip embedding (questions, etc.)              │
│         │                                                        │
│         ▼ Yes                                                    │
│   3. Fetch parent statement (question context)                   │
│         │                                                        │
│         ▼                                                        │
│   4. Generate context-aware embedding                            │
│      Input: statement.statement + parent.statement               │
│         │                                                        │
│         ▼                                                        │
│   5. Update statement document with embedding                    │
│      {                                                           │
│        embedding: [0.123, -0.456, ...],  // 768 floats           │
│        embeddingModel: "text-embedding-004",                     │
│        embeddingContext: "How should we...?",                    │
│        embeddingCreatedAt: 1703001234567                         │
│      }                                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Find Similar Statements (Real-time)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIND SIMILAR STATEMENTS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User submits input text                                     │
│         │                                                        │
│         ▼                                                        │
│   2. Content moderation check (existing)                         │
│         │                                                        │
│         ├── Inappropriate ──▶ Return 400 error                   │
│         │                                                        │
│         ▼ OK                                                     │
│   3. Generate embedding for user input                           │
│      (with question context)                                     │
│         │                                                        │
│         ▼                                                        │
│   4. Firestore Vector Search                                     │
│      ┌─────────────────────────────────────┐                     │
│      │ db.collection('statements')          │                     │
│      │   .where('parentId', '==', parentId) │                     │
│      │   .findNearest({                     │                     │
│      │     vectorField: 'embedding',        │                     │
│      │     queryVector: userEmbedding,      │                     │
│      │     limit: 10,                       │                     │
│      │     distanceMeasure: 'COSINE'        │                     │
│      │   });                                │                     │
│      └─────────────────────────────────────┘                     │
│         │                                                        │
│         ▼                                                        │
│   5. Filter by similarity threshold (>0.65)                      │
│         │                                                        │
│         ▼                                                        │
│   6. Return top 6 similar statements                             │
│                                                                  │
│   Performance: ~200-500ms total                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3: Cluster by Framing (Batch Operation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLUSTER BY FRAMING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Admin triggers clustering for a question                    │
│         │                                                        │
│         ▼                                                        │
│   2. Fetch all option statements for question                    │
│         │                                                        │
│         ▼                                                        │
│   3. Check statement count                                       │
│         │                                                        │
│         ├── <100 statements ────────────────────────┐            │
│         │                                           │            │
│         │   ┌───────────────────────────────────┐   │            │
│         │   │       DIRECT LLM CLUSTERING       │   │            │
│         │   │                                   │   │            │
│         │   │  Send all to Gemini with prompt:  │   │            │
│         │   │  "Cluster by FRAMING perspective" │   │            │
│         │   │  "Identify: economic, safety..."  │   │            │
│         │   │                                   │   │            │
│         │   │  Returns: Named framing clusters  │   │            │
│         │   └───────────────────────────────────┘   │            │
│         │                                           │            │
│         ├── 100+ statements ────────────────────────┤            │
│         │                                           │            │
│         │   ┌───────────────────────────────────┐   │            │
│         │   │       HYBRID CLUSTERING           │   │            │
│         │   │                                   │   │            │
│         │   │  Step 1: Get all embeddings       │   │            │
│         │   │                                   │   │            │
│         │   │  Step 2: K-Means clustering       │   │            │
│         │   │          (√n clusters)            │   │            │
│         │   │                                   │   │            │
│         │   │  Step 3: For each cluster:        │   │            │
│         │   │    - Sample 20-30 statements      │   │            │
│         │   │    - LLM identifies framing       │   │            │
│         │   │    - LLM names cluster            │   │            │
│         │   │                                   │   │            │
│         │   │  Step 4: Merge similar framings   │   │            │
│         │   └───────────────────────────────────┘   │            │
│         │                                           │            │
│         └───────────────────────────────────────────┘            │
│                                                                  │
│   4. Create cluster statements in Firestore                      │
│         │                                                        │
│         ▼                                                        │
│   5. Store snapshot for recovery                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Firestore Structure

### Statements Collection (Updated)

```
statements/
  {statementId}/
    # Existing fields
    statement: string
    statementId: string
    parentId: string
    topParentId: string
    statementType: StatementType
    creatorId: string
    consensus: number
    createdAt: number
    lastUpdate: number
    ...

    # NEW: Embedding fields
    embedding: number[]              # 768-dim vector
    embeddingModel: string           # "text-embedding-004"
    embeddingContext: string         # Parent question text
    embeddingCreatedAt: number       # Timestamp in ms
```

### Vector Index Configuration

```yaml
# firestore.indexes.json
{
  "indexes": [],
  "fieldOverrides": [
    {
      "collectionGroup": "statements",
      "fieldPath": "embedding",
      "indexes": [
        {
          "order": "ASCENDING",
          "queryScope": "COLLECTION"
        },
        {
          "order": "DESCENDING",
          "queryScope": "COLLECTION"
        },
        {
          "vectorConfig": {
            "dimension": 768,
            "flat": {}
          },
          "queryScope": "COLLECTION"
        }
      ]
    }
  ]
}
```

## API Endpoints

### Find Similar Statements (Updated)

```typescript
// POST /checkForSimilarStatements
// Now uses embeddings-first approach

interface FindSimilarRequest {
  statementId: string;      // Parent question ID
  userInput: string;        // User's suggestion text
  creatorId: string;        // User ID
  generateIfNeeded?: boolean;
}

interface FindSimilarResponse {
  ok: boolean;
  similarStatements: Statement[];
  userText: string;
  method: 'embedding' | 'llm' | 'hybrid';  // NEW: Which method was used
  similarity_scores?: number[];             // NEW: Cosine similarity scores
  cached: boolean;
  responseTime: number;
}
```

### Cluster Statements (New)

```typescript
// POST /clusterStatements

interface ClusterRequest {
  parentId: string;                    // Question to cluster
  clusterBy: 'topic' | 'framing';      // Clustering strategy
  forceMethod?: 'llm' | 'embeddings' | 'hybrid';  // Override auto-selection
}

interface ClusterResponse {
  ok: boolean;
  clusters: Cluster[];
  method: 'llm' | 'embeddings' | 'hybrid';
  statementCount: number;
  processingTime: number;
}
```

### Generate Embedding (Internal)

```typescript
// Internal service - not exposed as HTTP endpoint

interface GenerateEmbeddingRequest {
  text: string;
  context?: string;
}

interface GenerateEmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
}
```

## Performance Characteristics

### Similarity Search

| Metric | Embeddings | Current LLM |
|--------|-----------|-------------|
| Latency (P50) | 200ms | 2,500ms |
| Latency (P95) | 500ms | 4,000ms |
| Cost per query | $0.0001 | $0.01 |
| Scalability | 10,000+ statements | ~200 statements |
| Accuracy | 85-90% | 90-95% |

### Clustering

| Dataset Size | Approach | Time | Cost |
|-------------|----------|------|------|
| <50 | LLM | 3-5s | $0.05 |
| 50-100 | LLM | 5-10s | $0.10 |
| 100-500 | Hybrid | 10-20s | $0.15 |
| 500-1000 | Hybrid | 20-40s | $0.25 |
| 1000+ | Hybrid | 40-60s | $0.35 |

## Framing Types & Detection

### Supported Framing Categories

| Framing | Description | Example Statement |
|---------|-------------|-------------------|
| Economic | Cost, business, jobs | "This will create new jobs" |
| Safety | Security, health, accidents | "This will prevent injuries" |
| Environmental | Climate, pollution, nature | "This will reduce emissions" |
| Social | Community, equality, inclusion | "This will help everyone equally" |
| Rights | Freedom, privacy, autonomy | "People should have the right to choose" |
| Practical | Feasibility, implementation | "This is the most realistic option" |
| Moral | Ethics, values, principles | "This is the right thing to do" |
| Temporal | Urgency, long-term | "We need to act now before..." |

### Framing Detection Prompt

```typescript
const FRAMING_ANALYSIS_PROMPT = `
Analyze these statements about "${topic}" and cluster them by FRAMING.

Framing is about HOW an argument is made, not WHAT it's about:
- Economic framing: focuses on costs, jobs, business impact
- Safety framing: focuses on security, health, preventing harm
- Environmental framing: focuses on climate, pollution, nature
- Social framing: focuses on community, equality, inclusion
- Rights framing: focuses on freedom, privacy, individual choice
- Practical framing: focuses on feasibility, implementation
- Moral framing: focuses on ethics, values, right/wrong
- Temporal framing: focuses on urgency, timeline, future impact

Statements:
${statements}

Return JSON:
{
  "clusters": [
    {
      "name": "Safety-focused solutions",
      "framing": "safety",
      "description": "These statements emphasize preventing harm...",
      "statementIds": ["id1", "id2", ...]
    }
  ]
}
`;
```

## Error Handling

### Graceful Degradation

```
┌─────────────────────────────────────────────────────────────────┐
│                    FALLBACK STRATEGY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Primary: Embedding-based vector search                         │
│       │                                                          │
│       ├── Success ──▶ Return results                             │
│       │                                                          │
│       ▼ Failure (no embeddings, index error)                     │
│                                                                  │
│   Fallback 1: LLM-based similarity (existing)                    │
│       │                                                          │
│       ├── Success ──▶ Return results + log fallback              │
│       │                                                          │
│       ▼ Failure (API error, rate limit)                          │
│                                                                  │
│   Fallback 2: Text-based fuzzy matching                          │
│       │                                                          │
│       ├── Success ──▶ Return results + alert                     │
│       │                                                          │
│       ▼ Failure                                                  │
│                                                                  │
│   Final: Return empty results + error notification               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| EMBEDDING_GENERATION_FAILED | Could not generate embedding | Retry with backoff |
| VECTOR_INDEX_NOT_READY | Index still building | Use LLM fallback |
| NO_EMBEDDINGS_FOUND | Statements lack embeddings | Trigger migration |
| LLM_RATE_LIMITED | Gemini API rate limit | Exponential backoff |
| CLUSTERING_TIMEOUT | Clustering took too long | Reduce batch size |

## Migration Strategy

### Phase 1: Add Embeddings to New Statements
- Deploy embedding generation in `onStatementCreated`
- New statements automatically get embeddings
- Existing system continues to work

### Phase 2: Backfill Existing Statements
- Background job generates embeddings for existing options
- Process in batches of 100 to avoid rate limits
- Track progress in `_migrations` collection

### Phase 3: Enable Vector Search
- Create Firestore vector index
- Update `findSimilarStatements` to use embeddings
- Keep LLM as fallback for statements without embeddings

### Phase 4: Enable Hybrid Clustering
- Add `clusterBy: 'framing'` option
- Implement hybrid clustering for large datasets
- Update admin UI to use new clustering

## Monitoring & Observability

### Metrics to Track

```typescript
interface EmbeddingMetrics {
  // Performance
  embedding_generation_time_ms: number;
  vector_search_time_ms: number;
  total_request_time_ms: number;

  // Quality
  search_method_used: 'embedding' | 'llm' | 'fallback';
  results_count: number;
  avg_similarity_score: number;

  // Usage
  embeddings_generated_count: number;
  vector_searches_count: number;
  fallback_rate: number;
}
```

### Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| High Fallback Rate | >20% using LLM fallback | Check embedding generation |
| Slow Vector Search | P95 > 1s | Check index health |
| Embedding Errors | >5% failure rate | Check API quota |
| Index Not Ready | Index building >1hr | Manual intervention |

## Security Considerations

### Embedding Storage
- Embeddings are stored in Firestore (existing security rules apply)
- No PII in embeddings (mathematical vectors only)
- Same access controls as statement documents

### API Security
- All endpoints require authentication
- Rate limiting on embedding generation
- Content moderation before embedding generation

## Cost Analysis

### Gemini Embedding Costs

| Model | Cost per 1M tokens | Avg tokens/statement | Cost per 1000 embeddings |
|-------|-------------------|---------------------|-------------------------|
| text-embedding-004 | $0.00025 | ~50 | $0.0125 |

### Firestore Vector Search Costs

| Operation | Cost |
|-----------|------|
| Vector search query | Same as regular read |
| Storage (768 floats) | ~6KB per embedding |

### Monthly Cost Estimate (10,000 active questions)

| Component | Cost |
|-----------|------|
| Embedding generation | ~$5 |
| Vector storage | ~$2 |
| Vector queries | ~$10 |
| LLM clustering (fallback) | ~$20 |
| **Total** | **~$37/month** |

vs. Current LLM-only approach: **~$200-500/month**

## Future Enhancements

### Short-term
- [ ] Fine-tune similarity threshold per question type
- [ ] Add user feedback on similarity quality
- [ ] Implement embedding refresh for updated statements

### Medium-term
- [ ] Multi-language embedding optimization
- [ ] Semantic deduplication (auto-merge very similar)
- [ ] Embedding-based recommendation engine

### Long-term
- [ ] Custom fine-tuned embedding model for Freedi domain
- [ ] Real-time clustering updates as statements are added
- [ ] Cross-question similarity for knowledge transfer

## References

- [Firestore Vector Search Documentation](https://firebase.google.com/docs/firestore/vector-search)
- [Gemini Embedding Models](https://ai.google.dev/gemini-api/docs/embeddings)
- [Current Functions Architecture](./FUNCTIONS_ARCHITECTURE.md)
- [Existing Similarity Implementation](../functions/src/fn_findSimilarStatements.ts)
- [Current Clustering Implementation](../functions/src/fn_clusters.ts)
