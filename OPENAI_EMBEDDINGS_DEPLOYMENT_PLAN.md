# OpenAI Embeddings Deployment Plan

## Background
Gemini's embedding API has a bug where Hebrew text produces identical embeddings. We switched to OpenAI's `text-embedding-3-small` which works correctly with Hebrew, Arabic, and all languages.

## Key Changes
- **Model**: Gemini `text-embedding-004` → OpenAI `text-embedding-3-small`
- **Dimensions**: 768 → 1536
- **Cost**: ~$0.02 per 1M tokens (very cheap)

## Deployment Steps

### Step 1: Deploy Functions
```bash
cd /Users/talyaron/Documents/Freedi-app
npm run deploy:f:prod
```

### Step 2: Update Firestore Vector Index
The vector index must be updated to 1536 dimensions. Run from project root:

```bash
# For production (wizcol-app)
gcloud firestore indexes composite create \
  --project=wizcol-app \
  --collection-group=statements \
  --field-config=field-path=embedding,vector-config='{"dimension":"1536","flat":{}}' \
  --field-config=field-path=parentId,order=ASCENDING

# For testing (freedi-test)
gcloud firestore indexes composite create \
  --project=freedi-test \
  --collection-group=statements \
  --field-config=field-path=embedding,vector-config='{"dimension":"1536","flat":{}}' \
  --field-config=field-path=parentId,order=ASCENDING
```

Note: You may need to delete the old 768-dimension index first if it exists.

### Step 3: Regenerate All Embeddings
Existing embeddings are 768-dimensional (Gemini) and incompatible with new 1536-dimensional (OpenAI) embeddings.

For each question that uses similarity search, regenerate embeddings:

```bash
# Replace QUESTION_ID with actual question statementId
curl -X POST https://me-west1-wizcol-app.cloudfunctions.net/generateBulkEmbeddings \
  -H "Content-Type: application/json" \
  -d '{"parentStatementId": "QUESTION_ID", "forceRegenerate": true}'
```

Or use the admin UI if available.

### Step 4: Test
1. Go to a question with options
2. Add a new option
3. Check if similar suggestions appear correctly
4. Verify Hebrew text produces unique, relevant matches

## Rollback (if needed)
To rollback to Gemini embeddings:
1. Revert `functions/src/services/embedding-service.ts` to use Gemini
2. Update vector index back to 768 dimensions
3. Regenerate embeddings

## Files Modified
- `functions/src/services/embedding-service.ts` - Main embedding service (now uses OpenAI)
- `functions/src/services/embedding-cache-service.ts` - Updated imports
- `env/env-loader.js` - Added OPENAI_API_KEY mapping
- `env/.env.dev` - Added OPENAI_API_KEY
- `env/.env.prod` - Added OPENAI_API_KEY
- `functions/package.json` - Added openai dependency

## Environment Variables Required
- `OPENAI_API_KEY` - OpenAI API key for embeddings
