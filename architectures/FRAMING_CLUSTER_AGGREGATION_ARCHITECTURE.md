# Framing & Cluster Aggregation Architecture

This document provides a comprehensive overview of the multi-framing clustering system and cluster-based evaluation aggregation for Freedi.

## Overview

The Framing & Cluster Aggregation system enables administrators to generate multiple AI-powered clustering perspectives ("framings") for options under a question, and accurately count unique evaluators per cluster while preventing double-counting when users evaluate multiple options within the same cluster.

### Problem Statement

When generating end-reports for clustered options in Mass Consensus:
1. We need to know how many **unique** people evaluated each clustered option
2. We must prevent double-counting when a user evaluated multiple options within the same cluster
3. Administrators need different "framings" (clustering perspectives) from AI for analysis
4. Multiple framings should be stored for comparison

**Example**: Cluster "Keep dogs at home" contains:
- Option A: "People should keep their dogs at home" (50 evaluators)
- Option B: "Keeping dogs at home is highly important" (40 evaluators)

If 20 users evaluated BOTH options, the cluster should show **70 unique evaluators** (not 90), with their cluster-level score being the **average** of their evaluations within that cluster.

## Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20 |
| Framework | Firebase Functions v2 |
| Database | Firebase Firestore |
| AI | Google Gemini API |
| Language | TypeScript (strict) |
| Validation | Valibot |
| Caching | Firestore with TTL |
| Frontend | React + TypeScript |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Admin UI (React)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  ClusteringAdmin │  │   FramingList   │  │    FramingDetail        │  │
│  │  (Main Container)│  │   (Selection)   │  │    (Cluster Cards)      │  │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘  │
│           │                    │                       │                 │
│           └────────────────────┼───────────────────────┘                 │
│                                │                                         │
│                    ┌───────────▼───────────┐                            │
│                    │  framingController.ts  │                            │
│                    │   (Client API Layer)   │                            │
│                    └───────────┬───────────┘                            │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │ HTTP/HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Firebase Cloud Functions                          │
│                                                                          │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │   fn_multiFramingClusters.ts   │  │   fn_clusterAggregation.ts      │ │
│  │                               │  │                                 │ │
│  │  • generateMultipleFramings   │  │  • getClusterAggregations       │ │
│  │  • requestCustomFraming       │  │  • recalculateClusterAggregation│ │
│  │  • getFramingsForStatement    │  │  • getFramingAggregationSummary │ │
│  │  • getFramingClusters         │  │  • onEvaluationChangeInvalidate │ │
│  │  • deleteFraming              │  │    Cache (Trigger)              │ │
│  └───────────────┬───────────────┘  └──────────────┬──────────────────┘ │
│                  │                                  │                    │
│                  │         ┌────────────────────────┘                    │
│                  │         │                                             │
│                  ▼         ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                        Firestore Collections                         ││
│  │  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐ ││
│  │  │   framings   │  │ clusterAggregations │ │      statements       │ ││
│  │  │              │  │     (Cache)       │  │  (isCluster=true)     │ ││
│  │  └──────────────┘  └──────────────────┘  └────────────────────────┘ ││
│  │  ┌──────────────────┐  ┌──────────────────┐                         ││
│  │  │ framingRequests  │  │   evaluations    │                         ││
│  │  │  (Admin Queue)   │  │  (Source Data)   │                         ││
│  │  └──────────────────┘  └──────────────────┘                         ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### Framing

```typescript
interface Framing {
  framingId: string;           // Unique identifier
  parentStatementId: string;   // The question being clustered
  name: string;                // Display name (e.g., "By Implementation Cost")
  description: string;         // AI-generated description
  prompt?: string;             // Custom prompt if admin-requested
  createdAt: number;           // Timestamp (milliseconds)
  createdBy: 'ai' | 'admin';   // Origin
  creatorId?: string;          // Admin user ID if custom
  isActive: boolean;           // Whether framing is active
  clusterIds: string[];        // References to cluster statements
  order: number;               // Display order
}
```

### ClusterAggregatedEvaluation (Cache)

