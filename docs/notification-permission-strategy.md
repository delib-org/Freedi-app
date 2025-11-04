# Notification Permission & Control Strategy

**Document Version:** 1.0
**Created:** 2025-11-04
**Status:** Design Proposal

---

## 📋 Executive Summary

This document proposes a **contextual, user-friendly notification permission strategy** that shows value before asking for permissions, provides granular user controls, and includes developer configuration options.

### Key Improvements
1. ✅ **Contextual permission requests** - Ask when users see value
2. ✅ **Tier-based triggers** - Smart timing based on user engagement
3. ✅ **iOS-specific handling** - Different UX for iOS users
4. ✅ **Granular user controls** - Per-statement and global preferences
5. ✅ **Developer configuration** - Easy to adjust timing and behavior
6. ✅ **Rate limiting** - Prevent notification spam

---

## 🔍 Current Situation Analysis

### Problems Identified

| Issue | Current State | Impact |
|-------|--------------|--------|
| **Permission prompt disabled** | Commented out in PWAWrapper.tsx line 253 | No push notifications at all |
| **Too early timing** | Shows 5-8 seconds after load | Users don't see value |
| **No context** | Generic "Enable notifications?" | Low conversion rate |
| **iOS same treatment** | iOS users see prompts that don't work | Confusing UX |
| **Single attempt** | If dismissed, never asked again | Lose potential subscribers |

### Current Timing (When Enabled)
```
App Load → 5s → Service Worker Ready → 3s → Prompt Shown = 8 seconds total
```

**Conditions:**
- `Notification.permission === 'default'`
- NOT in mass-consensus route
- Service worker supported

### Existing User Controls ✅

**NotificationPreferences Component** (Already built!)
- ✅ Per-statement granular control
- ✅ Three toggles: In-app, Push, Email
- ✅ Warning if browser permission not granted
- ✅ Saves to `statementsSubscribe` collection

**What's Missing:**
- ❌ Global notification settings
- ❌ Quiet hours
- ❌ Digest mode
- ❌ Notification type filtering
- ❌ Temporary muting

---

## 🎯 Proposed Solution: Contextual Permission Strategy

### Core Principle

> **"Show Value Before Asking"**
>
> Never request notification permission until the user understands WHY they need notifications and has experienced the app's value.

---

## 📍 1. Permission Request Triggers (Three Tiers)

### **Tier 1: High-Intent Actions** 🔥 (Best Conversion)

Ask immediately after these actions with contextual messaging:

| Trigger | User Action | Contextual Message | Priority |
|---------|-------------|-------------------|----------|
| **After 1st subscription** | User clicks "Join"/"Subscribe" | "Get notified when there are updates to this discussion" | 🔴 Highest |
| **After 1st post** | User creates first statement/reply | "Be notified when someone responds to your comment" | 🔴 Highest |
| **After 1st vote** | User votes/evaluates | "Find out when voting results are in" | 🟡 High |
| **Settings page** | User visits notification settings | "Enable push notifications for updates" | 🟡 High |

**Implementation:**
```typescript
// After user subscribes to statement
const handleSubscribe = async () => {
  await subscribeToStatement(statementId, userId);

  // Show contextual permission prompt
  if (shouldRequestNotificationPermission()) {
    showContextualPrompt({
      trigger: 'first_subscription',
      message: 'Get notified when there are updates to this discussion',
      icon: '🔔'
    });
  }
};
```

### **Tier 2: Medium-Intent Actions** 💡 (Good Conversion)

Ask after engagement indicators:

| Trigger | User Action | Timing | Message |
|---------|-------------|--------|---------|
| **After 2 mins active** | User engaged for 2+ minutes | At 2:00 mark | "Stay updated - enable notifications" |
| **Opening 3rd statement** | User views 3rd different statement | On 3rd view | "You're exploring a lot! Get notified of updates" |
| **Return visit** | User returns after 1+ day | On 2nd+ visit | "Welcome back! Enable notifications to stay updated" |
| **Creating statement** | User creates new question/group | After creation | "Get notified when people respond" |

