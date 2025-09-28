# Average Evaluation Implementation

## Overview
This document describes the implementation of the `averageEvaluation` field, which provides a pure average evaluation score for statements without weighting by the number of evaluators. This was implemented to improve the sorting of top results in mass consensus.

## Purpose
- **Previous behavior**: Used `consensus` field (weighted by sqrt of evaluators count)
- **New behavior**: Uses pure average for fairer representation of user preferences
- **Formula**: `averageEvaluation = sumEvaluations / numberOfEvaluators`

## Implementation Details

### 1. Schema Changes

#### Location: `node_modules/delib-npm/src/models/evaluation/Evaluation.ts`
```typescript
export const StatementEvaluationSchema = object({
    sumEvaluations: number(),
    // ... other fields
    averageEvaluation: number(), // Added field (line 49)
    // ... other fields
});
```

**Note**: This is in node_modules, so changes need to be made in the delib-npm package source.

### 2. Backend Changes

#### 2.1 Evaluation Calculation
**File**: `functions/src/fn_evaluation.ts`

**Lines 245-271** - `calculateEvaluation` function:
```typescript
function calculateEvaluation(statement: Statement, proConDiff: CalcDiff, evaluationDiff: number, addEvaluator: number) {
    const evaluation = statement.evaluation || {
        // ... other fields
        averageEvaluation: 0, // Initialize field (line 252)
    };

    // ... update sums

    // Calculate average evaluation (lines 263-265)
    evaluation.averageEvaluation = evaluation.numberOfEvaluators > 0
        ? evaluation.sumEvaluations / evaluation.numberOfEvaluators
        : 0;

    // ... rest of function
}
```

#### 2.2 Query Sorting Update
**File**: `functions/src/services/statements/statementService.ts`

**Line 329** - Changed sorting in `getTopStatements`:
```typescript
// Before:
.orderBy('consensus', 'desc')

// After:
.orderBy('evaluation.averageEvaluation', 'desc')
```

### 3. Frontend Changes

#### 3.1 Initial Statement Creation
**File**: `src/controllers/db/statements/setStatements.ts`

**Line 378** - Added default value:
```typescript
evaluation: {
    // ... other fields
    averageEvaluation: 0,
}
```

#### 3.2 Redux State Management
**File**: `src/redux/statements/statementsSlice.ts`

**Line 94** - Handle field in state:
```typescript
averageEvaluation: st.evaluation?.averageEvaluation ?? 0,
```

#### 3.3 Display and Sorting
**File**: `src/view/pages/massConsensus/topSuggestions/TopSuggestionVM.tsx`

**Lines 40-70** - Added error handling and client-side sorting:
```typescript
fetch(endPoint)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then((data) => {
        if (!data.statements || !Array.isArray(data.statements)) {
            console.error('Invalid response: missing statements array', data);
            setLoadingStatements(false);
            return;
        }
        const options = data.statements
            .map((st: Statement) => ({ /* ... */ }))
            .sort((a, b) => (b.evaluation?.averageEvaluation ?? 0) - (a.evaluation?.averageEvaluation ?? 0));
        // ... rest of handling
    })
```

### 4. Migration System

#### 4.1 Migration Function
**File**: `functions/src/migrations/updateStatementAverageEvaluation.ts`

Key function: `updateStatementAndChildrenAverageEvaluation`
- Updates a parent statement and all its child options
- Processes in batches of 500 for performance
- Returns count of updated documents and any errors

#### 4.2 HTTP Endpoint Setup

**Modified Files**:
- `functions/src/controllers/maintenanceController.ts` (lines 63-91) - Controller method
- `functions/src/fn_httpRequests.ts` (line 32) - Route export
- `functions/src/index.ts` (lines 51, 180) - Function registration

**Endpoint URLs**:
```bash
# Local development
http://localhost:5001/delib-v3-dev/me-west1/updateAverageEvaluation?statementId=XXX

# Production
https://me-west1-freedi-test.cloudfunctions.net/updateAverageEvaluation?statementId=XXX
```

### 5. Database Requirements

#### 5.1 Firestore Index
A composite index is required for the new query pattern:

**Collection**: `statements`
**Fields**:
- `parentId` - Ascending
- `statementType` - Ascending
- `evaluation.averageEvaluation` - Descending

Add to `firestore.indexes.json`:
```json
{
  "collectionGroup": "statements",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "parentId", "order": "ASCENDING" },
    { "fieldPath": "statementType", "order": "ASCENDING" },
    { "fieldPath": "evaluation.averageEvaluation", "order": "DESCENDING" }
  ]
}
```

Deploy with: `firebase deploy --only firestore:indexes`

## Migration Process

### For Existing Data
1. Identify statements that need updating
2. Call migration endpoint with statement ID
3. Migration will update the statement and all its children
4. Verify results in the response

### Example Migration Call
```bash
curl "https://me-west1-freedi-test.cloudfunctions.net/updateAverageEvaluation?statementId=LMqdDPfUzGKS"
```

Response:
```json
{
  "ok": true,
  "statementId": "LMqdDPfUzGKS",
  "updated": 25,
  "processed": 30,
  "errors": []
}
```

## Troubleshooting

### Common Issues

#### 1. 500 Error on getTopStatements
**Cause**: Missing Firestore index
**Solution**: Deploy the required index (see section 5.1)

#### 2. averageEvaluation is undefined
**Cause**: Old data without the field
**Solution**: Run migration for the affected statement

#### 3. Frontend crash "Cannot read properties of undefined"
**Cause**: Backend error or malformed response
**Solution**: Already fixed with error handling in TopSuggestionVM.tsx

#### 4. Wrong project/region in URLs
**Check**:
- Development: `delib-v3-dev` / `me-west1`
- Production: `freedi-test` / `me-west1`

## Key Differences

| Field | Formula | Use Case |
|-------|---------|----------|
| **consensus** | `avg * sqrt(evaluators)` | Weights popular options higher |
| **averageEvaluation** | `sum / evaluators` | Pure average, no popularity bias |

## Testing

### Manual Testing Steps
1. Create a statement with multiple options
2. Have users evaluate the options
3. Check that `averageEvaluation` is calculated correctly
4. Verify top results are sorted by `averageEvaluation`

### Verification Queries
```javascript
// In Firestore console
// Check if field exists and is calculated
db.collection('statements')
  .where('parentId', '==', 'YOUR_STATEMENT_ID')
  .get()
  .then(snapshot => {
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log({
        id: doc.id,
        averageEvaluation: data.evaluation?.averageEvaluation,
        numberOfEvaluators: data.evaluation?.numberOfEvaluators,
        sumEvaluations: data.evaluation?.sumEvaluations
      });
    });
  });
```

## Future Considerations

1. **Performance**: Monitor query performance with the new index
2. **Backwards Compatibility**: Ensure all statements have the field before removing fallbacks
3. **UI Updates**: Consider showing both consensus and average in admin views
4. **Analytics**: Track which sorting method produces better user engagement

## Related Files
- Schema: `node_modules/delib-npm/src/models/evaluation/Evaluation.ts`
- Calculation: `functions/src/fn_evaluation.ts`
- Query: `functions/src/services/statements/statementService.ts`
- Migration: `functions/src/migrations/updateStatementAverageEvaluation.ts`
- Frontend: `src/view/pages/massConsensus/topSuggestions/TopSuggestionVM.tsx`
- Indexes: `firestore.indexes.json`