```typescript
interface ClusterAggregatedEvaluation {
  clusterId: string;                  // Cluster statement ID
  framingId: string;                  // Parent framing
  parentStatementId: string;          // Original question
  uniqueEvaluatorCount: number;       // Count of unique users
  averageClusterConsensus: number;    // Average of user averages
  proEvaluatorCount: number;          // Users with positive average
  conEvaluatorCount: number;          // Users with negative average
  neutralEvaluatorCount: number;      // Users with zero average
  sumPro: number;                     // Sum of positive scores
  sumCon: number;                     // Sum of negative scores
  optionCount: number;                // Number of options in cluster
  evaluationsPerOption: number[];     // Distribution of evaluations
  calculatedAt: number;               // Cache timestamp
  expiresAt: number;                  // TTL expiration
  isStale: boolean;                   // Invalidation flag
}
```

### FramingRequest

```typescript
interface FramingRequest {
  requestId: string;
  parentStatementId: string;
  customPrompt: string;
  requestedBy: string;         // Admin user ID
  requestedAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultFramingId?: string;
  error?: string;
}
```

## Core Algorithm: Deduplication

The deduplication algorithm ensures each user is counted once per cluster, with their score being the average of all their evaluations within that cluster.

```typescript
async function calculateClusterAggregation(clusterId: string): Promise<ClusterAggregatedEvaluation> {
  // 1. Get all options in this cluster
  const options = await getOptionsInCluster(clusterId);
  const optionIds = options.map(o => o.statementId);

  // 2. Fetch all evaluations for these options
  const allEvaluations = await fetchEvaluationsForOptions(optionIds);

  // 3. Group evaluations by user
  const evaluationsByUser = new Map<string, { evaluations: number[]; userId: string }>();

  allEvaluations.forEach((evaluation) => {
    const userId = evaluation.evaluatorId;
    const existing = evaluationsByUser.get(userId);
    if (existing) {
      existing.evaluations.push(evaluation.evaluation);
    } else {
      evaluationsByUser.set(userId, {
        userId,
        evaluations: [evaluation.evaluation]
      });
    }
  });

  // 4. Calculate per-user AVERAGE and aggregate
  let totalScore = 0;
  let proCount = 0, conCount = 0, neutralCount = 0;

  evaluationsByUser.forEach((userData) => {
    // Each user's contribution is their AVERAGE across all options they evaluated
    const userAverage = userData.evaluations.reduce((sum, val) => sum + val, 0)
                        / userData.evaluations.length;

    totalScore += userAverage;

    // Classify user based on their average
    if (userAverage > 0) proCount++;
    else if (userAverage < 0) conCount++;
    else neutralCount++;
  });

  const uniqueEvaluators = evaluationsByUser.size;

  return {
    uniqueEvaluatorCount: uniqueEvaluators,
    averageClusterConsensus: uniqueEvaluators > 0 ? totalScore / uniqueEvaluators : 0,
    proEvaluatorCount: proCount,
    conEvaluatorCount: conCount,
    neutralEvaluatorCount: neutralCount,
    // ... additional fields
  };
}
```

## Caching Strategy

### Cache Configuration

```typescript
const CLUSTER_AGGREGATION_CACHE = {
  DEFAULT_TTL_MS: 5 * 60 * 1000,    // 5 minutes - active discussions
  LONG_TTL_MS: 30 * 60 * 1000,     // 30 minutes - stable clusters
  SHORT_TTL_MS: 1 * 60 * 1000,     // 1 minute - high-activity voting
} as const;
```

### Cache Invalidation

