# Main Card Update Visibility Issue

## Problem Summary
After implementing the cascade optimizations, users can now only see top-level updates in the main card on the home page, but cannot see root/parent updates. This breaks the user's ability to track updates from their subscribed statements' sub-statements.

## Issue Description

### Current Behavior
- Main card shows updates only from the exact statements user is subscribed to
- Updates from child statements are NOT visible in parent subscription cards
- Users miss important updates happening in sub-statements

### Expected Behavior
- Users subscribed to a parent statement should see updates from all child statements
- Main card should aggregate updates from the entire statement tree
- Updates should bubble up from children to parents

## Root Cause Analysis
The optimization in `updateParentStatementOnChildChange` now only updates direct parents with `lastSubStatements`, but this information isn't properly propagated to the main card view.

## Affected Components

### Backend Functions
- `updateParentStatementOnChildChange` / `updateParentOnChildCreate` - Updates parent with child info
- `updateParentSubscriptions` - Updates subscriptions with lastSubStatements
- Subscription update logic

### Frontend Components
- `/src/view/pages/home/main/mainCard/MainCard.tsx`
- `/src/view/pages/home/main/mainCard/updateMainCard/UpdateMainCard.tsx`
- `/src/services/subscriptionManager.ts`
- `/src/view/pages/home/main/HomeMain.tsx`

## Proposed Solution

### Option 1: Enhance Subscription Updates (Recommended)
- Modify subscription documents to include aggregated child updates
- Update `updateParentSubscriptions` to include recent activity from entire subtree
- Add a `recentChildActivity` field to track updates across the hierarchy

### Option 2: Frontend Aggregation
- Query child statements when displaying main cards
- Aggregate updates on the client side
- More complex but gives real-time accuracy

### Option 3: Hybrid Approach
- Store last N updates from children in parent subscription
- Frontend can query for more details if needed
- Balance between performance and completeness

## Implementation Plan

### Phase 1: Analysis
1. [ ] Analyze current subscription update structure
2. [ ] Review MainCard component data requirements
3. [ ] Document the update propagation flow

### Phase 2: Backend Changes
1. [ ] Modify subscription schema to include child updates
2. [ ] Update `updateParentSubscriptions` to aggregate child activity
3. [ ] Add timestamp tracking for update hierarchy

### Phase 3: Frontend Changes
1. [ ] Update MainCard to display child updates
2. [ ] Modify UpdateMainCard component to show update source
3. [ ] Add UI indicators for update types (direct vs child)

### Phase 4: Testing
1. [ ] Test update visibility across statement hierarchy
2. [ ] Verify performance with deep nesting
3. [ ] Ensure no cascade issues return

## Technical Details

### Current Data Structure
```typescript
// Subscription document
{
  statementId: string,
  userId: string,
  lastUpdate: number,
  lastSubStatements: SimpleStatement[], // Only shows direct children
  statement: SimpleStatement
}
```

### Proposed Enhancement
```typescript
// Enhanced subscription document
{
  statementId: string,
  userId: string,
  lastUpdate: number,
  lastSubStatements: SimpleStatement[],
  recentChildActivity: {
    updates: Array<{
      statementId: string,
      statement: string,
      timestamp: number,
      depth: number, // How deep in hierarchy
      type: 'direct' | 'child' | 'grandchild'
    }>,
    lastActivityTimestamp: number
  },
  statement: SimpleStatement
}
```

## Success Criteria
1. Users can see updates from all child statements in parent subscription cards
2. Update source is clearly indicated (direct vs inherited)
3. Performance remains acceptable (no cascade issues)
4. Updates are timely and accurate

## Risks & Mitigation
- **Risk**: Reintroducing cascade issues
  - **Mitigation**: Careful implementation with guards and limits
- **Risk**: Performance degradation with deep hierarchies
  - **Mitigation**: Limit update depth and use pagination
- **Risk**: Confusing UI with too many updates
  - **Mitigation**: Smart filtering and grouping of updates

## Notes
- This issue was discovered after fixing the cascade problem
- Need to balance visibility with performance
- Consider user preferences for update depth

---

# Trello Ticket Template

## Title
Fix Main Card Update Visibility - Show Child Statement Updates in Parent Cards

## Description
After the cascade optimization, users subscribed to parent statements can no longer see updates from child statements in their main cards. This breaks the update tracking functionality for hierarchical statements.

### Problem
- Users only see top-level updates in main cards
- Child statement updates are not visible to parent subscribers
- Important updates are being missed

### Acceptance Criteria
- [ ] Users subscribed to parent statements see child updates
- [ ] Update source is clearly indicated in the UI
- [ ] Performance remains acceptable (no cascade issues)
- [ ] Updates aggregate properly across the hierarchy

## Labels
- Bug
- High Priority
- Frontend
- Backend
- UX

## Story Points
8 (Complex - requires backend and frontend changes)

## Sprint
Next Sprint

## Checklist
- [ ] Analyze current update propagation
- [ ] Design solution approach
- [ ] Implement backend changes
- [ ] Implement frontend changes
- [ ] Test with various hierarchy depths
- [ ] Verify no performance regression
- [ ] Update documentation

## Dependencies
- Cascade optimization completion (DONE)
- Understanding of current subscription model

## Technical Notes
See: `/claude/updates/MAIN_CARD_UPDATE_VISIBILITY_ISSUE.md`