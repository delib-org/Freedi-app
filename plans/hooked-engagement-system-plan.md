# Freedi Hooked Engagement System - Unified Plan

## Context

Freedi is a deliberation platform with 4 apps (main, sign, mass-consensus, flow) sharing the same Firestore. Users currently get basic push notifications (FCM) and in-app notifications only in the main app. There is no engagement tracking, no credits/rewards, no digest system, and no branch-level subscription control. Sign and MC apps have zero notification infrastructure beyond email subscribers.

**Goal**: Build a single, portable engagement system based on Nir Eyal's "Hooked" model that works across all current and future apps. It must support 4 notification channels: PWA push, native push (Capacitor), email, and in-app notifications.

---

## Architecture Overview

```
                  +--------------------+
                  |   Firestore DB     |
                  | (shared by all)    |
                  +--------+-----------+
                           |
            +--------------+--------------+
            |              |              |
   +--------v---+  +-------v----+  +-----v--------+
   | Firebase    |  | Scheduled  |  | HTTP         |
   | Triggers    |  | Functions  |  | Endpoints    |
   +------+------+  +-----+-----+  +------+-------+
          |                |               |
          +-------+--------+-------+-------+
                  |                 |
         +--------v--------+  +----v----+
         | Notification     |  | Credit  |
         | Queue + Router   |  | Engine  |
         +---------+--------+  +----+----+
                   |                 |
    +--------------+----+----+------+-------+
    |              |         |              |
+---v----+  +-----v--+  +--v------+  +----v-----+
| PWA    |  | Native |  | Email   |  | In-App   |
| Push   |  | Push   |  | (SMTP)  |  | (Firestore|
| (FCM)  |  | (Cap.) |  |         |  |  + RT)   |
+--------+  +--------+  +---------+  +----------+
    |           |            |             |
+---v-----------v------------v-------------v------+
| Main | Sign | Mass-Consensus | Flow | Future... |
+-----------------------------------------------------+
```

**Key Principle**: All engagement logic lives in Firebase Functions + Firestore. Frontend apps are thin adapters that read state and display UI. Adding a new app = adding a thin adapter, not rebuilding the system.

---

## Part 1: Notification Channel Abstraction

### The Problem
Currently each channel (push, in-app, email) is handled separately with different code paths. Capacitor native push would add a 4th path. This doesn't scale.

### The Solution: Unified Notification Queue

A single `notificationQueue` collection acts as the central bus. Firebase Functions write to it. A processor function reads from it and routes to the correct channel.

```
notificationQueue/{queueItemId}
{
  queueItemId: string;
  userId: string;

  // Content
  title: string;
  body: string;
  imageUrl?: string;

  // Routing
  channels: NotificationChannel[];  // ['push', 'inApp', 'email']
  sourceApp: SourceApp;             // 'main' | 'sign' | 'mass-consensus' | 'flow'
  targetPath: string;               // deep link: '/statement/{id}', '/doc/{id}', etc.

  // Scheduling
  deliverAt: number | null;         // null = immediate, timestamp = delayed
  frequency: 'instant' | 'digest';  // instant = send now, digest = aggregate

  // Context
  triggerType: NotificationTriggerType;
  statementId?: string;
  parentId?: string;
  topParentId?: string;

  // State
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  processedAt?: number;
  createdAt: number;
}
```

### Channel Router (Firebase Function)

```typescript
// Processes each queue item and routes to appropriate channel(s)
async function processNotificationQueueItem(item: NotificationQueueItem) {
  const user = await getUserEngagement(item.userId);

  for (const channel of item.channels) {
    switch (channel) {
      case 'push':
        // Check platform: web tokens -> FCM, native tokens -> Capacitor/APNs
        await sendPushNotification(item, user);
        break;
      case 'inApp':
        await writeInAppNotification(item);  // existing pattern
        break;
      case 'email':
        await sendEmailNotification(item, user);
        break;
    }
  }
}
```

### Capacitor Readiness

**What we build now** (no Capacitor dependency):
1. Token collection stores `platform: 'web' | 'android-native' | 'ios-native'`
2. Push router checks platform and uses appropriate sender (FCM for web+android, APNs for iOS native)
3. Deep link paths are app-agnostic (just paths, not URLs)
4. All notification content is structured data, not platform-specific

**What gets added later** (when Capacitor ships):
1. `@capacitor/push-notifications` plugin in app
2. Native token registration → writes to same `pushNotifications` collection with `platform: 'ios-native'`
3. Channel router already knows how to handle it

