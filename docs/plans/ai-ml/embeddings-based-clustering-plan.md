# Embeddings-Based Clustering Implementation Plan

**Date**: 2024-12-23
**Status**: Planning
**Architecture**: [EMBEDDINGS_CLUSTERING_ARCHITECTURE.md](../architectures/EMBEDDINGS_CLUSTERING_ARCHITECTURE.md)

## Overview

Implement a hybrid embeddings/LLM system for:
1. **Fast similarity detection** using Firestore Vector Search
2. **Scalable clustering** using embeddings + LLM for framing analysis

## Goals

| Goal | Metric | Target |
|------|--------|--------|
| Faster similarity search | P50 latency | <500ms (from 2-5s) |
| Cost reduction | Per-query cost | 90% reduction |
| Scale support | Max statements | 10,000+ (from ~200) |
| Maintain quality | Relevance accuracy | >85% |

## Decision Matrix

| Use Case | Approach | Rationale |
|----------|----------|-----------|
| Find similar (real-time) | **Embeddings** | Speed critical, user-facing |
| Cluster by topic | **Embeddings** | Scalable, same meaning = same group |
| Cluster by framing | **LLM (<100)** | Needs semantic understanding |
| Cluster by framing | **Hybrid (100+)** | Embeddings pre-group, LLM analyzes |
| Name clusters | **LLM** | Needs language generation |

---

## Phase 1: Embedding Infrastructure

**Duration**: 2-3 days
**Goal**: Set up embedding generation and storage

### 1.1 Install Dependencies

```bash
cd functions
npm install @google/generative-ai  # Already installed, verify version
```

### 1.2 Create Embedding Service

**File**: `functions/src/services/embedding-service.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logError } from '../utils/errorHandling';

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

class EmbeddingService {
  private genAI: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.genAI) {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not configured');
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI;
  }

  async generateEmbedding(
    text: string,
    context?: string
  ): Promise<EmbeddingResult> {
    try {
      const client = this.getClient();
      const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });

      // Combine text with context for context-aware embedding
      const input = context
        ? `Question: ${context}\nSuggestion: ${text}`
        : text;

      const result = await model.embedContent(input);
      const embedding = result.embedding.values;

      return {
        embedding,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS
      };
    } catch (error) {
      logError(error, {
        operation: 'embeddingService.generateEmbedding',
        metadata: { textLength: text.length, hasContext: !!context }
      });
      throw error;
    }
  }

  async generateBatchEmbeddings(
    texts: string[],
    context?: string
  ): Promise<EmbeddingResult[]> {
    // Process in parallel with rate limiting
    const results: EmbeddingResult[] = [];
    const batchSize = 10;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.generateEmbedding(text, context))
      );
      results.push(...batchResults);

      // Rate limit: wait 100ms between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}

export const embeddingService = new EmbeddingService();
```

### 1.3 Update Statement Types

**File**: `packages/shared-types/src/statement.ts` (or update in delib-npm)

```typescript
// Add to Statement interface
interface StatementEmbedding {
  embedding?: number[];           // 768-dim vector
  embeddingModel?: string;        // "text-embedding-004"
  embeddingContext?: string;      // Question context used
  embeddingCreatedAt?: number;    // Timestamp in ms
}
```

### 1.4 Create Firestore Vector Index

**File**: `firestore.indexes.json`

```json
{
  "fieldOverrides": [
    {
      "collectionGroup": "statements",
      "fieldPath": "embedding",
      "indexes": [
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

Deploy index:
```bash
firebase deploy --only firestore:indexes
```

### 1.5 Tasks Checklist - Phase 1

- [ ] Create `embedding-service.ts`
- [ ] Add embedding fields to Statement type
- [ ] Create Firestore vector index configuration
- [ ] Deploy vector index
- [ ] Write unit tests for embedding service
- [ ] Test embedding generation with sample statements

---

## Phase 2: Embedding Generation on Statement Create

**Duration**: 1-2 days
**Goal**: Automatically generate embeddings for new statements

### 2.1 Update onStatementCreated Trigger

**File**: `functions/src/fn_statementCreation.ts`

```typescript
import { embeddingService } from './services/embedding-service';
import { StatementType } from 'delib-npm';

