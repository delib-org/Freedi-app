# findSimilarStatements Function Optimization Plan

## Executive Summary
This document outlines a comprehensive optimization strategy for the `findSimilarStatements` Firebase Function to improve performance through enhanced parallelization and strategic caching.

## Current Performance Bottlenecks

### Sequential Operations Analysis
1. **Content moderation check** - ~200-400ms (AI call)
2. **Parent statement fetch** - ~50-100ms (Firestore read)
3. **Sub-statements fetch** - ~100-200ms (Firestore query)
4. **AI similarity check** - ~300-600ms (AI call)
5. **Total current time**: ~650-1300ms (sequential)

### Current Implementation Issues
- Partial parallelization only (content check + data fetch)
- Sequential database operations within data fetch
- No caching mechanism
- AI similarity check waits for all validations

## Optimization Strategy

### Phase 1: Enhanced Parallelization (40-50% improvement)

#### 1.1 Parallel Database Operations
```typescript
// BEFORE: Sequential
const parentStatement = await getParentStatement(statementId);
const subStatements = await getSubStatements(statementId);

// AFTER: Parallel
const [parentStatement, subStatements] = await Promise.all([
  getParentStatement(statementId),
  getSubStatements(statementId)
]);
```

#### 1.2 Early AI Processing
```typescript
// Start AI similarity check as soon as sub-statements are available
const [contentCheck, dataProcessing] = await Promise.all([
  checkForInappropriateContent(userInput),
  processDataWithEarlyAI(statementId, userInput, creatorId)
]);
```

#### 1.3 Optimized Data Flow
```typescript
async function processDataWithEarlyAI(...) {
  // Fetch all data in parallel
  const [parentStatement, subStatements] = await Promise.all([
    getParentStatement(statementId),
    getSubStatements(statementId)
  ]);

  // Start AI processing immediately while doing validation
  const [aiResults, validationResult] = await Promise.all([
    findSimilarStatementsAI(
      convertToSimpleStatements(subStatements),
      userInput,
      parentStatement.statement
    ),
    validateUserLimits(subStatements, creatorId, parentStatement)
  ]);

  // Combine results
  return { aiResults, validationResult, subStatements };
}
```

### Phase 2: Firestore-Based Caching (30-40% improvement)

#### 2.1 Cache Service Implementation
```typescript
// services/cache-service.ts
interface CacheEntry {
  value: any;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
}

class FirestoreCacheService {
  private collection = db.collection('_cache');

  async get<T>(key: string): Promise<T | null> {
    try {
      const doc = await this.collection.doc(key).get();

      if (!doc.exists) return null;

      const data = doc.data() as CacheEntry;

      // Check expiration
      if (data.expiresAt < Date.now()) {
        // Async cleanup, don't wait
        this.collection.doc(key).delete().catch(() => {});
        return null;
      }

      // Update hit count asynchronously
      this.collection.doc(key).update({
        hitCount: (data.hitCount || 0) + 1,
        lastAccessed: Date.now()
      }).catch(() => {});

      return data.value as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null; // Fail gracefully
    }
  }

  async set(key: string, value: any, ttlMinutes: number = 5): Promise<void> {
    try {
      await this.collection.doc(key).set({
        value,
        expiresAt: Date.now() + (ttlMinutes * 60 * 1000),
        createdAt: Date.now(),
        hitCount: 0
      });
    } catch (error) {
      console.error('Cache set error:', error);
      // Fail silently - caching is not critical
    }
  }

  // Generate cache key
  generateKey(...parts: string[]): string {
    const hash = parts.join('_');
    // Use first 16 chars of base64 hash for shorter keys
    return Buffer.from(hash).toString('base64').substring(0, 16);
  }
}

export const cache = new FirestoreCacheService();
```

#### 2.2 Cached Statement Service
```typescript
// services/cached-statement-service.ts
export async function getCachedParentStatement(statementId: string): Promise<Statement | null> {
  const cacheKey = `parent_${statementId}`;

  // Try cache first
  const cached = await cache.get<Statement>(cacheKey);
  if (cached) return cached;

  // Fetch from database
  const statement = await getParentStatement(statementId);

  if (statement) {
    // Cache for 10 minutes (parent statements rarely change)
    await cache.set(cacheKey, statement, 10);
  }

  return statement;
}

export async function getCachedSubStatements(parentId: string): Promise<Statement[]> {
  const cacheKey = `subs_${parentId}`;

  // Try cache first
  const cached = await cache.get<Statement[]>(cacheKey);
  if (cached) return cached;

  // Fetch from database
  const statements = await getSubStatements(parentId);

  if (statements) {
    // Cache for 2 minutes (sub-statements change more frequently)
    await cache.set(cacheKey, statements, 2);
  }

  return statements;
}
```

### Phase 3: AI Response Caching (20-30% improvement)

#### 3.1 Cache Similar Statements Results
```typescript
export async function getCachedSimilarStatements(
  statements: string[],
  userInput: string,
  question: string
): Promise<string[] | null> {
  // Create deterministic cache key
  const cacheKey = cache.generateKey(
    'similar',
    question.substring(0, 20),
    userInput.substring(0, 50),
    statements.length.toString()
  );

  // Try cache first
  const cached = await cache.get<string[]>(cacheKey);
  if (cached) return cached;

  // Call AI
  const results = await findSimilarStatementsAI(statements, userInput, question);

  // Cache for 15 minutes (AI results are expensive)
  if (results && results.length > 0) {
    await cache.set(cacheKey, results, 15);
  }

  return results;
}
```

