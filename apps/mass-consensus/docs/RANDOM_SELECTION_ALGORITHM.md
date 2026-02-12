# Random Option Selection Algorithm

This document explains how the Mass-Consensus app selects options randomly while ensuring all options receive fair opportunity for evaluation.

## Overview

The system employs two distinct selection strategies based on user authentication status:

1. **Random Selection** - For anonymous users (simple, fast)
2. **Adaptive Selection** - For authenticated users (fair, sophisticated)

Both mechanisms ensure that all options get a fair chance to be evaluated, preventing early submissions from dominating the evaluation pool.

---

## 1. Random Selection (Anonymous Users)

### How It Works

Each option has a `randomSeed` field (value between 0 and 1) assigned when created:

```typescript
// When creating an option
{
  ...optionData,
  randomSeed: Math.random()  // e.g., 0.7342
}
```

### Query Strategy

Uses a **two-part query approach** for efficient Firestore random sampling:

```
                    randomSeed: 0                               1
                    ├─────────────────────────────────────────────┤
                                       ↑
                               Generated: 0.6

Query 1: randomSeed >= 0.6    [          ████████████████████████]
Query 2: randomSeed < 0.6     [██████████                        ]
```

1. Generate a random value (e.g., 0.6)
2. Query options where `randomSeed >= 0.6` (gets ~40% of options)
3. If more needed, query where `randomSeed < 0.6` (gets remaining ~60%)

### Why This Works

- **Efficient**: No need to fetch all options, then shuffle
- **Scalable**: Uses Firestore indexes for fast queries
- **Uniform**: Each option has equal probability of selection
- **Deterministic field**: The randomSeed is assigned once and reused

### Code Location

`apps/mass-consensus/src/lib/firebase/queries.ts` → `getRandomOptions()`

---

## 2. Adaptive Selection (Authenticated Users)

### The Fairness Problem

Without intervention, options submitted earlier accumulate more evaluations simply by existing longer. This creates unfair advantages and biases the results.

### Solution: Thompson Sampling with Multi-Factor Priority

The system calculates a **priority score** for each option to ensure fair distribution:

```
Priority = (0.4 × Base) + (0.25 × Uncertainty) + (0.2 × Recency) + (0.15 × TopMean)
```

### The Four Fairness Factors

#### 1. Base Priority (40% weight) - Evaluation Balance

Options with fewer evaluations get higher priority:

```
Base Priority = 1 - (evaluationCount / targetEvaluations)
```

| Evaluations | Target: 30 | Base Priority |
|-------------|-----------|---------------|
| 0           | 30        | 1.0 (highest) |
| 15          | 30        | 0.5           |
| 30+         | 30        | 0.0 (lowest)  |

**Effect**: Under-evaluated options are prioritized to catch up.

#### 2. Uncertainty Bonus (25% weight) - Statistical Confidence

Options with high variance need more evaluations to reach statistical significance:

```
Uncertainty Bonus = SEM / targetSEM
```

| SEM (Standard Error) | Target: 0.15 | Uncertainty Bonus |
|---------------------|--------------|-------------------|
| 0.30                | 0.15         | 1.0 (needs data)  |
| 0.15                | 0.15         | 1.0               |
| 0.08                | 0.15         | 0.53 (confident)  |

**Effect**: Controversial options (high variance) get more evaluations until statistically stable.

#### 3. Recency Boost (20% weight) - Temporal Fairness

New options get a temporary priority boost to counteract first-mover advantage:

```
Recency Boost = 1 - (hoursOld / boostWindow)
```

| Age        | Boost Window: 24h | Recency Boost |
|------------|-------------------|---------------|
| 0 hours    | 24                | 1.0 (new)     |
| 12 hours   | 24                | 0.5           |
| 24+ hours  | 24                | 0.0 (no boost)|

**Effect**: New submissions can catch up to older ones quickly.

#### 4. Top-Mean Bonus (15% weight) - Validate Leaders

Top-performing options (relative to other proposals) need validation before being declared winners:

```
TopMean Bonus = percentileRank × (SEM / targetSEM)
```

Where:
- **percentileRank**: 0.0 (lowest mean) to 1.0 (highest mean) among all proposals
- **SEM / targetSEM**: Uncertainty factor (high = needs validation)

| Proposal | Mean | Percentile | SEM | Bonus |
|----------|------|------------|-----|-------|
| A (top)  | +0.8 | 1.0 | 0.30 | **1.0** (leader needs validation) |
| B        | +0.5 | 0.67 | 0.15 | **0.67** |
| C        | +0.2 | 0.33 | 0.30 | **0.66** |
| D (bottom) | -0.3 | 0.0 | 0.30 | **0.0** (no need to validate losers) |

