# Cascading Function Calls Performance Issue

**Date**: October 30, 2025
**Severity**: 🔴 HIGH
**Impact**: 75% of function calls are unnecessary cascades
**Status**: Identified, awaiting fix

---

## 📊 Executive Summary

Analysis of Firebase function logs revealed **376 out of 500 function calls (75.4%)** are from `updateNumberOfMembers`, triggering a cascade loop. The system generated **79 requests/second** at peak, far exceeding normal activity for ~70 users.

**Root Cause**: Metadata updates to subscriptions trigger full function execution, creating an infinite loop between parent statement updates and subscription updates.

---

## 🔍 Problem Analysis

### Issue #1: Cascading Update Loop 🔄

**File**: `functions/src/fn_statement_updates.ts:207-213`

When a child statement is updated:
1. `updateParentOnChildUpdate` runs
2. Updates parent subscriptions with new timestamp
3. **This triggers `updateNumberOfMembers` for EVERY subscription** ⚠️
4. Which can trigger more updates, creating a cascade

```typescript
// fn_statement_updates.ts:207-213
subscriptionsQuery.docs.forEach(doc => {
    batch.update(doc.ref, {
        lastUpdate: timestamp,          // ⚠️ Triggers onDocumentWritten
        lastSubStatements: lastSubStatements
    });
});
```

**Impact**:
- 376 unnecessary function calls (75.4% of total)
- Peak of 79 requests/second
- Wasted compute resources and potential cost overruns

---

### Issue #2: Misleading Function Name 🏷️

**File**: `functions/src/index.ts:262-267`

```typescript
exports.updateNumberOfMembers = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentWritten,
  onNewSubscription,  // ⚠️ Actually handles waiting role notifications!
  "updateNumberOfMembers"
);
```

**Problem**:
- Function name suggests it updates member counts
- Actually handles awaiting user notifications
- Makes debugging confusing

**Actual Behavior**: When a subscription is created/updated with `role: waiting`, it:
1. Finds all admins of the top parent statement
2. Creates `awaitingUsers` entries for each admin
3. Has nothing to do with "number of members"

---

### Issue #3: N×M Admin Notification Pattern 📈

**File**: `functions/src/fn_subscriptions.ts:133-141`

```typescript
adminsSubscriptions.forEach((adminSub: StatementSubscription) => {
    const adminRef = collectionRef.doc(getRandomUID());
    const adminCall = {
        ...subscription,
        adminId: adminSub.userId,
    };
    batch.set(adminRef, adminCall);
});
```

**Problem**: For N waiting users and M admins = N×M database writes

**Example**:
- Popular statement with 10 admins
- 7 users request membership
- = 70 `awaitingUsers` entries created
- = 70+ function invocations

---

### Issue #4: No Loop Prevention 🔁

**File**: `functions/src/fn_subscriptions.ts:24-148`

The function triggers on **ALL** subscription updates (`onDocumentWritten`), including:
- Metadata-only changes (lastUpdate, lastSubStatements)
- Changes made by other functions
- No event source detection

**Result**: Functions trigger each other in a loop.

---

## 📋 Fix Plan

### Phase 1: Stop the Cascade Loop (HIGH PRIORITY) 🚨

**Estimated Time**: 2-3 hours
**Risk**: Low (defensive programming)

#### Fix 1.1: Add Event Source Detection

**File**: `functions/src/fn_subscriptions.ts`
**Location**: `onNewSubscription` function (line 24)

**Add this check at the start**:

```typescript
export async function onNewSubscription(
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined>
) {
    try {
        if (!event.data) throw new Error('No event data found');

        const isCreate = !event.data.before.exists;
        const snapshot = event.data.after;

        if (!snapshot.exists)
            throw new Error('No snapshot found in onNewSubscription');

        // ✅ NEW: Skip if only metadata changed (prevents cascade)
        if (!isCreate && event.data.before.exists) {
            const before = event.data.before.data();
            const after = snapshot.data();

            if (before && after) {
                // Check if only metadata fields changed
                const beforeCopy = { ...before };
                const afterCopy = { ...after };

                // Remove metadata fields that other functions update
                delete beforeCopy.lastUpdate;
                delete beforeCopy.lastSubStatements;
                delete afterCopy.lastUpdate;
                delete afterCopy.lastSubStatements;

                // If nothing else changed, skip
                if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
                    logger.info('Skipping - only metadata updated (preventing cascade)');
                    return;
                }
            }
        }

        // ... rest of function continues as before
```

**Why This Works**:
- Compares before/after states
- Ignores metadata-only changes
- Only processes actual role/subscription changes
- Prevents the cascade loop

**Expected Reduction**: ~300 function calls eliminated (80% reduction)

---

#### Fix 1.2: Add Circuit Breaker for Admin Count

**File**: `functions/src/fn_subscriptions.ts`
**Location**: After fetching admins (line 97)