**Implementation:**
```typescript
// Track user engagement
const notificationTriggerTracker = {
  sessionStart: Date.now(),
  statementViewCount: 0,
  returnVisit: false,

  checkTier2Triggers: () => {
    // After 2 minutes active
    if (Date.now() - sessionStart > 120000) {
      triggerPermissionPrompt('time_active');
    }

    // After 3 statement views
    if (statementViewCount === 3) {
      triggerPermissionPrompt('statement_exploration');
    }
  }
};
```

### **Tier 3: Gentle Reminders** ⏰ (Re-engagement)

Re-prompt users who previously dismissed:

| Trigger | Condition | Timing | Message |
|---------|-----------|--------|---------|
| **7-day re-prompt** | Dismissed once | After 7 days | "Ready for notifications? They help you stay engaged" |
| **5 subscriptions** | User has 5+ subscriptions | On 5th subscription | "With many subscriptions, notifications help you track updates" |
| **Exit intent** | User about to close tab | On tab close | "Enable notifications to never miss updates" |

**Implementation:**
```typescript
// Store dismissal in localStorage
const NOTIFICATION_DISMISSAL_KEY = 'notification_prompt_dismissed';

const canReprompt = () => {
  const dismissedAt = localStorage.getItem(NOTIFICATION_DISMISSAL_KEY);
  if (!dismissedAt) return true;

  const daysSinceDismissal = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
  return daysSinceDismissal >= 7;
};
```

### **❌ Never Ask During These**

- ❌ First 10 seconds of app load
- ❌ During login/signup flow
- ❌ In mass consensus workflow
- ❌ More than once per session
- ❌ If user clicked "Never ask again"
- ❌ If user already granted/denied permission

---

## 🎛️ 2. User Notification Controls

### **Level 1: Global Settings** (New)

**Location:** User Profile → Notifications

```typescript
interface GlobalNotificationSettings {
  // Master switches
  enablePushNotifications: boolean;      // Global push on/off
  enableInAppNotifications: boolean;     // Global in-app on/off
  enableEmailNotifications: boolean;     // Global email on/off

  // Smart features
  quietHours?: {
    enabled: boolean;
    start: string;    // "22:00"
    end: string;      // "08:00"
    timezone: string;
  };

  digestMode?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time: string;     // "09:00"
    timezone: string;
  };

  // Preferences
  notificationSound: boolean;
  vibration: boolean;
  showOnLockScreen: boolean;

  // Platform
  platform: 'web' | 'ios' | 'android';
  iosWorkAroundEnabled?: boolean;
}
```

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│  Global Notification Settings                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [✓] Enable Push Notifications                     │
│      Get notifications even when app is closed     │
│                                                     │
│  [✓] Enable In-App Notifications                   │
│      See notifications while using the app         │
│                                                     │
│  [ ] Enable Email Notifications                    │
│      Receive daily digest via email                │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Quiet Hours                                        │
│  [✓] Don't notify me between:                      │
│      [22:00] to [08:00]                            │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Notification Sound:  [✓] Enabled                  │
│  Vibration:           [✓] Enabled                  │
│  Show on Lock Screen: [✓] Enabled                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### **Level 2: Per-Statement Controls** (Enhanced)

**Location:** Statement Settings (Existing component enhanced)

```typescript
interface StatementNotificationSettings {
  statementId: string;
  userId: string;

  // Basic controls (keep existing)
  getInAppNotification: boolean;
  getPushNotification: boolean;
  getEmailNotification: boolean;

  // NEW: Granular event types
  notificationTypes?: {
    newReplies: boolean;           // Someone replies to my comment
    directMentions: boolean;       // Someone @mentions me
    topLevelUpdates: boolean;      // New top-level statements
    votingStarted: boolean;        // Voting phase begins
    votingEnded: boolean;          // Voting phase ends
    consensusReached: boolean;     // Consensus milestone
    moderatorActions: boolean;     // Content moderated
    allActivity: boolean;          // Everything
  };

  // NEW: Frequency control
  frequency: 'instant' | 'hourly' | 'daily' | 'off';

  // NEW: Smart features
  muteUntil?: number;              // Temporarily mute (timestamp)
  priority: 'all' | 'important';   // Filter noise
}
```

