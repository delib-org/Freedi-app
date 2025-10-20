# Mass Consensus Complete Optimization Plan
## Redux Simplification + Prefetching + Get New Suggestions

## Executive Summary
A comprehensive plan that combines:
1. **Redux-based architecture simplification**
2. **Intelligent prefetching for instant page loads**
3. **"Get New Suggestions" functionality for random statements**

## Part 1: Redux Architecture Simplification

### Enhanced Redux State Structure

```typescript
interface MassConsensusState {
  // Flow Control
  flow: {
    currentStage: MassConsensusStage;
    completedStages: Set<MassConsensusStage>;
    stageConfig: StageConfig[];
    canProceed: boolean;
  };

  // All Data in One Place
  data: {
    statement: Statement | null;
    userAnswer: string;
    similarStatements: Statement[];
    randomStatements: Statement[];
    randomStatementsBatches: Statement[][]; // Store multiple batches
    currentRandomBatch: number; // Track which batch we're showing
    topStatements: Statement[];
    votingOptions: Statement[];
    evaluations: Record<string, Evaluation>;
    viewedStatementIds: Set<string>; // Track what user has already seen
  };

  // Prefetch Cache
  prefetch: {
    randomStatements: {
      batches: Statement[][];  // Multiple prefetched batches
      timestamp: number;
      parentId: string;
    } | null;
    topStatements: {
      data: Statement[];
      timestamp: number;
      parentId: string;
    } | null;
  };

  // Loading States
  loading: {
    fetchingNewRandom: boolean;
    prefetchingRandom: boolean;
    stages: Partial<Record<MassConsensusStage, boolean>>;
  };

  // UI State
  ui: {
    evaluationsPerBatch: Record<number, number>; // Track evaluations per batch
    totalBatchesViewed: number;
    canGetNewSuggestions: boolean;
  };
}
```

## Part 2: Get New Random Suggestions Feature

### Core Functionality

#### Async Thunk for Fetching New Batch

```typescript
// Fetch a new batch of random statements
export const fetchNewRandomBatch = createAsyncThunk(
  'massConsensus/fetchNewRandomBatch',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { statement, viewedStatementIds } = state.massConsensus.data;

    if (!statement) throw new Error('No statement found');

    // Fetch new batch, excluding already viewed statements
    const response = await fetch(
      APIEndPoint('getRandomStatements', {
        parentId: statement.statementId,
        limit: 6,
        excludeIds: Array.from(viewedStatementIds).join(',')
      })
    );

    const { statements } = await response.json();

    // Filter out any statements user has already seen (double-check)
    const newStatements = statements.filter(
      (s: Statement) => !viewedStatementIds.has(s.statementId)
    );

    // If we got less than 3 new statements, fetch more
    if (newStatements.length < 3) {
      const additionalResponse = await fetch(
        APIEndPoint('getRandomStatements', {
          parentId: statement.statementId,
          limit: 10,
          excludeIds: Array.from(viewedStatementIds).join(',')
        })
      );

      const { statements: moreStatements } = await additionalResponse.json();
      newStatements.push(
        ...moreStatements.filter(
          (s: Statement) => !viewedStatementIds.has(s.statementId)
        )
      );
    }

    // Start prefetching top suggestions since user is engaged
    dispatch(prefetchTopStatements());

    return newStatements.slice(0, 6); // Return max 6 statements
  }
);

// Prefetch multiple batches of random statements
export const prefetchRandomBatches = createAsyncThunk(
  'massConsensus/prefetchRandomBatches',
  async (batchCount: number = 3, { getState }) => {
    const state = getState() as RootState;
    const { statement, viewedStatementIds } = state.massConsensus.data;

    if (!statement) return null;

    const batches: Statement[][] = [];
    const tempViewedIds = new Set(viewedStatementIds);

    for (let i = 0; i < batchCount; i++) {
      const response = await fetch(
        APIEndPoint('getRandomStatements', {
          parentId: statement.statementId,
          limit: 6,
          excludeIds: Array.from(tempViewedIds).join(',')
        })
      );

      const { statements } = await response.json();
      batches.push(statements);

      // Add to temp viewed to avoid duplicates in next batch
      statements.forEach((s: Statement) =>
        tempViewedIds.add(s.statementId)
      );
    }

    return batches;
  }
);
```

### Reducer Actions for New Suggestions