### Multi-App Deep Link Registry

Each app registers its URL patterns. The notification payload includes a `targetPath` that each app interprets:

```typescript
// Stored in shared-types, used by all apps
const APP_DEEP_LINKS: Record<SourceApp, Record<string, string>> = {
  main: {
    statement: '/statement/{parentId}?focusId={statementId}',
    profile: '/user/{userId}',
  },
  sign: {
    document: '/doc/{statementId}',
  },
  'mass-consensus': {
    process: '/swipe/{processId}',
  },
  flow: {
    step: '/flow/{flowId}/step/{stepId}',
  },
};
```

---

## Part 2: Subscription & Branch Preferences

### Extended Subscription Model

Extend existing `statementsSubscribe` (backwards-compatible):

```typescript
// New optional fields on existing StatementSubscription
{
  // ... existing fields (userId, statementId, role, tokens, etc.) ...

  // NEW: Default notification frequency for this discussion
  notificationFrequency?: 'instant' | 'daily' | 'weekly' | 'none';

  // NEW: Per-branch overrides
  branchPreferences?: {
    [branchStatementId: string]: {
      frequency: 'instant' | 'daily' | 'weekly' | 'none';
      channels: NotificationChannel[];  // which channels for this branch
      lastNotifiedAt: number;
    }
  };
}
```

**Why extend instead of new collection**: Subscription queries are already optimized. Adding optional fields is backwards-compatible. No migration needed for existing users.

### How Branch Preferences Flow

1. User taps bell icon on a branch → opens frequency selector
2. Client writes to `statementsSubscribe/{userId}--{topParentId}.branchPreferences.{branchId}`
3. When new activity happens in that branch:
   - Firebase Function checks subscriber's `branchPreferences[branchId].frequency`
   - `instant` → write to `notificationQueue` immediately
   - `daily`/`weekly` → skip (digest functions pick it up later)
   - `none` → skip entirely

---

## Part 3: The Hook Cycle Implementation

### Trigger Phase

| Trigger Type | Channel | When |
|---|---|---|
| Statement reply | instant push + inApp | Someone replies to user's content |
| Social proof | instant push + inApp | 5th/10th/25th/50th evaluator on user's option |
| Consensus shift | instant push + inApp | Consensus on user's option shifts >15% |
| Voting deadline | push + inApp | Voting closes in 24h |
| Daily digest | push + email | Aggregated daily summary |
| Weekly summary | email | Weekly impact report |
| Streak reminder | push | "Don't lose your 7-day streak!" (only if >3 days) |
| Welcome back | push + email | User inactive >7 days |

### Action Phase (Progressive Complexity)

```
Level 0 (Zero friction): Read/browse - no account needed
Level 1 (One tap):       Evaluate (slider), Vote, React
Level 2 (Short input):   Comment, Subscribe to branch, Set preferences
Level 3 (Full creation): Create option/suggestion, Create discussion
```

Each level earns progressively more credits, matching increasing investment.

### Variable Reward Phase

- **Tribe**: Agreement pulse animation, "X people agreed", signature counter
- **Hunt**: "3 new perspectives", consensus surprise, document evolution diff
- **Self**: Level progression bar, streak counter, impact dashboard, badges

### Investment Phase

- Content creation (options, suggestions, comments)
- Subscription curation (branch preferences)
- Notification personalization (schedule, quiet hours)
- Reputation building (credits, badges, level)

---

## Part 4: Credits & Rewards Engine

### Credit Rules (Firestore-configurable, no code deploys needed)

```
creditRules/{ruleId}
{
  action: CreditAction;
  baseAmount: number;
  cooldownMs: number;        // min time between awards
  dailyLimit: number;        // max per day
  qualityGate?: {
    minTextLength?: number;
    minEvaluators?: number;
  };
  appMultipliers?: {         // per-app adjustments
    [app: string]: number;
  };
  enabled: boolean;
}
```

### Default Credit Values

| Action | Credits | Limit | Anti-Gaming |
|---|---|---|---|
| Join discussion | 5 | 1/discussion | Once |
| Evaluate option | 3 | 20/day | Cooldown 30s |
| Create option | 10 | 5/day | Min 20 chars |
| Comment | 2 | 15/day | Min 10 chars |
| Vote | 5 | 1/round | Once |
| Sign document | 10 | 1/doc | Once |
| Daily login | 2 | 1/day | - |
| 7-day streak | 15 | 1/week | Verified |
| Option reaches consensus | 25 | System-verified | - |
| Suggestion accepted | 30 | Admin-approved | - |

