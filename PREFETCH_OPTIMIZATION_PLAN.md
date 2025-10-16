# Prefetch Optimization Plan for Mass Consensus Flow

## Executive Summary
This document outlines a comprehensive plan to implement prefetching for random and top suggestions in the Mass Consensus flow, eliminating loading delays and significantly improving user experience.

## Current Problem Analysis

### Pain Points
1. **Random Suggestions Loading**: ~1-2 second delay when transitioning from question stage to random suggestions
2. **Top Suggestions Loading**: Similar delay when moving from random suggestions to top suggestions
3. **User Experience Impact**: Loading spinners interrupt the flow and create a perception of slowness
4. **Wasted Time**: Users wait idle while data loads that could have been fetched in advance

### Current Flow
```
Introduction → Question (user types) → [LOADING] → Random Suggestions → [LOADING] → Top Suggestions → Voting
```

### Proposed Flow
```
Introduction → Question (prefetch random) → Random Suggestions (prefetch top) → Top Suggestions → Voting
                      ↓                              ↓
              [Background fetch]            [Background fetch]
```

## Technical Architecture

### 1. Redux State Enhancement

#### New State Structure
```typescript
// src/redux/statements/statementsSlice.ts
interface PrefetchedData {
  randomStatements: {
    statements: Statement[];
    parentId: string;
    timestamp: number;
    isLoading: boolean;
    error: string | null;
  };
  topStatements: {
    statements: Statement[];
    parentId: string;
    timestamp: number;
    isLoading: boolean;
    error: string | null;
  };
}
```

#### New Actions
- `setPrefetchedRandomStatements`
- `clearPrefetchedRandomStatements`
- `setPrefetchedTopStatements`
- `clearPrefetchedTopStatements`
- `setPrefetchLoading`
- `setPrefetchError`

### 2. Prefetch Service

#### File: `src/services/prefetchService.ts`
```typescript
class PrefetchService {
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static async prefetchRandomStatements(parentId: string): Promise<void>
  static async prefetchTopStatements(parentId: string): Promise<void>
  static isDataFresh(timestamp: number): boolean
  static getCachedData(type: 'random' | 'top', parentId: string): Statement[] | null
}
```

### 3. Custom Hooks

#### File: `src/hooks/usePrefetchRandomSuggestions.ts`
```typescript
export function usePrefetchRandomSuggestions(parentId: string) {
  // Triggers prefetch when called
  // Manages Redux state updates
  // Handles error states
  // Returns loading/error status
}
```

#### File: `src/hooks/usePrefetchTopSuggestions.ts`
```typescript
export function usePrefetchTopSuggestions(parentId: string) {
  // Similar structure to random suggestions
  // Fetches top 6 statements
  // Updates Redux prefetch state
}
```

## Implementation Details

### Phase 1: Random Suggestions Prefetch

#### 1.1 Trigger Points
- **Primary**: When user starts typing in the question field (after 500ms debounce)
- **Secondary**: When similar suggestions are displayed
- **Fallback**: On question stage mount (if not already typing)

#### 1.2 Integration in MassConsesusQuestion.tsx
```typescript
// Add to component
const { prefetchRandomSuggestions } = usePrefetchRandomSuggestions(statementId);

// In InitialQuestion component
useEffect(() => {
  if (userInput.length > 10) { // User is engaged
    prefetchRandomSuggestions();
  }
}, [userInput]);
```

#### 1.3 Consumption in RandomSuggestionsVM.tsx
```typescript
const fetchRandomStatements = async () => {
  // Check prefetched data first
  const cached = PrefetchService.getCachedData('random', statementId);
  if (cached && PrefetchService.isDataFresh(cachedTimestamp)) {
    setSubStatements(cached);
    dispatch(setMassConsensusStatements({
      statements: cached,
      selectionFunction: SelectionFunction.random,
    }));
    setLoadingStatements(false);
    dispatch(clearPrefetchedRandomStatements()); // Clean up
    return;
  }

  // Fallback to regular fetch
  // ... existing code
};
```

### Phase 2: Top Suggestions Prefetch

#### 2.1 Trigger Points
- **Primary**: When user lands on random suggestions page
- **Secondary**: After evaluating 3+ random suggestions
- **Tertiary**: When clicking "Get New Suggestions"

#### 2.2 Integration in RandomSuggestions.tsx
```typescript
// Add prefetch hook
const { prefetchTopSuggestions } = usePrefetchTopSuggestions(statementId);

// Trigger prefetch on mount
useEffect(() => {
  // Start prefetching top suggestions while user evaluates random ones
  const timer = setTimeout(() => {
    prefetchTopSuggestions();
  }, 1000); // Small delay to prioritize current page

  return () => clearTimeout(timer);
}, []);

// Also trigger when user is actively engaged
useEffect(() => {
  if (evaluationsCompleted >= 3 && !topPrefetched) {
    prefetchTopSuggestions();
  }
}, [evaluationsCompleted]);
```

