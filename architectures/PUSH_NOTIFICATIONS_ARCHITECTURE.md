# Push Notifications Architecture

## Overview

The Freedi app implements a multi-channel notification system that delivers real-time updates to users when new statements/replies are created in subscribed discussions. The system supports:

- **Push Notifications (FCM)**: Browser push via Firebase Cloud Messaging
- **In-App Notifications**: Real-time Firestore-synced notification feed
- **Email Notifications**: Backend capability (UI not fully implemented)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER CREATES STATEMENT                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FIRESTORE TRIGGER                                    │
│                    (onCreate: statements collection)                         │
│                                                                              │
│  functions/src/fn_notifications.ts                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│   IN-APP CHANNEL     │   │    PUSH CHANNEL      │   │   EMAIL CHANNEL      │
│                      │   │       (FCM)          │   │                      │
│ • Create document in │   │ • Fetch FCM tokens   │   │ • (Backend ready,    │
│   inAppNotifications │   │ • Validate tokens    │   │    UI not impl.)     │
│ • Batch write        │   │ • Send via FCM       │   │                      │
│                      │   │ • Remove invalid     │   │                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
              │                         │
              ▼                         ▼
┌──────────────────────┐   ┌──────────────────────┐
│   CLIENT: REDUX      │   │  CLIENT: SERVICE     │
│                      │   │      WORKER          │
│ • Real-time sync     │   │                      │
│ • Badge counter      │   │ • Background msg     │
│ • Notification feed  │   │ • Notification click │
│                      │   │ • Deep linking       │
└──────────────────────┘   └──────────────────────┘
```

---

## Core Components

### 1. Client-Side Services

| File | Purpose |
|------|---------|
| `src/services/notificationService.ts` | Main singleton orchestrator for all notification operations |
| `src/services/pushService.ts` | FCM initialization, token management, foreground listeners |
| `src/services/platformService.ts` | Browser capability detection (iOS, Android, PWA) |
| `src/services/notificationRepository.ts` | Firestore CRUD for tokens and subscriptions |
| `public/firebase-messaging-sw.js` | Service worker for background notifications |

### 2. Server-Side Functions

| File | Purpose |
|------|---------|
| `functions/src/fn_notifications.ts` | Firestore trigger that processes and sends notifications |

### 3. React Hooks & Components

| File | Purpose |
|------|---------|
| `src/controllers/hooks/useNotifications.ts` | Main React hook for notification state |
| `src/view/pages/statement/hooks/useNotificationSetup.ts` | Auto-initialization hook |
| `src/view/components/notifications/NotificationPrompt.tsx` | Permission request UI |
| `src/view/components/notifications/NotificationSubscriptionButton.tsx` | Per-statement toggle |
| `src/view/components/notifications/NotificationPreferences.tsx` | Settings panel |

---

## Database Schema

### Collection: `statementsSubscribe`

**Primary subscription storage with multi-device token support**

```typescript
// Document ID: ${userId}--${statementId}
interface StatementSubscription {
  userId: string;
  statementId: string;
  user: {
    uid: string;
    displayName: string;
    photoURL: string;
  };

  // Notification Preferences
  getInAppNotification: boolean;    // Default: true
  getPushNotification: boolean;     // Default: false
  getEmailNotification: boolean;    // Default: false

  // Multi-Device Token Storage
  tokens?: string[];                // Array of FCM tokens (one per device)

  // Metadata
  createdAt: number;                // Milliseconds
  lastUpdate: number;               // Milliseconds
  lastReadTimestamp?: number;
  lastTokenUpdate?: number;

  // Role/Status
  role: 'creator' | 'admin' | 'facilitator' | 'member' | 'waiting';
}
```

### Collection: `pushNotifications`

**Token metadata tracking**

```typescript
// Document ID: FCM token string
interface TokenMetadata {
  token: string;
  userId: string;
  platform: 'ios' | 'android' | 'web';

  lastUpdate: Timestamp;
  lastRefresh: Timestamp;

  deviceInfo: {
    userAgent: string;
    language: string;
  };
}
```

### Collection: `inAppNotifications`

**Real-time notification feed per user**

```typescript
interface InAppNotification {
  userId: string;
  parentId: string;
  statementId: string;

  // Content
  text: string;
  creatorId: string;
  creatorName: string;
  creatorImage: string;