**Enhanced UI Design:**
```
┌─────────────────────────────────────────────────────┐
│  Notifications for: "Climate Change Discussion"    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Notification Channels                             │
│  [✓] In-app notifications                          │
│  [✓] Push notifications                            │
│  [ ] Email notifications                           │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Notify me about:                                  │
│  [✓] Replies to my comments                        │
│  [✓] Direct mentions (@me)                         │
│  [✓] New top-level statements                      │
│  [ ] Voting started                                │
│  [✓] Voting ended                                  │
│  [ ] Consensus reached                             │
│  [ ] Moderator actions                             │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Frequency: [Instant ▼]                            │
│             ├ Instant                              │
│             ├ Hourly digest                        │
│             ├ Daily digest                         │
│             └ Off                                  │
│                                                     │
│  Priority:  [All ▼]                                │
│             ├ All updates                          │
│             └ Important only                       │
│                                                     │
│  [Mute for 1 day]  [Mute for 1 week]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### **Level 3: Quick Actions** (New)

**Location:** Notification bell icon / notification list

```
┌─────────────────────────────────────────┐
│  Notifications                    [⚙️]  │
├─────────────────────────────────────────┤
│                                         │
│  🔔 New reply from Sarah                │
│     "Climate Change Discussion"         │
│     2 minutes ago                       │
│     [View] [Mute this discussion]       │
│                                         │
│  🗳️ Voting ended                        │
│     "Budget Priorities"                 │
│     1 hour ago                          │
│     [View Results] [Mute]               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [Mark all as read]                     │
│  [Notification settings]                │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔧 3. Developer Configuration System

### **Main Config File: `/src/config/notifications.ts`**

```typescript
export const NOTIFICATION_CONFIG = {
  // ===== PERMISSION REQUEST STRATEGY =====
  permissionStrategy: {
    enabled: true,                       // Master on/off switch
    strategy: 'contextual',              // 'immediate' | 'contextual' | 'manual'

    // Timing controls
    minSessionTimeSeconds: 10,           // Min seconds before can prompt (Tier 2)
    promptDelaySeconds: 3,               // Delay after trigger event
    repromptAfterDays: 7,               // Days before re-prompting after dismiss
    maxPromptsPerSession: 1,            // Don't spam user
    maxPromptsPerDay: 2,                // Daily limit

    // Platform-specific
    ios: {
      strategy: 'in-app-only',          // 'in-app-only' | 'pwa-prompt' | 'hide'
      minIOSVersion: '16.4',            // For PWA prompts
      showExplanation: true,            // Explain iOS limitations
    },

    // Tier 1: High-intent triggers
    tier1Triggers: {
      afterFirstSubscription: true,
      afterFirstPost: true,
      afterFirstVote: true,
      onSettingsPage: true,
    },

    // Tier 2: Medium-intent triggers
    tier2Triggers: {
      afterTimeActive: true,
      afterStatementViews: 3,
      onReturnVisit: true,
      afterCreatingStatement: true,
    },

    // Tier 3: Gentle reminders
    tier3Triggers: {
      timeBasedReminder: true,
      afterXSubscriptions: 5,
      exitIntent: false,                // Can be annoying
    }
  },

  // ===== NOTIFICATION SENDING =====
  sending: {
    // Batch configuration
    batchSize: 500,                     // Max tokens per batch (FCM limit)
    rateLimitDelayMs: 50,              // Delay between individual sends

    // Retry configuration
    retryAttempts: 3,
    retryBackoffMs: [1000, 2000, 4000], // Exponential backoff

    // Token management
    tokenRefreshDays: 30,
    tokenCheckIntervalHours: 24,
    validateTokensInProduction: true,
    validateTokensInDevelopment: false, // Skip for speed

    // Cooldown (prevent spam)
    minSecondsBetweenSameStatement: 300, // 5 minutes
  },

  // ===== RATE LIMITING =====
  rateLimits: {
    perUser: {
      maxPerHour: 10,
      maxPerDay: 50,
    },
    perStatement: {
      maxPerHour: 100,
      cooldownSeconds: 300,             // 5 minutes between notifications
    },
    global: {
      maxPerMinute: 1000,              // System-wide limit
    }
  },

  // ===== QUIET HOURS (Default) =====
  quietHours: {
    enabled: false,                     // Disabled by default, user can enable
    defaultStart: '22:00',
    defaultEnd: '08:00',
    timezone: 'user',                   // Use user's timezone
  },

  // ===== FEATURE FLAGS =====
  features: {
    quietHours: true,                   // Enable feature
    digestMode: false,                  // Not implemented yet
    notificationGrouping: false,        // Not implemented yet
    richMediaNotifications: false,      // Not implemented yet
    priorityLevels: true,              // Important vs all
    temporaryMuting: true,             // Mute for X days
    notificationTypeFiltering: true,    // Granular event types
  },

  // ===== PLATFORM SUPPORT =====
  platform: {
    ios: {
      fcmPushEnabled: false,            // FCM not supported on iOS
      inAppEnabled: true,
      pwaPromptEnabled: true,           // Show PWA install prompt
    },
    safari: {
      fcmPushEnabled: true,
      limitedSupport: true,             // Note: limited background push
    },
    chrome: {
      fcmPushEnabled: true,
      fullSupport: true,
    },
    firefox: {
      fcmPushEnabled: true,
      fullSupport: true,
    },
    edge: {
      fcmPushEnabled: true,
      fullSupport: true,
    }
  },

  // ===== ANALYTICS =====
  analytics: {
    trackPermissionRequests: true,
    trackPermissionGrants: true,
    trackPermissionDenials: true,
    trackNotificationClicks: true,
    trackNotificationDismissals: true,
  }
} as const;

// Type exports for TypeScript
export type NotificationConfig = typeof NOTIFICATION_CONFIG;
export type PermissionStrategy = NotificationConfig['permissionStrategy']['strategy'];
export type NotificationTrigger = keyof NotificationConfig['permissionStrategy']['tier1Triggers'];
```

