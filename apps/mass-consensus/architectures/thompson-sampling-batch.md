# Thompson Sampling Batch Mechanism

## Overview

This document describes the adaptive batch selection mechanism for proposal evaluation in the mass-consensus application. The system uses Thompson Sampling combined with multi-factor priority scoring to intelligently select which proposals users should evaluate next.

## Problem Statement

The original batch mechanism had several issues:

1. **No priority for under-evaluated proposals**: All proposals were treated equally regardless of evaluation count
2. **Temporal bias**: Earlier submissions accumulated more evaluations than newer ones
3. **No early stopping**: Converged proposals kept consuming evaluation bandwidth
4. **RandomSeed clustering**: Excluded items clustered in seed space, causing empty results when users requested new batches

## Solution: Thompson Sampling with Priority Scoring

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (React)                            │
│  SolutionFeedClient.tsx                                          │
│  - Requests batch with userId                                    │
│  - No longer tracks excludeIds (server handles this)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Route (Next.js)                           │
│  app/api/statements/[id]/batch/route.ts                         │
│  - Validates request                                             │
│  - Calls getAdaptiveBatch() or falls back to getRandomOptions()│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Layer                                   │
│  src/lib/firebase/queries.ts                                    │
│  - getAdaptiveBatch(): Main entry point                         │
│  - Fetches all proposals for question                           │
│  - Gets user's evaluation history                               │
│  - Uses ProposalSampler for selection                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Sampling Layer                                │
│  src/lib/utils/proposalSampler.ts                               │
│  - ProposalSampler class                                         │
│  - scoreProposals(): Calculate priority for all proposals       │
│  - selectForUser(): Filter and select top N by priority         │
│  - calculateStats(): Return batch statistics                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Utilities Layer                               │
│  src/lib/utils/sampling.ts                                      │
│  - calculateStatsFromAggregates(): O(1) stats from aggregates   │
│  - calculatePriority(): Multi-factor priority scoring           │
│  - thompsonSample(): Beta distribution sampling                 │
│  - isStable(): Check if proposal has converged                  │
└─────────────────────────────────────────────────────────────────┘
```

## Priority Scoring Formula

```
Priority = (0.4 × Base) + (0.25 × Uncertainty) + (0.2 × Recency) + (0.15 × Threshold)
```

### Components

| Component | Weight | Description |
|-----------|--------|-------------|
| **Base Priority** | 40% | `1 - (evaluationCount / targetEvaluations)` - Under-evaluated proposals get higher priority |
| **Uncertainty Bonus** | 25% | `min(1, currentSEM / targetSEM)` - High variance proposals need more data |
| **Recency Boost** | 20% | Linear decay over 24 hours - Counteracts temporal bias for new proposals |
| **Near-Threshold Bonus** | 15% | Proposals near consensus threshold (0) get priority for decisive evaluation |

## Thompson Sampling

Thompson Sampling is a multi-armed bandit algorithm that balances exploration (trying uncertain options) with exploitation (favoring known good options).

### Implementation

```typescript
// Model ratings as Beta distribution
const alpha = positiveRatings + neutralRatings * 0.5 + 1;
const beta = negativeRatings + neutralRatings * 0.5 + 1;

// Sample from Beta distribution
const thompsonSample = sampleBeta(alpha, beta);

// Combine deterministic priority with exploration
adjustedPriority = priority * 0.7 + thompsonSample * 0.3;
```

This ensures that even lower-priority proposals occasionally get selected, preventing the algorithm from getting stuck on local optima.

## Early Stopping (Stability Check)

Proposals are considered "stable" when:
- `evaluationCount >= targetEvaluations` (default: 30)
- `SEM < targetSEM` (default: 0.15)

Stable proposals are excluded from active sampling, saving evaluation bandwidth for proposals that still need data.

## Configuration

```typescript
interface SamplingConfig {
  targetEvaluations: number;   // Default: 30
  targetSEM: number;           // Default: 0.15
  explorationWeight: number;   // Default: 0.3
  recencyBoostHours: number;   // Default: 24
}
```

## Data Flow

### Request Flow

1. Client sends POST to `/api/statements/[id]/batch` with `{ userId, size }`
2. Server fetches all proposals for the question from Firestore
3. Server fetches user's evaluation history from Firestore
4. ProposalSampler scores all available proposals
5. Top N proposals (by adjusted priority) are selected
6. Response includes `solutions`, `hasMore`, and `stats`

### Response Format

```typescript
{
  solutions: Statement[];      // Selected proposals
  hasMore: boolean;            // More proposals available
  count: number;               // Number of solutions returned
  stats: {
    totalCount: number;        // Total proposals for question
    evaluatedCount: number;    // User's evaluated count
    stableCount: number;       // Converged proposals count
    remainingCount: number;    // Proposals still available
  };
  method: 'adaptive' | 'random';
}
```

## Files

| File | Purpose |
|------|---------|
| `src/lib/utils/sampling.ts` | Core statistics and priority calculation utilities |
| `src/lib/utils/proposalSampler.ts` | ProposalSampler class for batch selection |
| `src/lib/firebase/queries.ts` | `getAdaptiveBatch()` function |
| `app/api/statements/[id]/batch/route.ts` | API endpoint |
| `src/components/question/SolutionFeedClient.tsx` | Client component |

## Existing Data Infrastructure

The implementation leverages existing aggregate fields in the Statement model:

```typescript
// Statement.evaluation object (already exists)
{
  sumEvaluations: number;        // Sum of all ratings
  sumSquaredEvaluations: number; // Sum of squared ratings (for variance)
  numberOfEvaluators: number;    // Total evaluation count
  averageEvaluation: number;     // Mean rating
}
```

### SEM Calculation

Standard Error of Mean is calculated using the same algorithm as `fn_evaluation.ts`:

```typescript
const FLOOR_STD_DEV = 0.5; // Uncertainty floor

function calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators) {
  if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

  const mean = sumEvaluations / numberOfEvaluators;
  const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);
  const observedStdDev = Math.sqrt(Math.max(0, variance));
  const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

  return adjustedStdDev / Math.sqrt(numberOfEvaluators);
}
```

## Benefits Over Previous Approach

| Aspect | Before (randomSeed) | After (Thompson Sampling) |
|--------|---------------------|---------------------------|
| Selection | Random with exclusion filter | Priority-based + exploration |
| Temporal fairness | None (earlier = more evals) | Recency boost for new proposals |
| Efficiency | Wastes bandwidth on converged | Early stopping for stable proposals |
| Uncertainty | Ignored | Prioritizes high-SEM proposals |
| Threshold decisions | Random coverage | Focuses on near-threshold cases |
| Server handling | Client sends excludeIds | Server manages evaluation history |

## Future Enhancements

1. **Persistent isStable flag**: Mark proposals as stable in Firestore to avoid re-computing
2. **Skip penalty**: Track and penalize frequently skipped proposals
3. **Question-level configuration**: Allow per-question sampling parameters
4. **Analytics**: Track sampling effectiveness metrics