// Add to the consolidated onCreate handler
async function generateEmbeddingForStatement(
  statement: Statement
): Promise<void> {
  // Only generate embeddings for options (suggestions)
  if (statement.statementType !== StatementType.option) {
    return;
  }

  try {
    // Get parent statement for context
    const parentDoc = await db
      .collection(Collections.statements)
      .doc(statement.parentId)
      .get();

    const parentStatement = parentDoc.data() as Statement | undefined;
    if (!parentStatement) {
      console.info('Parent statement not found, skipping embedding');
      return;
    }

    // Generate context-aware embedding
    const result = await embeddingService.generateEmbedding(
      statement.statement,
      parentStatement.statement
    );

    // Update statement with embedding
    await db
      .collection(Collections.statements)
      .doc(statement.statementId)
      .update({
        embedding: result.embedding,
        embeddingModel: result.model,
        embeddingContext: parentStatement.statement,
        embeddingCreatedAt: Date.now()
      });

    console.info('Embedding generated for statement', {
      statementId: statement.statementId,
      parentId: statement.parentId
    });
  } catch (error) {
    // Log but don't fail the trigger
    logError(error, {
      operation: 'generateEmbeddingForStatement',
      statementId: statement.statementId
    });
  }
}

// In onStatementCreated, add to parallel tasks:
tasks.push(generateEmbeddingForStatement(statement));
```

### 2.2 Tasks Checklist - Phase 2

- [ ] Update `fn_statementCreation.ts` with embedding generation
- [ ] Add error handling for embedding failures
- [ ] Test with new statement creation
- [ ] Verify embeddings are stored correctly
- [ ] Monitor embedding generation latency

---

## Phase 3: Vector-Based Similarity Search

**Duration**: 2-3 days
**Goal**: Replace LLM similarity search with vector search

### 3.1 Create Similarity Service

**File**: `functions/src/services/similarity-service.ts`

```typescript
import { db } from '../db';
import { embeddingService } from './embedding-service';
import { Collections, Statement } from 'delib-npm';
import { logError } from '../utils/errorHandling';

interface SimilarStatement {
  statement: Statement;
  similarity: number;
}

interface FindSimilarOptions {
  limit?: number;
  threshold?: number;
}

class SimilarityService {
  private readonly DEFAULT_LIMIT = 10;
  private readonly DEFAULT_THRESHOLD = 0.65;

  async findSimilarStatements(
    userInput: string,
    parentId: string,
    questionContext: string,
    options: FindSimilarOptions = {}
  ): Promise<SimilarStatement[]> {
    const { limit = this.DEFAULT_LIMIT, threshold = this.DEFAULT_THRESHOLD } = options;

    try {
      // Generate embedding for user input
      const { embedding: queryEmbedding } = await embeddingService.generateEmbedding(
        userInput,
        questionContext
      );

      // Perform vector search
      const vectorQuery = db
        .collection(Collections.statements)
        .where('parentId', '==', parentId)
        .where('hide', '!=', true)
        .findNearest({
          vectorField: 'embedding',
          queryVector: queryEmbedding,
          limit: limit * 2, // Fetch more to filter by threshold
          distanceMeasure: 'COSINE'
        });

      const snapshot = await vectorQuery.get();

      // Convert distance to similarity and filter by threshold
      const results: SimilarStatement[] = [];

      snapshot.forEach(doc => {
        const statement = doc.data() as Statement;
        // Firestore returns distance, convert to similarity
        // For cosine: similarity = 1 - distance
        const distance = doc.get('_distance') ?? 0;
        const similarity = 1 - distance;

        if (similarity >= threshold) {
          results.push({ statement, similarity });
        }
      });

      // Sort by similarity and limit
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    } catch (error) {
      logError(error, {
        operation: 'similarityService.findSimilarStatements',
        parentId,
        metadata: { inputLength: userInput.length }
      });
      throw error;
    }
  }

  // Fallback: Calculate cosine similarity manually (for testing/debugging)
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
}