### **Environment Overrides**

```typescript
// /src/config/notifications.dev.ts
export const DEV_OVERRIDES: Partial<NotificationConfig> = {
  permissionStrategy: {
    ...NOTIFICATION_CONFIG.permissionStrategy,
    minSessionTimeSeconds: 5,           // Faster for testing
    promptDelaySeconds: 1,
    maxPromptsPerSession: 3,            // Allow more for testing
  },
  sending: {
    ...NOTIFICATION_CONFIG.sending,
    validateTokensInDevelopment: false, // Skip validation
    batchSize: 10,                      // Smaller batches for testing
  },
  rateLimits: {
    perUser: { maxPerHour: 100, maxPerDay: 500 },
    perStatement: { maxPerHour: 1000, cooldownSeconds: 10 },
    global: { maxPerMinute: 10000 },
  }
};

// /src/config/notifications.prod.ts
export const PROD_OVERRIDES: Partial<NotificationConfig> = {
  sending: {
    ...NOTIFICATION_CONFIG.sending,
    validateTokensInProduction: true,
  },
  rateLimits: {
    perUser: { maxPerHour: 10, maxPerDay: 50 },
    perStatement: { maxPerHour: 100, cooldownSeconds: 300 },
    global: { maxPerMinute: 1000 },
  }
};
```

### **Usage in Code**

```typescript
import { NOTIFICATION_CONFIG } from '@/config/notifications';

// Check if should show permission prompt
const shouldShowPermissionPrompt = (trigger: NotificationTrigger): boolean => {
  const { permissionStrategy } = NOTIFICATION_CONFIG;

  // Check if enabled globally
  if (!permissionStrategy.enabled) return false;

  // Check if specific trigger is enabled
  if (trigger in permissionStrategy.tier1Triggers) {
    return permissionStrategy.tier1Triggers[trigger];
  }

  // Check tier 2, tier 3...

  return false;
};

// Use in component
const handleSubscribe = () => {
  subscribeToStatement(statementId);

  if (shouldShowPermissionPrompt('afterFirstSubscription')) {
    showContextualPrompt({
      message: 'Get notified when there are updates to this discussion',
      trigger: 'afterFirstSubscription'
    });
  }
};
```

---

## 📱 4. iOS-Specific Strategy

### **Approach 1: In-App Only** (Recommended, Current)

**When:** iOS detected, FCM not supported