```typescript
const adminsDB = await db
    .collection(Collections.statementsSubscribe)
    .where('statementId', '==', topParentId)
    .where('role', '==', Role.admin)
    .get();

// ✅ NEW: Circuit breaker for excessive admins
if (adminsDB.size > 50) {
    logger.error(
        `CIRCUIT BREAKER: Refusing to process ${adminsDB.size} admins for statement ${topParentId}. ` +
        `This indicates a potential issue with admin inheritance or a malicious action.`
    );
    return;
}

if (adminsDB.empty) {
    logger.error(`No admins found for statement ${topParentId}`);
    throw new Error('No admins found');
}
```

**Why This Matters**:
- Prevents runaway notification creation
- Protects against admin proliferation bugs
- Safety net for the N×M multiplication issue

**Threshold Rationale**:
- Normal statements have 1-10 admins
- 50 is generous safety limit
- Prevents 50+ awaiting entries per waiting user

---

### Phase 2: Improve Naming & Clarity (MEDIUM PRIORITY) 📝

**Estimated Time**: 1 hour
**Risk**: Low (rename only)

#### Fix 2.1: Rename Function

**File**: `functions/src/index.ts:262-267`

```typescript
// ❌ BEFORE
exports.updateNumberOfMembers = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentWritten,
  onNewSubscription,
  "updateNumberOfMembers"
);

// ✅ AFTER
exports.handleWaitingRoleSubscriptions = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentWritten,
  onNewSubscription,
  "handleWaitingRoleSubscriptions"
);
```

**Update Firebase Function Name**:
```bash
# Deploy with new name
firebase deploy --only functions:handleWaitingRoleSubscriptions

# After verification, delete old function
firebase functions:delete updateNumberOfMembers
```

**Why This Matters**:
- Clear intent for debugging
- Accurate logging/monitoring
- Easier for new developers

---

### Phase 3: Optimize Admin Notifications (LOW PRIORITY) ⚡

**Estimated Time**: 3-4 hours
**Risk**: Medium (data model change)

#### Fix 3.1: Batch Admin Notifications

**File**: `functions/src/fn_subscriptions.ts:133-141`

**Current Approach** (N×M entries):
```typescript
// Creates separate document for each admin
adminsSubscriptions.forEach((adminSub: StatementSubscription) => {
    const adminRef = collectionRef.doc(getRandomUID());
    batch.set(adminRef, { ...subscription, adminId: adminSub.userId });
});
```

**Optimized Approach** (N entries with admin arrays):
```typescript
// Create ONE entry with array of admin IDs
const awaitingEntry = {
    statementsSubscribeId: subscriptionId,
    statementId: statement.statementId,
    statement: statement,
    user: subscription.user,
    userId: subscription.userId,
    role: subscription.role,
    adminIds: adminsSubscriptions.map(admin => admin.userId), // ✅ Array
    createdAt: Date.now(),
    lastUpdate: Date.now()
};

const ref = collectionRef.doc(subscriptionId); // Use subscription ID as key
batch.set(ref, awaitingEntry);
```

**Benefits**:
- Reduces writes from N×M to N
- Example: 7 waiting users × 10 admins = 70 writes → 7 writes (90% reduction)
- Easier to manage (one document per waiting user)
- Simpler queries for admins

**Migration Required**:
- Update client-side queries for `awaitingUsers` collection
- Update admin dashboard to handle `adminIds` array
- Consider backward compatibility or one-time migration

---

### Phase 4: Monitoring & Validation (ONGOING) 📊

#### Fix 4.1: Add Performance Logging

**File**: `functions/src/fn_subscriptions.ts`

Add timing metrics:

```typescript
export async function onNewSubscription(
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined>
) {
    const startTime = Date.now();
    const eventType = !event.data?.before.exists ? 'create' : 'update';

    try {
        // ... existing logic ...

        const duration = Date.now() - startTime;
        logger.info(`onNewSubscription completed in ${duration}ms (${eventType})`);

        // Alert if taking too long
        if (duration > 2000) {
            logger.warn(`Slow execution: ${duration}ms for ${eventType}`);
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`onNewSubscription failed after ${duration}ms (${eventType})`, error);
        return;
    }
}
```

#### Fix 4.2: Add Metrics Dashboard

Create a Cloud Function to analyze patterns:

```typescript
// New file: functions/src/fn_metrics.ts
export const analyzeSubscriptionPatterns = onRequest(async (req, res) => {
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);

    // Query firestore for subscription changes
    const changes = await db
        .collection(Collections.statementsSubscribe)
        .where('lastUpdate', '>=', last24Hours)
        .get();

    // Analyze patterns
    const metadataOnly = changes.docs.filter(/* check if metadata only */);
    const roleChanges = changes.docs.filter(/* check if role changed */);

    res.json({
        total: changes.size,
        metadataOnly: metadataOnly.length,
        roleChanges: roleChanges.length,
        cascadeRatio: (metadataOnly.length / changes.size * 100).toFixed(1) + '%'
    });
});
```

---

## 🧪 Testing Plan

### Test 1: Verify Cascade Prevention

**Steps**:
1. Deploy Fix 1.1 (event source detection)
2. Create a test statement with 5 subscribers
3. Update the parent statement (trigger cascade)
4. Check logs for "Skipping - only metadata updated"
5. Verify `onNewSubscription` NOT called for metadata updates

