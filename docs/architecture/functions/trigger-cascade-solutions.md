# Firebase Functions Trigger Cascade Solutions

## Implementation Priority
Solutions are organized by priority: Critical (implement immediately), High (within 1 week), Medium (within 1 month).

## Critical Priority Solutions (Implement Immediately)

### 1. Fix Statement Update Subscription Explosion (MOST URGENT)
**File**: `functions/src/fn_subscriptions.ts` - `updateSubscriptionsSimpleStatement()`

This is the MOST CRITICAL issue as it affects every statement update operation and could cause immediate cost explosion.

#### Immediate Hotfix (Deploy TODAY)
```typescript
export const updateSubscriptionsSimpleStatement = onDocumentUpdated(
  `/${Collections.statements}/{statementId}`,
  async (event) => {
    // EMERGENCY CIRCUIT BREAKER - Deploy this immediately!
    const subscriptionCount = await db
      .collection(Collections.statementsSubscribe)
      .where('statementId', '==', event.params.statementId)
      .count()
      .get();
    
    if (subscriptionCount.data().count > 100) {
      console.error(`CIRCUIT BREAKER: Skipping update for ${subscriptionCount.data().count} subscriptions`);
      return;
    }
    
    // Existing code continues...
  }
);
```

#### Permanent Fix (Deploy within 24 hours)
See Solution A, B, and C in section 3 below.

### 2. Fix Notification Explosion
**File**: `functions/src/fn_notifications.ts`

Move to section 3 below - this is now second priority after subscription updates.

### 3. Fix Admin Escalation Pattern
**File**: `functions/src/fn_subscriptions.ts`

#### Solution A: Implement Admin Count Limits
```typescript
// In setAdminsToNewStatement()
const MAX_INHERITED_ADMINS = 10;
const MAX_TOTAL_ADMINS = 20;

export async function setAdminsToNewStatement(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) {
  // ... existing code ...
  
  // Get parent admins
  const parentAdmins = parentSubs
    .filter(sub => sub.role === Role.admin || sub.role === Role.creator)
    .slice(0, MAX_INHERITED_ADMINS); // Limit inherited admins
  
  // Check total admin count
  const currentAdminCount = await getAdminCount(statement.statementId);
  const adminsToAdd = Math.min(
    parentAdmins.length, 
    MAX_TOTAL_ADMINS - currentAdminCount
  );
  
  // Only add limited number of admins
  for (let i = 0; i < adminsToAdd; i++) {
    await setSubscribeToDB(parentAdmins[i], statement, Role.admin);
  }
}
```

#### Solution B: Implement Admin Inheritance Levels
```typescript
// Add to statement document
interface StatementSettings {
  adminInheritanceLevel: number; // 0 = no inheritance, 1 = direct parent only, 2 = two levels up
}

// Only inherit admins based on level setting
if (statement.statementSettings?.adminInheritanceLevel > 0) {
  // Implement inheritance logic
}
```

### 4. Fix Notification Explosion (Moved from #2)
**File**: `functions/src/fn_notifications.ts`

#### Solution A: Implement Notification Queuing
```typescript
// Create new file: functions/src/services/notification-queue-service.ts
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const NOTIFICATION_TOPIC = 'statement-notifications';

export async function queueNotificationBatch(
  statement: Statement,
  subscribers: User[],
  message: NotificationMessage
) {
  // Split into manageable batches
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);
    
    await pubsub.topic(NOTIFICATION_TOPIC).publish(
      Buffer.from(JSON.stringify({
        statementId: statement.statementId,
        subscribers: batch,
        message,
        batchIndex: i / BATCH_SIZE
      }))
    );
  }
}

// Update updateInAppNotifications()
export async function updateInAppNotifications(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) {
  // ... existing code ...
  
  // Check subscriber count
  if (subscribers.length > 100) {
    // Queue for async processing
    await queueNotificationBatch(statement, subscribers, notificationMessage);
    return;
  }
  
  // Process small batches synchronously
  await processNotificationsSynchronously(subscribers, statement);
}
```