**Daily cap**: 100 credits/day. **Streak grace**: Missing 1 day reduces bonus to 50% instead of resetting.

### Level Progression (Full Gating)

Features are **gated by level**. Users must earn credits to unlock capabilities. This creates a strong Investment loop in the Hook cycle.

| Level | Name | Credits | Permissions |
|---|---|---|---|
| 0 | Observer | 0 | **Read only**: Browse discussions, view results, read documents |
| 1 | Participant | 50 | **+ Evaluate**: Rate options (slider), vote in rounds, react with emoji |
| 2 | Contributor | 200 | **+ Create**: Add comments, create options/suggestions, subscribe to branches |
| 3 | Advocate | 500 | **+ Influence**: Create discussions, invite others, priority in suggestion queue, badge display |
| 4 | Leader | 1500 | **+ Manage**: Advanced analytics, community recognition, suggest discussion structure changes |

#### Permission Enforcement

**Backend (Firebase Functions + Security Rules):**
```typescript
// In security rules - write operations check user level
match /statements/{statementId} {
  allow create: if getUserLevel(request.auth.uid) >= 2;  // Contributor+
}

// In Firebase Functions - credit actions validate level
function validateLevelPermission(userId: string, action: CreditAction): boolean {
  const level = await getUserLevel(userId);
  return LEVEL_REQUIREMENTS[action] <= level;
}
```

**Frontend (all apps):**
```typescript
// Shared pure function in packages/shared-types
export function canPerformAction(userLevel: number, action: string): boolean;
export function getRequiredLevel(action: string): number;

// Each app uses this to show/hide or enable/disable UI elements
// Locked actions show a tooltip: "Reach Contributor level to create options"
```

#### Fast-Track for New Users

To prevent frustrating new users, the first discussion a user joins gives them a temporary **"trial" mode** where they can evaluate (Level 1 actions) for 24 hours without earning 50 credits first. After 24 hours or after earning 50 credits (whichever comes first), normal gating applies.

### Credit Engine (Firebase Function)

Processes credit awards inside a Firestore transaction:
1. Load credit rule for action
2. Quality gate check (min text length, etc.)
3. Cooldown check (last award time for same action)
4. Daily limit check
5. Diminishing returns (each repeated action = 90% of previous)
6. App multiplier
7. Atomic write: creditLedger doc + update userEngagement balance
8. Check level-up → if yes, trigger LEVEL_UP notification
9. Check badge triggers → if earned, trigger BADGE_EARNED notification

---

## Part 5: Firestore Collections

### New Collections

| Collection | Purpose | Write | Read |
|---|---|---|---|
| `notificationQueue` | Central notification bus | Functions only | Functions only |
| `creditLedger` | Append-only credit transactions | Functions only | User reads own |
| `userEngagement` | User profile (level, streak, badges, impact) | Functions only | User reads own |
| `engagementEvents` | Analytics log (hook cycle tracking) | Functions only | Aggregation only |
| `creditRules` | Admin-configurable credit rules | Admin only | Functions |

### Modified Collections

| Collection | Changes |
|---|---|
| `statementsSubscribe` | Add `notificationFrequency`, `branchPreferences` (optional) |
| `pushNotifications` | Add `platform` field ('web' / 'android-native' / 'ios-native') |

### Firestore Indexes Needed

```
creditLedger: (userId ASC, createdAt DESC)
creditLedger: (userId ASC, action ASC, createdAt DESC)
notificationQueue: (status ASC, deliverAt ASC)
userEngagement: (digestPreferences.dailyDigest ASC, digestPreferences.timezone ASC)
```

### Security Rules

```
userEngagement/{userId}: read if auth.uid == userId, write by functions only
creditLedger/{txId}: read if auth.uid == resource.data.userId, write by functions only
notificationQueue: no client access
engagementEvents: no client access
creditRules: read if authenticated, write if admin
```

---

## Part 6: Shared Types (packages/shared-types)

All new engagement types go in `packages/shared-types` (local monorepo package). This allows fast iteration without publishing to npm. All apps and functions already depend on this package.

### New files in packages/shared-types:

```
packages/shared-types/src/models/engagement/
  index.ts                  # Re-exports all
  NotificationChannel.ts    # 'push' | 'inApp' | 'email'
  NotificationFrequency.ts  # 'instant' | 'daily' | 'weekly' | 'none'
  NotificationQueue.ts      # Queue item schema (Valibot)
  CreditModel.ts            # CreditAction, CreditTransaction, CreditRule (Valibot)
  EngagementModel.ts        # UserEngagement, Badge, EngagementLevel (Valibot)
  SourceApp.ts              # 'main' | 'sign' | 'mass-consensus' | 'flow' | string
  HookModel.ts              # HookPhase, HookState
  DigestModel.ts            # DigestContent, DigestItem
  PermissionModel.ts        # Level-gated action permissions
```

### Key Enums

```typescript
export enum NotificationChannel {
  PUSH = 'push',       // FCM (web) or native (Capacitor)
  IN_APP = 'inApp',    // Firestore real-time
  EMAIL = 'email',     // SMTP
}

export enum SourceApp {
  MAIN = 'main',
  SIGN = 'sign',
  MASS_CONSENSUS = 'mass-consensus',
  FLOW = 'flow',
}

export enum CreditAction {
  JOIN_DISCUSSION = 'join_discussion',
  EVALUATE_OPTION = 'evaluate_option',
  CREATE_OPTION = 'create_option',
  COMMENT = 'comment',
  VOTE = 'vote',
  SIGN_DOCUMENT = 'sign_document',
  DAILY_LOGIN = 'daily_login',
  STREAK_BONUS = 'streak_bonus',
  CONSENSUS_REACHED = 'consensus_reached',
  SUGGESTION_ACCEPTED = 'suggestion_accepted',
  MC_PARTICIPATION = 'mc_participation',
  INVITE_FRIEND = 'invite_friend',
}

export enum NotificationTriggerType {
  STATEMENT_REPLY = 'statement_reply',
  SOCIAL_PROOF = 'social_proof',
  CONSENSUS_SHIFT = 'consensus_shift',
  VOTING_DEADLINE = 'voting_deadline',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_DIGEST = 'weekly_digest',
  CREDIT_EARNED = 'credit_earned',
  LEVEL_UP = 'level_up',
  BADGE_EARNED = 'badge_earned',
  STREAK_REMINDER = 'streak_reminder',
  WELCOME_BACK = 'welcome_back',
}
```

---

## Part 7: Firebase Functions Architecture

### Directory Structure

```
functions/src/engagement/
  index.ts                    # Re-exports all
  notifications/
    queueProcessor.ts         # Process notificationQueue items
    channelRouter.ts          # Route to push/inApp/email
    digestAggregator.ts       # Build daily/weekly digest content
    socialProofTrigger.ts     # Detect evaluation milestones
  credits/
    creditEngine.ts           # Core credit awarding (transactional)
    creditRules.ts            # Load & evaluate rules
    levelProgression.ts       # Level-up detection
    badgeEngine.ts            # Badge awarding
  scheduled/
    dailyDigest.ts            # Hourly check per timezone
    weeklyDigest.ts           # Daily check per user day preference
    streakCalculator.ts       # Midnight UTC streak update
    creditExpiry.ts           # Expire old credits
```

### Integration Strategy: Piggyback on Existing Triggers

Rather than creating new Firestore triggers (cost + complexity), add engagement calls inside existing consolidated functions:

```typescript
// Inside existing onStatementCreated (fn_statementCreation.ts):
tasks.push(
  trackEngagementEvent(statement, CreditAction.CREATE_OPTION)
    .catch(err => logger.warn('Engagement tracking failed:', err))
);

// Inside existing evaluation trigger:
tasks.push(
  handleEvaluationEngagement(evaluation, statement)
    .catch(err => logger.warn('Engagement tracking failed:', err))
);
```

**Non-blocking**: Engagement tracking failures never break core functionality.

### Scheduled Functions

| Function | Schedule | Purpose |
|---|---|---|
| `sendDailyDigests` | Every hour at :00 | Check per-user timezone, build & send digest |
| `sendWeeklyDigests` | Daily at 10:00 UTC | Check per-user day preference |
| `calculateStreaks` | Daily at 00:00 UTC | Update streak counts |
| `expireCredits` | Daily at 02:00 UTC | Expire old credits if configured |

---

## Part 8: Frontend Architecture (Per-App Adapters)

### Shared Core: `packages/engagement-core` (NEW package)

Framework-agnostic pure functions + Firestore listeners. No React, no Redux, no Mithril — just vanilla TypeScript + Firebase SDK. All 4 apps import from here.