```
┌──────────────────────────────────────────────────────────────────┐
│                     Cache Invalidation Flow                       │
│                                                                   │
│   User submits           Firestore Trigger           Mark cache   │
│   evaluation      ──────►  detects write     ──────►  as stale    │
│                           (onWrite event)                         │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │  onEvaluationChangeInvalidateCache                          │ │
│   │                                                             │ │
│   │  1. Get statement ID from evaluation                        │ │
│   │  2. Find all clusters containing this statement             │ │
│   │  3. Query clusterAggregations where clusterId IN clusterIds │ │
│   │  4. Update all matching docs: { isStale: true }             │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│   Next request           Check cache           Recalculate if     │
│   for aggregations ──────► isStale?    ──────► stale or expired   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Cache Lookup Flow

```typescript
async function getClusterAggregation(clusterId: string, framingId: string): Promise<ClusterAggregatedEvaluation> {
  const cacheId = `${clusterId}--${framingId}`;
  const cached = await getCachedAggregation(cacheId);

  const now = Date.now();

  if (cached && !cached.isStale && cached.expiresAt > now) {
    // Cache hit - return cached data
    return cached;
  }

  // Cache miss or stale - recalculate
  const freshData = await calculateClusterAggregation(clusterId, framingId);
  await saveToCacheWithTTL(cacheId, freshData, CLUSTER_AGGREGATION_CACHE.DEFAULT_TTL_MS);

  return freshData;
}
```

## API Reference

### Cloud Functions

| Function | Method | Description |
|----------|--------|-------------|
| `generateMultipleFramings` | POST | Generate 3 AI framings for a statement |
| `requestCustomFraming` | POST | Create framing with custom prompt |
| `getFramingsForStatement` | GET | List all framings for a statement |
| `getFramingClusters` | GET | Get clusters and options for a framing |
| `deleteFraming` | POST | Delete framing and its clusters |
| `getClusterAggregations` | GET | Get aggregated stats for all clusters |
| `recalculateClusterAggregation` | POST | Force recalculate specific cluster |
| `getFramingAggregationSummary` | GET | Get summary stats for a framing |

### Client Controller API

```typescript
// Generate AI framings
await generateMultipleFramings(statementId: string, maxFramings?: number): Promise<Framing[]>

// Request custom framing
await requestCustomFraming(statementId: string, customPrompt: string, userId: string): Promise<Framing>

// Get framings for statement
await getFramingsForStatement(statementId: string): Promise<Framing[]>

// Get framing clusters with options
await getFramingClusters(framingId: string): Promise<GetFramingClustersResponse>

// Delete framing
await deleteFraming(framingId: string): Promise<void>

// Get cluster aggregations
await getClusterAggregations(framingId: string, forceRefresh?: boolean): Promise<GetClusterAggregationsResponse>

// Recalculate specific cluster
await recalculateClusterAggregation(clusterId: string, framingId: string): Promise<ClusterAggregatedEvaluation>

// Get framing summary
await getFramingAggregationSummary(framingId: string): Promise<GetFramingAggregationSummaryResponse>
```

## UI Components

### Component Hierarchy

```
ClusteringAdmin (Main Container)
├── FramingList (Left Panel)
│   └── FramingItem (Repeating)
│       ├── Framing Name
│       ├── AI/Custom Badge
│       ├── Cluster Count
│       └── Delete Button
├── FramingDetail (Right Panel)
│   ├── Summary Stats
│   │   ├── Cluster Count
│   │   ├── Unique Evaluators
│   │   ├── Avg Consensus
│   │   └── Stale Data Warning
│   ├── Custom Prompt Display
│   └── Cluster Grid
│       └── ClusterCard (Repeating)
│           ├── Option Count
│           ├── Unique Evaluator Count
│           ├── Consensus Score
│           ├── Distribution Bar
│           │   ├── Pro (green)
│           │   ├── Neutral (gray)
│           │   └── Con (red)
│           └── Last Updated
└── RequestFramingModal (Modal)
    ├── Description
    ├── Custom Prompt Textarea
    └── Submit/Cancel Buttons
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `ClusteringAdmin` | State management, API calls, layout |
| `FramingList` | Display framings, selection, deletion |
| `FramingDetail` | Display selected framing details and clusters |
| `ClusterCard` | Display individual cluster metrics |
| `RequestFramingModal` | Custom framing request form |

## File Structure