#### Solution B: Implement Circuit Breaker
```typescript
// Add circuit breaker for large operations
const CIRCUIT_BREAKER_THRESHOLD = 1000;

export async function updateInAppNotifications(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) {
  const subscribers = await getSubscribers(statement);
  
  if (subscribers.length > CIRCUIT_BREAKER_THRESHOLD) {
    console.error(`Circuit breaker triggered: ${subscribers.length} subscribers exceeds threshold`);
    
    // Log to monitoring
    await logLargeOperationSkipped(statement.statementId, subscribers.length);
    
    // Queue for manual review or batch processing
    await queueForManualProcessing(statement, subscribers.length);
    
    return;
  }
  
  // Continue with normal processing
}
```

### 3. Fix Statement Update Subscription Explosion
**File**: `functions/src/fn_subscriptions.ts` - `updateSubscriptionsSimpleStatement()`

#### Solution A: Only Update on Significant Changes
```typescript
export const updateSubscriptionsSimpleStatement = onDocumentUpdated(
  `/${Collections.statements}/{statementId}`, // Fix parameter name!
  async (event) => {
    const { before, after } = event.data;
    const statementBefore = before.data() as Statement;
    const statementAfter = after.data() as Statement;
    
    // Only update subscriptions if significant fields changed
    const significantFields = ['statement', 'title', 'description'];
    const hasSignificantChange = significantFields.some(field => 
      statementBefore[field] !== statementAfter[field]
    );
    
    if (!hasSignificantChange) {
      console.log('No significant changes, skipping subscription updates');
      return;
    }
    
    // Add circuit breaker
    const subscriptionCount = await getSubscriptionCount(statementAfter.statementId);
    if (subscriptionCount > 1000) {
      console.error(`Circuit breaker: ${subscriptionCount} subscriptions exceeds limit`);
      await logLargeOperationSkipped(statementAfter.statementId, subscriptionCount);
      return;
    }
    
    // Process in batches to avoid exceeding limits
    await processSubscriptionBatches(statementAfter);
  }
);

// Helper function to process in batches
async function processSubscriptionBatches(statement: Statement) {
  const BATCH_SIZE = 400; // Stay under Firestore's 500 limit
  let lastDoc = null;
  
  do {
    let query = db.collection(Collections.statementsSubscribe)
      .where('statementId', '==', statement.statementId)
      .orderBy('statementsSubscribeId')
      .limit(BATCH_SIZE);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    if (snapshot.empty) break;
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { 
        statement: statement,
        lastUpdate: FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    // Add delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (lastDoc);
}
```

#### Solution B: Remove Unnecessary Subscription Updates
```typescript
// Question: Why store the entire statement in each subscription?
// Better approach: Store only statementId and fetch statement when needed

// Remove this trigger entirely and refactor to:
interface StatementSubscription {
  statementsSubscribeId: string;
  statementId: string; // Only store ID, not entire statement
  userId: string;
  role: Role;
  // ... other subscription-specific fields
}

// When displaying subscriptions, join with statement data on the client
```

#### Solution C: Implement Lazy Updates
```typescript
// Instead of immediate updates, mark subscriptions as stale
export const markSubscriptionsAsStale = onDocumentUpdated(
  `/${Collections.statements}/{statementId}`,
  async (event) => {
    const statementId = event.params.statementId;
    
    // Just mark as stale with a timestamp
    await db.collection(Collections.statementMeta)
      .doc(statementId)
      .set({
        subscriptionsStale: true,
        staleTimestamp: FieldValue.serverTimestamp()
      }, { merge: true });
  }
);

// Update subscriptions when they're actually accessed
export async function getSubscriptionWithFreshStatement(
  subscriptionId: string
): Promise<SubscriptionWithStatement> {
  const subscription = await getSubscription(subscriptionId);
  const meta = await getStatementMeta(subscription.statementId);
  
  if (meta.subscriptionsStale) {
    // Update this specific subscription
    const statement = await getStatement(subscription.statementId);
    await updateSubscription(subscriptionId, { statement });
  }
  
  return subscription;
}
```

