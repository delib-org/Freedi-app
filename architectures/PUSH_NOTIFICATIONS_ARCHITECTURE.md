# Push Notifications Architecture

## Overview

The Wizcol app implements a comprehensive multi-channel notification system that delivers real-time updates to users when new statements/replies are created in subscribed discussions. The system supports:

- **Push Notifications (FCM)**: Browser push via Firebase Cloud Messaging with rich notifications
- **In-App Notifications**: Real-time Firestore-synced notification feed
- **Email Notifications**: Backend capability with UI preferences
- **Notification Grouping**: Smart grouping of multiple replies from same discussion
- **Quiet Hours**: User preference to pause notifications during specified times
- **Analytics Tracking**: Comprehensive event tracking for notification lifecycle

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
│ • Create document in │   │ • Fetch FCM tokens   │   │ • Backend ready      │
│   inAppNotifications │   │ • Validate tokens    │   │ • UI preferences     │
│ • Batch write        │   │ • Filter quiet hours │   │   available          │
│                      │   │ • Send via FCM       │   │                      │
│                      │   │ • Rich notifications │   │                      │
│                      │   │ • Remove invalid     │   │                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
              │                         │
              ▼                         ▼
┌──────────────────────┐   ┌──────────────────────┐
│   CLIENT: REDUX      │   │  CLIENT: SERVICE     │
│                      │   │      WORKER          │
│ • Real-time sync     │   │                      │
│ • Badge counter      │   │ • Background msg     │
│ • Notification feed  │   │ • Notification group │
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
| `src/services/notificationRepository.ts` | Firestore CRUD for tokens, subscriptions, and quiet hours |
| `src/services/notificationAnalytics.ts` | Firebase Analytics event tracking |
| `public/firebase-messaging-sw.js` | Service worker for background notifications and grouping |

### 2. Server-Side Functions

| File | Purpose |
|------|---------|
| `functions/src/fn_notifications.ts` | Firestore trigger that processes and sends notifications |
| `functions/src/fn_tokenCleanup.ts` | Scheduled job to clean stale tokens (60+ days) |

### 3. React Hooks & Components

| File | Purpose |
|------|---------|
| `src/controllers/hooks/useNotifications.ts` | Main React hook for notification state |
| `src/view/pages/statement/hooks/useNotificationSetup.ts` | Auto-initialization hook |
| `src/view/components/notifications/NotificationPrompt.tsx` | Permission request UI with iOS guidance |
| `src/view/components/notifications/NotificationSubscriptionButton.tsx` | Per-statement toggle |
| `src/view/components/notifications/NotificationPreferences.tsx` | Settings panel |
| `src/view/components/notifications/QuietHoursSettings.tsx` | Quiet hours configuration UI |

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