```typescript
// packages/engagement-core/src/

// Pure functions (zero dependencies)
export function calculateLevel(totalCredits: number): EngagementLevel;
export function getNextLevelThreshold(currentLevel: EngagementLevel): number;
export function canPerformAction(userLevel: number, action: string): boolean;
export function getRequiredLevel(action: string): number;
export function isStreakAtRisk(lastActiveDate: string): boolean;
export function buildDeepLink(sourceApp: SourceApp, targetPath: string): string;

// Firestore listeners (framework-agnostic, return unsubscribe functions)
export function listenToUserEngagement(userId: string, callback: (data: UserEngagement) => void): () => void;
export function listenToRecentCredits(userId: string, callback: (credits: CreditTransaction[]) => void): () => void;
export function listenToInAppNotifications(userId: string, callback: (notifs: NotificationType[]) => void): () => void;

// Firestore writes
export function updateBranchPreference(userId: string, topParentId: string, branchId: string, frequency: NotificationFrequency): Promise<void>;
export function updateDigestPreferences(userId: string, prefs: DigestPreferences): Promise<void>;
```

### Main App (React + Redux)

```
src/redux/engagement/engagementSlice.ts     # State management
src/controllers/hooks/useEngagement.ts       # Wraps engagement-core listener → Redux
src/controllers/hooks/useCreditAnimation.ts  # "+5 credits" toast
src/controllers/hooks/usePermissionGate.ts   # Level-gated UI controls
src/controllers/db/engagement/              # Firestore operations (uses engagement-core)
```

### Sign App (Next.js)

```
apps/sign/app/hooks/useEngagement.ts         # Wraps engagement-core → React state
apps/sign/app/hooks/usePermissionGate.ts     # Level-gated UI controls
apps/sign/app/components/EngagementBadge.tsx  # Thin display component
apps/sign/app/components/InAppNotificationPanel.tsx  # NEW: notification UI
```

### Mass Consensus App (Next.js + Redux)

```
apps/mass-consensus/src/hooks/useEngagement.ts       # Wraps engagement-core → Redux
apps/mass-consensus/src/hooks/usePermissionGate.ts
apps/mass-consensus/src/store/engagementSlice.ts
apps/mass-consensus/src/components/EngagementBadge.tsx
apps/mass-consensus/src/components/InAppNotificationPanel.tsx
```

### Flow App (Mithril.js)

```
apps/flow/src/engagement/
  engagementState.ts          # Mithril stream wrapping engagement-core listeners
  permissionGate.ts           # Level-gated action checks
  components/
    EngagementBadge.ts        # Mithril component (m.Component)
    InAppNotificationPanel.ts # Mithril component for notification UI
    LevelProgress.ts          # Mithril progress bar component
```

Mithril adapter pattern:
```typescript
// Mithril stream wraps the engagement-core listener
import { listenToUserEngagement } from '@freedi/engagement-core';
import stream from 'mithril/stream';

export const engagementStream = stream<UserEngagement | null>(null);

export function initEngagement(userId: string) {
  return listenToUserEngagement(userId, (data) => {
    engagementStream(data);
    m.redraw();  // Trigger Mithril re-render
  });
}
```

### Adding Any Future App

1. `npm install @freedi/engagement-core @freedi/shared-types`
2. Create framework-specific adapter (wrap listeners → framework state)
3. Create thin UI components
4. Backend engagement tracking is automatic (Firebase Functions)
5. **Total adapter code per app: ~200-400 lines**

---

## Part 9: Per-App UI/UX Design

Detailed wireframes, component hierarchies, and interaction specs are in separate files:

- **`plans/hooked-ux-main-flow-apps.md`** -- Main App + Flow App UI design
- **`plans/hooked-ux-sign-mc-apps.md`** -- Sign App + Mass Consensus App UI design

### Per-App UI Summary

#### Main App (React + Redux)
- **Branch Bell**: 5-state bell icon on every statement card (unsubscribed/instant/daily/weekly/muted) with frequency popover
- **Subscription Manager**: Full page listing all subscriptions with per-branch frequency controls
- **Level Badge**: 28px shield in HomeHeader, 48px on profile. Five colors mapped to design tokens
- **Permission Gating**: Grayed buttons with tooltip ("Reach Contributor level to create options"), overlay banners on locked sections
- **Engagement Dashboard**: New "My Impact" page with level progress ring, streak flame, badge grid, credit feed, impact stats
- **Credit Animation**: Floating "+5 credits" near action point, header badge pulse
- **Onboarding**: 5-step progressive flow (welcome → tooltip → celebration → subscription prompt → checklist)
- **Enhanced Notifications**: 6 card variants (content, credit, level-up, badge, social proof, digest)
- **In-Tree Indicators**: Activity heatmap, new content badges, subscription status on mind map nodes