### 4. Implement Batch Processing Limits
**File**: `functions/src/fn_evaluation.ts`

#### Solution: Add Pagination to Batch Operations
```typescript
// Fix clearPreviousChosenOptions()
async function clearPreviousChosenOptions(parentId: string): Promise<void> {
  const BATCH_SIZE = 500; // Firestore batch limit
  let lastDoc = null;
  
  do {
    let query = db.collection(Collections.statements)
      .where("parentId", "==", parentId)
      .where("statementSettings.isChosen", "==", true)
      .limit(BATCH_SIZE);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        "statementSettings.isChosen": false,
        lastUpdate: Timestamp.now()
      });
    });
    
    await batch.commit();
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    // Add delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (lastDoc);
}
```

## High Priority Solutions (Within 1 Week)

### 4. Implement Subscription Update Optimization
**File**: `functions/src/fn_subscriptions.ts`

```typescript
// Optimize updateSubscriptionsSimpleStatement()
export async function updateSubscriptionsSimpleStatement(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) {
  // Only update if significant fields changed
  const before = change.before.data();
  const after = change.after.data();
  
  const significantFields = ['statement', 'description', 'title'];
  const hasSignificantChange = significantFields.some(field => 
    before[field] !== after[field]
  );
  
  if (!hasSignificantChange) {
    console.log('No significant changes, skipping subscription updates');
    return;
  }
  
  // Use Cloud Tasks for large updates
  const subscriptionCount = await getSubscriptionCount(after.statementId);
  
  if (subscriptionCount > 100) {
    await scheduleSubscriptionUpdate(after.statementId, after);
    return;
  }
  
  // Process small updates synchronously
  await processSubscriptionUpdates(after);
}
```

### 5. Add Monitoring and Alerting
**File**: Create `functions/src/services/monitoring-service.ts`

```typescript
import { Logging } from '@google-cloud/logging';

const logging = new Logging();
const log = logging.log('function-performance');

export interface PerformanceMetrics {
  functionName: string;
  executionTime: number;
  documentCount: number;
  userId?: string;
  statementId?: string;
}

export async function logPerformanceMetrics(metrics: PerformanceMetrics) {
  const entry = log.entry({
    resource: { type: 'cloud_function' },
    severity: metrics.executionTime > 30000 ? 'WARNING' : 'INFO',
    jsonPayload: metrics
  });
  
  await log.write(entry);
  
  // Alert if execution time is too high
  if (metrics.executionTime > 60000) {
    await sendSlackAlert(`Function ${metrics.functionName} took ${metrics.executionTime}ms`);
  }
}

// Wrapper for all triggers
export function withPerformanceMonitoring(
  functionName: string,
  fn: Function
) {
  return async (...args: any[]) => {
    const startTime = Date.now();
    let documentCount = 0;
    
    try {
      const result = await fn(...args);
      documentCount = result?.documentCount || 0;
      return result;
    } finally {
      await logPerformanceMetrics({
        functionName,
        executionTime: Date.now() - startTime,
        documentCount
      });
    }
  };
}
```

### 6. Implement Caching Layer
**File**: Create `functions/src/services/cache-service.ts`

```typescript
import { Firestore } from '@google-cloud/firestore';
import * as NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 }); // 10 minute cache

export async function getCachedSubscribers(
  statementId: string,
  forceRefresh = false
): Promise<User[]> {
  const cacheKey = `subscribers:${statementId}`;
  
  if (!forceRefresh) {
    const cached = cache.get<User[]>(cacheKey);
    if (cached) return cached;
  }
  
  // Fetch from database
  const subscribers = await getSubscribersFromDB(statementId);
  
  // Cache for future use
  cache.set(cacheKey, subscribers);
  
  return subscribers;
}

// Invalidate cache when subscriptions change
export function invalidateSubscriberCache(statementId: string) {
  cache.del(`subscribers:${statementId}`);
}
```