```typescript
const massConsensusSlice = createSlice({
  name: 'massConsensus',
  initialState,
  reducers: {
    // Load next batch from prefetched data
    loadNextRandomBatch: (state) => {
      const { prefetch } = state;

      if (prefetch.randomStatements?.batches.length > 0) {
        // Get first batch from prefetch
        const nextBatch = prefetch.randomStatements.batches.shift();

        if (nextBatch) {
          // Add current batch to history
          state.data.randomStatementsBatches.push(state.data.randomStatements);

          // Set new batch as current
          state.data.randomStatements = nextBatch;
          state.data.currentRandomBatch++;

          // Mark statements as viewed
          nextBatch.forEach(s =>
            state.data.viewedStatementIds.add(s.statementId)
          );

          // Reset evaluations for new batch
          state.ui.evaluationsPerBatch[state.data.currentRandomBatch] = 0;
          state.ui.canGetNewSuggestions = false;
        }
      }
    },

    // Check if user can get new suggestions
    updateCanGetNewSuggestions: (state) => {
      const currentBatch = state.data.currentRandomBatch;
      const evaluatedCount = state.ui.evaluationsPerBatch[currentBatch] || 0;
      const totalInBatch = state.data.randomStatements.length;

      // User can get new suggestions if they evaluated all in current batch
      state.ui.canGetNewSuggestions = evaluatedCount >= totalInBatch;
    },

    // Track evaluation
    setEvaluation: (state, action: PayloadAction<{
      statementId: string;
      value: number;
    }>) => {
      const { statementId, value } = action.payload;

      // Track evaluation
      state.data.evaluations[statementId] = {
        value,
        timestamp: Date.now()
      };

      // Update count for current batch
      const currentBatch = state.data.currentRandomBatch;
      if (!state.ui.evaluationsPerBatch[currentBatch]) {
        state.ui.evaluationsPerBatch[currentBatch] = 0;
      }
      state.ui.evaluationsPerBatch[currentBatch]++;

      // Check if can get new suggestions
      const evaluatedCount = state.ui.evaluationsPerBatch[currentBatch];
      const totalInBatch = state.data.randomStatements.length;
      state.ui.canGetNewSuggestions = evaluatedCount >= totalInBatch;
    },
  },

  extraReducers: (builder) => {
    builder
      // Handle fetching new random batch
      .addCase(fetchNewRandomBatch.pending, (state) => {
        state.loading.fetchingNewRandom = true;
      })
      .addCase(fetchNewRandomBatch.fulfilled, (state, action) => {
        state.loading.fetchingNewRandom = false;

        // Store current batch in history
        if (state.data.randomStatements.length > 0) {
          state.data.randomStatementsBatches.push(state.data.randomStatements);
        }

        // Set new batch
        state.data.randomStatements = action.payload;
        state.data.currentRandomBatch++;

        // Mark as viewed
        action.payload.forEach(s =>
          state.data.viewedStatementIds.add(s.statementId)
        );

        // Reset UI state for new batch
        state.ui.evaluationsPerBatch[state.data.currentRandomBatch] = 0;
        state.ui.canGetNewSuggestions = false;

        // Trigger prefetch of more batches
        // (handled in middleware)
      })
      .addCase(fetchNewRandomBatch.rejected, (state, action) => {
        state.loading.fetchingNewRandom = false;
        state.errors.stages.randomSuggestions = action.error.message;
      })

      // Handle prefetching batches
      .addCase(prefetchRandomBatches.fulfilled, (state, action) => {
        if (!action.payload) return;

        state.prefetch.randomStatements = {
          batches: action.payload,
          timestamp: Date.now(),
          parentId: state.data.statement?.statementId || '',
        };
      });
  },
});
```

## Part 3: Updated RandomSuggestions Component