#### Sign App (Next.js)
- **Notification Bell**: In topBar between Admin button and UserAvatar. Desktop dropdown, mobile bottom sheet
- **Document Subscription**: Auto-subscribe on first interaction (sign/comment/suggest). Toast with frequency change option
- **Level Gating**: Locked actions at 0.4 opacity with lock icon overlay. Almost-unlocked at 0.6 opacity with sparkle
- **Credit Feedback**: Subtle top-right toast using existing Toast pattern. No confetti -- professional feel
- **Engagement Dashboard**: Separate "My Activity" page from avatar dropdown
- **Document Evolution**: Banner on return visits showing changes, diff highlighting
- **Signature Milestones**: Banners at 10/50/100/500 signatures, "Pioneer" badge for first 10

#### Mass Consensus App (Next.js + Redux)
- **Notifications**: NO bell during swipe sessions. Bell only on results/landing pages. Action-oriented notifications with CTAs
- **Process Subscription**: Integrates into existing CompletionScreen, replacing email-only form
- **Level Gating**: Locked swipe area with lock overlay + sign-in CTA. Locked "Add Solution" shows LockedActionCard
- **Credits on CompletionScreen**: New CreditsSummary molecule between stats and badges sections. Counting animation
- **Swipe Engagement**: Credit counter on SurveyProgress ("12 of 50 evaluated +24 credits")
- **Results Impact**: PersonalImpactCard at top, UserSolutionMarker pills on user's solutions
- **MC Dashboard**: Profile card, 3-stat grid, weekly calendar streak counter, badges

#### Flow App (Mithril.js)
- **Level Badge**: Small 20px pill in shell header with candy palette colors
- **Permission Gating**: Soft prompt with lock illustration, progress bar, "Skip to evaluation" option
- **Credit Feedback**: Inline "+5 credits earned" text below action area, 2s visibility
- **Flow Completion**: Enhanced celebration with total credits, level progress, impact summary
- **Engagement Indicators**: Live participant count, impact feedback on return, community progress marker

### New CSS Variables (shared design tokens)
```scss
--engagement-level-0: var(--text-caption);   // Observer (gray)
--engagement-level-1: var(--btn-primary);    // Participant (blue)
--engagement-level-2: var(--agree);          // Contributor (teal)
--engagement-level-3: var(--option);         // Advocate (gold)
--engagement-level-4: var(--group);          // Leader (purple)
--streak-flame: #ff6b35;
--credit-earn: var(--agree);
--progress-track: var(--border-light);
--progress-fill: var(--btn-primary);
```

### New Screens Required

| App | Screen | Type |
|---|---|---|
| Main | Subscription Manager | New page |
| Main | Engagement Dashboard ("My Impact") | New page |
| Sign | Engagement Dashboard ("My Activity") | New page |
| MC | Engagement Dashboard | New page |
| Flow | (No new screens -- all inline in existing wizard) | - |

### Existing Screens Modified

| App | Screen | Changes |
|---|---|---|
| Main | HomeHeader | Level badge added |
| Main | Statement cards | Branch bell added |
| Main | InAppNotifications | New notification card variants |
| Main | Profile page | "My Impact" tab link |
| Sign | DocumentView topBar | Notification bell + panel added |
| Sign | UserAvatar dropdown | Level badge + "My Activity" link |
| MC | CompletionScreen | CreditsSummary + ProcessSubscription added |
| MC | SurveyProgress | Credit counter added |
| MC | ResultsList | PersonalImpactCard + UserSolutionMarker added |
| MC | SwipeInterface | Level gating overlay |
| Flow | Shell header | Level pill badge |
| Flow | Step completion | Credit feedback text |
| Flow | Done stage | Subscription panel |

---

## Part 10: In-App Notification System Enhancement

### Current State
- Main app has real-time `inAppNotifications` listener + Redux slice + UI panel
- Sign/MC apps have zero in-app notification UI

### Enhancement Plan

**Shared in-app notification listener** (framework-agnostic):

```typescript
// packages/engagement-core or shared-types
export function createInAppNotificationListener(
  userId: string,
  onNotification: (notifications: NotificationType[]) => void,
  onError: (error: Error) => void
): () => void {  // returns unsubscribe function
  // Firestore onSnapshot on inAppNotifications where userId == userId
}
```

Each app wraps this with its own state management:
- Main app: dispatches to Redux (existing pattern, extend)
- Sign app: stores in Zustand/React state
- MC app: stores in Redux
- Flow app: Mithril stream (see Part 8 adapter pattern)

