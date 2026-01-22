# In-App Notifications Refactoring Plan

## Executive Summary
Refactor the in-app notification system to ensure both NotificationBtn (header) and StatementChatMore components display accurate unread message counts throughout the application.

## Current State

### Two Notification Display Contexts

#### 1. NotificationBtn (Global Header)
- **Location**: `src/view/components/notificationBtn/NotificationBtn.tsx`
- **Used in**: `HomeHeader.tsx`
- **Scope**: ALL notifications across the entire app
- **Current Filter**: Only excludes current user's notifications
- **Purpose**: Global notification center

#### 2. StatementChatMore (Statement-Specific)
- **Location**: `src/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore.tsx`
- **Used in**: Statement cards throughout the app
- **Scope**: Notifications for a specific statement only
- **Current Filter**: `parentId === statement.statementId` (this is correct and intentional)
- **Purpose**: Shows activity for specific discussions

## Current Issues

### 1. Read/Unread Status Tracking
- **Problem**: No "read" status tracking in the notification model
- **Impact**: Both components show ALL notifications (including already-seen ones) instead of just unread
- **Current State**: `NotificationType` lacks read/unread tracking

### 2. Notification Count Accuracy
- **Problem**: Both components show total count, not unread count
- **Impact**: Users see inflated numbers that don't reflect actual new content
- **Examples**:
  - Header shows "15" even if user has seen 14 of them
  - Statement shows "3" even after user has read the messages

### 3. Lack of Synchronization
- **Problem**: No mechanism to mark notifications as read
- **Impact**: Notification counts never decrease, causing notification fatigue

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

### Phase 3: Component Refactoring

#### 3.1 StatementChatMore Component (Statement-Specific)
```typescript
const StatementChatMore: FC<Props> = ({ statement, onlyCircle, useLink = true }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const creator = useSelector(creatorSelector);
  
  // Get unread count for this specific statement only
  const unreadCount = useSelector(state => 
    unreadCountForStatementSelector(state, statement.statementId)
  );
  
  // Track when user clicks to view
  const handleClick = () => {
    if (useLink) {
      // Mark notifications for this statement as read when navigating
      dispatch(markStatementNotificationsAsRead(statement.statementId));
      navigate(`/statement/${statement.statementId}/chat`);
    }
  };
  
  // Only show badge if there are unread notifications
  if (unreadCount === 0 && onlyCircle) return null;
  
  return (
    <button onClick={handleClick} className={styles.statementChatMore}>
      <div className={styles.icon}>
        {unreadCount > 0 && (
          <div className={styles.blueCircle}>
            {unreadCount < 10 ? unreadCount : '9+'}
          </div>
        )}
        {!onlyCircle && <ChatIcon />}
      </div>
    </button>
  );
};
```

#### 3.2 NotificationBtn Component (Global Header)
```typescript
const NotificationBtn: FC = () => {
  const dispatch = useDispatch();
  const creator = useSelector(creatorSelector);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Get ALL unread notifications count (excluding user's own)
  const unreadCount = useSelector(state => {
    const notifications = state.notifications.inAppNotifications;
    return notifications.filter(n => 
      n.creatorId !== creator?.uid && 
      !n.read
    ).length;
  });
  
  // Get all notifications for dropdown (both read and unread)
  const allNotifications = useSelector(inAppNotificationsSelector)
    .filter(n => n.creatorId !== creator?.uid);
  
  const handleClick = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown) {
      // Mark notifications as "viewed in list" after a delay
      setTimeout(() => {
        dispatch(markNotificationsAsViewedInList());
      }, 2000);
    }
  };
  
  return (
    <button onClick={handleClick} className={styles.notificationBtn}>
      <div className={styles.icon}>
        {unreadCount > 0 && (
          <div className={styles.redCircle}>
            {unreadCount < 10 ? unreadCount : '9+'}
          </div>
        )}
      </div>
      <MailIcon />
      {showDropdown && (
        <InAppNotifications 
          notifications={allNotifications}
          onNotificationClick={(notificationId) => {
            dispatch(markNotificationAsRead(notificationId));
          }}
        />
      )}
    </button>
  );
};
```

### Phase 4: Notification Marking Strategy

#### 4.1 Different Marking Contexts

##### For StatementChatMore (Statement-Specific)
1. **Mark as Read When**:
   - User clicks StatementChatMore button → navigates to chat
   - User is viewing the chat page for that statement
   - User scrolls through messages in that statement's chat
   
2. **Scope**: Only marks notifications where `parentId === statement.statementId`

##### For NotificationBtn (Global Header)
1. **Mark as Viewed When**:
   - User opens the dropdown (mark as "viewed in list" after 2 seconds)
   - User clicks on a specific notification card
   
2. **Mark as Read When**:
   - User clicks on notification → navigates to content
   
3. **Scope**: Can mark any/all notifications

##### Synchronization
- When notifications are marked as read in StatementChatMore, the count in NotificationBtn should also update
- When user marks all as read from NotificationBtn, all StatementChatMore badges should clear

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

#### StatementChatMore Tests
```typescript
describe('StatementChatMore', () => {
  it('should show unread count only for its specific statement', () => {
    // Test filtering by parentId === statement.statementId
  });
  
  it('should exclude current user notifications', () => {
    // Test creatorId !== currentUser filter
  });
  
  it('should mark only statement-specific notifications as read on click', () => {
    // Test that only relevant notifications are marked
  });
});
```

#### NotificationBtn Tests
```typescript
describe('NotificationBtn', () => {
  it('should show total unread count across all statements', () => {
    // Test global unread count
  });
  
  it('should update count when notifications are marked as read elsewhere', () => {
    // Test synchronization with StatementChatMore actions
  });
  
  it('should mark notifications as viewed when dropdown opens', () => {
    // Test dropdown viewing behavior
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

## Key Differences Between Components

| Aspect | NotificationBtn (Header) | StatementChatMore |
|--------|-------------------------|-------------------|
| **Scope** | All notifications globally | Single statement only |
| **Filter** | `creatorId !== currentUser` | `parentId === statementId && creatorId !== currentUser` |
| **Purpose** | Global activity indicator | Statement-specific activity |
| **Badge Color** | Red (global alerts) | Blue (discussion activity) |
| **Click Action** | Opens dropdown list | Navigates to statement chat |
| **Mark as Read** | Individual or bulk | Statement-specific batch |

## Implementation Priority

1. **Phase 1**: Add read/unread field to NotificationType
2. **Phase 2**: Update Redux to track read status
3. **Phase 3**: Refactor NotificationBtn to show only unread count
4. **Phase 4**: Refactor StatementChatMore to show only unread count  
5. **Phase 5**: Implement marking mechanisms
6. **Phase 6**: Add synchronization between components
7. **Phase 7**: Testing and refinement

## Conclusion

This refactoring will significantly improve the notification system by:
1. **Providing accurate unread counts** in both global header and statement-specific contexts
2. **Properly tracking read status** with synchronization between components
3. **Maintaining clear separation** between global and statement-specific notifications
4. **Reducing notification fatigue** by showing only truly new content
5. **Setting foundation** for future notification features

The phased approach ensures minimal disruption while delivering incremental improvements to both NotificationBtn and StatementChatMore components.