**Expected Result**: Function calls reduced by ~80%

---

### Test 2: Verify Circuit Breaker

**Steps**:
1. Deploy Fix 1.2 (circuit breaker)
2. Create a test statement with >50 admin subscriptions
3. Have a user request membership (role: waiting)
4. Check logs for "CIRCUIT BREAKER" message
5. Verify no `awaitingUsers` entries created

**Expected Result**: Function returns early, no explosion of entries

---

### Test 3: Load Test After Fixes

**Steps**:
1. Deploy all Phase 1 fixes
2. Simulate 70 concurrent users with activity:
   - 20 vote on statements
   - 10 create new comments
   - 5 request membership
3. Monitor Firebase Functions dashboard
4. Download logs and analyze

**Success Criteria**:
- Peak requests/second < 10 (down from 79)
- `handleWaitingRoleSubscriptions` < 50 calls (down from 376)
- No cascade loops detected
- All legitimate role changes processed

---

## 📈 Expected Impact

### Before Fixes
- **Total function calls**: 500 in 2 minutes
- **updateNumberOfMembers calls**: 376 (75.4%)
- **Peak rate**: 79 requests/second
- **Cost impact**: High (unnecessary compute)

### After Phase 1 Fixes
- **Expected total calls**: ~150 in 2 minutes (70% reduction)
- **handleWaitingRoleSubscriptions calls**: ~50-75 (80% reduction)
- **Peak rate**: ~10-15 requests/second (81% reduction)
- **Cost impact**: Significantly reduced

### After All Fixes
- **Expected total calls**: ~100 in 2 minutes (80% reduction)
- **Function calls**: Only for actual changes
- **Peak rate**: ~5-10 requests/second (87% reduction)
- **Cost impact**: Minimal, only for real user actions

---

## 🚀 Implementation Priority

| Phase | Priority | Estimated Time | Risk | Impact |
|-------|----------|----------------|------|--------|
| Phase 1.1 | 🔴 HIGH | 2 hours | Low | -80% calls |
| Phase 1.2 | 🔴 HIGH | 1 hour | Low | Safety net |
| Phase 2.1 | 🟡 MEDIUM | 1 hour | Low | Clarity |
| Phase 3.1 | 🟢 LOW | 4 hours | Medium | -90% writes |
| Phase 4 | 🔵 ONGOING | - | Low | Visibility |

**Recommended Approach**:
1. Implement Phase 1 immediately (critical)
2. Test thoroughly with load testing
3. Monitor for 1-2 days
4. Implement Phase 2 for clarity
5. Consider Phase 3 if write costs are concern

---

## 📝 Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Add event source detection to `onNewSubscription`
- [ ] Add circuit breaker for admin count
- [ ] Write unit tests for new logic
- [ ] Deploy to test environment
- [ ] Load test with 70 simulated users
- [ ] Monitor logs for cascade prevention
- [ ] Deploy to production
- [ ] Monitor production for 24 hours

### Phase 2: Naming
- [ ] Rename function in `index.ts`
- [ ] Update any client references (if any)
- [ ] Deploy new function
- [ ] Verify new function works
- [ ] Delete old function
- [ ] Update documentation

### Phase 3: Optimization
- [ ] Design new `awaitingUsers` schema
- [ ] Update client-side queries
- [ ] Update admin dashboard
- [ ] Write migration script (if needed)
- [ ] Test with staging data
- [ ] Deploy incrementally
- [ ] Monitor query performance

### Phase 4: Monitoring
- [ ] Add performance logging
- [ ] Create metrics dashboard
- [ ] Set up alerts for anomalies
- [ ] Regular log analysis

---

## 🔗 Related Files

- `functions/src/fn_subscriptions.ts` - Main issue location
- `functions/src/fn_statement_updates.ts` - Triggers cascade
- `functions/src/index.ts` - Function registration
- `functions/src/fn_statementsMetaData.ts` - Member count logic

---

## 📚 Additional Notes

### Why This Wasn't Caught Earlier

1. **Function naming**: "updateNumberOfMembers" suggested counter logic, not notification logic
2. **Firestore triggers**: `onDocumentWritten` fires for ALL writes, including metadata
3. **Distributed system**: Cascade effects not visible in single-function testing
4. **Log volume**: Issue only apparent with concurrent users

### Prevention for Future

1. **Function naming**: Use descriptive names that match actual behavior
2. **Event filtering**: Always filter metadata-only changes in triggers
3. **Circuit breakers**: Add safety limits for batch operations
4. **Load testing**: Test with realistic concurrent user scenarios
5. **Monitoring**: Set up alerts for function call spikes

---

## ✅ Success Metrics

After implementing fixes, success is:
- ✅ Function calls reduced by 70-80%
- ✅ No cascade loops in logs
- ✅ Peak requests/second < 15
- ✅ All legitimate role changes processed
- ✅ Circuit breaker never triggered in normal operation
- ✅ Function costs reduced proportionally

---

**Document Version**: 1.0
**Last Updated**: October 30, 2025
**Author**: Claude Code Analysis
**Review Status**: Pending Implementation