**UX Flow:**
```
iOS User Subscribes to Statement
   ↓
Detect iOS platform
   ↓
Show iOS-specific explanation
   ↓
┌─────────────────────────────────────────┐
│  📱 Notifications on iOS                │
│                                         │
│  iOS web apps have limited notification │
│  support. You'll receive updates:      │
│                                         │
│  ✅ While using the app                │
│  ✅ In the notification list           │
│  ❌ When app is closed                 │
│                                         │
│  [Enable In-App Notifications]         │
│                                         │
│  iOS 16.4+? [Install as App]          │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
const IOSNotificationPrompt = ({ onEnable }: { onEnable: () => void }) => {
  const isIOS164Plus = detectIOSVersion() >= 16.4;
  const isPWAInstalled = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <div className={styles.iosPrompt}>
      <h3>📱 Notifications on iOS</h3>
      <p>iOS web apps have limited notification support.</p>

      <div className={styles.supportList}>
        <div className={styles.supported}>
          <span>✅</span>
          <span>While using the app</span>
        </div>
        <div className={styles.supported}>
          <span>✅</span>
          <span>In the notification list</span>
        </div>
        <div className={styles.notSupported}>
          <span>❌</span>
          <span>When app is closed</span>
        </div>
      </div>

      <button onClick={onEnable} className={styles.enableButton}>
        Enable In-App Notifications
      </button>

      {isIOS164Plus && !isPWAInstalled && (
        <button onClick={showPWAInstallGuide} className={styles.secondaryButton}>
          Install as App for Better Experience
        </button>
      )}
    </div>
  );
};
```

### **Approach 2: iOS 16.4+ PWA Prompt** (If implementing Web Push)

**When:** iOS 16.4+, PWA not installed, user highly engaged

**UX Flow:**
```
iOS 16.4+ User (Highly Engaged)
   ↓
Show PWA installation benefits
   ↓
┌─────────────────────────────────────────┐
│  🚀 Get Push Notifications on iOS      │
│                                         │
│  Install FreeDi to your home screen    │
│  for push notifications:               │
│                                         │
│  1. Tap [Share Icon] in Safari         │
│  2. Select "Add to Home Screen"        │
│  3. Open the installed app             │
│  4. Enable notifications                │
│                                         │
│  Benefits:                             │
│  • Push notifications when app closed  │
│  • Faster loading                      │
│  • Better offline support              │
│                                         │
│  [Show Me How] [Maybe Later]          │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
const IOSPWAPrompt = ({ onShowGuide, onDismiss }: IOSPWAPromptProps) => {
  return (
    <div className={styles.iosPWAPrompt}>
      <div className={styles.icon}>🚀</div>
      <h3>Get Push Notifications on iOS</h3>
      <p>Install FreeDi to your home screen for push notifications:</p>

      <ol className={styles.steps}>
        <li>
          Tap <img src="/assets/safari-share.svg" alt="Share" className={styles.inlineIcon} /> in Safari
        </li>
        <li>Select "Add to Home Screen"</li>
        <li>Open the installed app</li>
        <li>Enable notifications when prompted</li>
      </ol>

      <div className={styles.benefits}>
        <h4>Benefits:</h4>
        <ul>
          <li>Push notifications when app closed</li>
          <li>Faster loading</li>
          <li>Better offline support</li>
        </ul>
      </div>

      <div className={styles.actions}>
        <button onClick={onShowGuide} className={styles.primary}>
          Show Me How
        </button>
        <button onClick={onDismiss} className={styles.secondary}>
          Maybe Later
        </button>
      </div>
    </div>
  );
};
```

---

## 🎬 5. Implementation Plan

### **Phase 1: Smart Permission Timing** (2-3 days)

**Goal:** Enable contextual permission prompts with Tier 1 triggers

**Tasks:**
1. ✅ Create `NotificationTriggerService`
   - Track user actions (subscriptions, posts, votes)
   - Detect trigger events
   - Check if should show prompt

2. ✅ Update `NotificationPrompt` component
   - Accept contextual message
   - Show appropriate icon
   - Track trigger source

3. ✅ Implement Tier 1 triggers
   - After first subscription
   - After first post
   - On settings page visit

4. ✅ Add iOS detection and alternative messaging
   - Show iOS-specific prompt
   - Explain in-app notifications

5. ✅ Create `/src/config/notifications.ts`
   - Configuration file with all settings
   - Export types for TypeScript

**Files to Create:**
- `/src/services/notificationTriggerService.ts`
- `/src/config/notifications.ts`
- `/src/view/components/notifications/ContextualNotificationPrompt.tsx`
- `/src/view/components/notifications/IOSNotificationPrompt.tsx`

