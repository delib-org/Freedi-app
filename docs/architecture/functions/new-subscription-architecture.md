# New Subscription Update Architecture

## Overview
This document describes the new architecture for handling statement updates and subscriptions, which eliminates the costly pattern of updating all subscription documents when a statement changes.

## Current Problem
- When a statement is updated, ALL subscription documents are updated
- This causes thousands of writes for popular statements
- Cost implications: $25,000+/month for active communities
- Performance issues: Batch write limits, timeouts

## New Architecture

### Core Concept
Instead of storing the full statement in each subscription document, users will:
1. Listen directly to statements they're subscribed to
2. Track updates via a `lastUpdate` timestamp on the statement
3. View recent sub-statements via a `subStatements` array on the parent statement

### Data Structure Changes

#### Statement Document (Modified)
```typescript
interface Statement {
  // Existing fields...
  statementId: string;
  statement: string;
  creatorId: string;
  parentId: string;
  
  // New fields for subscription updates
  lastUpdate: Timestamp;           // When this statement or its children were last updated
  lastUpdateType: 'self' | 'child'; // What triggered the update
  subStatements: SubStatement[];   // Array of last 3 sub-statements
}

interface SubStatement {
  statementId: string;
  statement: string;
  creatorId: string;
  creatorName: string;
  createdAt: Timestamp;
  type: StatementType;
  // Only essential fields for preview
}
```

#### StatementSubscription Document (Simplified)
```typescript
interface StatementSubscription {
  statementsSubscribeId: string;
  statementId: string;      // Only store the ID
  userId: string;
  role: Role;
  // Remove the full statement object!
  // statement: Statement;   // REMOVED
  
  // Notification preferences
  getEmailNotification: boolean;
  getInAppNotification: boolean;
  getPushNotification: boolean;
}
```

### Implementation Flow

#### 1. User Subscription List
Users listen to their subscriptions to get a list of statement IDs:
```typescript
// Client-side code
const subscriptions = await firebase.firestore()
  .collection('statementsSubscribe')
  .where('userId', '==', currentUser.uid)
  .onSnapshot((snapshot) => {
    const statementIds = snapshot.docs.map(doc => doc.data().statementId);
    listenToStatements(statementIds);
  });
```

#### 2. Listen to Statements
Users then listen to the actual statements:
```typescript
// Client-side code
function listenToStatements(statementIds: string[]) {
  const unsubscribes = statementIds.map(id => 
    firebase.firestore()
      .collection('statements')
      .doc(id)
      .onSnapshot((doc) => {
        const statement = doc.data();
        updateUIWithStatement(statement);
      })
  );
}
```

#### 3. Update Parent When Child Changes
When a sub-statement is created or updated:
```typescript
// Cloud Function
export const updateParentStatementOnChildChange = onDocumentWritten(
  'statements/{statementId}',
  async (event) => {
    const statement = event.data?.after.data() as Statement;
    if (!statement || statement.parentId === 'top') return;
    
    const parentRef = db.collection('statements').doc(statement.parentId);
    
    // Get current parent data
    const parentDoc = await parentRef.get();
    const parentData = parentDoc.data() as Statement;
    
    // Get last 3 sub-statements
    const subStatementsQuery = await db.collection('statements')
      .where('parentId', '==', statement.parentId)
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    
    const subStatements: SubStatement[] = subStatementsQuery.docs.map(doc => {
      const data = doc.data() as Statement;
      return {
        statementId: data.statementId,
        statement: data.statement,
        creatorId: data.creatorId,
        creatorName: data.creator.displayName,
        createdAt: data.createdAt,
        type: data.statementType
      };
    });
    
    // Update parent with new timestamp and sub-statements
    await parentRef.update({
      lastUpdate: FieldValue.serverTimestamp(),
      lastUpdateType: 'child',
      subStatements: subStatements
    });
  }
);
```

### Migration Strategy

#### Phase 1: Add New Fields
1. Add `lastUpdate`, `lastUpdateType`, and `subStatements` to statement documents
2. Deploy the new cloud function to update parent statements

#### Phase 2: Update Client Code
1. Modify client to listen to statements directly
2. Remove dependency on statement data in subscription documents
3. Update UI to show sub-statements from parent

#### Phase 3: Clean Up
1. Remove `updateSubscriptionsSimpleStatement` function
2. Stop storing full statement in subscription documents
3. Run migration to remove statement data from existing subscriptions

### Benefits

#### Performance
- **Before**: 1 statement update = N subscription updates (where N could be thousands)
- **After**: 1 statement update = 1 parent statement update

#### Cost
- **Before**: $25,000+/month for subscription updates alone
- **After**: ~$100/month for parent statement updates

#### Scalability
- **Before**: Limited by batch write constraints (500 documents)
- **After**: No limits - works with millions of subscribers

#### Real-time Updates
- **Before**: Delayed due to batch processing
- **After**: Instant updates via Firestore listeners

### Considerations

#### Client-Side Complexity
- Clients need to manage multiple listeners
- Need to handle subscription/unsubscription properly
- Memory management for many active listeners

#### Solution:
```typescript
class SubscriptionManager {
  private listeners: Map<string, Unsubscribe> = new Map();
  
  async updateSubscriptions(userId: string) {
    // Clean up old listeners
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
    
    // Get user's subscriptions
    const subs = await getSubscriptions(userId);
    
    // Listen to each statement
    subs.forEach(sub => {
      const unsubscribe = listenToStatement(sub.statementId);
      this.listeners.set(sub.statementId, unsubscribe);
    });
  }
  
  cleanup() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}
```

#### Read Operations
- More reads on statement documents
- But Firestore charges less for reads than writes
- Can implement client-side caching

### Security Rules Update
```javascript
// Firestore Security Rules
match /statements/{statementId} {
  allow read: if isSubscribed(statementId);
  
  function isSubscribed(statementId) {
    return exists(/databases/$(database)/documents/statementsSubscribe/$(request.auth.uid + '_' + statementId));
  }
}
```

### Monitoring
Track these metrics:
- Number of active listeners per user
- Statement document read frequency
- Parent update frequency
- Client memory usage

## Conclusion
This new architecture eliminates the critical scalability issue while providing better real-time updates and dramatically reducing costs. It's a more standard Firestore pattern that scales to millions of users.