export const similarityService = new SimilarityService();
```

### 3.2 Update findSimilarStatements Function

**File**: `functions/src/fn_findSimilarStatements.ts`

```typescript
import { similarityService } from './services/similarity-service';
import { findSimilarStatementsAI } from './services/ai-service'; // Existing

export async function findSimilarStatements(
  request: Request,
  response: Response
): Promise<void> {
  const startTime = Date.now();

  try {
    const { statementId, userInput, creatorId } = request.body;

    // 1. Content moderation (existing)
    const contentCheck = await checkForInappropriateContent(userInput);
    if (contentCheck.isInappropriate) {
      response.status(400).send({
        ok: false,
        error: 'Input contains inappropriate content'
      });
      return;
    }

    // 2. Get parent statement
    const parentStatement = await getParentStatement(statementId);
    if (!parentStatement) {
      response.status(404).send({
        ok: false,
        error: 'Parent statement not found'
      });
      return;
    }

    // 3. Try vector search first
    let similarStatements: Statement[] = [];
    let method: 'embedding' | 'llm' | 'fallback' = 'embedding';

    try {
      const vectorResults = await similarityService.findSimilarStatements(
        userInput,
        statementId,
        parentStatement.statement,
        { limit: 6, threshold: 0.65 }
      );

      similarStatements = vectorResults.map(r => r.statement);

      // If vector search returns too few results, supplement with LLM
      if (similarStatements.length < 3) {
        console.info('Vector search returned few results, supplementing with LLM');
        method = 'hybrid';

        const llmResults = await findSimilarStatementsAI(
          await getAllStatements(statementId),
          userInput,
          parentStatement.statement,
          6 - similarStatements.length
        );

        // Merge results, avoiding duplicates
        const existingIds = new Set(similarStatements.map(s => s.statementId));
        for (const stmt of llmResults) {
          if (!existingIds.has(stmt.statementId)) {
            similarStatements.push(stmt);
          }
        }
      }
    } catch (vectorError) {
      // Fallback to LLM if vector search fails
      console.error('Vector search failed, falling back to LLM:', vectorError);
      method = 'llm';

      similarStatements = await findSimilarStatementsAI(
        await getAllStatements(statementId),
        userInput,
        parentStatement.statement,
        6
      );
    }

    const responseTime = Date.now() - startTime;

    response.status(200).send({
      ok: true,
      similarStatements,
      userText: userInput,
      method,
      responseTime,
      cached: false
    });

  } catch (error) {
    logError(error, {
      operation: 'fn_findSimilarStatements',
      metadata: { body: request.body }
    });
    response.status(500).send({ ok: false, error: 'Internal server error' });
  }
}
```

### 3.3 Tasks Checklist - Phase 3

- [ ] Create `similarity-service.ts`
- [ ] Update `fn_findSimilarStatements.ts` with vector search
- [ ] Implement fallback to LLM
- [ ] Add method tracking for analytics
- [ ] Write integration tests
- [ ] Test with statements that have embeddings
- [ ] Test fallback when embeddings missing
- [ ] Measure and compare latency

---

## Phase 4: Backfill Existing Statements

**Duration**: 1-2 days
**Goal**: Generate embeddings for all existing option statements

### 4.1 Create Migration Script

**File**: `functions/src/migrations/backfill-embeddings.ts`

```typescript
import { db } from '../db';
import { embeddingService } from '../services/embedding-service';
import { Collections, Statement, StatementType } from 'delib-npm';
import { logError } from '../utils/errorHandling';

interface MigrationProgress {
  totalStatements: number;
  processedStatements: number;
  failedStatements: number;
  startedAt: number;
  lastProcessedAt: number;
  status: 'running' | 'completed' | 'failed';
}

const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY = 200; // ms between batches