**Files to Modify:**
- `/src/view/components/pwa/PWAWrapper.tsx` - Re-enable prompt with new logic
- `/src/controllers/db/subscriptions/setSubscriptions.ts` - Add trigger after subscribe
- `/src/controllers/db/statements/setStatements.ts` - Add trigger after post

**Testing:**
- [ ] Test on Chrome (should show contextual prompt)
- [ ] Test on Firefox (should show contextual prompt)
- [ ] Test on iOS Safari (should show iOS-specific prompt)
- [ ] Test trigger after subscription
- [ ] Test trigger after first post
- [ ] Test "Not now" dismissal (should not show again for 7 days)

---

### **Phase 2: Enhanced User Controls** (3-4 days)

**Goal:** Add granular notification controls and global settings

**Tasks:**
1. ✅ Create Global Notification Settings page
   - Master on/off switches
   - Quiet hours configuration
   - Platform-specific settings

2. ✅ Enhance `NotificationPreferences` component
   - Add notification type filtering
   - Add frequency control (instant/digest)
   - Add temporary muting
   - Add priority filtering

3. ✅ Create Quick Actions in notification list
   - "Mute this discussion" button
   - "Mark as read" button
   - Settings link

4. ✅ Update backend to respect new preferences
   - Filter by notification types
   - Respect quiet hours
   - Honor mute settings

**Files to Create:**
- `/src/view/pages/settings/NotificationSettings.tsx`
- `/src/types/notificationSettings.ts`
- `/src/controllers/db/notificationSettings/getNotificationSettings.ts`
- `/src/controllers/db/notificationSettings/setNotificationSettings.ts`

**Files to Modify:**
- `/src/view/components/notifications/NotificationPreferences.tsx` - Add new controls
- `/functions/src/fn_notifications.ts` - Respect granular settings

**Testing:**
- [ ] Test global on/off switches
- [ ] Test quiet hours (no notifications between 10pm-8am)
- [ ] Test per-statement type filtering
- [ ] Test muting for 1 day
- [ ] Test frequency control (instant vs digest)

---

### **Phase 3: Tier 2 & 3 Triggers** (2 days)

**Goal:** Implement medium-intent and gentle reminder triggers

**Tasks:**
1. ✅ Add session tracking
   - Track time spent active
   - Track statement views
   - Track return visits

2. ✅ Implement Tier 2 triggers
   - After 2 minutes active
   - After 3 statement views
   - On return visit

3. ✅ Implement Tier 3 triggers
   - 7-day re-prompt after dismissal
   - After 5 subscriptions

4. ✅ Add "Never ask again" option
   - Store in localStorage
   - Respect user choice

**Files to Modify:**
- `/src/services/notificationTriggerService.ts` - Add session tracking
- `/src/view/components/notifications/ContextualNotificationPrompt.tsx` - Add "Never ask" option

**Testing:**
- [ ] Test 2-minute timer trigger
- [ ] Test 3-statement-view trigger
- [ ] Test return visit trigger
- [ ] Test "Never ask again" persistence

---

### **Phase 4: Rate Limiting & Safety** (1-2 days)

**Goal:** Prevent notification spam and ensure good UX

**Tasks:**
1. ✅ Implement rate limiting service
   - Per-user limits (10/hour, 50/day)
   - Per-statement cooldown (5 minutes)
   - Global system limits

2. ✅ Add notification grouping
   - Group multiple notifications from same statement
   - "3 new replies" instead of 3 separate notifications

3. ✅ Add analytics tracking
   - Track permission request events
   - Track grant/denial rates
   - Track notification engagement

**Files to Create:**
- `/src/services/notificationRateLimiter.ts`
- `/src/services/notificationGrouper.ts`

**Files to Modify:**
- `/functions/src/fn_notifications.ts` - Add rate limiting checks

**Testing:**
- [ ] Test per-user rate limiting (should cap at 10/hour)
- [ ] Test per-statement cooldown (should wait 5 minutes)
- [ ] Test notification grouping ("3 new replies")

---

### **Phase 5: iOS PWA Support** (Optional, 3-5 days)

**Goal:** Enable iOS 16.4+ Web Push for PWA users

**Requires:**
- Apple Developer account ($99/year)
- APNs authentication key
- Separate Web Push API implementation (not FCM)

**Tasks:**
1. Set up APNs authentication
2. Implement Web Push API
3. Create APNs bridge Cloud Function
4. Update service worker for Web Push
5. Add PWA install prompts for iOS