```
/packages/shared-types/src/models/framing/
└── framingModel.ts           # Type definitions and schemas

/functions/src/
├── fn_multiFramingClusters.ts  # AI framing generation
├── fn_clusterAggregation.ts    # Aggregation and caching
└── index.ts                    # Function exports

/src/controllers/db/framing/
└── framingController.ts        # Client API layer

/src/view/pages/statement/components/settings/components/ClusteringAdmin/
├── ClusteringAdmin.tsx         # Main container
├── ClusteringAdmin.module.scss # Styles
├── FramingList.tsx             # Framing selection
├── FramingDetail.tsx           # Cluster display
├── ClusterCard.tsx             # Individual cluster
├── RequestFramingModal.tsx     # Custom framing form
└── index.ts                    # Exports

/packages/shared-i18n/src/languages/
├── en.json                     # English translations
├── he.json                     # Hebrew translations
├── ar.json                     # Arabic translations
├── de.json                     # German translations
├── es.json                     # Spanish translations
└── nl.json                     # Dutch translations
```

## Firestore Collections

### New Collections

| Collection | Purpose |
|------------|---------|
| `framings` | Store framing metadata and cluster references |
| `framingRequests` | Track admin custom framing requests |
| `clusterAggregations` | Cache cluster-level aggregated evaluations |
| `framingSnapshots` | Optional: Store framing state for recovery |

### Collection Schemas

```typescript
// framings/{framingId}
{
  framingId: string,
  parentStatementId: string,
  name: string,
  description: string,
  prompt?: string,
  createdAt: number,
  createdBy: 'ai' | 'admin',
  creatorId?: string,
  isActive: boolean,
  clusterIds: string[],
  order: number
}

// clusterAggregations/{clusterId--framingId}
{
  clusterId: string,
  framingId: string,
  parentStatementId: string,
  uniqueEvaluatorCount: number,
  averageClusterConsensus: number,
  proEvaluatorCount: number,
  conEvaluatorCount: number,
  neutralEvaluatorCount: number,
  sumPro: number,
  sumCon: number,
  optionCount: number,
  evaluationsPerOption: number[],
  calculatedAt: number,
  expiresAt: number,
  isStale: boolean
}
```

## Performance Considerations

### Batch Operations

- All cluster aggregation calculations use Firestore batch reads
- Updates to multiple cache entries use batch writes
- Maximum batch size: 500 operations (Firestore limit)

### Query Optimization

- Cluster lookups use compound indexes on `parentId` + `isCluster`
- Evaluation queries indexed on `statementId`
- Cache lookups use document ID directly

### Scalability

| Scenario | Expected Performance |
|----------|---------------------|
| < 100 options per question | < 500ms aggregation |
| < 1000 evaluators per cluster | < 1s aggregation |
| < 10 framings per question | Negligible overhead |

## Security Considerations

### Authorization

- Only admins can generate/request framings
- Only admins can delete framings
- Aggregation data is read-only for non-admins
- Custom prompts are validated for length and content

### Data Privacy

- Aggregations only store counts, not individual evaluations
- User IDs are used internally but not exposed in responses
- Evaluation details remain in secure evaluations collection

## Error Handling

### Error Categories

| Error Type | Handling |
|------------|----------|
| AI Generation Failure | Retry with exponential backoff |
| Cache Miss | Recalculate on-demand |
| Invalid Framing ID | Return 400 with clear message |
| Permission Denied | Return 403, log attempt |
| Firestore Timeout | Retry with smaller batch |

### Logging

```typescript
// All operations logged with context
logger.info('Generated multiple framings', {
  statementId,
  framingCount: framings.length,
  duration: endTime - startTime
});

logError(error, {
  operation: 'fn_clusterAggregation.calculateClusterAggregation',
  clusterId,
  framingId,
  metadata: { optionCount, evaluationCount }
});
```

## Future Enhancements

### Planned Features

1. **Embedding-Based Clustering**: Use vector embeddings for semantic clustering
2. **Real-Time Updates**: WebSocket subscriptions for live aggregation updates
3. **Export Functionality**: PDF/CSV export of framing reports
4. **Comparison View**: Side-by-side framing comparison
5. **Historical Analysis**: Track how framings change over time

### Integration Points

- Mass Consensus results page integration
- Admin dashboard widgets
- Email report generation
- API for external analytics tools

## Related Documentation

- [Functions Architecture](./FUNCTIONS_ARCHITECTURE.md)
- [Main App Architecture](./MAIN_APP_ARCHITECTURE.md)
- [Embeddings Clustering Architecture](./EMBEDDINGS_CLUSTERING_ARCHITECTURE.md)