export async function backfillEmbeddings(
  questionId?: string  // Optional: backfill for specific question
): Promise<MigrationProgress> {
  const migrationId = `embedding_backfill_${Date.now()}`;

  // Initialize progress tracking
  const progress: MigrationProgress = {
    totalStatements: 0,
    processedStatements: 0,
    failedStatements: 0,
    startedAt: Date.now(),
    lastProcessedAt: Date.now(),
    status: 'running'
  };

  await db.collection('_migrations').doc(migrationId).set(progress);

  try {
    // Build query
    let query = db
      .collection(Collections.statements)
      .where('statementType', '==', StatementType.option)
      .where('embedding', '==', null);  // Only statements without embeddings

    if (questionId) {
      query = query.where('parentId', '==', questionId);
    }

    // Get total count
    const countSnapshot = await query.count().get();
    progress.totalStatements = countSnapshot.data().count;

    console.info(`Starting backfill: ${progress.totalStatements} statements`);

    // Process in batches
    let lastDoc = null;

    while (true) {
      let batchQuery = query.limit(BATCH_SIZE);
      if (lastDoc) {
        batchQuery = batchQuery.startAfter(lastDoc);
      }

      const snapshot = await batchQuery.get();
      if (snapshot.empty) break;

      // Process batch
      const batch = db.batch();
      const statements = snapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data() as Statement
      }));

      // Get parent statements for context
      const parentIds = [...new Set(statements.map(s => s.data.parentId))];
      const parentDocs = await db
        .collection(Collections.statements)
        .where('statementId', 'in', parentIds)
        .get();

      const parentMap = new Map<string, Statement>();
      parentDocs.forEach(doc => {
        parentMap.set(doc.id, doc.data() as Statement);
      });

      // Generate embeddings
      for (const { id, data } of statements) {
        const parent = parentMap.get(data.parentId);
        if (!parent) {
          progress.failedStatements++;
          continue;
        }

        try {
          const result = await embeddingService.generateEmbedding(
            data.statement,
            parent.statement
          );

          batch.update(db.collection(Collections.statements).doc(id), {
            embedding: result.embedding,
            embeddingModel: result.model,
            embeddingContext: parent.statement,
            embeddingCreatedAt: Date.now()
          });

          progress.processedStatements++;
        } catch (error) {
          progress.failedStatements++;
          logError(error, {
            operation: 'backfillEmbeddings.generateEmbedding',
            statementId: id
          });
        }
      }

      await batch.commit();

      // Update progress
      progress.lastProcessedAt = Date.now();
      await db.collection('_migrations').doc(migrationId).update(progress);

      console.info(
        `Backfill progress: ${progress.processedStatements}/${progress.totalStatements}`
      );

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    progress.status = 'completed';
    await db.collection('_migrations').doc(migrationId).update(progress);

    console.info('Backfill completed:', progress);
    return progress;

  } catch (error) {
    progress.status = 'failed';
    await db.collection('_migrations').doc(migrationId).update(progress);
    throw error;
  }
}
```

### 4.2 Create Backfill HTTP Endpoint

**File**: `functions/src/index.ts` (add export)

```typescript
export const runEmbeddingBackfill = wrapHttpFunction(
  async (req: Request, res: Response) => {
    // Admin only
    const { questionId } = req.body;
    const progress = await backfillEmbeddings(questionId);
    res.json(progress);
  }
);
```

### 4.3 Tasks Checklist - Phase 4

- [ ] Create `backfill-embeddings.ts` migration script
- [ ] Add HTTP endpoint for triggering backfill
- [ ] Add admin authentication check
- [ ] Test backfill on small dataset
- [ ] Run backfill on production (staged)
- [ ] Monitor progress and errors
- [ ] Verify embeddings are searchable

---

## Phase 5: Framing-Based Clustering

**Duration**: 2-3 days
**Goal**: Implement hybrid clustering for framing analysis

### 5.1 Create Clustering Service

**File**: `functions/src/services/clustering-service.ts`

```typescript
import { db } from '../db';
import { embeddingService } from './embedding-service';
import { getGenerativeAIModel } from './ai-service';
import { Collections, Statement, StatementType } from 'delib-npm';
import { logError } from '../utils/errorHandling';

interface Cluster {
  clusterId: string;
  name: string;
  description: string;
  framing: FramingType;
  statementIds: string[];
  representativeId: string;
  confidence: number;
}

type FramingType =
  | 'economic'
  | 'safety'
  | 'environmental'
  | 'social'
  | 'rights'
  | 'practical'
  | 'moral'
  | 'temporal'
  | 'other';