  // Metadata
  createdAt: Timestamp;
  notificationId: string;
  read: boolean;
  readAt?: Timestamp;
  viewedInList: boolean;
  viewedInContext: boolean;

  // Context
  parentStatement: string;
  questionType: string;
  statementType: string;
}
```

### Collection: `askedToBeNotified` (DEPRECATED)

**Legacy token storage - being phased out**

```typescript
// Document ID: ${token}_${statementId}
// New code should use statementsSubscribe.tokens[] instead
```

---

## Flow Diagrams

### A. Permission Request & Token Generation

```
User Opens App
       │
       ▼
┌──────────────────────────────┐
│  NotificationService.init()  │
│  src/services/notificationService.ts:initialize()
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│   Platform Detection         │
│   platformService.ts         │
│   • isNotificationSupported  │
│   • isFirebaseMessaging...   │
│   • isIOSWebPushSupported    │
└──────────────────────────────┘
       │
       ├─────────── iOS ─────────────────► In-App Only (FCM disabled)
       │
       ▼ Desktop/Android
┌──────────────────────────────┐
│   Register Service Worker    │
│   firebase-messaging-sw.js   │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Request Browser Permission  │
│  Notification.requestPerm()  │
└──────────────────────────────┘
       │
       ├─── denied ──────────────────────► Log, continue without push
       │
       ▼ granted
┌──────────────────────────────┐
│   Generate FCM Token         │
│   getToken({ vapidKey })     │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│   Store Token Metadata       │
│   pushNotifications/{token}  │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│   Sync with Subscriptions    │
│   Add token to all user's    │
│   statementsSubscribe docs   │
└──────────────────────────────┘
```

### B. Statement Subscription

```
User Clicks "Subscribe" Button
       │
       ▼
┌──────────────────────────────────────────────────┐
│  NotificationSubscriptionButton.tsx              │
│  handleSubscribe()                               │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  notificationService.registerForStatement()      │
│  src/services/notificationService.ts             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Create/Update statementsSubscribe document      │
│  Document ID: ${userId}--${statementId}          │
│                                                  │
│  {                                               │
│    userId, statementId, user,                    │
│    getInAppNotification: true,                   │
│    getPushNotification: true,                    │
│    tokens: [currentDeviceToken]                  │
│  }                                               │
└──────────────────────────────────────────────────┘
```

### C. Notification Sending (Backend)

```
New Statement Created in Firestore
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Firestore onCreate Trigger                      │
│  functions/src/fn_notifications.ts               │
│  updateInAppNotifications()                      │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Parallel Queries:                               │
│  1. In-app subscribers (getInApp... = true)      │
│  2. Push subscribers (getPush... = true)         │
│  3. Parent statement doc                         │
│  4. All ancestor statement subscribers           │
└──────────────────────────────────────────────────┘
       │
       ├────────────────────────┬────────────────────────┐
       ▼                        ▼                        │
┌─────────────────────┐  ┌─────────────────────┐        │
│ IN-APP PROCESSING   │  │   FCM PROCESSING    │        │
│                     │  │                     │        │
│ processInAppNotif() │  │ processFcmNotif...()│        │
│                     │  │                     │        │
│ • Batch create docs │  │ • Extract tokens    │        │
│   in inAppNotif...  │  │ • Validate tokens   │        │
│ • Per-subscriber    │  │ • Send via FCM      │        │
│   entry             │  │ • Batch of 500      │        │
│                     │  │ • 50ms delay each   │        │
│                     │  │ • Remove invalid    │        │
└─────────────────────┘  └─────────────────────┘        │
                                │                        │
                                ▼                        │
                    ┌───────────────────────┐            │
                    │   FCM Send Result     │            │
                    │                       │            │
                    │ Success: delivered    │            │
                    │ Error: retry (3x) or  │            │
                    │        remove token   │            │
                    └───────────────────────┘            │
                                                         │
                                  ▼──────────────────────┘
                    ┌───────────────────────┐
                    │   Token Cleanup       │
                    │                       │
                    │ Remove invalid tokens:│
                    │ • not-registered      │
                    │ • invalid-token       │
                    │ • invalid-argument    │
                    └───────────────────────┘
