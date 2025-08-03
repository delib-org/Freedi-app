# Function Cascade Issue Tracker

## Problem Summary
When a single operation occurs (e.g., adding an option to a question), it triggers a cascade of function executions, causing performance issues and unnecessary database operations. A single option creation triggered 16 function executions.

## Issue Analysis

### Current Cascade Flow
```
User adds option to question
    ↓
Creates new statement document
    ↓
Triggers 6 initial functions:
    - updateInAppNotifications
    - addOptionToMassConsensus
    - updateParentStatementOnChildChange (1st time)
    - updateChosenOptionsOnOptionCreate
    - setAdminsToNewStatement
    - updateNumberOfMembers
    ↓
These functions modify documents
    ↓
Document modifications trigger more functions:
    - updateSubscriptionsSimpleStatement (3x)
    - updateParentStatementOnChildChange (3x more)
    - updateOptionInMassConsensus (3x)
```

### Root Causes

1. **Overly Broad Triggers**
   - `onDocumentWritten` triggers on ANY change (create/update/delete)
   - Functions re-trigger when they update their own watched documents

2. **Redundant Operations**
   - Multiple functions update subscriptions independently
   - Parent updates trigger even for non-significant changes

3. **Missing Guards**
   - No checks for actual field changes
   - No deduplication of operations

4. **Exponential Admin Creation**
   - `setAdminsToNewStatement` creates subscriptions for ALL parent admins
   - Can create hundreds of subscriptions for deeply nested statements

## Affected Functions

### High Priority (Most Problematic)
- [ ] `updateParentStatementOnChildChange` - Triggers 4x for one operation
- [ ] `updateSubscriptionsSimpleStatement` - Triggers 3x, updates ALL subscriptions
- [ ] `updateOptionInMassConsensus` - Triggers 3x on every update
- [ ] `setAdminsToNewStatement` - Creates exponential admin subscriptions

### Medium Priority
- [ ] `updateInAppNotifications` - May send duplicate notifications
- [ ] `addOptionToMassConsensus` - Needs better guards
- [ ] `updateNumberOfMembers` - Minor redundancy

## Proposed Solutions

### 1. Change Trigger Types
- [ ] Change `onDocumentWritten` → `onDocumentCreated` where appropriate
- [ ] Use `onDocumentUpdated` only for actual updates needed
- [ ] Add field-specific change detection

### 2. Add Smart Guards
- [ ] Check if fields actually changed before processing
- [ ] Implement debouncing for rapid updates
- [ ] Add circuit breakers for cascade detection

### 3. Consolidate Operations
- [ ] Merge subscription update logic into single function
- [ ] Batch related operations together
- [ ] Use transactions for atomic updates

### 4. Optimize Specific Functions

#### updateParentStatementOnChildChange
- [ ] Only trigger on creation or significant content changes
- [ ] Skip if parent was recently updated (debounce)
- [ ] Limit subscription updates to direct parent only

#### updateSubscriptionsSimpleStatement
- [ ] Add batching with reasonable limits (e.g., 50 at a time)
- [ ] Only update if statement/description actually changed
- [ ] Consider async processing for large subscription counts

#### setAdminsToNewStatement
- [ ] Limit admin propagation depth
- [ ] Only add creator as admin, not all parent admins
- [ ] Make admin inheritance optional

#### updateOptionInMassConsensus
- [ ] Only trigger when mass consensus fields change
- [ ] Add field-specific checks

## Implementation Plan

### Phase 1: Quick Wins (Immediate)
1. [ ] Add field change guards to prevent unnecessary executions
2. [ ] Change trigger types from `onDocumentWritten` to specific triggers
3. [ ] Add logging to track cascade patterns

### Phase 2: Structural Improvements (This Week)
1. [ ] Consolidate subscription update logic
2. [ ] Implement batching for large operations
3. [ ] Add debouncing for parent updates

### Phase 3: Long-term Optimization (Next Sprint)
1. [ ] Redesign admin propagation system
2. [ ] Implement async processing with Cloud Tasks
3. [ ] Add comprehensive cascade detection and prevention

## Testing Strategy

### Test Scenarios
1. [ ] Create single option - should trigger ≤6 functions
2. [ ] Update statement text - should update subscriptions once
3. [ ] Create nested statement - should not create exponential admins
4. [ ] Bulk operations - should handle gracefully with batching

### Performance Metrics
- Target: Reduce function executions by 70%
- Target: Reduce subscription update time by 50%
- Target: Eliminate redundant operations

## Progress Tracking

### Completed
- [x] Identified cascade patterns
- [x] Analyzed function triggers
- [x] Documented root causes

### In Progress
- [ ] Creating field change guards
- [ ] Updating trigger types

### Next Steps
1. Implement quick wins from Phase 1
2. Test each change in isolation
3. Monitor function execution counts
4. Iterate based on results

## Notes
- Branch: `fix/subscription-cascade-performance2`
- Related commits: 02ff9a09, a30c5f1b, 88d4a8d9
- Testing environment: Development Firebase project