interface ClusteringResult {
  clusters: Cluster[];
  method: 'llm' | 'embeddings' | 'hybrid';
  processingTime: number;
}

const SMALL_DATASET_THRESHOLD = 100;
const CLUSTER_SAMPLE_SIZE = 30;

class ClusteringService {
  async clusterByFraming(
    parentId: string,
    forceMethod?: 'llm' | 'embeddings' | 'hybrid'
  ): Promise<ClusteringResult> {
    const startTime = Date.now();

    // Fetch all option statements
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .where('hide', '!=', true)
      .get();

    const statements: Statement[] = [];
    snapshot.forEach(doc => statements.push(doc.data() as Statement));

    // Get parent for context
    const parentDoc = await db
      .collection(Collections.statements)
      .doc(parentId)
      .get();
    const parentStatement = parentDoc.data() as Statement;

    // Choose method
    const method = forceMethod ?? (
      statements.length < SMALL_DATASET_THRESHOLD ? 'llm' : 'hybrid'
    );

    let clusters: Cluster[];

    if (method === 'llm') {
      clusters = await this.clusterWithLLM(statements, parentStatement);
    } else {
      clusters = await this.clusterHybrid(statements, parentStatement);
    }

    return {
      clusters,
      method,
      processingTime: Date.now() - startTime
    };
  }