```typescript
const RandomSuggestions = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useUserConfig();

  // Selectors for all needed data
  const {
    randomStatements,
    currentBatch,
    canGetNewSuggestions,
    isLoadingNew,
    evaluations,
    hasPrefetchedBatches
  } = useSelector(selectRandomSuggestionsState);

  const { statementId } = useParams<{ statementId: string }>();

  // Load initial data
  useEffect(() => {
    dispatch(fetchStageData('randomSuggestions'));
    // Prefetch additional batches for smooth experience
    dispatch(prefetchRandomBatches(3));
  }, [dispatch]);

  // Handle getting new suggestions
  const handleGetNewSuggestions = async () => {
    // First check if we have prefetched batches
    if (hasPrefetchedBatches) {
      // Use prefetched data (instant)
      dispatch(loadNextRandomBatch());
    } else {
      // Fetch new batch (shows loading)
      await dispatch(fetchNewRandomBatch()).unwrap();
    }

    // Prefetch more batches in background
    dispatch(prefetchRandomBatches(2));
  };

  // Handle evaluation
  const handleEvaluate = (statementId: string, value: number) => {
    dispatch(setEvaluation({ statementId, value }));
  };

  // Navigate to next stage
  const handleNext = () => {
    dispatch(progressToNextStage());
    navigate(`/mass-consensus/${statementId}/top-suggestions`);
  };

  // Calculate evaluations left
  const evaluationsLeft = randomStatements.filter(
    s => !evaluations[s.statementId]
  ).length;

  return (
    <div className="random-suggestions">
      <h2>{t("Please rate the following suggestions")}</h2>

      {/* Batch indicator */}
      <div className="batch-indicator">
        {t("Batch")} {currentBatch + 1} {t("of suggestions")}
      </div>

      {/* Suggestion cards */}
      <SimpleSuggestionCards
        subStatements={randomStatements}
        onEvaluate={handleEvaluate}
        evaluations={evaluations}
      />

      {/* Get New Suggestions Button */}
      <div className="batch-controls">
        <button
          className={`btn btn--secondary btn--img ${
            !canGetNewSuggestions || isLoadingNew ? 'btn--disabled' : ''
          }`}
          onClick={handleGetNewSuggestions}
          disabled={!canGetNewSuggestions || isLoadingNew}
        >
          {isLoadingNew ? (
            <>
              <Spinner />
              <span>{t("Loading new suggestions...")}</span>
            </>
          ) : (
            <>
              <RandomIcon />
              <span>{t("Get New Suggestions")}</span>
            </>
          )}
        </button>

        {evaluationsLeft > 0 && (
          <p className="hint">
            {t("Evaluate all suggestions to get new ones")}
            ({evaluationsLeft} {t("left")})
          </p>
        )}
      </div>

      {/* Footer with navigation */}
      <MassConsensusFooter
        canProceed={true} // Always can proceed from random
        onNext={handleNext}
        showBack={true}
      />
    </div>
  );
};
```

## Part 4: Smart Selectors

```typescript
// Selector for random suggestions state
export const selectRandomSuggestionsState = createSelector(
  [(state: RootState) => state.massConsensus],
  (massConsensus) => ({
    randomStatements: massConsensus.data.randomStatements,
    currentBatch: massConsensus.data.currentRandomBatch,
    canGetNewSuggestions: massConsensus.ui.canGetNewSuggestions,
    isLoadingNew: massConsensus.loading.fetchingNewRandom,
    evaluations: massConsensus.data.evaluations,
    hasPrefetchedBatches:
      massConsensus.prefetch.randomStatements?.batches.length > 0,
    totalBatchesViewed: massConsensus.ui.totalBatchesViewed,
  })
);

// Selector for viewed statement IDs
export const selectViewedStatementIds = (state: RootState) =>
  state.massConsensus.data.viewedStatementIds;

// Selector for evaluation progress
export const selectEvaluationProgress = createSelector(
  [
    (state: RootState) => state.massConsensus.data.randomStatements,
    (state: RootState) => state.massConsensus.data.evaluations,
  ],
  (statements, evaluations) => {
    const total = statements.length;
    const evaluated = statements.filter(s => evaluations[s.statementId]).length;
    return {
      evaluated,
      total,
      percentage: (evaluated / total) * 100,
      remaining: total - evaluated,
    };
  }
);
```

## Part 5: Prefetch Strategy

### When to Prefetch

1. **Random Suggestions Prefetch**:
   - When user starts typing in question field (after 500ms)
   - When user views similar suggestions
   - Prefetch 3 batches initially

2. **Top Suggestions Prefetch**:
   - When user lands on random suggestions
   - When user evaluates 3+ random suggestions
   - When user requests new random batch

### Prefetch Implementation

```typescript
// Middleware to handle smart prefetching
const massConsensusPrefetchMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState() as RootState;

  // Trigger prefetches based on actions
  switch (action.type) {
    case 'massConsensus/setUserAnswer':
      // User is typing, start prefetching random
      if (action.payload.length > 10) {
        store.dispatch(prefetchRandomBatches(3));
      }
      break;

    case 'massConsensus/setEvaluation':
      // User is evaluating, check if should prefetch top
      const evaluatedCount = Object.keys(
        state.massConsensus.data.evaluations
      ).length;

      if (evaluatedCount === 3) {
        // User is engaged, prefetch top suggestions
        store.dispatch(prefetchTopStatements());
      }

      if (evaluatedCount % 6 === 0) {
        // Every 6 evaluations, prefetch more random batches
        store.dispatch(prefetchRandomBatches(2));
      }
      break;

    case 'massConsensus/loadNextRandomBatch':
      // Loading new batch, ensure we have more prefetched
      const prefetchedCount =
        state.massConsensus.prefetch.randomStatements?.batches.length || 0;

      if (prefetchedCount < 2) {
        store.dispatch(prefetchRandomBatches(3));
      }
      break;
  }

  return result;
};
```

