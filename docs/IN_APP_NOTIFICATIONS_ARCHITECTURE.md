# In-App Notifications Architecture Documentation

## Overview

The Freedi app implements a comprehensive notification system that includes both in-app notifications and push notifications. This document provides a detailed technical overview of the notification architecture for developers.

## System Components

### 1. Data Models

#### NotificationType (`src/types/notification/Notification.ts`)
Core notification data structure:
```typescript
{
  userId: string          // Recipient user ID
  parentId: string        // Parent statement ID
  parentStatement?: string // Optional parent statement text
  text: string           // Notification content
  creatorName: string    // Name of action creator
  creatorImage?: string  // Creator's avatar URL
  createdAt: number      // Timestamp
  read: boolean          // Read status
  notificationId: string // Unique identifier
}
```

### 2. State Management

#### Redux Store (`src/redux/notificationsSlice/notificationsSlice.ts`)
- **State Structure:**
  - `inAppNotifications`: Array of NotificationType objects
- **Actions:**
  - `setInAppNotificationsAll`: Replace entire notification list
  - `setInAppNotifications`: Update multiple notifications (merge)
  - `setInAppNotification`: Update single notification
  - `deleteInAppNotification`: Remove by notification ID
  - `deleteInAppNotificationsByParentId`: Bulk delete by parent statement
- **Selectors:**
  - `inAppNotificationsSelector`: Get all notifications
  - `inAppNotificationsCountSelectorForStatement`: Count by statement ID

### 3. Database Layer

#### Firestore Integration (`src/controllers/db/inAppNotifications/db_inAppNotifications.ts`)
- **Collection:** `inAppNotifications`
- **Real-time Listener:** `listenToInAppNotifications()`
  - Queries user's notifications
  - Orders by creation date (newest first)
  - Limits to 100 most recent
  - Auto-updates Redux store on changes
- **Cleanup:** `clearInAppNotifications(statementId)`
  - Deletes all notifications for a specific statement
  - Used when user views/interacts with statement

### 4. UI Components

#### NotificationBtn (`src/view/components/notificationBtn/NotificationBtn.tsx`)
- Main notification bell icon in UI
- Shows unread count badge (9+ for >9 notifications)
- Toggle dropdown with notification list
- Filters out self-generated notifications
- Click-outside handler to close dropdown

#### InAppNotifications (`src/view/components/inAppNotifications/InAppNotifications.tsx`)
- Container for notification list
- Renders NotificationCard components
- Shows "no notifications" message when empty
- Filters notifications from current user

#### NotificationCard (`src/view/components/notificationCard/NotificationCard.tsx`)
- Individual notification display
- Shows creator avatar, name, and message
- Links to relevant statement/chat
- Smart routing based on notification type:
  - Chat messages → `/statement-screen/{id}/chat`
  - Mass consensus → `/statement/{id}`
  - Other → `/statement/{statementId}`

### 5. Notification Services

#### NotificationService (`src/services/notificationService.ts`)
Singleton service managing push notifications:
- **Browser Support Detection**
- **FCM Token Management**
  - Token generation and refresh (30-day cycle)
  - Token storage in Firestore
  - Device metadata tracking
- **Permission Handling**
  - Safe permission checks
  - Graceful degradation for unsupported browsers
- **Message Handling**
  - Foreground message processing
  - Background message delegation to service worker

#### Service Worker (`public/firebase-messaging-sw.js`)
Background notification handling:
- **Push Event Interception**
- **Badge Management** (IndexedDB persistence)
- **Notification Display**
  - Custom icons and badges
  - Action buttons
  - Sound playback triggers
- **Click Handling**
  - URL navigation
  - Client focus/open logic
- **Multi-environment Configuration**
  - Domain-based Firebase config selection
  - Support for dev/test/prod environments

### 6. Hooks

#### useNotifications (`src/controllers/hooks/useNotifications.ts`)
Primary hook for notification features:
- **State Management:**
  - Permission status
  - Loading state
  - FCM token
  - Browser support flags
- **Methods:**
  - `requestPermission()`: Request browser permission
  - `sendTestNotification()`: Debug/test notifications
  - `clearNotifications()`: Clear all displayed notifications
  - `playNotificationSound()`: Audio feedback
- **Auto-initialization** on auth state changes
- **Service Worker Message Handling**

### 7. Backend Functions

#### Cloud Functions (`functions/src/fn_notifications.ts`)
Server-side notification creation:
- **updateInAppNotifications()**
  - Triggered on new statement creation
  - Creates notifications for subscribed users
  - Handles nested reply notifications
  - Supports multi-level subscription hierarchy