  private async clusterWithLLM(
    statements: Statement[],
    parent: Statement
  ): Promise<Cluster[]> {
    const model = await getGenerativeAIModel();

    const prompt = this.buildFramingPrompt(statements, parent.statement);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      const parsed = JSON.parse(text);
      return this.validateClusters(parsed.clusters, statements);
    } catch (error) {
      logError(error, {
        operation: 'clusteringService.clusterWithLLM',
        metadata: { responsePreview: text.slice(0, 200) }
      });
      throw new Error('Failed to parse clustering response');
    }
  }

  private async clusterHybrid(
    statements: Statement[],
    parent: Statement
  ): Promise<Cluster[]> {
    // Step 1: Get embeddings (use existing or generate)
    const statementsWithEmbeddings = statements.filter(s => s.embedding);

    if (statementsWithEmbeddings.length < statements.length * 0.5) {
      // Too many missing embeddings, fall back to LLM
      console.info('Too many missing embeddings, using LLM clustering');
      return this.clusterWithLLM(statements, parent);
    }

    // Step 2: K-Means clustering on embeddings
    const numClusters = Math.ceil(Math.sqrt(statementsWithEmbeddings.length));
    const embeddingClusters = this.kMeansClustering(
      statementsWithEmbeddings,
      numClusters
    );

    // Step 3: LLM analyzes framing for each cluster
    const framingClusters: Cluster[] = [];

    for (const [clusterIndex, clusterStatements] of embeddingClusters.entries()) {
      // Sample if cluster is too large
      const sample = clusterStatements.length > CLUSTER_SAMPLE_SIZE
        ? this.selectRepresentativeSample(clusterStatements, CLUSTER_SAMPLE_SIZE)
        : clusterStatements;

      const framing = await this.analyzeClusterFraming(sample, parent.statement);

      framingClusters.push({
        clusterId: `cluster_${clusterIndex}`,
        name: framing.name,
        description: framing.description,
        framing: framing.framingType,
        statementIds: clusterStatements.map(s => s.statementId),
        representativeId: this.findCentroid(clusterStatements),
        confidence: framing.confidence
      });
    }

    // Step 4: Merge clusters with same framing
    return this.mergeSimilarFramings(framingClusters);
  }

  private kMeansClustering(
    statements: Statement[],
    k: number
  ): Statement[][] {
    const embeddings = statements.map(s => s.embedding!);
    const n = embeddings.length;
    const dims = embeddings[0].length;

    // Initialize centroids randomly
    const centroidIndices = new Set<number>();
    while (centroidIndices.size < k) {
      centroidIndices.add(Math.floor(Math.random() * n));
    }
    let centroids = Array.from(centroidIndices).map(i => [...embeddings[i]]);

    // K-means iterations
    const maxIterations = 50;
    let assignments = new Array(n).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign points to nearest centroid
      const newAssignments = embeddings.map(emb => {
        let minDist = Infinity;
        let closest = 0;
        for (let c = 0; c < k; c++) {
          const dist = this.euclideanDistance(emb, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            closest = c;
          }
        }
        return closest;
      });

      // Check convergence
      if (this.arraysEqual(assignments, newAssignments)) break;
      assignments = newAssignments;

      // Update centroids
      const newCentroids = Array.from({ length: k }, () =>
        new Array(dims).fill(0)
      );
      const counts = new Array(k).fill(0);

      for (let i = 0; i < n; i++) {
        const c = assignments[i];
        counts[c]++;
        for (let d = 0; d < dims; d++) {
          newCentroids[c][d] += embeddings[i][d];
        }
      }

      centroids = newCentroids.map((centroid, c) =>
        centroid.map(val => counts[c] > 0 ? val / counts[c] : 0)
      );
    }

    // Group statements by cluster
    const clusters: Statement[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      clusters[assignments[i]].push(statements[i]);
    }

    return clusters.filter(c => c.length > 0);
  }

  private async analyzeClusterFraming(
    statements: Statement[],
    questionContext: string
  ): Promise<{
    name: string;
    description: string;
    framingType: FramingType;
    confidence: number;
  }> {
    const model = await getGenerativeAIModel();

    const prompt = `
Analyze the framing of these statements about: "${questionContext}"

Statements:
${statements.map(s => `- ${s.statement}`).join('\n')}

What FRAMING perspective do these statements share?
Framing types:
- economic: focuses on costs, jobs, business
- safety: focuses on security, health, harm prevention
- environmental: focuses on climate, pollution, nature
- social: focuses on community, equality, inclusion
- rights: focuses on freedom, privacy, choice
- practical: focuses on feasibility, implementation
- moral: focuses on ethics, values, principles
- temporal: focuses on urgency, timeline
- other: doesn't fit above categories

Return JSON:
{
  "framingType": "economic",
  "name": "Economic Benefits",
  "description": "These statements focus on economic advantages...",
  "confidence": 0.85
}
`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }

  private buildFramingPrompt(
    statements: Statement[],
    questionContext: string
  ): string {
    return `
Analyze these ${statements.length} statements about: "${questionContext}"

Cluster them by FRAMING - how the argument is made, not what it's about.

Framing types:
- economic: focuses on costs, jobs, business impact
- safety: focuses on security, health, harm prevention
- environmental: focuses on climate, pollution, nature
- social: focuses on community, equality, inclusion
- rights: focuses on freedom, privacy, individual choice
- practical: focuses on feasibility, implementation
- moral: focuses on ethics, values, right/wrong
- temporal: focuses on urgency, timeline, future impact

Statements:
${statements.map(s => `[${s.statementId}] ${s.statement}`).join('\n')}

Return JSON:
{
  "clusters": [
    {
      "clusterId": "cluster_1",
      "name": "Safety-focused solutions",
      "description": "These emphasize preventing harm and protecting people",
      "framing": "safety",
      "statementIds": ["id1", "id2", ...],
      "confidence": 0.85
    }
  ]
}
`;
  }

  // Helper methods
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  private selectRepresentativeSample(
    statements: Statement[],
    size: number
  ): Statement[] {
    // Simple random sampling for now
    const shuffled = [...statements].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  private findCentroid(statements: Statement[]): string {
    // Return ID of statement closest to cluster center
    if (statements.length === 0) return '';
    if (statements.length === 1) return statements[0].statementId;

    const embeddings = statements.filter(s => s.embedding).map(s => s.embedding!);
    if (embeddings.length === 0) return statements[0].statementId;

    // Calculate centroid
    const dims = embeddings[0].length;
    const centroid = new Array(dims).fill(0);
    for (const emb of embeddings) {
      for (let d = 0; d < dims; d++) {
        centroid[d] += emb[d];
      }
    }
    for (let d = 0; d < dims; d++) {
      centroid[d] /= embeddings.length;
    }

    // Find closest statement
    let minDist = Infinity;
    let closestId = statements[0].statementId;
    for (const s of statements.filter(s => s.embedding)) {
      const dist = this.euclideanDistance(s.embedding!, centroid);
      if (dist < minDist) {
        minDist = dist;
        closestId = s.statementId;
      }
    }

    return closestId;
  }

  private mergeSimilarFramings(clusters: Cluster[]): Cluster[] {
    // Group by framing type
    const byFraming = new Map<FramingType, Cluster[]>();
    for (const cluster of clusters) {
      const existing = byFraming.get(cluster.framing) ?? [];
      existing.push(cluster);
      byFraming.set(cluster.framing, existing);
    }

    // Merge clusters with same framing
    const merged: Cluster[] = [];
    for (const [framing, framingClusters] of byFraming) {
      if (framingClusters.length === 1) {
        merged.push(framingClusters[0]);
      } else {
        // Merge into one cluster
        const allIds = framingClusters.flatMap(c => c.statementIds);
        const avgConfidence = framingClusters.reduce((sum, c) => sum + c.confidence, 0)
          / framingClusters.length;

        merged.push({
          clusterId: `merged_${framing}`,
          name: framingClusters[0].name,
          description: framingClusters[0].description,
          framing,
          statementIds: allIds,
          representativeId: framingClusters[0].representativeId,
          confidence: avgConfidence
        });
      }
    }

    return merged;
  }

  private validateClusters(
    clusters: Cluster[],
    statements: Statement[]
  ): Cluster[] {
    const validIds = new Set(statements.map(s => s.statementId));

    return clusters.map(cluster => ({
      ...cluster,
      statementIds: cluster.statementIds.filter(id => validIds.has(id))
    })).filter(cluster => cluster.statementIds.length > 0);
  }
}