## Medium Priority Solutions (Within 1 Month)

### 7. Implement Event Sourcing for Notifications
Instead of creating notifications immediately, log events and process them asynchronously:

```typescript
// Create notification_events collection
interface NotificationEvent {
  id: string;
  type: 'statement_created' | 'statement_updated' | 'comment_added';
  statementId: string;
  timestamp: Timestamp;
  processed: boolean;
  metadata: any;
}

// Log events instead of creating notifications
export async function logNotificationEvent(
  type: string,
  statementId: string,
  metadata: any
) {
  await db.collection('notification_events').add({
    type,
    statementId,
    timestamp: Timestamp.now(),
    processed: false,
    metadata
  });
}

// Process events in batches (scheduled function)
export const processNotificationEvents = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const events = await db.collection('notification_events')
      .where('processed', '==', false)
      .orderBy('timestamp')
      .limit(1000)
      .get();
    
    // Process in batches
    await processEventBatch(events.docs);
  });
```

### 8. Implement Database Sharding Strategy
For high-volume collections, implement sharding:

```typescript
// Shard subscriptions by statement ID
function getSubscriptionShard(statementId: string, userId: string): string {
  const hash = hashCode(statementId + userId);
  const shardNumber = hash % 10; // 10 shards
  return `statementsSubscribe_${shardNumber}`;
}

// Update subscription queries to use shards
async function getSubscriptionsToStatement(statementId: string): Promise<User[]> {
  const promises = [];
  
  // Query all shards in parallel
  for (let i = 0; i < 10; i++) {
    promises.push(
      db.collection(`statementsSubscribe_${i}`)
        .where('statementId', '==', statementId)
        .get()
    );
  }
  
  const results = await Promise.all(promises);
  return results.flatMap(r => r.docs.map(d => d.data()));
}
```

## Testing Strategy

### 1. Load Testing Script
```typescript
// Create test/load-test.ts
import * as admin from 'firebase-admin';

async function createLoadTest() {
  // Create test statement with many subscribers
  const testStatement = await createTestStatement();
  
  // Add 1000 test subscribers
  for (let i = 0; i < 1000; i++) {
    await addTestSubscriber(testStatement.id, `user${i}`);
  }
  
  // Trigger update to test notification system
  await updateStatement(testStatement.id, { title: 'Updated title' });
  
  // Monitor function execution time
  await monitorFunctionPerformance('updateInAppNotifications');
}
```

### 2. Performance Benchmarks
Establish acceptable performance benchmarks:
- Statement creation: < 5 seconds
- Notification processing: < 100ms per user
- Batch operations: < 30 seconds for 1000 documents

## Rollout Plan

### Phase 1 (Day 1-2): Critical Fixes
1. Deploy admin count limits
2. Implement notification circuit breaker
3. Add basic monitoring

### Phase 2 (Day 3-7): Optimization
1. Deploy batch processing limits
2. Implement caching layer
3. Add performance monitoring

### Phase 3 (Week 2-4): Long-term Solutions
1. Implement event sourcing
2. Deploy sharding strategy
3. Comprehensive testing

## Monitoring Dashboard
Create monitoring dashboard tracking:
- Function execution times
- Document write counts
- Notification delivery rates
- Error rates
- Cost per operation

## Success Metrics
- 90% reduction in function execution time
- 95% reduction in unnecessary writes
- Cost reduction of 80% (from $30,750 to ~$6,000/month)
- User notification latency < 5 seconds
- Zero batch write failures
- Statement update operations < 5 seconds

## Emergency Action Items
1. **TODAY**: Deploy circuit breaker for updateSubscriptionsSimpleStatement
2. **Tomorrow**: Implement significant field checking
3. **This Week**: Complete refactoring of subscription update pattern
4. **Next Week**: Full testing and monitoring deployment