**Effect**: Top performers get extra evaluations to confirm they're truly the best. Bottom performers don't waste evaluation resources.

---

## 3. Exploration vs. Exploitation

The algorithm balances two competing goals:

| Goal | Description | Weight |
|------|-------------|--------|
| **Exploitation** | Show options we're confident about | 70% |
| **Exploration** | Test uncertain options | 30% |

This is achieved through **Thompson Sampling**, which adds controlled randomness:

```typescript
adjustedPriority = (0.7 × deterministicPriority) + (0.3 × thompsonSample)
```

This prevents the system from getting "stuck" on known options and ensures discovery of potentially good but under-evaluated proposals.

---

## 4. Filtering Mechanisms

Before scoring, the system filters out:

### Layer 1: Already Evaluated
Options the user has already evaluated are excluded from future batches.

### Layer 2: Stable Options (Early Stopping)
Options that have reached statistical stability are excluded:

```typescript
isStable = evaluationCount >= 30 AND sem < 0.15
```

**Effect**: Prevents wasting evaluations on already-decided options.

### Layer 3: Hidden/Merged Options
Deleted or merged options are filtered out.

---

## 5. Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Requests New Batch                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │    Is User Authenticated?    │
              └──────────────┬───────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ Random Selection│               │Adaptive Selection│
   │  (Anonymous)    │               │ (Authenticated) │
   └────────┬────────┘               └────────┬────────┘
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ Query by        │               │ Fetch all       │
   │ randomSeed      │               │ options         │
   └────────┬────────┘               └────────┬────────┘
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ Filter:         │               │ Filter:         │
   │ - Evaluated     │               │ - Evaluated     │
   │ - Hidden        │               │ - Hidden        │
   └────────┬────────┘               │ - Stable        │
            │                        └────────┬────────┘
            │                                 │
            │                                 ▼
            │                        ┌─────────────────┐
            │                        │ Calculate       │
            │                        │ Priority Score  │
            │                        │ for each option │
            │                        └────────┬────────┘
            │                                 │
            │                                 ▼
            │                        ┌─────────────────┐
            │                        │ Thompson Sample │
            │                        │ (exploration)   │
            │                        └────────┬────────┘
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ Return batch    │               │ Select top N    │
   │ (6 options)     │               │ by priority     │
   └────────┬────────┘               └────────┬────────┘
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │      Display to User         │
              └──────────────────────────────┘
```

---

## 6. Fairness Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| All options get evaluated | Base priority boosts under-evaluated options |
| No temporal bias | Recency boost for new submissions |
| Statistical significance | SEM-based uncertainty tracking |
| No small-group dominance | Uncertainty floor (min std dev = 0.5) |
| Leader validation | Top-mean bonus (percentile-based) |
| Discovery of good options | Thompson sampling exploration |

---

## 7. Key Configuration

```typescript
const DEFAULT_CONFIG = {
  targetEvaluations: 30,      // Goal per option
  targetSEM: 0.15,            // Statistical significance threshold
  explorationWeight: 0.3,     // 30% exploration
  recencyBoostHours: 24,      // New option boost window
};
```

---

## 8. API Usage

### Endpoint
```
POST /api/statements/[questionId]/batch
```

### Request
```json
{
  "userId": "user-123",
  "size": 6,
  "useAdaptive": true
}
```

### Response
```json
{
  "solutions": [...],
  "hasMore": true,
  "stats": {
    "totalCount": 47,
    "evaluatedCount": 12,
    "stableCount": 8,
    "remainingCount": 25
  },
  "method": "adaptive"
}
```

---

## 9. Code Locations

| Component | File |
|-----------|------|
| Random selection query | `src/lib/firebase/queries.ts` → `getRandomOptions()` |
| Adaptive selection | `src/lib/firebase/queries.ts` → `getAdaptiveBatch()` |
| Priority calculation | `src/lib/utils/sampling.ts` → `calculatePriority()` |
| Thompson sampling | `src/lib/utils/proposalSampler.ts` |
| Batch API endpoint | `app/api/statements/[id]/batch/route.ts` |
| Evaluation aggregation | `functions/src/fn_evaluation.ts` |

---

## 10. Summary

The random selection algorithm ensures fairness through:

1. **Equal initial opportunity**: randomSeed gives each option equal selection probability
2. **Catch-up mechanism**: Under-evaluated options are prioritized
3. **Temporal fairness**: New submissions get a boost to catch up
4. **Statistical rigor**: Options are evaluated until statistically stable
5. **Exploration**: Thompson sampling prevents greedy exploitation
6. **Early stopping**: Stable options exit the pool to save resources

This creates a self-balancing system where all options receive fair evaluation opportunity regardless of when they were submitted.