#### 2.3 Consumption in TopSuggestionVM.tsx
```typescript
const fetchStatements = () => {
  // Check prefetched data
  const cached = PrefetchService.getCachedData('top', statementId);
  if (cached && PrefetchService.isDataFresh(cachedTimestamp)) {
    const sorted = cached.sort((a, b) =>
      (b.evaluation?.averageEvaluation ?? 0) - (a.evaluation?.averageEvaluation ?? 0)
    );
    dispatch(setStatements(sorted));
    setTopStatements(sorted);
    setLoadingStatements(false);
    dispatch(clearPrefetchedTopStatements());
    return;
  }

  // Fallback to regular fetch
  // ... existing code
};
```

### Phase 3: Backend Optimization (Optional)

#### 3.1 Cache Implementation
```typescript
// functions/src/controllers/statementController.ts
async getRandomStatements(req: Request, res: Response): Promise<void> {
  const { parentId, limit } = req.query;

  // Check cache first
  const cacheKey = cache.generateKey('random', parentId, limit);
  const cached = await cache.get(cacheKey);

  if (cached) {
    // Update view counts asynchronously
    this.statementService.updateStatementViewCounts(cached.statements);
    return res.json(cached);
  }

  // Fetch fresh data
  const statements = await this.statementService.getRandomStatements({
    parentId,
    limit,
  });

  // Cache for 2 minutes
  await cache.set(cacheKey, { statements }, 2);

  res.json({ statements });
}
```

## Performance Metrics

### Expected Improvements
- **Random Suggestions Load Time**: 1500ms → 50ms (96% improvement)
- **Top Suggestions Load Time**: 1200ms → 50ms (95% improvement)
- **Total Wait Time Eliminated**: ~2.7 seconds per user session
- **Perceived Performance**: Near-instant transitions

### Monitoring Points
1. Prefetch hit rate (target: >85%)
2. Cache freshness violations (target: <5%)
3. Failed prefetch recovery time
4. Memory usage increase (expected: <500KB per session)

## Risk Mitigation

### Potential Issues & Solutions

1. **Stale Data**
   - Solution: 5-minute cache TTL with timestamp validation
   - Fallback: Always verify parentId matches before using cached data

2. **Memory Overhead**
   - Solution: Clear prefetched data after consumption
   - Limit: Max 12 statements cached at once

3. **Race Conditions**
   - Solution: Use Redux loading flags to prevent duplicate fetches
   - Check: isLoading state before initiating prefetch

4. **Network Failures**
   - Solution: Graceful fallback to synchronous loading
   - Error state management in Redux

5. **User Navigation Changes**
   - Solution: Cancel pending prefetches on route change
   - Clear irrelevant cached data on navigation

## Implementation Timeline

### Week 1: Foundation
- [ ] Update Redux slice with prefetch state
- [ ] Create PrefetchService class
- [ ] Implement usePrefetchRandomSuggestions hook
- [ ] Add backend caching for random statements endpoint

### Week 2: Random Suggestions
- [ ] Integrate prefetch in MassConsesusQuestion
- [ ] Update RandomSuggestionsVM to use cached data
- [ ] Add telemetry for cache hit rates
- [ ] Testing and debugging

### Week 3: Top Suggestions
- [ ] Implement usePrefetchTopSuggestions hook
- [ ] Integrate prefetch in RandomSuggestions
- [ ] Update TopSuggestionVM to use cached data
- [ ] Add backend caching for top statements endpoint

### Week 4: Polish & Optimization
- [ ] Performance testing
- [ ] Memory usage optimization
- [ ] Error handling improvements
- [ ] Documentation and code cleanup

## Success Criteria

1. ✅ Loading spinners appear <10% of the time
2. ✅ Page transitions feel instant (< 100ms)
3. ✅ No increase in error rates
4. ✅ Memory usage increase < 1MB per session
5. ✅ Backend cache hit rate > 70%
6. ✅ User satisfaction metrics improve by 15%

## Testing Strategy

### Unit Tests
- PrefetchService methods
- Redux actions and reducers
- Custom hooks behavior
- Cache expiration logic

### Integration Tests
- Full flow from question → random → top
- Cache invalidation scenarios
- Error recovery paths
- Concurrent user scenarios

### Performance Tests
- Load time measurements
- Memory usage monitoring
- Network request optimization
- Cache effectiveness metrics

## Rollback Plan

If issues arise:
1. Feature flag to disable prefetching
2. Revert to synchronous loading
3. Clear all cached data
4. Monitor error rates for 24 hours
5. Gradual rollout strategy (10% → 50% → 100%)

## Future Enhancements

1. **Predictive Prefetching**: Use ML to predict user paths
2. **Progressive Loading**: Stream statements as they arrive
3. **Optimistic UI**: Show placeholders while loading
4. **Service Worker**: Offline-first architecture
5. **WebSocket Updates**: Real-time statement updates
6. **Batch Prefetching**: Fetch multiple stages at once

## Conclusion

This prefetching implementation will dramatically improve the perceived performance of the Mass Consensus flow. By fetching data during natural pause points (user typing, reading, evaluating), we eliminate visible loading states and create a seamless experience. The implementation is low-risk with built-in fallbacks and can be rolled out incrementally.

The 2.7 seconds of eliminated wait time per session, multiplied by thousands of users, represents a significant improvement in both user satisfaction and system efficiency.