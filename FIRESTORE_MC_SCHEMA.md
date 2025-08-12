# Firestore Schema for Multi-Question Mass Consensus

## Collections Structure

### 1. `mcSessions` Collection
**Path**: `/mcSessions/{sessionId}`

```typescript
{
  sessionId: string;              // Auto-generated UUID
  statementId: string;            // Reference to parent statement
  title: string;                  // Session title
  description?: string;           // Optional description
  createdAt: number;              // Timestamp
  createdBy: string;              // User ID of creator
  status: 'draft' | 'active' | 'completed' | 'archived';
  settings: {
    randomizeQuestions: boolean;
    allowSkipping: boolean;
    showProgressBar: boolean;
    showIntermediateResults: boolean;
    sharedSteps: {
      introduction: boolean;
      userDemographics: boolean;
      feedback: boolean;
      thankYou: boolean;
    }
  }
}
```

### 2. `mcQuestions` Subcollection
**Path**: `/mcSessions/{sessionId}/questions/{questionId}`

```typescript
{
  questionId: string;             // Auto-generated UUID
  sessionId: string;              // Parent session reference
  order: number;                  // Display order (0-based)
  content: {
    question: string;             // The question text
    description?: string;         // Optional additional context
  };
  questionType: 'full_consensus' | 'quick_vote' | 'brainstorm_only' | 'evaluate_only' | 'custom';
  steps: MassConsensusStep[];     // Array of step configurations
  required: boolean;              // Whether question must be answered
  createdAt: number;              // Timestamp
  updatedAt: number;              // Last update timestamp
}
```

### 3. `mcProgress` Collection
**Path**: `/mcProgress/{progressId}`
**Index**: Composite index on `sessionId` + `participantId`

```typescript
{
  progressId: string;             // {sessionId}_{participantId}
  sessionId: string;              // Reference to session
  participantId: string;          // User ID
  currentQuestionIndex: number;   // Current position
  completedQuestions: string[];   // Array of completed questionIds
  startedAt: number;              // Session start timestamp
  lastUpdated: number;            // Last activity timestamp
  completed: boolean;             // Session completion status
}
```

### 4. `mcResponses` Collection
**Path**: `/mcResponses/{responseId}`
**Index**: Composite index on `sessionId` + `questionId` + `participantId`

```typescript
{
  responseId: string;             // {sessionId}_{questionId}_{participantId}
  sessionId: string;              // Reference to session
  questionId: string;             // Reference to question
  participantId: string;          // User ID
  responses: {
    suggestions?: string[];       // For suggestion steps
    votes?: string[];            // Statement IDs voted for
    evaluations?: {              // For evaluation steps
      [statementId: string]: number;  // Score per statement
    };
  };
  completedAt: number;           // Response timestamp
}
```

### 5. `mcAggregations` Collection (Optional - for caching)
**Path**: `/mcAggregations/{aggregationId}`

```typescript
{
  aggregationId: string;         // {sessionId}_{aggregationType}
  sessionId: string;             // Reference to session
  aggregationType: string;       // Type of aggregation
  data: any;                     // Aggregated results
  participantCount: number;      // Number of participants
  lastCalculated: number;        // Calculation timestamp
  version: number;               // Schema version
}
```

## Firestore Indexes

### Required Composite Indexes:

1. **mcSessions**
   - `statementId` + `status` + `createdAt` (DESC)
   - `createdBy` + `status` + `createdAt` (DESC)

2. **mcQuestions** (subcollection)
   - `sessionId` + `order` (ASC)

3. **mcProgress**
   - `sessionId` + `participantId`
   - `participantId` + `completed` + `lastUpdated` (DESC)

4. **mcResponses**
   - `sessionId` + `participantId` + `completedAt` (DESC)
   - `sessionId` + `questionId` + `completedAt` (DESC)
   - `participantId` + `completedAt` (DESC)

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isSessionCreator(sessionId) {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/mcSessions/$(sessionId)).data.createdBy == request.auth.uid;
    }
    
    function isStatementAdmin(statementId) {
      // Check if user is admin of the parent statement
      return isAuthenticated() && 
        get(/databases/$(database)/documents/statements/$(statementId)).data.creatorId == request.auth.uid;
    }
    
    // mcSessions rules
    match /mcSessions/{sessionId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && 
        request.resource.data.createdBy == request.auth.uid;
      allow update: if isSessionCreator(sessionId) || 
        isStatementAdmin(resource.data.statementId);
      allow delete: if isSessionCreator(sessionId);
      
      // Questions subcollection
      match /questions/{questionId} {
        allow read: if isAuthenticated();
        allow write: if isSessionCreator(sessionId);
      }
    }
    
    // mcProgress rules
    match /mcProgress/{progressId} {
      allow read: if isAuthenticated() && 
        (resource.data.participantId == request.auth.uid || 
         isSessionCreator(resource.data.sessionId));
      allow create: if isAuthenticated() && 
        request.resource.data.participantId == request.auth.uid;
      allow update: if isAuthenticated() && 
        resource.data.participantId == request.auth.uid;
      allow delete: if false; // Never delete progress
    }
    
    // mcResponses rules
    match /mcResponses/{responseId} {
      allow read: if isAuthenticated() && 
        (resource.data.participantId == request.auth.uid || 
         isSessionCreator(resource.data.sessionId));
      allow create: if isAuthenticated() && 
        request.resource.data.participantId == request.auth.uid;
      allow update: if false; // Responses are immutable
      allow delete: if false; // Never delete responses
    }
    
    // mcAggregations rules (read-only for users)
    match /mcAggregations/{aggregationId} {
      allow read: if isAuthenticated();
      allow write: if false; // Only cloud functions can write
    }
  }
}
```

## Migration Strategy

### From Existing Mass Consensus to Multi-Question:

1. **Backward Compatibility**
   - Single-question sessions are stored as MCSession with one question
   - Existing `massConsensusProcesses` collection remains unchanged
   - New UI detects format and uses appropriate display

2. **Migration Path**
   ```typescript
   // Pseudo-code for migration
   const oldProcess = await getDoc(doc(db, 'massConsensusProcesses', statementId));
   if (oldProcess.exists()) {
     const session = convertSingleToMultiQuestion(
       statementId,
       oldProcess.data().title || 'Consensus Question',
       oldProcess.data().steps,
       userId
     );
     await setDoc(doc(db, 'mcSessions', session.sessionId), session);
   }
   ```

3. **Gradual Migration**
   - New sessions use multi-question format
   - Old sessions continue to work with compatibility layer
   - Admin can manually migrate old sessions via UI

## Data Lifecycle

1. **Creation**: Admin creates session → Questions added as subcollection
2. **Participation**: User starts → Progress document created → Responses saved per question
3. **Aggregation**: Cloud function triggered on response → Updates aggregation cache
4. **Archival**: Completed sessions moved to 'archived' status after X days
5. **Cleanup**: Archived sessions deleted after Y days (configurable)

## Performance Considerations

1. **Pagination**: Questions loaded in batches of 10
2. **Caching**: Aggregations cached for 5 minutes
3. **Lazy Loading**: Responses loaded only when needed
4. **Indexes**: All queries use composite indexes
5. **Denormalization**: Question count stored in session for quick access