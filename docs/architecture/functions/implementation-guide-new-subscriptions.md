# Implementation Guide: New Subscription Architecture

## Quick Start Checklist

### Phase 1: Backend Changes (Day 1-2)
- [ ] Add new fields to Statement interface
- [ ] Create `updateParentStatementOnChildChange` function
- [ ] Deploy with `updateSubscriptionsSimpleStatement` still active
- [ ] Test parent statement updates

### Phase 2: Client Updates (Day 3-5)
- [ ] Update client subscription logic
- [ ] Implement statement listeners
- [ ] Update UI components
- [ ] Test with small user group

### Phase 3: Migration (Day 6-7)
- [ ] Disable `updateSubscriptionsSimpleStatement`
- [ ] Run migration script
- [ ] Monitor performance
- [ ] Full rollout

## Detailed Implementation Steps

### Step 1: Update Statement Schema

**File**: `delib-npm/src/models/statements.ts` (or wherever Statement type is defined)

```typescript
export interface Statement {
  // Existing fields...
  
  // Add these new fields:
  lastUpdate?: Timestamp;
  lastUpdateType?: 'self' | 'child' | 'vote' | 'evaluation';
  subStatements?: SubStatement[];
}

export interface SubStatement {
  statementId: string;
  statement: string;
  creatorId: string;
  creatorName: string;
  createdAt: Timestamp;
  type: StatementType;
  consensus?: number;
  voted?: number;
}
```

### Step 2: Create New Cloud Function

**File**: `functions/src/fn_statements_update.ts`

```typescript
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '.';
import { Collections, Statement, StatementType } from 'delib-npm';

export const updateParentStatementOnChildChange = onDocumentWritten(
  `${Collections.statements}/{statementId}`,
  async (event) => {
    try {
      const before = event.data?.before.data() as Statement | undefined;
      const after = event.data?.after.data() as Statement | undefined;
      
      // Skip if this is a deletion or no parent
      if (!after || after.parentId === 'top') return;
      
      // Check if this is a significant change
      const isNewStatement = !before && after;
      const hasContentChange = before && after && (
        before.statement !== after.statement ||
        before.consensus !== after.consensus ||
        before.voted !== after.voted
      );
      
      if (!isNewStatement && !hasContentChange) return;
      
      // Update parent statement
      await updateParentWithLatestChildren(after.parentId, after.statementId);
      
    } catch (error) {
      console.error('Error in updateParentStatementOnChildChange:', error);
    }
  }
);

async function updateParentWithLatestChildren(
  parentId: string, 
  triggeringChildId: string
) {
  const parentRef = db.collection(Collections.statements).doc(parentId);
  
  // Get last 3 sub-statements
  const subStatementsQuery = await db
    .collection(Collections.statements)
    .where('parentId', '==', parentId)
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get();
  
  const subStatements = subStatementsQuery.docs.map(doc => {
    const data = doc.data() as Statement;
    return {
      statementId: data.statementId,
      statement: data.statement.substring(0, 100), // Limit length
      creatorId: data.creatorId,
      creatorName: data.creator?.displayName || 'Anonymous',
      createdAt: data.createdAt,
      type: data.statementType,
      consensus: data.consensus,
      voted: data.voted
    };
  });
  
  // Update parent
  await parentRef.update({
    lastUpdate: FieldValue.serverTimestamp(),
    lastUpdateType: 'child',
    subStatements: subStatements
  });
  
  // Recursively update grandparent if exists
  const parentDoc = await parentRef.get();
  const parentData = parentDoc.data() as Statement;
  
  if (parentData.parentId !== 'top') {
    await updateGrandparentLastUpdate(parentData.parentId);
  }
}

async function updateGrandparentLastUpdate(grandparentId: string) {
  await db.collection(Collections.statements).doc(grandparentId).update({
    lastUpdate: FieldValue.serverTimestamp(),
    lastUpdateType: 'child'
  });
}
```

