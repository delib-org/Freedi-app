# Freedi App: Groups/Statements Structure Analysis

## Overview
This document maps out the groups/statements data structure in Firestore and provides guidance for implementing free text search at the database level.

---

## 1. FIRESTORE COLLECTION STRUCTURE

### Primary Collection: `statements`
All statements (including groups, questions, and options) are stored in a single collection with a `statementType` field differentiating them.

```
Collection: statements/{statementId}
├── Document format: Defined by delib-npm Statement interface
└── Used for: All deliberative elements (groups, questions, options, results, etc.)
```

### Key Collections Related to Statements:
- **statementsSubscribe**: User subscriptions and membership information
- **evaluations**: User evaluations/votes on statements (nested under statements)
- **votes**: Voting records for mass consensus questions
- **importance**: User importance ratings
- **feedback**: User feedback on statements

---

## 2. STATEMENT DATA MODEL

### Core Statement Fields (from delib-npm):
```typescript
Statement {
  // Identification
  statementId: string           // Unique ID
  parentId: string              // Direct parent statement ID
  topParentId: string           // Root statement ID in hierarchy
  parents: string[]             // Array of all ancestor IDs
  
  // Content
  statement: string             // Main text field (primary search target)
  description?: string          // Optional description
  title?: string                // Optional title field
  
  // Type & Classification
  statementType: StatementType  // 'group' | 'question' | 'option' | 'result' | 'document'
  questionType?: QuestionType   // For questions: consensus, vote, majority, etc.
  
  // Metadata
  creatorId: string             // Creator user ID
  creator: Creator              // Creator details object
  createdAt: number             // Timestamp (milliseconds)
  lastUpdate: number            // Last update timestamp
  lastChildUpdate?: number      // Last child update timestamp
  
  // State
  hide?: boolean                // Whether hidden from non-admins
  isCluster?: boolean           // Clustering flag
  isVoted?: boolean             // Voting state
  
  // Consensus & Evaluation
  consensus?: number            // Current consensus score (0-1)
  evaluation?: {
    sumEvaluations: number      // Sum of all evaluations
    sumPro: number              // Count of positive evaluations
    sumCon: number              // Count of negative evaluations
    averageEvaluation: number   // Average evaluation score
    viewed: number              // Number of times viewed
    evaluationRandomNumber: number // Random number for fair sampling
  }
  
  // Membership & Access
  membership: Membership        // Access control settings
  
  // Results & Configuration
  results?: Statement[]         // Computed results array
  topVotedOption?: Statement    // Top voted option reference
  evaluationSettings?: {...}    // Evaluation configuration
  resultsSettings?: {...}       // Results computation settings
}
```

### Statement Type Enum:
```typescript
enum StatementType {
  group = 'group',              // Deliberation groups/sections
  question = 'question',        // Questions requiring options
  option = 'option',            // Proposed options/solutions
  result = 'result',            // Computed results
  document = 'document'         // Documentation/reference materials
}
```

---

## 3. GROUP STRUCTURE SPECIFICS

### What is a "Group"?
Groups are statements with `statementType === StatementType.group`. They serve as organizational containers for deliberation.

### Group Hierarchy:
```
Root Group (topParentId = self)
├── Sub-Groups (statementType = 'group', parentId = Root)
│   ├── Questions (statementType = 'question', parentId = Sub-Group)
│   │   ├── Options (statementType = 'option', parentId = Question)
│   │   └── Results (statementType = 'result', parentId = Question)
│   └── Sub-Sub-Groups (nested groups)
└── Questions (direct under root)
    ├── Options
    └── Results
```

### Group-Specific Fields:
- **statement**: Group name/title (searchable)
- **description**: Group description (potentially searchable)
- **parentId**: Parent group (or root)
- **topParentId**: Root group for the entire tree
- **parents**: Array containing entire hierarchy path
- **statementType**: Always 'group'
- **members**: Accessible via `statementsSubscribe` collection

---

## 4. CURRENT FIRESTORE QUERIES

### Relevant Indexes for Groups (from firestore.indexes.json):

```json
// Query: Get sub-items by parent + type + ordering
{
  "collectionGroup": "statements",
  "fields": [
    "parentId",
    "statementType",
    "createdAt",
    "__name__"
  ]
}

// Query: Get descendants by parent array + type
{
  "collectionGroup": "statements",
  "fields": [
    "parents",
    "statementType",
    "createdAt"
  ]
}
```

### Common Query Patterns (from listenToStatements.ts):

1. **Get Sub-Statements by Parent:**
   ```typescript
   collection(statements)
     .where('parentId', '==', parentId)
     .where('statementType', '!=', StatementType.document)
     .orderBy('createdAt', 'desc/asc')
   ```