```

### D. Client Notification Receipt

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FOREGROUND (App Open)                            │
│                                                                     │
│  pushService.ts: onMessage(messaging, callback)                     │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  Play notification sound                │                       │
│  │  /assets/sounds/bell.mp3                │                       │
│  └─────────────────────────────────────────┘                       │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  Show browser notification              │                       │
│  │  new Notification(title, options)       │                       │
│  └─────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND (App Closed)                          │
│                                                                     │
│  firebase-messaging-sw.js                                           │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  messaging.onBackgroundMessage()        │                       │
│  │  self.registration.showNotification()   │                       │
│  └─────────────────────────────────────────┘                       │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  User clicks notification               │                       │
│  │  notificationclick event handler        │                       │
│  └─────────────────────────────────────────┘                       │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  Deep link to statement page            │                       │
│  │  /statement/${parentId}                 │                       │
│  └─────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Platform Support Matrix

| Platform | Push (FCM) | In-App | Notes |
|----------|------------|--------|-------|
| Chrome Desktop | ✅ Full | ✅ Full | Best experience |
| Firefox Desktop | ✅ Full | ✅ Full | Best experience |
| Edge Desktop | ✅ Full | ✅ Full | Best experience |
| Safari Desktop | ⚠️ Limited | ✅ Full | Some FCM limitations |
| Chrome Android | ✅ Full | ✅ Full | Best mobile experience |
| iOS Safari | ❌ Disabled | ✅ Full | FCM deliberately disabled |
| iOS PWA 16.4+ | ❌ Not Impl. | ✅ Full | Could be enabled in future |

### iOS Strategy

FCM is deliberately disabled on iOS in `platformService.ts:isFirebaseMessagingSupported()` because:
1. iOS Web Push requires PWA installation on iOS 16.4+
2. Complex user flow for limited benefit
3. In-app notifications provide adequate fallback

---

## Token Lifecycle

### Token Generation
```
1. Service worker registration
2. Browser permission granted
3. FCM getToken() with VAPID key
4. Token stored in pushNotifications collection
5. Token synced to all user's statementsSubscribe docs
```

### Token Refresh (30 days)
```typescript
// pushService.ts
const TOKEN_REFRESH_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days

// Checked on app load:
if (Date.now() - lastRefresh > TOKEN_REFRESH_INTERVAL) {
  getOrRefreshToken(userId, true); // forceRefresh = true
}
```

### Token Invalidation
```
Server detects invalid token during send:
  • messaging/registration-token-not-registered
  • messaging/invalid-registration-token
  • messaging/invalid-argument

Actions:
  1. Remove from askedToBeNotified collection
  2. Remove from pushNotifications collection
  3. (Should also remove from statementsSubscribe.tokens[])
```

---

## Notification Payload Structure

### FCM Message (Server → Client)

```typescript
{
  token: string,
  notification: {
    title: `New reply from ${creatorDisplayName}`,
    body: statement.substring(0, 100) + '...'
  },
  data: {
    statementId: string,
    parentId: string,
    createdAt: string,
    notificationType: 'statement_reply'
  }
}
```

### Service Worker Display Options

```typescript
{
  body: payload.notification.body,
  icon: '/icons/logo-192px.png',
  badge: '/icons/logo-48px.png',
  tag: `statement-${parentId}`,      // Prevents duplicates
  data: payload.data,
  requireInteraction: true,          // Won't auto-dismiss
  vibrate: [100, 50, 100, 50, 100],
  actions: [
    { action: 'open', title: 'View' },
    { action: 'dismiss', title: 'Dismiss' }
  ]
}
```

---

## Redux State Management

### Slice: `notificationsSlice`

```typescript
// src/redux/notificationsSlice/notificationsSlice.ts

interface NotificationsState {
  inAppNotifications: NotificationType[];
}

// Selectors
inAppNotificationsSelector(state)                    // All notifications
unreadNotificationsSelector(state)                   // Only unread
totalUnreadCountSelector(state)                      // Count
unreadNotificationsForStatementSelector(state, id)   // By statement

// Actions
setInAppNotificationsAll(notifications)
setInAppNotification(notification)
deleteInAppNotification(id)
markNotificationAsRead(id)
markNotificationsAsRead(ids[])
markStatementNotificationsAsRead(statementId)
markNotificationsAsViewedInList(ids[])
markAllNotificationsAsRead()
```

### Real-time Sync

```typescript
// src/controllers/db/inAppNotifications/db_inAppNotifications.ts

