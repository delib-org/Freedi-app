# Vector Search Setup Guide

This document describes how to set up and use the Firestore Vector Search functionality for finding semantically similar statements.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Firestore Structure                      │
├─────────────────────────────────────────────────────────────┤
│  statements/{statementId}                                    │
│    ├── statement: "We should invest in education"           │
│    ├── description: "Optional detailed description"          │
│    ├── embedding: vector<768>  ← auto-generated              │
│    ├── embeddingDimension: 768                               │
│    └── embeddedAt: timestamp                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Cloud Functions                          │
├─────────────────────────────────────────────────────────────┤
│  onStatementCreated → Generate embedding automatically       │
│  updateParentOnChildUpdate → Regenerate on text changes      │
│  findSimilarStatementsVector → Callable for vector search    │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Google Cloud Project** with Firestore enabled
2. **Gemini API Key** set as `GOOGLE_API_KEY` environment variable
3. **Firestore Vector Index** (see setup below)

## Step 1: Create Firestore Vector Index

Run this command once to create the vector index for similarity search:

```bash
# For the default database
gcloud firestore indexes composite create \
  --collection-group=statements \
  --query-scope=COLLECTION \
  --field-config field-path=embedding,vector-config='{"dimension":"768", "flat": "{}"}' \
  --database="(default)"
```

If you need to filter by parentId, also create a composite index:

```bash
gcloud firestore indexes composite create \
  --collection-group=statements \
  --query-scope=COLLECTION \
  --field-config field-path=parentId,order=ASCENDING \
  --field-config field-path=embedding,vector-config='{"dimension":"768", "flat": "{}"}' \
  --database="(default)"
```

For topParentId filtering:

```bash
gcloud firestore indexes composite create \
  --collection-group=statements \
  --query-scope=COLLECTION \
  --field-config field-path=topParentId,order=ASCENDING \
  --field-config field-path=embedding,vector-config='{"dimension":"768", "flat": "{}"}' \
  --database="(default)"
```

## Step 2: Set Environment Variables

Ensure your Cloud Functions have access to the Gemini API:

```bash
# In your functions/.env file
GOOGLE_API_KEY=your-gemini-api-key
```

Or set it via Firebase secrets:

```bash
firebase functions:secrets:set GOOGLE_API_KEY
```

## Step 3: Deploy Functions

Deploy the updated Cloud Functions:

```bash
cd functions
npm run build
firebase deploy --only functions
```

## Usage

### Client-Side (React/TypeScript)

```typescript
import {
  findSimilarStatements,
  suggestAlternatives,
  checkForDuplicateStatement,
} from '@/controllers/db/statements/vectorSearch';

// Find similar statements within a question
const results = await findSimilarStatements(
  "We should invest in education",
  { parentId: "question-123", limit: 5 }
);

// Results include similarity scores
results.forEach(result => {
  console.info(`${result.statement} (${(result.similarity * 100).toFixed(1)}% similar)`);
});

// Suggest alternatives as user types
const suggestions = await suggestAlternatives(userInput, currentQuestionId);

// Check for duplicates before submission
const existingDuplicate = await checkForDuplicateStatement(
  newStatementText,
  parentQuestionId
);
if (existingDuplicate) {
  showWarning(`Similar statement exists: "${existingDuplicate.statement}"`);
}
```

### Direct Firebase Callable (if needed)

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const findSimilar = httpsCallable(functions, 'findSimilarStatementsVector');

const result = await findSimilar({
  text: "user's input text",
  parentId: "optional-question-id",
  limit: 5,
  minSimilarity: 0.6,
});

console.info(result.data.results);
```

## How It Works

### Automatic Embedding Generation

1. **On Statement Creation**: When a new statement is created, the `onStatementCreated` trigger automatically generates a vector embedding by combining the `statement` and `description` fields.

2. **On Statement Update**: When a statement's `statement` or `description` field is modified, the embedding is automatically regenerated.

3. **Embedding Model**: Uses Google's `text-embedding-004` model with 768 dimensions.

### Vector Search

1. **Query Embedding**: When searching, the user's query text is converted to a vector embedding.

2. **Firestore Vector Search**: Uses Firestore's native `findNearest()` with COSINE distance measure.

3. **Filtering**: Optional pre-filtering by `parentId` or `topParentId` before vector search.

4. **Similarity Threshold**: Results are filtered by minimum similarity score (default 0.6).

## Batch Regeneration

To regenerate embeddings for existing statements (e.g., after model update):

```typescript
import { batchRegenerateEmbeddings } from './fn_vectorSearch';

// Get statement IDs to update
const statementIds = ['id1', 'id2', 'id3', ...];

// Regenerate embeddings with concurrency limit
const { success, failed } = await batchRegenerateEmbeddings(statementIds, 5);
console.info(`Regenerated ${success} embeddings, ${failed} failed`);
```

## Monitoring

Check Cloud Functions logs for:
- Embedding generation times
- Vector search performance
- API errors

```bash
firebase functions:log --only findSimilarStatementsVector
firebase functions:log --only onStatementCreated
```

## Troubleshooting

### "Vector index not found" error

Create the required index using the gcloud commands above. Index creation takes a few minutes.

### "GOOGLE_API_KEY not set" error

Ensure the environment variable is set in your functions configuration:

```bash
firebase functions:config:get
firebase functions:secrets:access GOOGLE_API_KEY
```

### High latency on first requests

Vector operations have a cold start overhead. Consider:
- Keeping functions warm with periodic pings
- Using minimum instances configuration

### Low similarity scores

- Check if statements have embeddings: look for `embedding` field in Firestore
- Verify the embedding dimension matches (should be 768)
- Adjust `minSimilarity` threshold if needed

## Cost Considerations

- **Gemini API**: Each embedding generation uses ~1 API call
- **Firestore Reads**: Vector search reads documents for results
- **Cloud Functions**: Standard Cloud Functions pricing applies

## Future Improvements

- [ ] Add clustering support for grouping similar statements
- [ ] Implement embedding caching for repeated queries
- [ ] Add support for multilingual embeddings
- [ ] Create admin dashboard for monitoring embedding status