2. **Get All Descendants:**
   ```typescript
   collection(statements)
     .where('parents', 'array-contains', parentId)
     .where('statementType', 'in', [StatementType.question, StatementType.group, StatementType.option])
   ```

3. **Get Groups by Creator:**
   ```typescript
   collection(statements)
     .where('creatorId', '==', userId)
     .where('parentId', '==', parentId)
     .where('statementType', 'in', ['result', 'option'])
   ```

4. **Get Top Statements by Consensus:**
   ```typescript
   collection(statements)
     .where('parentId', '==', parentId)
     .where('statementType', '==', StatementType.option)
     .orderBy('evaluation.averageEvaluation', 'desc')
     .limit(6)
   ```

---

## 5. EXISTING SEARCH FUNCTIONALITY

### Current Client-Side Search:
**Location**: `/src/view/pages/statement/components/statementTypes/question/massConsesusQuestion/components/searchBar/SearchBar.tsx`

```typescript
// Current implementation: Simple in-memory filtering
const filteredOptions = options.filter((option) =>
  option.statement.toLowerCase().includes(searchTerm.toLowerCase())
);
```

**Limitations:**
- Only searches on already-loaded statements in memory
- No database-level search capability
- Case-insensitive substring matching only
- Cannot search across groups without loading all statements first

### No Existing Database-Level Text Search
- **No full-text search indexes** configured
- **No search field** (like `searchString`) on statements
- Groups are searched via field-based queries only (by parentId, creatorId, etc.)

---

## 6. SEARCH IMPLEMENTATION RECOMMENDATIONS

### Option 1: Add Search Field (Recommended for MVP)

**Index a denormalized search field on each statement:**

```typescript
// In Statement creation/update
interface Statement {
  // ... existing fields
  searchString: string;  // Denormalized lowercase, searchable version
}

// Usage: Combine statement + description + title for search
searchString: [statement, description || '', title || '']
  .filter(Boolean)
  .join(' ')
  .toLowerCase()
  .trim()
```

**Required Firestore Index:**
```json
{
  "collectionGroup": "statements",
  "fields": [
    {"fieldPath": "searchString", "order": "ASCENDING"},
    {"fieldPath": "parentId", "order": "ASCENDING"},
    {"fieldPath": "statementType", "order": "ASCENDING"},
    {"fieldPath": "__name__", "order": "ASCENDING"}
  ]
}
```

**Query Pattern:**
```typescript
collection(statements)
  .where('statementType', '==', StatementType.group)
  .where('searchString', '>=', searchTerm.toLowerCase())
  .where('searchString', '<', searchTerm.toLowerCase() + '~')
  .limit(50)
```

**Pros:**
- Simple to implement
- Works with existing Firestore
- Reasonable performance up to millions of documents
- Supports substring search efficiently
- Cost-effective

**Cons:**
- Case-sensitive prefix matching only (unless you use workarounds)
- Doesn't handle typos or fuzzy matching
- Requires maintaining denormalized field

### Option 2: Use Firestore Full-Text Search Extension

Firestore recently introduced a search extension, but it's complex and has limitations.

**Pros:** Advanced search features, typo tolerance
**Cons:** Requires third-party service, additional complexity, higher costs

### Option 3: Elasticsearch/Algolia Integration

Syncing statements to external search service.

**Pros:** Powerful search, relevance ranking, typo tolerance
**Cons:** Higher cost, infrastructure complexity, data sync issues

---

## 7. RECOMMENDED IMPLEMENTATION PLAN FOR FREE TEXT GROUP SEARCH

### Step 1: Add Search Field to Statements
- Add `searchString` field to Statement documents
- Denormalize: `[statement, description, title].join(' ').toLowerCase()`
- Implement when creating/updating statements

### Step 2: Create Firestore Index
```json
{
  "collectionGroup": "statements",
  "fields": [
    {"fieldPath": "statementType", "order": "ASCENDING"},
    {"fieldPath": "searchString", "order": "ASCENDING"},
    {"fieldPath": "parentId", "order": "ASCENDING"}
  ]
}
```

### Step 3: Implement Search Query
**Location**: `/src/controllers/db/statements/searchStatements.ts` (new file)

```typescript
import { Collections, StatementType, Statement } from 'delib-npm';
import { query, where, collection } from 'firebase/firestore';
import { FireStore } from '../config';

export interface SearchStatementsParams {
  searchTerm: string;
  statementType?: StatementType;
  parentId?: string;
  limit?: number;
}

export async function searchStatements({
  searchTerm,
  statementType = StatementType.group,
  parentId,
  limit = 50
}: SearchStatementsParams): Promise<Statement[]> {
  const lowerSearchTerm = searchTerm.toLowerCase().trim();
  
  if (!lowerSearchTerm) return [];
  
  let q = query(
    collection(FireStore, Collections.statements),
    where('statementType', '==', statementType),
    where('searchString', '>=', lowerSearchTerm),
    where('searchString', '<', lowerSearchTerm + '~')
  );
  
  if (parentId) {
    q = query(q, where('parentId', '==', parentId));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as Statement).slice(0, limit);
}
```