**Token metadata tracking with quiet hours**

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

  // Quiet Hours Configuration
  quietHours?: {
    enabled: boolean;
    startTime: string;    // HH:mm format (e.g., "22:00")
    endTime: string;      // HH:mm format (e.g., "08:00")
    timezone: string;     // IANA timezone (e.g., "America/New_York")
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

**Legacy token storage - maintained for backward compatibility during migration**

```typescript
// Document ID: ${token}_${statementId}
// New code uses statementsSubscribe.tokens[] instead
// Will be phased out after migration complete
```

---

## Features

### Rich Notifications

Push notifications include enhanced features:

```typescript
// FCM Message Payload (Server)
{
  token: subscriber.token,
  notification: {
    title: `New reply from ${creatorName}`,
    body: statementPreview,
    image: creatorPhoto,  // Creator's profile photo
  },
  data: {
    statementId: string,
    parentId: string,
    url: `/statement/${parentId}?focusId=${statementId}`,
    tag: `discussion-${parentId}`,  // For grouping
    openActionTitle: 'View Reply',
    creatorName: string,
    requireInteraction: 'true',
  },
  // Platform-specific options
  webpush: {
    headers: { Urgency: 'high' },
    fcmOptions: { link: notificationUrl },
  },
  android: {
    priority: 'high',
    notification: {
      channelId: 'freedi_replies',
      tag: notificationTag,
      clickAction: 'OPEN_DISCUSSION',
    },
  },
  apns: {
    headers: { 'apns-priority': '10' },
    payload: { aps: { 'mutable-content': 1, sound: 'default' } },
  },
}
```

### Notification Grouping

Multiple notifications from the same discussion are grouped:

```javascript
// Service Worker (firebase-messaging-sw.js)
if (notificationTag.startsWith('discussion-')) {
  const existingNotifications = await self.registration.getNotifications({
    tag: notificationTag
  });

  if (existingNotifications.length > 0) {
    const totalReplies = existingNotifications.length + 1;
    groupedTitle = `${totalReplies} new replies in discussion`;
    groupedBody = `${creatorName} and ${totalReplies - 1} others replied`;
  }
}
```

### Quiet Hours

Users can configure quiet hours to pause push notifications:

```typescript
// Configuration stored in pushNotifications collection
interface QuietHoursConfig {
  enabled: boolean;
  startTime: string;    // "22:00" (10 PM)
  endTime: string;      // "08:00" (8 AM)
  timezone: string;     // "America/New_York"
}

// Server-side filtering before sending
async function filterByQuietHours(subscribers: FcmSubscriber[]): Promise<FcmSubscriber[]> {
  // Fetch quiet hours config for each user
  // Filter out users currently in quiet hours
  // Return only users who should receive notifications
}
```

### Analytics Tracking

Comprehensive event tracking for notification lifecycle:

```typescript
// src/services/notificationAnalytics.ts
enum NotificationEventType {
  // Permission events
  PERMISSION_REQUESTED = 'notification_permission_requested',
  PERMISSION_GRANTED = 'notification_permission_granted',
  PERMISSION_DENIED = 'notification_permission_denied',

  // Token events
  TOKEN_GENERATED = 'notification_token_generated',
  TOKEN_REFRESHED = 'notification_token_refreshed',
  TOKEN_DELETED = 'notification_token_deleted',
  TOKEN_INVALID = 'notification_token_invalid',

  // Subscription events
  SUBSCRIPTION_CREATED = 'notification_subscription_created',
  SUBSCRIPTION_REMOVED = 'notification_subscription_removed',
  SUBSCRIPTION_PUSH_ENABLED = 'notification_push_enabled',
  SUBSCRIPTION_PUSH_DISABLED = 'notification_push_disabled',

  // Notification events
  NOTIFICATION_RECEIVED = 'notification_received',
  NOTIFICATION_CLICKED = 'notification_clicked',
  NOTIFICATION_DISMISSED = 'notification_dismissed',

  // iOS-specific events
  IOS_PWA_INSTALL_PROMPT_SHOWN = 'ios_pwa_install_prompt_shown',
  IOS_UNSUPPORTED_PROMPT_SHOWN = 'ios_unsupported_prompt_shown',

  // Error events
  NOTIFICATION_ERROR = 'notification_error',
}
```

### Scheduled Token Cleanup

Daily cleanup job removes stale tokens:

```typescript
// functions/src/fn_tokenCleanup.ts
export const cleanupStaleTokens = onSchedule(
  {
    schedule: '0 3 * * *',  // 3:00 AM UTC daily
    timeZone: 'UTC',
    retryCount: 3,
    memory: '512MiB',
  },
  async (): Promise<void> => {
    // Find tokens not updated in 60+ days
    // Remove from pushNotifications collection
    // Remove from statementsSubscribe.tokens[] arrays
    // Clean up legacy askedToBeNotified entries
  }
);
```

---

## Platform Support Matrix

| Platform | Push (FCM) | In-App | Notes |
|----------|------------|--------|-------|
| Chrome Desktop | Full | Full | Best experience |
| Firefox Desktop | Full | Full | Best experience |
| Edge Desktop | Full | Full | Best experience |
| Safari Desktop | Limited | Full | Some FCM limitations |
| Chrome Android | Full | Full | Best mobile experience |
| iOS Safari | Guidance | Full | Shows PWA install instructions |
| iOS PWA 16.4+ | Supported | Full | Requires PWA installation |

### iOS Support

iOS users see contextual guidance based on their situation:

1. **iOS < 16.4**: Informed that their iOS version doesn't support web push
2. **iOS 16.4+ in Safari**: Shown step-by-step PWA installation instructions
3. **iOS PWA**: Full push notification support when installed as PWA

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

### Token Invalidation & Cleanup
```
Server detects invalid token during send:
  • messaging/registration-token-not-registered
  • messaging/invalid-registration-token
  • messaging/invalid-argument

Actions (all automatic):
  1. Remove from pushNotifications collection
  2. Remove from statementsSubscribe.tokens[] arrays
  3. Remove from legacy askedToBeNotified collection
  4. Daily cleanup job catches any missed tokens (60+ days stale)
```

---

## Flow Diagrams

### A. Permission Request & Token Generation

```
User Opens App
       │
       ▼
┌──────────────────────────────────┐
│  NotificationService.init()      │
│  src/services/notificationService.ts:initialize()
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│   Platform Detection             │
│   platformService.ts             │
│   • isNotificationSupported      │
│   • isFirebaseMessaging...       │
│   • isIOSWebPushSupported        │
│   • getIOSVersion()              │
└──────────────────────────────────┘
       │
       ├─── iOS < 16.4 ─────────────► Show "iOS Unsupported" message
       │
       ├─── iOS Safari 16.4+ ───────► Show PWA install instructions
       │
       ├─── iOS PWA 16.4+ ──────────► Proceed with FCM setup
       │
       ▼ Desktop/Android
┌──────────────────────────────────┐
│   Register Service Worker        │
│   firebase-messaging-sw.js       │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Request Browser Permission      │
│  Notification.requestPerm()      │
│  + Analytics tracking            │
└──────────────────────────────────┘
       │
       ├─── denied ────────────────► Log, track analytics, continue without push
       │
       ▼ granted
┌──────────────────────────────────┐
│   Generate FCM Token             │
│   getToken({ vapidKey })         │
│   + Track TOKEN_GENERATED        │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│   Store Token Metadata           │
│   pushNotifications/{token}      │
│   (includes quietHours config)   │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│   Sync with Subscriptions        │
│   Add token to all user's        │
│   statementsSubscribe docs       │
└──────────────────────────────────┘
```

### B. Notification Sending (Backend)

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
│ • Per-subscriber    │  │ • Filter quiet hrs  │        │
│   entry             │  │ • Build rich msg    │        │
│                     │  │ • Send via FCM      │        │
│                     │  │ • Batch of 500      │        │
│                     │  │ • 50ms delay each   │        │
│                     │  │ • Remove invalid    │        │
└─────────────────────┘  └─────────────────────┘        │
                                │                        │
                                ▼                        │
                    ┌───────────────────────┐            │
                    │   Token Cleanup       │            │
                    │                       │            │
                    │ Remove invalid from:  │            │
                    │ • pushNotifications   │            │
                    │ • statementsSubscribe │            │
                    │ • askedToBeNotified   │            │
                    └───────────────────────┘            │
                                                         │
                                  ▼──────────────────────┘
                    ┌───────────────────────┐
                    │   Daily Cleanup Job   │
                    │   fn_tokenCleanup.ts  │
                    │                       │
                    │ 3:00 AM UTC daily:    │
                    │ Remove tokens > 60    │
                    │ days stale            │
                    └───────────────────────┘
```

### C. Client Notification Receipt with Grouping

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND (App Closed)                          │
│                                                                     │
│  firebase-messaging-sw.js                                           │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  messaging.onBackgroundMessage()        │                       │
│  │                                         │                       │
│  │  1. Check for existing notifications    │                       │
│  │     with same tag (discussion grouping) │                       │
│  │  2. Create summary if multiple:         │                       │
│  │     "3 new replies in discussion"       │                       │
│  │  3. Show rich notification with:        │                       │
│  │     • Creator photo as image            │                       │
│  │     • Action button: "View Reply"       │                       │
│  │     • Badge update                      │                       │
│  └─────────────────────────────────────────┘                       │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────┐                       │
│  │  User clicks notification               │                       │
│  │  notificationclick event handler        │                       │
│  │                                         │                       │
│  │  • Clear grouped notification count     │                       │
│  │  • Clear badge                          │                       │
│  │  • Deep link to statement page          │                       │
│  └─────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
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
- Generate via Firebase Console -> Project Settings -> Cloud Messaging

---

## File Reference

### Client-Side
```
src/services/
├── notificationService.ts       # Main singleton orchestrator
├── pushService.ts               # FCM setup and token management
├── platformService.ts           # Browser capability detection
├── notificationRepository.ts    # Firestore operations + quiet hours
└── notificationAnalytics.ts     # Firebase Analytics tracking

src/controllers/
├── hooks/useNotifications.ts    # Main React hook
└── db/inAppNotifications/       # In-app notification DB operations

src/view/components/notifications/
├── NotificationPrompt.tsx       # Permission request UI + iOS guidance
├── NotificationSubscriptionButton.tsx
├── NotificationPreferences.tsx
├── NotificationSettingsButton.tsx
├── QuietHoursSettings.tsx       # Quiet hours configuration UI
└── FCMTokenDisplay.tsx          # Debug display

src/redux/notificationsSlice/
└── notificationsSlice.ts        # Redux state management

public/
└── firebase-messaging-sw.js     # Service worker with grouping
```

### Server-Side
```
functions/src/
├── fn_notifications.ts          # Firestore trigger, FCM sending, quiet hours filter
└── fn_tokenCleanup.ts           # Scheduled cleanup job (daily at 3 AM UTC)
```

---

## Completed Improvements

The following improvements have been implemented:

| Feature | Status | Description |
|---------|--------|-------------|
| Token sync cleanup | Completed | Removes invalid tokens from `statementsSubscribe.tokens[]` when detected server-side |
| Legacy migration | Completed | Uses `statementsSubscribe.tokens[]` as primary, maintains legacy for compatibility |
| Scheduled cleanup job | Completed | Daily job at 3 AM UTC removes tokens unused for 60+ days |
| iOS PWA guidance | Completed | Shows contextual instructions for iOS Safari users |
| Analytics tracking | Completed | Comprehensive event tracking via Firebase Analytics |
| Rich notifications | Completed | Creator photos, action buttons, platform-specific options |
| Notification grouping | Completed | Groups multiple replies from same discussion with summary |
| Quiet hours | Completed | User preference to pause notifications during specified hours |

---

## Summary

The Wizcol push notification system is a production-ready, multi-channel notification architecture that:

- Uses Firebase Cloud Messaging for rich browser push notifications
- Maintains real-time in-app notification feed via Firestore
- Supports multi-device token synchronization
- Provides iOS-specific guidance for PWA installation
- Groups notifications from the same discussion
- Respects user quiet hours preferences
- Tracks comprehensive analytics for notification lifecycle
- Automatically cleans up stale tokens (60+ days)
- Includes comprehensive debugging utilities

The architecture follows a clean separation of concerns with singleton services, repository pattern for data access, and React hooks for UI integration. The backend uses Firestore triggers for event-driven notification delivery with robust error handling, token validation, and quiet hours filtering.
