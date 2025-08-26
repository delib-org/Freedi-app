# In-App Notifications Refactoring Plan

## Executive Summary
Refactor the in-app notification system to ensure StatementChatMore component displays accurate unread message counts across all instances in the application.

## Current Issues

### 1. Notification Filtering Logic
- **Problem**: Current implementation only filters by `parentId === statement.statementId`
- **Impact**: May miss nested replies or related notifications
- **Location**: `StatementChatMore.tsx` lines 34-39

### 2. Read/Unread Status
- **Problem**: No clear "read" status tracking in the notification model
- **Impact**: All notifications appear as "new" even after being viewed
- **Current State**: `NotificationType` doesn't have a reliable read tracking mechanism

### 3. Notification Count Accuracy
- **Problem**: Count shows all notifications, not just unread ones
- **Impact**: Users see inflated numbers that don't reflect actual new content

## Proposed Solution

### Phase 1: Enhanced Data Model

#### 1.1 Update NotificationType Interface
```typescript
interface NotificationType {
  // ... existing fields
  read: boolean;
  readAt?: Date | Timestamp;
  viewedInList?: boolean; // Seen in notification dropdown
  viewedInContext?: boolean; // Seen in actual chat/statement
}
```

#### 1.2 Add Read Status Collection
Create a new Firestore collection `notificationReadStatus`:
```typescript
interface NotificationReadStatus {
  userId: string;
  notificationId: string;
  statementId: string;
  readAt: Timestamp;
  readContext: 'list' | 'chat' | 'statement';
}
```

### Phase 2: Redux State Enhancement

#### 2.1 Update Redux Slice
```typescript
// notificationsSlice.ts
interface NotificationsState {
  inAppNotifications: NotificationType[];
  readStatus: Record<string, boolean>; // notificationId -> read status
  unreadCountByStatement: Record<string, number>; // statementId -> count
}
```

#### 2.2 Add New Actions
- `markNotificationAsRead(notificationId)`
- `markStatementNotificationsAsRead(statementId)`
- `updateUnreadCounts()`

#### 2.3 Add Memoized Selectors
```typescript
// Get unread count for specific statement
export const unreadCountForStatementSelector = createSelector(
  [inAppNotificationsSelector, (state, statementId) => statementId],
  (notifications, statementId) => 
    notifications.filter(n => 
      n.parentId === statementId && 
      !n.read && 
      n.creatorId !== currentUserId
    ).length
);
```

### Phase 3: StatementChatMore Component Refactor

#### 3.1 Enhanced Component Logic
```typescript
const StatementChatMore: FC<Props> = ({ statement, onlyCircle, useLink = true }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const creator = useSelector(creatorSelector);
  
  // Use memoized selector for unread count
  const unreadCount = useSelector(state => 
    unreadCountForStatementSelector(state, statement.statementId)
  );
  
  // Track when user clicks to view
  const handleClick = () => {
    if (useLink) {
      // Mark notifications as "viewed in list" when navigating
      dispatch(markStatementNotificationsAsViewed(statement.statementId));
      navigate(`/statement/${statement.statementId}/chat`);
    }
  };
  
  // Only show badge if there are unread notifications
  if (unreadCount === 0 && onlyCircle) return null;
  
  return (
    <button onClick={handleClick} className={styles.statementChatMore}>
      <div className={styles.icon}>
        {unreadCount > 0 && (
          <div className={styles.redCircle}>
            {unreadCount < 10 ? unreadCount : '9+'}
          </div>
        )}
        {!onlyCircle && <ChatIcon />}
      </div>
    </button>
  );
};
```

### Phase 4: Notification Marking Strategy

#### 4.1 Auto-Mark as Read Triggers
1. **In Chat View**: Mark all notifications for that statement as read when:
   - User opens the chat page
   - User scrolls to bottom of chat
   - Chat window gains focus

2. **In Notification Dropdown**: Mark as "viewed in list" when:
   - User opens the notification dropdown
   - Individual notification is visible for > 2 seconds

3. **On Navigation**: Mark as read when:
   - User clicks on a notification card
   - User navigates directly to statement

#### 4.2 Implementation Hooks
```typescript
// useMarkNotificationsAsRead.ts
export const useMarkNotificationsAsRead = (statementId: string) => {
  const dispatch = useDispatch();
  
  useEffect(() => {
    // Mark as read after a short delay
    const timer = setTimeout(() => {
      dispatch(markStatementNotificationsAsRead(statementId));
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [statementId]);
};
```

### Phase 5: Database Operations

#### 5.1 Firestore Functions
```typescript
// db_inAppNotifications.ts
export async function markNotificationsAsRead(
  userId: string, 
  notificationIds: string[]
): Promise<void> {
  const batch = writeBatch(DB);
  
  notificationIds.forEach(id => {
    const ref = doc(DB, Collections.inAppNotifications, id);
    batch.update(ref, {
      read: true,
      readAt: serverTimestamp()
    });
  });
  
  await batch.commit();
}
```