**New notification types** for engagement events:
- Credit earned ("+5 credits for evaluating")
- Level up ("You reached Contributor level!")
- Badge earned ("You earned the 7-Day Streak badge!")
- Digest ready ("Your daily summary is ready")

---

## Part 11: Implementation Phases (All Apps Simultaneously)

All phases build ALL apps in parallel. The `engagement-core` package ensures consistent behavior across apps from day one.

### Phase 0: Foundation (Week 1-2)
**Zero user impact. Types, infrastructure, shared package.**

1. Create `packages/engagement-core/` package with pure functions + Firestore listeners
2. Add all new types to `packages/shared-types/src/models/engagement/`
3. Add new collection names to Collections enum
4. Add `PermissionModel.ts` with level-gated action definitions
5. Create Firestore indexes + security rules (including level-gating rules)
6. Seed `creditRules` with default configuration
7. Create `functions/src/engagement/` directory structure

**Files to create:**
- `packages/engagement-core/` (entire new package)
- `packages/shared-types/src/models/engagement/` (all type files)
- `firestore.indexes.json`: New composite indexes
- `firestore.rules`: New collection + level-gating rules

### Phase 1: Credit Engine + Permission System (Week 3-5)
**Backend processing. Level gating enforced server-side.**

1. Implement `creditEngine.ts` with transactional credit awarding
2. Implement `creditRules.ts` with anti-gaming checks
3. Implement `levelProgression.ts` with level-up detection
4. Implement `badgeEngine.ts` for achievements
5. Implement `streakCalculator.ts` scheduled function
6. Implement permission enforcement in security rules
7. Implement "trial mode" for new users (24h Level 1 access)
8. Add engagement tracking to existing `onStatementCreated` and evaluation triggers
9. Backfill `userEngagement` docs for existing users

**Files to create:**
- `functions/src/engagement/credits/creditEngine.ts`
- `functions/src/engagement/credits/creditRules.ts`
- `functions/src/engagement/credits/levelProgression.ts`
- `functions/src/engagement/credits/badgeEngine.ts`
- `functions/src/engagement/scheduled/streakCalculator.ts`

**Files to modify:**
- `functions/src/fn_statementCreation.ts` (add engagement tracking call)
- `functions/src/index.ts` (register new functions)
- `firestore.rules` (add level-gating write rules)

### Phase 2: Notification Queue + All-App Adapters (Week 6-8)
**Notification infrastructure for ALL apps simultaneously.**

1. Implement `notificationQueue` processor + channel router
2. Implement social proof triggers (evaluation milestones)
3. Wire queue to existing FCM pipeline for push
4. Wire queue to email pipeline (extend `fn_emailNotifications.ts`)
5. **Main app**: Extend existing in-app notification UI with engagement types
6. **Sign app**: Create in-app notification panel (new component)
7. **MC app**: Create in-app notification panel (new component)
8. **Flow app**: Create Mithril notification component
9. Create per-app engagement adapters (hooks/streams wrapping engagement-core)

**Files to create:**
- `functions/src/engagement/notifications/queueProcessor.ts`
- `functions/src/engagement/notifications/channelRouter.ts`
- `functions/src/engagement/notifications/socialProofTrigger.ts`
- Main app: `src/controllers/hooks/useEngagement.ts`, `usePermissionGate.ts`
- Sign app: `apps/sign/app/hooks/useEngagement.ts`, notification panel
- MC app: `apps/mass-consensus/src/hooks/useEngagement.ts`, notification panel
- Flow app: `apps/flow/src/engagement/engagementState.ts`, notification component

### Phase 3: Digests + Branch Subscriptions (Week 9-11)
**Re-engagement loops + subscription management across all apps.**

1. Implement digest aggregator + daily/weekly scheduled functions
2. Create digest email templates
3. **All apps**: Add digest preference UI to settings
4. **All apps**: Create BranchBell + FrequencySelector components
5. **Main app**: SubscriptionManager page + SCSS atoms/molecules
6. **Sign app**: Document subscription preferences UI
7. **MC app**: Process subscription preferences UI
8. **Flow app**: Flow step subscription preferences

**Files to create:**
- `functions/src/engagement/notifications/digestAggregator.ts`
- `functions/src/engagement/scheduled/dailyDigest.ts`
- `functions/src/engagement/scheduled/weeklyDigest.ts`
- SCSS atoms/molecules (see Part 9)
- Per-app subscription UI components