### Step 4: Create React Component
**Location**: `/src/view/components/groupSearch/GroupSearch.tsx`

```typescript
import React, { useState, useCallback } from 'react';
import { Statement } from 'delib-npm';
import { searchStatements } from '@/controllers/db/statements/searchStatements';

interface GroupSearchProps {
  onSelect?: (group: Statement) => void;
  placeholder?: string;
}

const GroupSearch: React.FC<GroupSearchProps> = ({ onSelect, placeholder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Statement[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = useCallback(async (term: string) => {
    setSearchTerm(term);
    
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const groups = await searchStatements({
        searchTerm: term,
        limit: 10
      });
      setResults(groups);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div>
      <input
        type="text"
        placeholder={placeholder || 'Search groups...'}
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
      />
      
      {isLoading && <p>Loading...</p>}
      
      <ul>
        {results.map(group => (
          <li key={group.statementId} onClick={() => onSelect?.(group)}>
            {group.statement}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GroupSearch;
```

### Step 5: Migrate Existing Statements
Run a Cloud Function or admin script to add `searchString` to all existing statements:

```typescript
// functions/src/migrations/addSearchField.ts
import { db } from '../db';
import { Collections } from 'delib-npm';

export async function addSearchStringToStatements() {
  const statementsRef = db.collection(Collections.statements);
  const snapshot = await statementsRef.get();
  
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const searchString = [
      data.statement,
      data.description,
      data.title
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .trim();

    batch.update(doc.ref, { searchString });
    count++;

    if (count % 500 === 0) {
      batch.commit();
    }
  });

  if (count % 500 !== 0) {
    await batch.commit();
  }
}
```

---

## 8. IMPORTANT CONSIDERATIONS

### Performance
- **Index cost**: Each new index adds to Firestore indexing overhead
- **Query cost**: Range queries (`>=`, `<`) scan documents but are efficient
- **Max results**: Firestore can return up to 100MB per query; use pagination for large datasets

### Limitations of Range-Based Search
- **Prefix-based only**: Matches if search term is at the start of any word
- **Case-sensitive**: The above implementation requires lowercase preprocessing
- **No typo tolerance**: Won't match "grup" for "group"
- **No relevance ranking**: Results ordered by Firestore's internal order, not relevance

### Alternative: Multiple Shards
For very large datasets, consider sharding the search field:
```typescript
searchString_a: string;  // First letter
searchString_b: string;  // First 2 letters
// etc...
```
This allows more efficient indexing for autocomplete scenarios.

---

## 9. FIELD-BASED SEARCH APPROACHES (No Index Needed)

### Search by Creator
```typescript
where('creatorId', '==', userId)
  .where('statementType', '==', StatementType.group)
```

### Search by Time Range
```typescript
where('createdAt', '>=', startTime)
  .where('createdAt', '<=', endTime)
```

### Search by Consensus
```typescript
where('consensus', '>=', 0.5)
  .where('statementType', '==', StatementType.group)
```

---

## 10. REFERENCE FILES

### Key Implementation Files:
- **Statement Service**: `/functions/src/services/statements/statementService.ts`
- **Statement Controller**: `/functions/src/controllers/statementController.ts`
- **Statement Listeners**: `/src/controllers/db/statements/listenToStatements.ts`
- **Statement Creation**: `/src/controllers/db/statements/setStatements.ts`
- **Firestore Indexes**: `/firestore.indexes.json`
- **Firestore Rules**: `/firestore.rules`
- **Constants**: `/src/constants/common.ts`
- **delib-npm Package**: Version 5.6.66 (see package.json)

### Existing Search:
- **Client-side Search**: `/src/view/pages/statement/components/statementTypes/question/massConsesusQuestion/components/searchBar/SearchBar.tsx`

---

## Summary

**Current State:**
- Statements stored in single `statements` collection
- Groups identified by `statementType === 'group'`
- All queries use field-based filtering (parentId, creatorId, etc.)
- Only client-side text search exists (on pre-loaded data)
- No database-level text search indexes

**For Free Text Search Implementation:**
1. Add denormalized `searchString` field to all statements
2. Create Firestore composite index
3. Use range queries for prefix-based search
4. Migrate existing documents
5. Consider sharding for very large datasets

This approach balances simplicity, performance, and cost for the Freedi use case.