listenToInAppNotifications(): Unsubscribe
// Query: where("userId", "==", uid) orderBy("createdAt", "desc") limit(100)
// Updates Redux on every Firestore change
```

---

## Debugging Tools

All available in browser console:

```javascript
// Comprehensive diagnostic
window.comprehensiveNotificationDebug()

// Status checks
window.checkNotificationStatus()
window.notificationStatus()
window.refreshNotificationToken()

// Monitoring
window.monitorNotifications()          // Live message logging
window.monitorPushEvents()             // SW push events

// Testing
window.testNotification()              // Send test notification
window.debugGroupNotifications(id)     // Check subscription

// Service Worker
window.debugServiceWorkerScopes()
window.fixChromeServiceWorker()

// Cross-browser
window.compareBrowserTokens()
```

---

## Configuration

### Environment Variables

```bash
# Required for FCM
VITE_FIREBASE_VAPID_KEY=your-vapid-key-here

# Firebase project config (standard)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### VAPID Key Requirements
- Minimum 65 characters
- Cannot be placeholder: 'your-vapid-key', 'undefined', 'null'
- Generate via Firebase Console → Project Settings → Cloud Messaging

---

## Known Issues & Limitations

### Current Issues

1. **Token Cleanup Gap**: When tokens are invalidated server-side, they're removed from `askedToBeNotified` and `pushNotifications` but NOT from `statementsSubscribe.tokens[]`

2. **Legacy Collection**: `askedToBeNotified` is deprecated but still used by backend; migration incomplete

3. **iOS Disabled**: Web Push could work on iOS 16.4+ PWA but is deliberately disabled

4. **No Offline Queue**: If notification send fails due to network, no retry queue exists

### Performance Considerations

- FCM sends are batched in groups of 500 (FCM limit)
- 50ms delay between sends to avoid rate limiting
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- In-app notifications limited to 100 most recent

---

## Improvement Recommendations

### High Priority

1. **Complete Token Sync**: Remove invalid tokens from `statementsSubscribe.tokens[]` when detected server-side

2. **Migrate from Legacy Collection**: Complete migration from `askedToBeNotified` to `statementsSubscribe.tokens[]`

3. **Add Token Cleanup Job**: Scheduled function to clean stale tokens (> 60 days unused)

### Medium Priority

4. **Enable iOS PWA Push**: Implement Web Push for iOS 16.4+ when installed as PWA

5. **Add Analytics**: Track notification delivery rates, click rates, opt-out rates

6. **Implement Email Channel**: Backend is ready; add UI for email notification preferences

### Low Priority

7. **Rich Notifications**: Add images, action buttons for web push

8. **Notification Grouping**: Group multiple notifications from same discussion

9. **Quiet Hours**: User preference for notification timing

---

## File Reference

### Client-Side
```
src/services/
├── notificationService.ts       # Main singleton orchestrator
├── pushService.ts               # FCM setup and token management
├── platformService.ts           # Browser capability detection
└── notificationRepository.ts    # Firestore operations

src/controllers/
├── hooks/useNotifications.ts    # Main React hook
└── db/inAppNotifications/       # In-app notification DB operations

src/view/components/notifications/
├── NotificationPrompt.tsx       # Permission request UI
├── NotificationSubscriptionButton.tsx
├── NotificationPreferences.tsx
├── NotificationSettingsButton.tsx
└── FCMTokenDisplay.tsx          # Debug display

src/redux/notificationsSlice/
└── notificationsSlice.ts        # Redux state management

public/
└── firebase-messaging-sw.js     # Service worker
```

### Server-Side
```
functions/src/
└── fn_notifications.ts          # Firestore trigger and FCM sending
```

---

## Summary

The Freedi push notification system is a production-ready, multi-channel notification architecture that:

- Uses Firebase Cloud Messaging for browser push notifications
- Maintains real-time in-app notification feed via Firestore
- Supports multi-device token synchronization
- Provides graceful fallbacks for unsupported platforms (iOS)
- Includes comprehensive debugging utilities

The architecture follows a clean separation of concerns with singleton services, repository pattern for data access, and React hooks for UI integration. The backend uses Firestore triggers for event-driven notification delivery with robust error handling and token validation.

Key areas for improvement include completing the migration from legacy token storage, adding token cleanup jobs, and potentially enabling iOS PWA push notifications.
