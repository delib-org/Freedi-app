# Semantic Search Implementation Plan for Mass Consensus

## Overview
Replace slow AI API calls with fast semantic search using embeddings to find similar suggestions in mass consensus feature.

**Current Performance:** 2-5 seconds per request
**Target Performance:** 50-200ms per request
**Improvement:** 10-25x faster

## Problem Analysis

### Current Flow (Slow)
1. User submits suggestion
2. All existing suggestions sent to AI API (JSON stringified)
3. AI processes and returns similar ones (2-5 seconds)
4. Results displayed to user

### Issues
- Every unique suggestion triggers new AI call
- Large prompts with ALL suggestions
- No caching (each user input is unique)
- Sequential processing
- High API costs

## Proposed Solution: Context-Aware Semantic Search

### New Flow (Fast)
1. User submits suggestion
2. Generate embedding for suggestion + question context (50ms)
3. Compare with pre-computed embeddings (100ms)
4. Return similar suggestions instantly
5. Fall back to AI only if needed

## Implementation Phases

### Phase 1: Infrastructure Setup (Day 1-2)

#### 1.1 Install Dependencies
```bash
cd functions
npm install @tensorflow-models/universal-sentence-encoder
npm install @tensorflow/tfjs-node
```

#### 1.2 Create Database Schema
```typescript
// Firestore Collections Structure
embeddings/
  {statementId}_embeddings/
    {suggestionId}/
      - text: string
      - embedding: number[] (512 dimensions)
      - questionContext: string
      - language: string
      - createdAt: timestamp
      - updatedAt: timestamp
      - version: string (model version)
```

#### 1.3 Create Core Services
- `services/embedding-service.ts` - Generate embeddings
- `services/similarity-service.ts` - Calculate similarities
- `services/embedding-cache.ts` - Cache management

### Phase 2: Embedding Service Implementation (Day 2-3)

#### 2.1 Core Embedding Service
```typescript
// functions/src/services/embedding-service.ts

import * as use from '@tensorflow-models/universal-sentence-encoder';
import { logger } from 'firebase-functions';

class EmbeddingService {
  private model: any = null;
  private modelVersion = 'use-multilingual-v3';

  async initialize() {
    if (!this.model) {
      logger.info('Loading Universal Sentence Encoder model...');
      this.model = await use.load();
      logger.info('Model loaded successfully');
    }
    return this.model;
  }

  async generateEmbedding(
    text: string,
    context?: string
  ): Promise<number[]> {
    const model = await this.initialize();

    // Combine text with context for context-aware embedding
    const input = context
      ? `Context: ${context}\nText: ${text}`
      : text;

    const embeddings = await model.embed([input]);
    const embeddingArray = await embeddings.array();
    embeddings.dispose(); // Free memory

    return embeddingArray[0];
  }

  async generateBatchEmbeddings(
    texts: string[],
    context?: string
  ): Promise<number[][]> {
    const model = await this.initialize();

    const inputs = texts.map(text =>
      context ? `Context: ${context}\nText: ${text}` : text
    );

    const embeddings = await model.embed(inputs);
    const embeddingArrays = await embeddings.array();
    embeddings.dispose();

    return embeddingArrays;
  }
}

export const embeddingService = new EmbeddingService();
```

#### 2.2 Similarity Calculation Service
```typescript
// functions/src/services/similarity-service.ts

export class SimilarityService {
  // Cosine similarity between two vectors
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  // Find top N similar embeddings
  findTopSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: Array<{id: string, embedding: number[], text: string}>,
    topN: number = 6,
    threshold: number = 0.6
  ) {
    const similarities = candidateEmbeddings.map(candidate => ({
      ...candidate,
      similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding)
    }));

    return similarities
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  }
}

export const similarityService = new SimilarityService();
```

### Phase 3: Migration & Integration (Day 3-4)

#### 3.1 Migration Script for Existing Suggestions
```typescript
// functions/src/scripts/migrate-embeddings.ts

export async function migrateExistingSuggestions() {
  const batch = db.batch();
  const batchSize = 50;
  let processedCount = 0;

  // Get all statements with suggestions
  const statements = await db
    .collection('statements')
    .where('statementType', '==', 'question')
    .get();

  for (const statementDoc of statements.docs) {
    const statement = statementDoc.data();
    const suggestions = await db
      .collection('statements')
      .where('parentId', '==', statementDoc.id)
      .where('statementType', '==', 'option')
      .get();

    // Process in batches
    const suggestionTexts = suggestions.docs.map(d => d.data().statement);
    const embeddings = await embeddingService.generateBatchEmbeddings(
      suggestionTexts,
      statement.statement // Question as context
    );

    // Store embeddings
    suggestions.docs.forEach((doc, index) => {
      const embeddingRef = db
        .collection('embeddings')
        .doc(`${statementDoc.id}_embeddings`)
        .collection('suggestions')
        .doc(doc.id);

      batch.set(embeddingRef, {
        text: doc.data().statement,
        embedding: embeddings[index],
        questionContext: statement.statement,
        language: doc.data().language || 'auto',
        createdAt: FieldValue.serverTimestamp(),
        version: 'use-multilingual-v3'
      });

      processedCount++;

      if (processedCount % batchSize === 0) {
        await batch.commit();
        logger.info(`Processed ${processedCount} suggestions`);
      }
    });
  }

  await batch.commit();
  logger.info(`Migration complete: ${processedCount} embeddings created`);
}
```