## Part 6: Backend Optimization

### Enhanced Random Statements Endpoint

```typescript
// functions/src/controllers/statementController.ts
async getRandomStatements(req: Request, res: Response): Promise<void> {
  const { parentId, limit = 6, excludeIds = '' } = req.query;

  // Parse excluded IDs
  const excludedStatementIds = excludeIds
    ? excludeIds.split(',').filter(Boolean)
    : [];

  // Generate cache key including exclusions
  const cacheKey = cache.generateKey(
    'random',
    parentId,
    limit,
    excludedStatementIds.length.toString()
  );

  // Try cache first (only if no exclusions for simplicity)
  if (excludedStatementIds.length === 0) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
  }

  // Fetch statements excluding already viewed ones
  const statements = await this.statementService.getRandomStatements({
    parentId,
    limit: Number(limit),
    excludeIds: excludedStatementIds,
  });

  // Cache if no exclusions (common case for first load)
  if (excludedStatementIds.length === 0) {
    await cache.set(cacheKey, { statements }, 2); // 2 min TTL
  }

  res.json({ statements });
}
```

### Service Method Update

```typescript
// functions/src/services/statements/statementService.ts
async getRandomStatements({
  parentId,
  limit = 6,
  excludeIds = []
}: GetRandomStatementsParams): Promise<Statement[]> {
  let query = this.db
    .collection('statements')
    .where('parentId', '==', parentId)
    .where('consensus', '<=', 70);

  // Exclude already viewed statements
  if (excludeIds.length > 0) {
    // Firestore limits 'not-in' to 10 items
    const chunks = this.chunkArray(excludeIds, 10);

    // For multiple chunks, we need to fetch more and filter client-side
    if (chunks.length === 1) {
      query = query.where(FieldPath.documentId(), 'not-in', chunks[0]);
    }
  }

  // Fetch more than needed to account for exclusions
  const snapshot = await query.limit(limit * 2).get();

  let statements = snapshot.docs.map(doc => ({
    ...doc.data(),
    statementId: doc.id,
  } as Statement));

  // Client-side filtering for multiple exclusion chunks
  if (excludeIds.length > 10) {
    statements = statements.filter(
      s => !excludeIds.includes(s.statementId)
    );
  }

  // Random selection from filtered results
  const shuffled = this.shuffleArray(statements);
  return shuffled.slice(0, limit);
}
```

## Implementation Timeline

### Week 1: Core Redux Setup
- [x] Enhanced massConsensusSlice with batch support
- [x] Implement fetchNewRandomBatch thunk
- [x] Add prefetchRandomBatches functionality
- [x] Create selectors for new state

### Week 2: UI Implementation
- [ ] Update RandomSuggestions component
- [ ] Add "Get New Suggestions" button with proper states
- [ ] Implement batch indicator UI
- [ ] Add loading states for new suggestions

### Week 3: Prefetch Integration
- [ ] Implement prefetch middleware
- [ ] Add prefetch triggers in Question component
- [ ] Setup background prefetching for smooth UX
- [ ] Test cache invalidation

### Week 4: Backend & Testing
- [ ] Update getRandomStatements endpoint
- [ ] Add exclude logic to service
- [ ] Implement caching strategy
- [ ] End-to-end testing
- [ ] Performance monitoring

## Success Metrics

1. **Performance**
   - New batch load time: < 100ms (with prefetch)
   - Fallback load time: < 1 second (without prefetch)
   - Zero duplicate statements shown

2. **User Engagement**
   - 30% of users request new suggestions
   - Average 2.5 batches viewed per session
   - Evaluation completion rate increases by 20%

3. **Technical**
   - Redux state size < 100KB
   - Memory usage stable across multiple batches
   - Cache hit rate > 80%

## Key Features Summary

### ✅ Get New Suggestions
- Users can request fresh random statements after evaluating current batch
- Prevents duplicate statements across batches
- Smooth loading with prefetched data

### ✅ Smart Prefetching
- Anticipates user actions and loads data in advance
- Multiple batches prefetched for instant loading
- Background updates don't block UI

### ✅ Simplified Architecture
- Single Redux slice manages entire flow
- Components reduced to simple presentational layers
- Centralized data fetching and caching

### ✅ Enhanced UX
- No loading spinners in happy path
- Instant batch switching
- Clear feedback on evaluation progress

## Conclusion

This plan delivers:
1. **Simplified architecture** using Redux as the single source of truth
2. **"Get New Suggestions"** feature with duplicate prevention
3. **Intelligent prefetching** for instant page loads
4. **Better user engagement** through seamless experience

The implementation is incremental, testable, and maintains backward compatibility while dramatically improving both code quality and user experience.