### Phase 4: Credits & Rewards UI (Week 12-14)
**Gamification visible across ALL apps.**

1. **Main app**: Full EngagementDashboard page, credit animation, level-up celebration, badge grid
2. **Sign app**: Level badge in header, credit toast, simplified impact view
3. **MC app**: Connect existing CompletionScreen/AchievementBadge to credit system, level badge
4. **Flow app**: Mithril level progress + badge components
5. Onboarding flow for new users (tooltips, first-action celebration, subscription prompt)

**Files to create:**
- `src/redux/engagement/engagementSlice.ts`
- `src/controllers/hooks/useCreditAnimation.ts`
- Profile engagement components (see Part 9)
- Per-app level badge + credit toast components
- Onboarding components (all apps)

### Phase 5: Polish + Capacitor Prep (Week 15-16)
**Refinement and native readiness.**

1. A/B test notification frequency defaults
2. Analytics for engagement funnel tracking
3. Accessibility audit of all new components
4. Anti-gaming tuning based on initial data
5. Prepare Capacitor-ready token handling:
   - `pushNotifications` collection supports `platform: 'web' | 'android-native' | 'ios-native'`
   - Channel router handles platform-specific push delivery
   - Deep link paths work with Capacitor's app URL scheme
6. **No Capacitor code yet** — just ensuring the architecture supports it when native apps ship

---

## Part 12: Ethical Design Guardrails

- **No dark patterns**: No fake urgency, no hidden unsubscribe, no guilt-tripping
- **No addictive loops**: Daily credit cap (100), streak doesn't reset on 1 missed day
- **No comparison pressure**: No public leaderboards that shame low-activity users
- **No notification spam**: Quiet hours enforced, easy mute, frequency always user-controlled
- **No pay-to-win**: Credits only from genuine participation
- **Full user control**: Every notification channel and branch is independently configurable

---

## Part 13: Key Existing Files to Reference

### Notification Infrastructure (extend, don't replace)
- `src/services/notificationService.ts` - Main notification orchestrator
- `src/services/pushService.ts` - FCM push operations
- `src/services/platformService.ts` - Platform detection (iOS, Android, web)
- `src/services/notificationRepository.ts` - Firestore persistence
- `functions/src/fn_notifications.ts` - Backend notification triggers
- `functions/src/fn_emailNotifications.ts` - Email pipeline
- `public/firebase-messaging-sw.js` - Service worker for background push

### Subscription System (extend)
- `packages/shared-types/src/models/statement/StatementSubscription.ts`
- `src/controllers/db/subscriptions/` - CRUD operations

### Data Models (follow patterns)
- `packages/shared-types/src/models/notification/Notification.ts` - Existing notification types
- `packages/shared-types/src/models/collections/collectionsModel.ts` - Collections enum

### Redux (follow patterns)
- `src/redux/notificationsSlice/notificationsSlice.ts` - Existing notification state
- `src/redux/store.ts` - Store configuration

### Existing Patterns to Reuse
- Firestore trigger consolidation: `fn_statementCreation.ts`
- Scheduled functions: `fn_tokenCleanup.ts` (onSchedule pattern)
- Valibot schemas: every model in shared-types
- Quiet hours: already implemented in `pushService.ts`
- Multi-device tokens: already in `pushNotifications` collection

---

## Verification Plan

### Phase 0-1 (Backend)
- Deploy functions to test environment (`npm run deploy:f:test`)
- Create test statements and evaluations
- Verify credit transactions appear in `creditLedger`
- Verify `userEngagement` docs update correctly
- Check Firebase Functions logs for errors

### Phase 2-3 (Notifications)
- Create evaluation, verify social proof notification in queue
- Verify push notification delivery via existing FCM pipeline
- Verify daily digest email content and timing
- Test quiet hours blocking

### Phase 4-5 (Frontend)
- `npm run check-all` (lint + typecheck + build)
- Manual testing of branch bell interactions
- Manual testing of engagement dashboard
- Verify credit animations trigger on actions

### All Apps (every phase)
- Test engagement-core package: `cd packages/engagement-core && npm run build && npm test`
- Test main app: `npm run check-all`
- Test Sign app: `cd apps/sign && npm run build`
- Test MC app: `cd apps/mass-consensus && npm run build`
- Test Flow app: `cd apps/flow && npm run build`
- Verify cross-app notifications route correctly

### All Phases
- No `any` types
- All errors use `logError()` with context
- All timestamps in milliseconds
- All Firestore operations use utilities
- All new strings use `useTranslation()`