#### 3.2 Update findSimilarStatements Function
```typescript
// functions/src/fn_findSimilarStatements.ts

import { embeddingService } from './services/embedding-service';
import { similarityService } from './services/similarity-service';
import { embedingCache } from './services/embedding-cache';

export async function findSimilarStatements(
  request: Request,
  response: Response
) {
  try {
    const { statementId, userInput, creatorId } = request.body;

    // 1. Check content appropriateness (existing)
    const contentCheck = await checkForInappropriateContent(userInput);
    if (contentCheck.isInappropriate) {
      response.status(400).send({
        ok: false,
        error: "Input contains inappropriate content"
      });
      return;
    }

    // 2. Get parent statement
    const parentStatement = await getParentStatement(statementId);
    if (!parentStatement) {
      response.status(404).send({
        ok: false,
        error: "Parent statement not found"
      });
      return;
    }

    // 3. Try semantic search first
    try {
      const results = await semanticSearch(
        userInput,
        parentStatement.statement,
        statementId
      );

      if (results.length >= 3) {
        // Found enough similar suggestions
        response.status(200).send({
          similarStatements: results,
          ok: true,
          userText: userInput,
          method: 'semantic' // For analytics
        });
        return;
      }
    } catch (error) {
      logger.warn('Semantic search failed, falling back to AI', error);
    }

    // 4. Fallback to AI if semantic search fails or returns too few
    const aiResults = await findSimilarStatementsAI(
      allStatements,
      userInput,
      parentStatement.statement,
      6
    );

    // 5. Store new embedding for future searches
    await storeEmbedding(userInput, parentStatement.statement, statementId);

    response.status(200).send({
      similarStatements: aiResults,
      ok: true,
      userText: userInput,
      method: 'ai' // For analytics
    });

  } catch (error) {
    logger.error('Error in findSimilarStatements', error);
    response.status(500).send({ error: error, ok: false });
  }
}

async function semanticSearch(
  userInput: string,
  questionContext: string,
  statementId: string
): Promise<any[]> {
  // 1. Generate embedding for user input with context
  const userEmbedding = await embeddingService.generateEmbedding(
    userInput,
    questionContext
  );

  // 2. Get cached embeddings for this statement
  const cachedEmbeddings = await embedingCache.getEmbeddings(statementId);

  if (!cachedEmbeddings || cachedEmbeddings.length === 0) {
    // No embeddings available, need to generate them
    throw new Error('No embeddings available for semantic search');
  }

  // 3. Find similar suggestions
  const similar = similarityService.findTopSimilar(
    userEmbedding,
    cachedEmbeddings,
    6,
    0.65 // Similarity threshold
  );

  // 4. Fetch full statement data for similar suggestions
  const statements = await Promise.all(
    similar.map(async (item) => {
      const doc = await db
        .collection('statements')
        .doc(item.id)
        .get();
      return doc.data();
    })
  );

  return statements.filter(s => s !== undefined);
}
```

### Phase 4: Caching Layer (Day 4-5)

#### 4.1 Embedding Cache Service
```typescript
// functions/src/services/embedding-cache.ts

export class EmbeddingCache {
  private memoryCache: Map<string, any> = new Map();
  private cacheTimeout = 15 * 60 * 1000; // 15 minutes

  async getEmbeddings(statementId: string) {
    // Check memory cache first
    const cacheKey = `embeddings_${statementId}`;
    if (this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    // Fetch from Firestore
    const embeddings = await db
      .collection('embeddings')
      .doc(`${statementId}_embeddings`)
      .collection('suggestions')
      .get();

    const data = embeddings.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Cache in memory
    this.memoryCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    // Implement LRU eviction if cache gets too large
    if (this.memoryCache.size > 100) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    return data;
  }

  invalidate(statementId: string) {
    const cacheKey = `embeddings_${statementId}`;
    this.memoryCache.delete(cacheKey);
  }
}

export const embedingCache = new EmbeddingCache();
```

### Phase 5: Real-time Updates (Day 5)