- **Push Notification Dispatch**
  - Token validation
  - Batch sending with retry logic
  - Invalid token cleanup
  - Multi-language support

## Data Flow

### In-App Notification Flow

1. **Action Trigger**: User creates statement/reply
2. **Cloud Function**: `updateInAppNotifications` triggered
3. **Subscription Check**: Query subscribed users
4. **Notification Creation**: Batch create in Firestore
5. **Real-time Sync**: Firestore listeners update client
6. **Redux Update**: Store receives new notifications
7. **UI Update**: Components re-render with new data
8. **User Interaction**: Click navigates to relevant content
9. **Cleanup**: Notifications cleared on view

### Push Notification Flow

1. **Permission Request**: User grants notification permission
2. **Token Generation**: FCM creates device token
3. **Token Storage**: Save to Firestore with metadata
4. **Subscription Update**: Link token to subscriptions
5. **Event Trigger**: New content created
6. **Server Dispatch**: Cloud Function sends FCM message
7. **Service Worker**: Receives and displays notification
8. **User Click**: Opens app to relevant content
9. **Token Refresh**: Periodic token renewal (30 days)

## Subscription Management

### StatementSubscription Model
```typescript
{
  user: Creator
  userId: string
  statementId: string
  statement: Statement
  role: Role
  getInAppNotification: boolean
  getEmailNotification: boolean
  getPushNotification: boolean
  fcmTokens?: string[]
  lastUpdate: number
  createdAt: number
}
```

### Subscription Operations
- **Creation**: Auto-subscribe on statement interaction
- **Token Management**: Add/remove FCM tokens
- **Preference Updates**: Toggle notification types
- **Cascading**: Parent statement subscribers notified of replies

## Security & Permissions

### Firestore Rules
- Users can only read their own notifications
- Notifications created server-side only (Cloud Functions)
- Subscription management requires authentication
- Token storage requires user match

### Browser Permissions
- Graceful degradation for unsupported browsers
- Permission state persistence
- Re-request capability after denial
- iOS Safari special handling

## Performance Optimizations

1. **Pagination**: 100 notification limit
2. **Selective Updates**: Only changed notifications updated
3. **Debounced Listeners**: Prevent excessive re-renders
4. **Token Caching**: 30-day refresh cycle
5. **Lazy Initialization**: Services created on-demand
6. **Batch Operations**: Bulk notification creation/deletion

## Testing & Debugging

### Test Utilities
- `sendTestNotification()`: Manual notification trigger
- `NotificationTester` component: UI testing interface
- Debug logging throughout service layer
- Service Worker message inspection

### Common Issues & Solutions

1. **Notifications Not Appearing**
   - Check browser permissions
   - Verify service worker registration
   - Confirm FCM token generation
   - Review Firestore rules

2. **Missing In-App Notifications**
   - Verify subscription exists
   - Check user authentication
   - Confirm listener attachment
   - Review Redux state updates

3. **Token Refresh Failures**
   - Check network connectivity
   - Verify Firebase configuration
   - Review token metadata
   - Clear browser storage

## Development Guidelines

### Adding New Notification Types
1. Update `NotificationType` schema
2. Modify Cloud Function logic
3. Update routing in `NotificationCard`
4. Add translation keys
5. Test across environments

### Best Practices
- Always filter self-notifications
- Handle browser incompatibility gracefully
- Maintain token hygiene (cleanup invalid)
- Use type-safe schemas (Valibot)
- Log errors with context
- Test on multiple browsers/devices

## Environment Configuration

### Firebase Projects
- **Development**: synthesistalyaron
- **Test**: freedi-test
- **Production**: TBD

### Environment Variables
- `VITE_FIREBASE_VAPID_KEY`: FCM VAPID key
- Firebase config per environment
- Domain-based config selection

## Future Enhancements

1. **Notification Grouping**: Aggregate similar notifications
2. **Priority Levels**: Urgent vs. normal notifications
3. **Custom Sounds**: Per notification type
4. **Rich Media**: Image/video in notifications
5. **Offline Queue**: Store notifications for offline users
6. **Analytics**: Track engagement metrics
7. **Scheduled Notifications**: Time-based delivery
8. **Notification Templates**: Customizable message formats

## Related Documentation

- [NOTIFICATIONS.md](/docs/NOTIFICATIONS.md) - User-facing notification guide
- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)