#### 5.2 Real-time Listener Updates
```typescript
export function listenToInAppNotifications(): Unsubscribe {
  // ... existing code
  
  return onSnapshot(q, (snapshot) => {
    const notifications: NotificationType[] = [];
    const unreadCounts: Record<string, number> = {};
    
    snapshot.forEach((doc) => {
      const notification = doc.data() as NotificationType;
      notifications.push(notification);
      
      // Track unread counts by statement
      if (!notification.read) {
        const statementId = notification.parentId;
        unreadCounts[statementId] = (unreadCounts[statementId] || 0) + 1;
      }
    });
    
    // Dispatch both notifications and counts
    store.dispatch(setInAppNotificationsWithCounts({
      notifications,
      unreadCounts
    }));
  });
}
```

### Phase 6: UI/UX Improvements

#### 6.1 Visual Indicators
- **Unread**: Blue badge with white number
- **Read but new**: Subtle gray badge
- **No new**: No badge shown

#### 6.2 Animation Effects
```scss
.redCircle {
  // ... existing styles
  
  // Pulse animation for new notifications
  &.new {
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
}
```

#### 6.3 Notification Grouping
- Group notifications by statement
- Show summary count at parent level
- Expand to show individual notifications

### Phase 7: Performance Optimizations

#### 7.1 Memoization
- Use `useMemo` for expensive filtering operations
- Implement `reselect` for Redux selectors
- Cache notification counts in local state

#### 7.2 Batch Operations
- Batch read status updates
- Debounce notification marking
- Implement virtual scrolling for large notification lists

#### 7.3 Query Optimization
```typescript
// Only fetch unread notifications initially
const q = query(
  inAppNotificationsRef,
  where("userId", '==', user.uid),
  where("read", "==", false),
  orderBy("createdAt", "desc"),
  limit(50)
);
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Update data models and interfaces
- [ ] Enhance Redux slice with read status
- [ ] Create database migration for existing notifications

### Week 2: Core Features  
- [ ] Implement mark as read functionality
- [ ] Update StatementChatMore component
- [ ] Add read status tracking

### Week 3: UI/UX
- [ ] Add visual indicators for read/unread
- [ ] Implement animations
- [ ] Test across all component instances

### Week 4: Optimization & Testing
- [ ] Performance optimizations
- [ ] End-to-end testing
- [ ] Bug fixes and refinements

## Testing Strategy

### Unit Tests
```typescript
describe('StatementChatMore', () => {
  it('should show correct unread count', () => {
    // Test unread count calculation
  });
  
  it('should mark notifications as read on click', () => {
    // Test read marking behavior
  });
  
  it('should not show badge for read notifications', () => {
    // Test badge visibility logic
  });
});
```

### Integration Tests
- Test notification flow from creation to read
- Verify real-time updates across components
- Test multi-device synchronization

### E2E Tests
- User receives notification → sees badge → clicks → badge disappears
- Multiple users in same statement → correct counts for each
- Notification persistence across sessions

## Migration Plan

### Step 1: Add read field to existing notifications
```typescript
// Migration script
async function migrateNotifications() {
  const batch = writeBatch(DB);
  const notifications = await getDocs(collection(DB, Collections.inAppNotifications));
  
  notifications.forEach(doc => {
    batch.update(doc.ref, {
      read: false,
      readAt: null
    });
  });
  
  await batch.commit();
}
```

### Step 2: Deploy in stages
1. Deploy backend changes
2. Deploy read tracking without UI changes
3. Deploy UI updates
4. Monitor and adjust

## Success Metrics

### Quantitative
- Notification click-through rate increase by 20%
- Reduce "phantom" notification complaints by 90%
- Page load time remains under 2s with notifications

### Qualitative
- Users report accurate notification counts
- Clear understanding of what's new vs. already seen
- Improved engagement with statement discussions

## Risk Mitigation

### Performance Risks
- **Risk**: Too many Firestore reads/writes
- **Mitigation**: Implement caching and batch operations

### Data Consistency
- **Risk**: Read status out of sync across devices
- **Mitigation**: Use Firestore transactions for critical updates

### User Experience
- **Risk**: Users miss notifications due to auto-marking
- **Mitigation**: Implement smart marking with delays and visibility checks

## Alternative Approaches Considered

### 1. Local Storage Only
- **Pros**: No server costs, fast
- **Cons**: No cross-device sync, data loss risk
- **Decision**: Rejected for lack of persistence

### 2. Separate Read Status Service
- **Pros**: Decoupled, scalable
- **Cons**: Additional complexity, latency
- **Decision**: Deferred to future if needed

### 3. Mark All as Read Button
- **Pros**: Simple, user control
- **Cons**: Requires manual action
- **Decision**: Include as supplementary feature

## Conclusion

This refactoring will significantly improve the notification system by:
1. Providing accurate unread counts
2. Tracking read status properly
3. Improving user experience across all StatementChatMore instances
4. Setting foundation for future notification features

The phased approach ensures minimal disruption while delivering incremental improvements.