export const clusteringService = new ClusteringService();
```

### 5.2 Create Clustering Endpoint

**File**: `functions/src/fn_clusters.ts` (update existing)

```typescript
import { clusteringService } from './services/clustering-service';

export const clusterStatementsByFraming = wrapHttpFunction(
  async (req: Request, res: Response) => {
    const { parentId, forceMethod } = req.body;

    if (!parentId) {
      res.status(400).json({ error: 'parentId required' });
      return;
    }

    const result = await clusteringService.clusterByFraming(parentId, forceMethod);

    res.json({
      ok: true,
      ...result
    });
  }
);
```

### 5.3 Tasks Checklist - Phase 5

- [ ] Create `clustering-service.ts`
- [ ] Implement K-means clustering algorithm
- [ ] Implement LLM framing analysis
- [ ] Implement hybrid clustering
- [ ] Create HTTP endpoint
- [ ] Write unit tests for clustering
- [ ] Test with various dataset sizes
- [ ] Test framing detection accuracy

---

## Phase 6: Testing & Rollout

**Duration**: 2-3 days
**Goal**: Comprehensive testing and gradual rollout

### 6.1 Unit Tests

**File**: `functions/src/services/__tests__/embedding-service.test.ts`

```typescript
import { embeddingService } from '../embedding-service';

describe('EmbeddingService', () => {
  describe('generateEmbedding', () => {
    it('should generate 768-dimensional embedding', async () => {
      const result = await embeddingService.generateEmbedding(
        'Test statement about housing'
      );

      expect(result.embedding).toHaveLength(768);
      expect(result.model).toBe('text-embedding-004');
    });

    it('should generate context-aware embedding', async () => {
      const withContext = await embeddingService.generateEmbedding(
        'More affordable housing',
        'How should we address homelessness?'
      );

      const withoutContext = await embeddingService.generateEmbedding(
        'More affordable housing'
      );

      // Embeddings should be different
      expect(withContext.embedding).not.toEqual(withoutContext.embedding);
    });
  });
});
```

### 6.2 Integration Tests

**File**: `functions/src/__tests__/similarity-search.integration.test.ts`

```typescript
describe('Similarity Search Integration', () => {
  it('should find similar statements using vector search', async () => {
    // Setup: Create statements with embeddings
    // Test: Query with similar input
    // Assert: Returns relevant statements
  });

  it('should fall back to LLM when embeddings missing', async () => {
    // Test fallback behavior
  });
});
```

### 6.3 Feature Flag for Gradual Rollout

```typescript
// In functions config
const USE_VECTOR_SEARCH = process.env.USE_VECTOR_SEARCH === 'true';
const VECTOR_SEARCH_PERCENTAGE = parseInt(
  process.env.VECTOR_SEARCH_PERCENTAGE ?? '0'
);

