# In-App Notifications Implementation Steps

## Current Status
✅ **Completed**: Updated delib-npm package with new NotificationType schema including:
- `read: boolean`
- `readAt?: number`
- `viewedInList?: boolean`
- `viewedInContext?: boolean`
- `NotificationReadStatusType` for tracking

## Phase 1: Redux State Updates

### 1.1 Update notificationsSlice.ts
Add new actions and selectors for read/unread functionality:

```typescript
// New actions needed:
- markNotificationAsRead(notificationId)
- markNotificationsAsRead(notificationIds[])
- markStatementNotificationsAsRead(statementId)
- markNotificationsAsViewedInList(notificationIds[])
- resetUnreadStatus() // For testing

// New selectors needed:
- selectUnreadNotifications
- selectUnreadCountTotal
- selectUnreadCountByStatement(statementId)
```

### 1.2 Update Redux State Interface
```typescript
interface NotificationsState {
  inAppNotifications: NotificationType[];
  // Optional: Add cache for performance
  unreadCountCache?: Record<string, number>;
}
```

## Phase 2: Database Migration

### 2.1 Create Migration Script
Create a one-time script to update existing notifications:

```typescript
// migrations/updateNotificationReadStatus.ts
async function migrateExistingNotifications() {
  // Set all existing notifications as read: false
  // Set readAt: null
  // Set viewedInList: false
  // Set viewedInContext: false
}
```

### 2.2 Update Firebase Function
Update `fn_notifications.ts` to set new notifications with:
- `read: false`
- `viewedInList: false`
- `viewedInContext: false`

## Phase 3: Component Updates

### 3.1 Update StatementChatMore
```typescript
// Changes needed:
1. Filter notifications by read === false
2. Add dispatch to mark as read on click
3. Update selector to use unread count
```

### 3.2 Update NotificationBtn
```typescript
// Changes needed:
1. Show only unread count in badge
2. Mark as viewed when dropdown opens
3. Add "Mark all as read" button
```

### 3.3 Update InAppNotifications Component
```typescript
// Changes needed:
1. Visual indicator for read vs unread
2. Click handler to mark individual as read
3. Auto-mark as viewed after delay
```

## Phase 4: Database Operations

### 4.1 Create New Functions in db_inAppNotifications.ts
```typescript
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<void>

export async function markMultipleNotificationsAsRead(
  notificationIds: string[],
  userId: string
): Promise<void>

export async function markStatementNotificationsAsRead(
  statementId: string,
  userId: string
): Promise<void>

export async function markNotificationsAsViewed(
  notificationIds: string[],
  userId: string,
  viewContext: 'list' | 'context'
): Promise<void>
```

## Phase 5: Hooks and Utilities

### 5.1 Create useMarkAsRead Hook
```typescript
// hooks/useMarkNotificationsAsRead.ts
export function useMarkNotificationsAsRead(statementId?: string) {
  // Auto-mark notifications as read when viewing
  // Handle cleanup on unmount
}
```

### 5.2 Create Notification Utils
```typescript
// utils/notificationUtils.ts
export function filterUnreadNotifications(
  notifications: NotificationType[],
  userId: string
): NotificationType[]

export function countUnreadByStatement(
  notifications: NotificationType[],
  statementId: string,
  userId: string
): number
```

## Phase 6: Testing

### 6.1 Test Scenarios
- [ ] New notification appears as unread
- [ ] Clicking StatementChatMore marks as read
- [ ] Opening NotificationBtn dropdown marks as viewed
- [ ] Counts update in real-time
- [ ] Synchronization between components
- [ ] Multi-device sync

### 6.2 Edge Cases
- [ ] User with 0 unread notifications
- [ ] User with 100+ unread notifications
- [ ] Rapid clicking/marking
- [ ] Offline/online transitions

## Implementation Order

### Week 1: Backend & State
1. Update Redux slice with new actions/selectors
2. Create database operation functions
3. Run migration script on existing data
4. Update Firebase function for new notifications

### Week 2: Component Updates
1. Update StatementChatMore with unread filtering
2. Update NotificationBtn with unread count
3. Add visual indicators for read/unread
4. Implement marking mechanisms

### Week 3: Polish & Testing
1. Add "Mark all as read" feature
2. Implement auto-marking with delays
3. Test all scenarios
4. Fix edge cases

### Week 4: Deployment
1. Deploy to test environment
2. Monitor for issues
3. Deploy to production
4. Monitor metrics

## Code Examples

### Example: Updated StatementChatMore
```typescript
const StatementChatMore: FC<Props> = ({ statement, onlyCircle, useLink = true }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const creator = useSelector(creatorSelector);
  
  // Get only UNREAD notifications for this statement
  const notifications = useSelector(inAppNotificationsSelector);
  const unreadCount = notifications.filter(n => 
    n.parentId === statement.statementId &&
    n.creatorId !== creator?.uid &&
    !n.read  // NEW: Only count unread
  ).length;
  
  const handleClick = () => {
    if (useLink) {
      // NEW: Mark notifications as read for this statement
      dispatch(markStatementNotificationsAsRead(statement.statementId));
      navigate(`/statement/${statement.statementId}/chat`);
    }
  };
  
  // Don't show badge if no unread notifications
  if (unreadCount === 0) return onlyCircle ? null : <ChatIcon />;
  
  return (
    <button onClick={handleClick} className={styles.statementChatMore}>
      <div className={styles.icon}>
        <div className={styles.blueCircle}>
          {unreadCount < 10 ? unreadCount : '9+'}
        </div>
        {!onlyCircle && <ChatIcon />}
      </div>
    </button>
  );
};
```

### Example: Updated NotificationBtn
```typescript
const NotificationBtn = () => {
  const dispatch = useDispatch();
  const creator = useSelector(creatorSelector);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Get ALL notifications
  const allNotifications = useSelector(inAppNotificationsSelector)
    .filter(n => n.creatorId !== creator?.uid);
  
  // Count only UNREAD
  const unreadCount = allNotifications.filter(n => !n.read).length;
  
  const handleShowNotifications = () => {
    setShowDropdown(!showDropdown);
    
    // Mark as viewed after 2 seconds
    if (!showDropdown && unreadCount > 0) {
      setTimeout(() => {
        const unreadIds = allNotifications
          .filter(n => !n.read)
          .map(n => n.notificationId);
        dispatch(markNotificationsAsViewedInList(unreadIds));
      }, 2000);
    }
  };
  
  return (
    <button onClick={handleShowNotifications} className={styles.notificationBtn}>
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
          onMarkAsRead={(id) => dispatch(markNotificationAsRead(id))}
          onMarkAllAsRead={() => dispatch(markAllNotificationsAsRead())}
        />
      )}
    </button>
  );
};
```

## Success Metrics

### Quantitative
- Notification badge shows 0 after viewing all content
- Click-through rate increases by 20%
- User complaints about "phantom notifications" drop to near 0

### Qualitative
- Users understand what's new vs already seen
- Clear visual distinction between read/unread
- Smooth real-time updates

## Notes

- The `read` field is the primary indicator
- `viewedInList` and `viewedInContext` are for analytics/future features
- Always filter by `creatorId !== currentUser` to exclude own notifications
- Batch operations when possible to reduce Firestore writes