### Step 3: Update Cloud Function Exports

**File**: `functions/src/index.ts`

```typescript
// Add new import
import { updateParentStatementOnChildChange } from './fn_statements_update';

// Add to exports
export { updateParentStatementOnChildChange };

// KEEP this for now (we'll remove later):
// export { updateSubscriptionsSimpleStatement };
```

### Step 4: Client-Side Implementation

**File**: Create `src/services/subscriptionManager.ts`

```typescript
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  doc,
  Unsubscribe,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Collections, Statement, StatementSubscription } from 'delib-npm';
import { store } from '@/redux/store';
import { setStatements, updateStatement } from '@/redux/statements/statementsSlice';

export class SubscriptionManager {
  private userId: string;
  private subscriptionListener: Unsubscribe | null = null;
  private statementListeners: Map<string, Unsubscribe> = new Map();
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  // Start listening to user's subscriptions
  async startListening() {
    // First, listen to subscription changes
    const subscriptionsQuery = query(
      collection(db, Collections.statementsSubscribe),
      where('userId', '==', this.userId),
      orderBy('createdAt', 'desc'),
      limit(50) // Limit for performance
    );
    
    this.subscriptionListener = onSnapshot(
      subscriptionsQuery,
      (snapshot) => {
        const statementIds = new Set<string>();
        
        snapshot.docs.forEach(doc => {
          const sub = doc.data() as StatementSubscription;
          statementIds.add(sub.statementId);
        });
        
        // Update statement listeners
        this.updateStatementListeners(statementIds);
      },
      (error) => {
        console.error('Error listening to subscriptions:', error);
      }
    );
  }
  
  // Update which statements we're listening to
  private updateStatementListeners(newStatementIds: Set<string>) {
    // Remove listeners for statements we're no longer subscribed to
    this.statementListeners.forEach((unsubscribe, statementId) => {
      if (!newStatementIds.has(statementId)) {
        unsubscribe();
        this.statementListeners.delete(statementId);
      }
    });
    
    // Add listeners for new statements
    newStatementIds.forEach(statementId => {
      if (!this.statementListeners.has(statementId)) {
        const listener = this.listenToStatement(statementId);
        this.statementListeners.set(statementId, listener);
      }
    });
  }
  
  // Listen to individual statement
  private listenToStatement(statementId: string): Unsubscribe {
    const statementRef = doc(db, Collections.statements, statementId);
    
    return onSnapshot(
      statementRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const statement = snapshot.data() as Statement;
          // Update Redux store
          store.dispatch(updateStatement(statement));
        }
      },
      (error) => {
        console.error(`Error listening to statement ${statementId}:`, error);
      }
    );
  }
  
  // Clean up all listeners
  cleanup() {
    if (this.subscriptionListener) {
      this.subscriptionListener();
    }
    
    this.statementListeners.forEach(unsubscribe => unsubscribe());
    this.statementListeners.clear();
  }
}
```

### Step 5: Update React Components

**File**: Update main app component to use SubscriptionManager

```typescript
import { useEffect, useRef } from 'react';
import { useAppSelector } from '@/hooks/reduxHooks';
import { SubscriptionManager } from '@/services/subscriptionManager';

export function App() {
  const user = useAppSelector(state => state.user.user);
  const subscriptionManagerRef = useRef<SubscriptionManager | null>(null);
  
  useEffect(() => {
    if (user?.uid) {
      // Clean up old manager
      if (subscriptionManagerRef.current) {
        subscriptionManagerRef.current.cleanup();
      }
      
      // Create new manager
      const manager = new SubscriptionManager(user.uid);
      manager.startListening();
      subscriptionManagerRef.current = manager;
    }
    
    return () => {
      if (subscriptionManagerRef.current) {
        subscriptionManagerRef.current.cleanup();
      }
    };
  }, [user?.uid]);
  
  // Rest of your app...
}
```