#### 5.1 Auto-generate Embeddings for New Suggestions
```typescript
// functions/src/triggers/onSuggestionCreate.ts

export const onSuggestionCreate = functions
  .firestore
  .document('statements/{statementId}')
  .onCreate(async (snapshot, context) => {
    const statement = snapshot.data() as Statement;

    // Only process options (suggestions)
    if (statement.statementType !== StatementType.option) {
      return;
    }

    try {
      // Get parent statement for context
      const parentDoc = await db
        .collection('statements')
        .doc(statement.parentId)
        .get();

      const parentStatement = parentDoc.data();
      if (!parentStatement) return;

      // Generate embedding with context
      const embedding = await embeddingService.generateEmbedding(
        statement.statement,
        parentStatement.statement
      );

      // Store embedding
      await db
        .collection('embeddings')
        .doc(`${statement.parentId}_embeddings`)
        .collection('suggestions')
        .doc(snapshot.id)
        .set({
          text: statement.statement,
          embedding,
          questionContext: parentStatement.statement,
          language: statement.language || 'auto',
          createdAt: FieldValue.serverTimestamp(),
          version: 'use-multilingual-v3'
        });

      // Invalidate cache
      embedingCache.invalidate(statement.parentId);

      logger.info('Embedding created for new suggestion', {
        suggestionId: snapshot.id,
        parentId: statement.parentId
      });
    } catch (error) {
      logger.error('Failed to create embedding', error);
    }
  });
```

### Phase 6: Optimization & Monitoring (Day 6)

#### 6.1 Performance Monitoring
```typescript
// Add performance tracking
export async function trackSearchPerformance(
  method: 'semantic' | 'ai',
  duration: number,
  resultCount: number
) {
  await db.collection('analytics').add({
    type: 'search_performance',
    method,
    duration,
    resultCount,
    timestamp: FieldValue.serverTimestamp()
  });
}
```

#### 6.2 A/B Testing Setup
```typescript
// Gradual rollout to test performance
export function shouldUseSemanticSearch(userId: string): boolean {
  // Start with 10% of users
  const hash = userId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  return Math.abs(hash) % 100 < 10; // 10% rollout
}
```

## Performance Expectations

### Before (Current)
- Response time: 2-5 seconds
- API calls: 1 per request
- Cost: ~$0.001 per request
- Scalability: Limited by API rate limits

### After (Semantic Search)
- Response time: 50-200ms
- API calls: Only for fallback (~10%)
- Cost: ~$0.0001 per request (90% reduction)
- Scalability: Handles 100x more requests

## Fallback Strategy

1. **Primary:** Semantic search (50-200ms)
2. **Fallback 1:** If < 3 results, use AI API
3. **Fallback 2:** If embedding service fails, use AI API
4. **Fallback 3:** If both fail, return cached popular suggestions

## Testing Plan

### Unit Tests
- Embedding generation
- Similarity calculation
- Cache operations
- Fallback handling

### Integration Tests
- End-to-end flow
- Multiple languages
- Edge cases (empty results, special characters)

### Load Testing
- 100 concurrent requests
- 1000 requests per minute
- Cache performance under load

## Rollback Plan

Feature flag to instantly revert to AI-only:
```typescript
const USE_SEMANTIC_SEARCH = process.env.USE_SEMANTIC_SEARCH === 'true';

if (USE_SEMANTIC_SEARCH) {
  // New semantic search
} else {
  // Original AI approach
}
```

## Success Metrics

1. **Performance**
   - P50 response time < 100ms
   - P95 response time < 500ms
   - P99 response time < 1 second

2. **Quality**
   - User satisfaction score maintained or improved
   - Relevant suggestions > 80% accuracy

3. **Cost**
   - 80% reduction in AI API costs
   - 90% reduction in API calls

4. **Reliability**
   - 99.9% uptime
   - Successful fallback rate > 95%

## Timeline

- **Week 1:** Infrastructure & core implementation
- **Week 2:** Migration & testing
- **Week 3:** Gradual rollout & monitoring
- **Week 4:** Full deployment & optimization

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model too large for Functions | High | Use quantized model or external service |
| Cold start latency | Medium | Keep functions warm, cache model in memory |
| Embedding quality issues | Medium | A/B test, maintain AI fallback |
| Storage costs increase | Low | Compress embeddings, clean old data |

## Next Steps

1. Review and approve plan
2. Set up development environment
3. Implement Phase 1 (Infrastructure)
4. Deploy to staging for testing
5. Gradual production rollout

## Additional Optimizations (Future)

1. **Fine-tune embeddings** on your specific data
2. **Implement re-ranking** with lightweight model
3. **Add user feedback loop** to improve suggestions
4. **Cluster similar embeddings** for faster search
5. **Use vector database** (Pinecone, Weaviate) for scale

## Code Repository Structure

```
functions/
  src/
    services/
      embedding-service.ts
      similarity-service.ts
      embedding-cache.ts
      batch-processor.ts
    triggers/
      onSuggestionCreate.ts
      onSuggestionDelete.ts
    scripts/
      migrate-embeddings.ts
      test-embeddings.ts
    tests/
      embedding.test.ts
      similarity.test.ts
```

## Conclusion

This implementation will reduce response time by 10-25x while maintaining or improving suggestion quality. The context-aware embeddings ensure suggestions are relevant to the specific question being asked, and the multilingual support handles Hebrew, English, Arabic, and other languages seamlessly.

The phased approach allows for safe deployment with fallbacks at every step, ensuring zero downtime and maintaining service quality throughout the migration.