function shouldUseVectorSearch(userId: string): boolean {
  if (!USE_VECTOR_SEARCH) return false;

  // Gradual rollout based on user ID hash
  const hash = userId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  return Math.abs(hash) % 100 < VECTOR_SEARCH_PERCENTAGE;
}
```

### 6.4 Rollout Schedule

| Day | Action | Vector Search % |
|-----|--------|-----------------|
| 1 | Deploy to staging | 100% (staging) |
| 2 | Testing & validation | - |
| 3 | Deploy to production | 5% |
| 5 | Monitor & validate | 25% |
| 7 | Full validation | 50% |
| 10 | Complete rollout | 100% |

### 6.5 Tasks Checklist - Phase 6

- [ ] Write unit tests for all services
- [ ] Write integration tests
- [ ] Set up feature flags
- [ ] Deploy to staging
- [ ] Run load tests
- [ ] Monitor error rates
- [ ] Gradual production rollout
- [ ] Monitor latency and quality metrics
- [ ] Full rollout

---

## Monitoring & Observability

### Metrics to Track

```typescript
interface EmbeddingMetrics {
  embedding_generation_time_ms: number;
  vector_search_time_ms: number;
  search_method: 'embedding' | 'llm' | 'hybrid' | 'fallback';
  results_count: number;
  similarity_scores: number[];
  embeddings_missing_count: number;
}
```

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High fallback rate | >20% using LLM fallback | Warning |
| Slow vector search | P95 > 1s | Warning |
| Embedding generation errors | >5% failure rate | Critical |
| Index not ready | Building > 1hr | Critical |

---

## Cost Projections

### Per-Query Costs

| Component | Embedding Approach | Current LLM |
|-----------|-------------------|-------------|
| Embedding generation | $0.0001 | - |
| Vector search | $0.00001 | - |
| LLM call | - | $0.01 |
| **Total** | **$0.00011** | **$0.01** |

### Monthly Projection (10,000 queries/day)

| Approach | Monthly Cost |
|----------|--------------|
| Current (LLM only) | ~$3,000 |
| Embeddings | ~$35 |
| **Savings** | **~$2,965 (99%)** |

---

## Rollback Plan

If issues arise:

1. **Disable vector search**: Set `USE_VECTOR_SEARCH=false`
2. **Revert to LLM**: System falls back automatically
3. **Investigate**: Check logs, metrics, error rates
4. **Fix forward**: Address issues, redeploy

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Latency P50 | <500ms | Cloud Monitoring |
| Latency P95 | <1s | Cloud Monitoring |
| Relevance accuracy | >85% | Manual sampling |
| Cost reduction | >90% | Billing comparison |
| Error rate | <1% | Error tracking |
| Fallback rate | <10% | Custom metric |

---

## Timeline Summary

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Infrastructure | 2-3 days | Embedding service ready |
| Phase 2: Auto-generate | 1-2 days | New statements get embeddings |
| Phase 3: Vector search | 2-3 days | Similarity uses vectors |
| Phase 4: Backfill | 1-2 days | Existing data migrated |
| Phase 5: Clustering | 2-3 days | Framing-based clustering ready |
| Phase 6: Rollout | 2-3 days | Full production deployment |
| **Total** | **10-16 days** | **Complete system** |

---

## References

- [Architecture Document](../architectures/EMBEDDINGS_CLUSTERING_ARCHITECTURE.md)
- [Firestore Vector Search](https://firebase.google.com/docs/firestore/vector-search)
- [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Current findSimilarStatements](../functions/src/fn_findSimilarStatements.ts)
- [Current Clustering](../functions/src/fn_clusters.ts)