**Note:** Only implement if:
- ✅ >30% users on iOS 16.4+
- ✅ Have Apple Developer account
- ✅ Users installing PWA to home screen
- ✅ User demand for iOS push

---

## 📊 6. Success Metrics

Track these metrics to measure success:

| Metric | Current | Target | Priority |
|--------|---------|--------|----------|
| **Permission grant rate** | ? | >40% | 🔴 High |
| **Notification click rate** | ? | >30% | 🔴 High |
| **User engagement after enabling** | ? | +20% | 🟡 Medium |
| **iOS user satisfaction** | ? | >70% | 🟡 Medium |
| **Notification dismissal rate** | ? | <10% | 🟢 Low |
| **"Never ask again" rate** | ? | <5% | 🟢 Low |

**Analytics to Implement:**
```typescript
// Track permission prompt shown
analyticsService.logEvent('notification_permission_prompt_shown', {
  trigger: 'first_subscription',
  platform: 'web',
  timestamp: Date.now()
});

// Track permission granted
analyticsService.logEvent('notification_permission_granted', {
  trigger: 'first_subscription',
  platform: 'web',
  timeToDecision: 5000 // ms
});

// Track notification engagement
analyticsService.logEvent('notification_clicked', {
  notificationType: 'statement_reply',
  statementId: 'abc123',
  timestamp: Date.now()
});
```

---

## 🎯 7. Recommended Action

### **Start with Phase 1** (2-3 days work)

**Why:**
- ✅ Immediate impact on notification adoption
- ✅ Low complexity, high value
- ✅ Foundation for future improvements
- ✅ Solves current "no prompts" problem

**Quick Wins:**
1. Re-enable permission prompt with contextual triggers
2. Add iOS-specific messaging
3. Implement "after first subscription" trigger
4. Create configuration file for easy adjustments

### **What to Implement First**

**Day 1:**
- ✅ Create `NOTIFICATION_CONFIG` in `/src/config/notifications.ts`
- ✅ Create `NotificationTriggerService`
- ✅ Create `IOSNotificationPrompt` component
- ✅ Update `PWAWrapper` to use new logic

**Day 2:**
- ✅ Implement "after first subscription" trigger
- ✅ Implement "after first post" trigger
- ✅ Add iOS detection and routing
- ✅ Test on all platforms

**Day 3:**
- ✅ Add analytics tracking
- ✅ Polish UI/UX
- ✅ Write documentation
- ✅ Deploy to test environment

---

## 💡 8. Key Takeaways

### **Core Principles**

1. **Show Value First** - Never ask without context
2. **Respect User Choice** - Honor dismissals and "Never ask again"
3. **Platform Awareness** - Different UX for iOS vs other platforms
4. **Gradual Escalation** - Tier 1 → Tier 2 → Tier 3 triggers
5. **User Control** - Granular settings, easy to disable
6. **Rate Limiting** - Prevent spam, maintain good UX

### **What Makes This Better**

| Old Approach | New Approach | Benefit |
|--------------|--------------|---------|
| Ask immediately (8s after load) | Ask after engagement | Higher conversion |
| Generic message | Contextual message | Clearer value proposition |
| Single attempt | Multiple strategic attempts | More chances to convert |
| Same for all platforms | iOS-specific handling | Better iOS UX |
| No user controls | Granular controls | User empowerment |
| Hard-coded timing | Configuration file | Easy to adjust |

---

## 📚 9. References

### **Related Documents**
- `/docs/NOTIFICATIONS.md` - Technical documentation
- `/docs/current-notifications-status.md` - Current implementation status

### **Key Files**
- `/src/services/notificationService.ts` - Core notification service
- `/src/view/components/pwa/PWAWrapper.tsx` - Service worker registration
- `/src/view/components/notifications/NotificationPreferences.tsx` - User controls
- `/functions/src/fn_notifications.ts` - Backend sending logic

### **External Resources**
- [Web Push Best Practices](https://web.dev/push-notifications-overview/)
- [iOS Web Push API](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [UX Patterns for Notifications](https://www.nngroup.com/articles/push-notification/)

---

**Document Owner:** Development Team
**Last Updated:** 2025-11-04
**Next Review:** After Phase 1 implementation