### Phase 4: Complete Optimized Implementation

#### 4.1 Main Function Refactor
```typescript
export async function findSimilarStatements(
  request: Request,
  response: Response
) {
  try {
    const { statementId, userInput, creatorId } = request.body;

    // Step 1: Check inappropriate content (NEVER CACHE THIS!)
    const contentCheck = await checkForInappropriateContent(userInput);

    if (contentCheck.isInappropriate) {
      return response.status(400).send({
        ok: false,
        error: "Input contains inappropriate content"
      });
    }

    // Step 2: Try to get complete cached response (if available)
    const fullCacheKey = cache.generateKey('full', statementId, userInput, creatorId);
    const cachedResponse = await cache.get(fullCacheKey);

    if (cachedResponse) {
      return response.status(200).send(cachedResponse);
    }

    // Step 3: Parallel fetch and process
    const [parentStatement, subStatements] = await Promise.all([
      getCachedParentStatement(statementId),
      getCachedSubStatements(statementId)
    ]);

    if (!parentStatement) {
      return response.status(404).send({
        ok: false,
        error: "Parent statement not found"
      });
    }

    // Step 4: Parallel validation and AI processing
    const [validationResult, aiSimilarStatements] = await Promise.all([
      validateUserLimits(subStatements, creatorId, parentStatement),
      getCachedSimilarStatements(
        convertToSimpleStatements(subStatements).map(s => s.statement),
        userInput,
        parentStatement.statement
      )
    ]);

    if (validationResult.exceeded) {
      return response.status(403).send({
        ok: false,
        error: "You have reached the maximum number of suggestions allowed."
      });
    }

    // Step 5: Process results
    const similarStatements = getStatementsFromTexts(
      convertToSimpleStatements(subStatements),
      aiSimilarStatements,
      subStatements
    );

    const { statements: cleanedStatements, duplicateStatement } =
      removeDuplicateStatement(similarStatements, userInput);

    const result = {
      similarStatements: cleanedStatements,
      ok: true,
      userText: duplicateStatement?.statement || userInput
    };

    // Step 6: Cache the complete response
    await cache.set(fullCacheKey, result, 5);

    return response.status(200).send(result);

  } catch (error) {
    console.error("Error in findSimilarStatements:", error);
    return response.status(500).send({
      ok: false,
      error: "Internal server error"
    });
  }
}
```

## Implementation Timeline

### Week 1: Parallelization
- [ ] Day 1-2: Refactor database operations for parallel execution
- [ ] Day 3-4: Implement early AI processing
- [ ] Day 5: Test and validate improvements

### Week 2: Caching Infrastructure
- [ ] Day 1-2: Implement Firestore cache service
- [ ] Day 3-4: Add caching to statement services
- [ ] Day 5: Implement cache cleanup and monitoring

### Week 3: AI Caching & Testing
- [ ] Day 1-2: Implement AI response caching
- [ ] Day 3-4: Integration testing
- [ ] Day 5: Performance benchmarking

## Performance Metrics

### Expected Improvements
| Operation | Current | Optimized | Improvement |
|-----------|---------|-----------|-------------|
| Cold Start | 1300ms | 800ms | 38% faster |
| Warm (no cache) | 900ms | 500ms | 44% faster |
| Warm (with cache) | 900ms | 200ms | 78% faster |
| Cache Hit Rate | 0% | 40-60% | - |

### Monitoring Plan
1. Add performance logging for each operation
2. Track cache hit/miss rates
3. Monitor Firestore cache collection size
4. Set up alerts for performance degradation

## Risk Mitigation

### Potential Issues & Solutions

1. **Cache Invalidation**
   - Solution: Short TTLs (2-15 minutes)
   - Manual cache clear endpoint for admins

2. **Firestore Costs**
   - Solution: Monitor cache collection size
   - Implement LRU eviction if needed
   - Set maximum cache entries limit

3. **Memory Pressure**
   - Solution: Limit in-memory cache size
   - Use streaming for large datasets

4. **Race Conditions**
   - Solution: Use transactional updates where needed
   - Implement optimistic locking

## Testing Strategy

### Unit Tests
```typescript
describe('findSimilarStatements optimization', () => {
  it('should return cached results when available', async () => {
    // Mock cache hit
    jest.spyOn(cache, 'get').mockResolvedValue(mockCachedData);

    const result = await findSimilarStatements(mockRequest, mockResponse);

    expect(cache.get).toHaveBeenCalled();
    expect(result).toEqual(mockCachedData);
  });

  it('should handle parallel operations correctly', async () => {
    const startTime = Date.now();

    await Promise.all([
      getParentStatement('id1'),
      getSubStatements('id1')
    ]);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(200); // Should be parallel, not sequential
  });
});
```

### Integration Tests
- Test with real Firestore
- Verify cache expiration
- Test error handling
- Load testing with concurrent requests

## Rollback Plan

If issues arise:
1. **Phase 1**: Feature flag to disable caching
2. **Phase 2**: Revert to previous version via Cloud Functions
3. **Phase 3**: Clear cache collection if corrupted

## Success Criteria

- [ ] 40% reduction in p95 response time
- [ ] 50% reduction in AI API calls (via caching)
- [ ] No increase in error rate
- [ ] Positive user feedback on performance

## Next Steps

1. Review and approve this plan
2. Set up performance monitoring baseline
3. Begin Phase 1 implementation
4. Weekly performance reviews during implementation

---

**Document Version**: 1.0
**Created**: 2025-01-15
**Author**: Claude Code Assistant
**Status**: Ready for Review