### Step 6: Update Statement List Component

**File**: Update component that shows subscribed statements

```typescript
export function StatementsList() {
  const statements = useAppSelector(state => state.statements.statements);
  
  // Sort by lastUpdate to show most recent first
  const sortedStatements = [...statements].sort((a, b) => {
    const aTime = a.lastUpdate?.toMillis() || 0;
    const bTime = b.lastUpdate?.toMillis() || 0;
    return bTime - aTime;
  });
  
  return (
    <div className="statements-list">
      {sortedStatements.map(statement => (
        <StatementCard 
          key={statement.statementId}
          statement={statement}
          showSubStatements={true}
        />
      ))}
    </div>
  );
}

// Update StatementCard to show sub-statements
export function StatementCard({ statement, showSubStatements }) {
  return (
    <div className="statement-card">
      <h3>{statement.statement}</h3>
      
      {showSubStatements && statement.subStatements && (
        <div className="sub-statements">
          <h4>Latest Updates:</h4>
          {statement.subStatements.map(sub => (
            <div key={sub.statementId} className="sub-statement">
              <span className="creator">{sub.creatorName}:</span>
              <span className="content">{sub.statement}</span>
              <span className="time">{formatTime(sub.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
      
      {statement.lastUpdate && (
        <div className="last-update">
          Last activity: {formatTime(statement.lastUpdate)}
        </div>
      )}
    </div>
  );
}
```

### Step 7: Migration Script

**File**: `scripts/migrate-subscriptions.ts`

```typescript
import * as admin from 'firebase-admin';
import { Collections } from 'delib-npm';

const db = admin.firestore();

async function migrateSubscriptions() {
  console.log('Starting subscription migration...');
  
  const batch = db.batch();
  let count = 0;
  
  // Get all subscriptions
  const subscriptions = await db
    .collection(Collections.statementsSubscribe)
    .get();
  
  console.log(`Found ${subscriptions.size} subscriptions to migrate`);
  
  // Remove statement field from each subscription
  subscriptions.docs.forEach(doc => {
    const data = doc.data();
    
    if (data.statement) {
      // Remove the statement field
      batch.update(doc.ref, {
        statement: admin.firestore.FieldValue.delete()
      });
      
      count++;
      
      // Commit batch every 400 documents
      if (count % 400 === 0) {
        batch.commit();
        console.log(`Migrated ${count} subscriptions...`);
        batch = db.batch();
      }
    }
  });
  
  // Commit remaining
  if (count % 400 !== 0) {
    await batch.commit();
  }
  
  console.log(`Migration complete! Migrated ${count} subscriptions.`);
}

// Run migration
migrateSubscriptions().catch(console.error);
```

### Step 8: Testing Plan

1. **Unit Tests** for new cloud function
2. **Integration Tests** for subscription manager
3. **Load Testing** with many statements
4. **User Acceptance Testing** with beta group

### Step 9: Rollout Plan

#### Canary Deployment (Day 1)
- Deploy new cloud function
- Keep old system running
- Monitor for errors

#### Beta Testing (Day 2-3)
- Enable for 10% of users
- Monitor performance metrics
- Gather feedback

#### Full Rollout (Day 4-5)
- Enable for all users
- Run migration script
- Disable old function

#### Cleanup (Day 6-7)
- Remove old code
- Update documentation
- Performance optimization

### Step 10: Monitoring

Set up alerts for:
- Function execution time > 5 seconds
- Error rate > 1%
- Memory usage > 80%
- Too many active listeners (> 100 per user)

## Rollback Plan

If issues arise:
1. Re-enable `updateSubscriptionsSimpleStatement`
2. Restore statement field in subscriptions
3. Disable new listeners
4. Investigate and fix issues

## Success Metrics

- 95% reduction in database writes
- 90% reduction in function costs
- Statement updates visible within 1 second
- No increase in client memory usage