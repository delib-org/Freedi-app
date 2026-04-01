# Freedi Engagement System

## Overview

The Freedi Engagement System is a **"Hooked" model** gamification layer that drives user participation across all Freedi apps (Main, Sign, Mass Consensus, Flow). It awards credits for meaningful actions, progresses users through 5 levels, tracks streaks, awards badges, and delivers smart notifications — all designed to encourage sustained deliberative engagement.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Credit System](#credit-system)
4. [Levels & Progression](#levels--progression)
5. [Badges](#badges)
6. [Streaks](#streaks)
7. [Permission Gating](#permission-gating)
8. [Notification System](#notification-system)
9. [Digest System](#digest-system)
10. [Frontend Integration](#frontend-integration)
11. [UI Components](#ui-components)
12. [Multi-App Support](#multi-app-support)
13. [Firestore Schema](#firestore-schema)
14. [Data Flow Examples](#data-flow-examples)
15. [File Locations](#file-locations)
16. [Design Tokens & Styling](#design-tokens--styling)
17. [Translation Keys](#translation-keys)
18. [Deployment & Configuration](#deployment--configuration)

---

## Core Concepts

### The Hooked Model

The system follows Nir Eyal's "Hooked" framework with 4 phases:

| Phase | Description | Implementation |
|-------|-------------|----------------|
| **Trigger** | External or internal cue to engage | Notifications, social proof, streak reminders |
| **Action** | The behavior the user takes | Evaluate, comment, vote, create options |
| **Variable Reward** | Unpredictable positive outcomes | Credits with diminishing returns, badge surprises, consensus shifts |
| **Investment** | User puts something back in | Subscriptions, preferences, discussion creation |

### Action Levels (Difficulty Tiers)

| Level | Actions | Description |
|-------|---------|-------------|
| 0 | Browse, read | Passive consumption |
| 1 | Evaluate, vote, react | Low-effort participation |
| 2 | Comment, subscribe, create options | Medium-effort contribution |
| 3 | Create discussions, invite friends | High-effort leadership |

---

## Architecture

### System Layers

```
                          ┌─────────────────────────────────┐
                          │         Shared Types             │
                          │  packages/shared-types/          │
                          │  models/engagement/              │
                          └──────────┬──────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
         ┌──────────▼──────┐  ┌─────▼──────┐  ┌─────▼──────────┐
         │ Engagement Core │  │  Cloud Fns  │  │   Frontend     │
         │ packages/       │  │  functions/  │  │   Apps         │
         │ engagement-core │  │  src/        │  │                │
         └─────────────────┘  │  engagement/ │  │  Main (Redux)  │
                              └──────────────┘  │  Sign (Zustand)│
                                                │  MC (React)    │
                                                │  Flow (Module) │
                                                └────────────────┘
```

### Dependency Direction

```
Shared Types ← Engagement Core ← Cloud Functions
                                ← Frontend Apps
```

All apps share the same Firestore documents, ensuring real-time sync across platforms.

---

## Credit System

### How Credits Work

Credits are the core currency of the engagement system. Users earn credits by performing meaningful actions. Credits accumulate to determine the user's level.

### Credit Rules (Default Configuration)

| Action | Credits | Cooldown | Daily Limit | Quality Gate |
|--------|---------|----------|-------------|--------------|
| JOIN_DISCUSSION | 5 | — | 10 | — |
| EVALUATE_OPTION | 3 | 30s | 20 | — |
| CREATE_OPTION | 10 | — | 5 | 20 chars min |
| COMMENT | 2 | — | 15 | 10 chars min |
| VOTE | 5 | — | 10 | — |
| SIGN_DOCUMENT | 10 | — | 5 | — |
| DAILY_LOGIN | 2 | — | 1 | — |
| STREAK_BONUS | 15 | — | 1 | 7-day multiple |
| CONSENSUS_REACHED | 25 | — | 5 | — |
| SUGGESTION_ACCEPTED | 30 | — | 5 | — |
| MC_PARTICIPATION | 3 | 10s | 50 | — |
| INVITE_FRIEND | 10 | — | 5 | — |

### Anti-Gaming Protections

- **Daily Credit Cap**: Maximum 100 credits per user per day
- **Diminishing Returns**: Each repeated action within the same day yields 90% of the previous (factor: 0.9)
- **Cooldown Periods**: Prevents rapid-fire actions (e.g., 30s between evaluations)
- **Daily Limits**: Per-action caps (e.g., max 20 evaluations/day)
- **Quality Gates**: Minimum content length for text-based actions
- **Atomic Transactions**: Firestore transactions prevent double-crediting

### Credit Award Flow

```
User Action → trackEngagement() → awardCredit()
                                       │
                                  ┌────▼─────┐
                                  │ Validate  │
                                  │ cooldown  │
                                  │ daily cap │
                                  │ quality   │
                                  └────┬──────┘
                                       │
                              ┌────────▼────────┐
                              │ Firestore        │
                              │ Transaction:     │
                              │ • creditLedger + │
                              │ • userEngagement │
                              └────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │ Post-Transaction  │
                              │ (non-blocking):   │
                              │ • Level-up check  │
                              │ • Badge check     │
                              └──────────────────┘
```

### Key Code

- **Credit Engine**: `functions/src/engagement/credits/creditEngine.ts`
- **Default Rules**: `functions/src/engagement/credits/defaultCreditRules.ts`
- **Rule Management**: `functions/src/engagement/credits/creditRules.ts`
- **Credit Utilities**: `packages/engagement-core/src/creditUtils.ts`

---

## Levels & Progression

### 5 Engagement Levels

| Level | Name | Credits Required | Unlocks |
|-------|------|-----------------|---------|
| 0 | Observer | 0 | Browse, read |
| 1 | Participant | 50 | Evaluate, vote, react |
| 2 | Contributor | 200 | Comment, create options, subscribe |
| 3 | Advocate | 500 | Create discussions, invite friends |
| 4 | Leader | 1,500 | Advanced analytics |

### Level Progression Utilities

```typescript
import {
  calculateLevel,       // credits → EngagementLevel
  getNextLevelThreshold, // credits → next milestone
  getLevelProgress,      // credits → percentage (0-100)
  didLevelUp,           // oldCredits, newCredits → boolean
  getLevelName           // level → display name
} from '@freedi/engagement-core';
```

### Trial Mode

New users receive a **24-hour trial** granting Level 1 permissions without needing credits. This lets them experience participation before committing.

- Trial activates on first engagement doc creation
- Expires after 24 hours (`trialModeExpiresAt` timestamp)
- Checked in `canUserPerformAction()` — trial users can perform Level 1 actions

### Key Code

- **Level Progression**: `functions/src/engagement/credits/levelProgression.ts`
- **Level Utilities**: `packages/engagement-core/src/levelUtils.ts`

---

## Badges

### Badge Definitions

| Badge ID | Name | Trigger |
|----------|------|---------|
| `first_evaluation` | First Evaluation | Complete 1 evaluation |
| `evaluator_10` | Active Evaluator | Complete 10 evaluations |
| `evaluator_50` | Super Evaluator | Complete 50 evaluations |
| `first_option` | Idea Starter | Create 1 option |
| `creator_5` | Prolific Creator | Create 5 options |
| `streak_3` | 3-Day Streak | Maintain 3-day streak |
| `streak_7` | Week Warrior | Maintain 7-day streak |
| `streak_30` | Monthly Champion | Maintain 30-day streak |
| `first_vote` | First Vote | Cast 1 vote |
| `commenter_10` | Active Commenter | Write 10 comments |

### How Badges are Awarded

1. After each credit transaction, `checkAndAwardBadges()` runs (non-blocking)
2. Checks all badge definitions against user stats
3. Skips already-awarded badges
4. Appends new badges via `FieldValue.arrayUnion()`
5. Enqueues `BADGE_EARNED` notification (IN_APP + PUSH)

### Key Code

- **Badge Engine**: `functions/src/engagement/credits/badgeEngine.ts`

---

## Streaks

### How Streaks Work

Streaks track consecutive days of activity. The system includes a **grace day** to be forgiving:

| Scenario | Result |
|----------|--------|
| User active today | Streak continues |
| User missed 1 day, grace unused | Grace day consumed, streak continues |
| User missed 1 day, grace already used | Streak resets to 0 |
| User missed 2+ days | Streak resets to 0 |

### Streak Bonus

Every 7th consecutive day awards a **STREAK_BONUS** of 15 credits.

### Scheduled Calculation

A Cloud Function runs **daily at 00:05 UTC** (`performStreakCalculation`):
- Batch processes all `userEngagement` documents (500-doc batches)
- Resets inactive users' streaks
- Marks grace days for borderline users

### At-Risk Detection

The `isStreakAtRisk()` utility detects when a user hasn't been active for 2+ days, triggering visual warnings in the UI (pulsing streak indicator).

### Key Code

- **Streak Calculator**: `functions/src/engagement/scheduled/streakCalculator.ts`
- **Streak Utilities**: `packages/engagement-core/src/streakUtils.ts`

---

## Permission Gating

### Level Requirements per Action

| Action | Required Level |
|--------|---------------|
| Browse/View | Observer (0) |
| Evaluate options | Participant (1) |
| Vote | Participant (1) |
| React | Participant (1) |
| Comment | Contributor (2) |
| Create options | Contributor (2) |
| Create suggestions | Contributor (2) |
| Subscribe to discussions | Contributor (2) |
| Create discussions | Advocate (3) |
| Invite friends | Advocate (3) |
| Advanced analytics | Leader (4) |

### Permission Checking

```typescript
import { canUserPerformAction, getLockedActionMessage, isAlmostUnlocked } from '@freedi/engagement-core';

// Check if user can perform action
const allowed = canUserPerformAction(userEngagement, 'COMMENT');

// Get user-friendly locked message
const message = getLockedActionMessage('COMMENT'); // "Reach Contributor level to comment"

// Check if user is close (80%+ progress to next level)
const almost = isAlmostUnlocked(userEngagement, 'COMMENT');
```

### Frontend Hook

```typescript
const { allowed, lockedMessage, almostUnlocked } = usePermissionGate('COMMENT');

if (!allowed) {
  // Show locked message, optionally with "almost there!" encouragement
}
```

### Key Code

- **Permission Model**: `packages/shared-types/src/models/engagement/PermissionModel.ts`
- **Permission Utilities**: `packages/engagement-core/src/permissionUtils.ts`
- **usePermissionGate Hook**: `src/controllers/hooks/usePermissionGate.ts`

---

## Notification System

### Notification Channels

| Channel | Description | Used For |
|---------|-------------|----------|
| **PUSH** | Firebase Cloud Messaging (FCM) | Instant alerts, level-ups, digests |
| **IN_APP** | Firestore `inAppNotifications` collection | All engagement notifications |
| **EMAIL** | Email delivery (template-based) | Weekly digests |

### Notification Triggers

| Trigger | Channels | Frequency |
|---------|----------|-----------|
| STATEMENT_REPLY | PUSH, IN_APP | Per user preference |
| SOCIAL_PROOF | IN_APP, PUSH | Instant |
| CONSENSUS_SHIFT | IN_APP | Instant |
| CREDIT_EARNED | IN_APP | Instant |
| LEVEL_UP | IN_APP, PUSH | Instant |
| BADGE_EARNED | IN_APP, PUSH | Instant |
| STREAK_REMINDER | PUSH | Instant |
| DAILY_DIGEST | PUSH, EMAIL | Daily |
| WEEKLY_DIGEST | EMAIL | Weekly |

### Queue Processing

1. Notification enqueued to `notificationQueue` collection
2. Firestore `onCreate` trigger fires `processQueueItem()`
3. Respects `deliverAt` scheduling (delayed delivery)
4. Routes to all specified channels via `channelRouter`
5. Max 3 retries before marking FAILED
6. Hourly batch processor catches stuck items (>5 min in PROCESSING)

### Social Proof Triggers

- **Evaluation Milestones**: At 5, 10, 25, 50, 100 evaluators, option creator gets notified: "N people evaluated your option"
- **Consensus Shifts**: >15% change in consensus notifies option creator: "Agreement increased/decreased by X%"

### Key Code

- **Queue Processor**: `functions/src/engagement/notifications/queueProcessor.ts`
- **Channel Router**: `functions/src/engagement/notifications/channelRouter.ts`
- **Social Proof**: `functions/src/engagement/notifications/socialProofTrigger.ts`

---

## Digest System

### Daily Digest

- **Schedule**: Runs every hour at :00 UTC
- **Target Users**: Those with `digestPreferences.dailyDigest = true`
- **Timezone-Aware**: Matches user's preferred delivery hour
- **Content**: Aggregates last 24h of notifications + credit summary
- **Channels**: PUSH + EMAIL

### Weekly Digest

- **Schedule**: Runs daily at 10:00 UTC
- **Target Users**: Those with `digestPreferences.weeklyDigest = true`
- **Day Matching**: Only delivers on user's `preferredDay` (0=Sunday)
- **Content**: Aggregates last 7 days, up to 50 items
- **Channels**: EMAIL only

### Key Code

- **Digest Aggregator**: `functions/src/engagement/scheduled/digestAggregator.ts`
- **Daily Digest**: `functions/src/engagement/scheduled/dailyDigest.ts`
- **Weekly Digest**: `functions/src/engagement/scheduled/weeklyDigest.ts`

---

## Frontend Integration

### Main App (React + Redux)

#### Redux State

```typescript
// State shape in engagementSlice
{
  userEngagement: UserEngagement | null,
  recentCredits: CreditTransaction[],
  loading: boolean,
  error: string | null
}

// Selectors
userEngagementSelector      // Full engagement object
userLevelSelector           // EngagementLevel enum
totalCreditsSelector        // number
userBadgesSelector          // Badge[]
currentStreakSelector        // number
isTrialModeSelector         // boolean
recentCreditsSelector       // CreditTransaction[]
```

#### Firestore Listeners

Set up in `Home.tsx` on mount:

```typescript
import { listenToUserEngagement, listenToRecentCredits } from '@/controllers/db/engagement/db_engagement';

// In useEffect:
const unsubEngagement = listenToUserEngagement(userId);
const unsubCredits = listenToRecentCredits(userId);
```

#### Custom Hooks

| Hook | Purpose | Returns |
|------|---------|---------|
| `useEngagement()` | Main engagement data | `{ engagement, level, levelName, levelProgress, nextLevelThreshold, totalCredits, badges, currentStreak, isTrialMode, loading, recentCredits }` |
| `usePermissionGate(action)` | Access control check | `{ allowed, lockedMessage, almostUnlocked }` |
| `useCreditAnimation()` | Toast trigger for new credits | `{ toast, dismissToast }` |
| `useBranchBell(topParentId, branchId?)` | Notification frequency state | `{ bellState, onFrequencyChange }` |

#### Subscription Management

```typescript
import { updateBranchPreference, updateSubscriptionFrequency } from '@/controllers/db/engagement/db_branchPreferences';

// Update per-branch notification frequency
await updateBranchPreference(topParentId, branchId, NotificationFrequency.DAILY);

// Update discussion-level frequency
await updateSubscriptionFrequency(topParentId, NotificationFrequency.WEEKLY);
```

---

## UI Components

### Component Hierarchy

```
Home Page (Home.tsx)
├── HomeHeader
│   └── ProfileAvatar (level-colored ring)
│       └── Link → /my/engagement
├── MainCard (per subscription)
│   └── BranchBell → FrequencySelector (popover)
└── CreditToast (floating overlay)

/my/engagement → EngagementDashboard
├── LevelBadge (large)
├── StreakIndicator (with at-risk warning)
├── LevelProgress (thick bar)
├── Stats Grid (credits, evaluations, options)
├── Badges Grid
└── Recent Activity Feed

/my/subscriptions → SubscriptionManager
└── SubscriptionRow[]
    └── BranchBell → FrequencySelector
```

### Atomic Components (Main App)

#### Atoms

| Component | File | Purpose |
|-----------|------|---------|
| **BranchBell** | `src/view/components/atomic/atoms/BranchBell/BranchBell.tsx` | Bell icon with 5 frequency states, opens FrequencySelector |
| **LevelBadge** | `src/view/components/atomic/atoms/LevelBadge/LevelBadge.tsx` | Color-coded pill showing engagement level |
| **LevelProgress** | `src/view/components/atomic/atoms/LevelProgress/LevelProgress.tsx` | Progress bar toward next level |
| **CreditToast** | `src/view/components/atomic/atoms/CreditToast/CreditToast.tsx` | Floating "+N credits" animation (auto-hides 1.5s) |
| **StreakIndicator** | `src/view/components/atomic/atoms/StreakIndicator/StreakIndicator.tsx` | Flame icon + streak count, pulsing when at-risk |
| **ProfileAvatar** | `src/view/components/atomic/atoms/ProfileAvatar/ProfileAvatar.tsx` | Photo/initials circle with level-colored border ring |

#### Molecules

| Component | File | Purpose |
|-----------|------|---------|
| **FrequencySelector** | `src/view/components/atomic/molecules/FrequencySelector/FrequencySelector.tsx` | Popover with 4 frequency options (Instant/Daily/Weekly/Mute) |

#### Pages

| Page | Route | File |
|------|-------|------|
| **EngagementDashboard** | `/my/engagement` | `src/view/pages/engagement/EngagementDashboard.tsx` |
| **SubscriptionManager** | `/my/subscriptions` | `src/view/pages/subscriptions/SubscriptionManager.tsx` |

#### Other Components

| Component | File | Purpose |
|-----------|------|---------|
| **EngagementNotificationCard** | `src/view/components/engagementNotificationCard/EngagementNotificationCard.tsx` | Card for engagement notifications in notification feed |

### Component Props Reference

#### BranchBell

```typescript
interface BranchBellProps {
  state: 'unsubscribed' | 'instant' | 'daily' | 'weekly' | 'muted';
  size?: 'small' | 'medium' | 'large';  // default: 'medium'
  disabled?: boolean;
  onFrequencyChange: (frequency: NotificationFrequency) => void;
  className?: string;
  ariaLabel?: string;
}
```

#### LevelBadge

```typescript
interface LevelBadgeProps {
  level: EngagementLevel;
  size?: 'small' | 'medium' | 'large';  // default: 'medium'
  iconOnly?: boolean;
  className?: string;
}
```

#### LevelProgress

```typescript
interface LevelProgressProps {
  progress: number;      // 0-100, clamped
  currentCredits: number;
  nextThreshold: number;
  thick?: boolean;
  showLabel?: boolean;   // default: true
  className?: string;
}
```

#### CreditToast

```typescript
interface CreditToastProps {
  amount: number;
  onComplete?: () => void;  // called after 1.5s animation
}
```

#### StreakIndicator

```typescript
interface StreakIndicatorProps {
  count: number;          // returns null if <= 0
  lastActiveDate?: string; // YYYY-MM-DD for at-risk detection
  className?: string;
}
```

#### FrequencySelector

```typescript
interface FrequencySelectorProps {
  currentFrequency: NotificationFrequency;
  onSelect: (frequency: NotificationFrequency) => void;
  onClose: () => void;
  className?: string;
}
```

### Accessibility Features

All engagement components follow WCAG AA standards:

- **ARIA roles**: button, listbox, option, progressbar, region, status, group
- **ARIA labels**: Descriptive labels on all interactive elements
- **ARIA live regions**: Polite announcements for credit toasts
- **Keyboard navigation**: Full support in FrequencySelector (Arrow keys, Home/End, Escape)
- **Focus management**: Visible outlines, focus restoration after popover close
- **Reduced motion**: All animations respect `@media (prefers-reduced-motion: reduce)`
- **Semantic HTML**: `<dl>`/`<dt>`/`<dd>` for definitions, `<time>` elements for dates

---

## Multi-App Support

Each Freedi app integrates the engagement system using its native state management:

### Main App (React + Redux)

- **State**: Redux Toolkit slice (`src/redux/engagement/engagementSlice.ts`)
- **Listeners**: Firestore `onSnapshot` dispatching to Redux
- **Hooks**: `useEngagement()`, `usePermissionGate()`, `useCreditAnimation()`, `useBranchBell()`
- **Key file**: `src/controllers/db/engagement/db_engagement.ts`

### Sign App (Next.js + Zustand)

- **State**: Zustand store (`apps/sign/src/store/engagementStore.ts`)
- **Methods**: `startListening(userId)`, `stopListening()`, `canPerformAction()`, `getLockedMessage()`
- **Computed getters**: level, levelName, levelProgress, totalCredits, badges, currentStreak

### Mass Consensus App (Next.js + React Hooks)

- **State**: Pure React state via custom hook (`apps/mass-consensus/src/hooks/useEngagement.ts`)
- **Components**: `LevelBadge`, `CreditsSummary`, `EngagementSummary`
- **Location**: `apps/mass-consensus/src/components/engagement/`

### Flow App (Mithril.js + Module State)

- **State**: Module-level variables (`apps/flow/src/lib/engagement.ts`)
- **Functions**: `startEngagementListener()`, `stopEngagementListener()`, `getUserLevel()`, `canPerformAction()`
- **Components**: `LevelPill`, `CreditFeedback`, `FlowCompletionEngagement`
- **Location**: `apps/flow/src/engagement/components/`

### All Apps Share

- Same Firestore documents (`userEngagement`, `creditLedger`)
- Same shared types (`@freedi/shared-types`)
- Same core utilities (`@freedi/engagement-core`)

---

## Firestore Schema

### Collections

| Collection | Document ID | Purpose |
|------------|------------|---------|
| `userEngagement` | `{userId}` | User's engagement state (level, credits, badges, streak, preferences) |
| `creditLedger` | `{transactionId}` | Immutable credit transaction log |
| `creditRules` | `{actionName}` | Admin-configurable credit rules (cached 5 min server-side) |
| `notificationQueue` | `{queueItemId}` | Pending/queued notifications with routing info |
| `inAppNotifications` | `{notificationId}` | Delivered in-app notifications |
| `pushNotifications` | `{token}` | Push token registry (userId field indexed) |
| `statementsSubscribe` | `{userId}--{topParentId}` | User subscriptions with branchPreferences map |

### UserEngagement Document

```typescript
{
  userId: string;
  totalCredits: number;
  level: EngagementLevel;           // 0-4
  badges: Badge[];                  // { badgeId, name, description, icon, awardedAt }
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string;         // YYYY-MM-DD
    graceDayUsed: boolean;
  };
  digestPreferences: {
    dailyDigest: boolean;
    weeklyDigest: boolean;
    preferredHour: number;          // 0-23, UTC
    preferredDay: number;           // 0=Sunday
    timezone: string;
  };
  trialModeActive: boolean;
  trialModeExpiresAt: number;       // milliseconds
  totalEvaluations: number;
  totalOptions: number;
  totalComments: number;
  totalVotes: number;
  dailyCreditsEarned: number;
  dailyCreditResetDate: string;     // YYYY-MM-DD
  createdAt: number;                // milliseconds
  lastUpdate: number;               // milliseconds
}
```

### CreditTransaction Document

```typescript
{
  transactionId: string;
  userId: string;
  action: CreditAction;
  amount: number;
  sourceApp: string;                // 'main' | 'sign' | 'mc' | 'flow'
  sourceId?: string;                // statementId, evaluationId, etc.
  metadata?: Record<string, string>;
  createdAt: number;                // milliseconds
}
```

---

## Data Flow Examples

### User Evaluates an Option (Full Flow)

```
1. User clicks "evaluate" in the UI
2. Evaluation saved to Firestore

3. Firebase trigger → trackEvaluationEngagement()
4. → awardCredit({ userId, action: EVALUATE_OPTION, sourceApp: 'main' })

5. creditEngine transaction:
   a. Load/create userEngagement doc
   b. Load credit rule (EVALUATE_OPTION: 3 credits, 30s cooldown, 20/day)
   c. Validate: cooldown passed? daily limit ok? daily cap ok?
   d. Apply diminishing returns (0.9^N if repeated today)
   e. Write creditLedger doc (immutable transaction record)
   f. Update userEngagement: totalCredits += amount, level recalculated

6. Post-transaction (non-blocking .catch()):
   a. checkAndNotifyLevelUp() → if leveled up, enqueue LEVEL_UP notification
   b. checkAndAwardBadges() → check all badge triggers, append new ones

7. notificationQueue onCreate trigger → processQueueItem()
   a. Route to IN_APP → write inAppNotifications doc
   b. Route to PUSH → send via FCM to user's tokens

8. Frontend Firestore listener fires:
   a. listenToUserEngagement → Redux dispatch → UI updates (level, credits)
   b. listenToRecentCredits → Redux dispatch → CreditToast appears
```

### Daily Streak Calculation

```
1. Scheduled function fires at 00:05 UTC daily
2. Batch loads all userEngagement docs (500 at a time)
3. For each user:
   - Active today: no change
   - Missed 1 day, grace unused: grace consumed
   - Missed 1 day, grace already used: streak = 0
   - Missed 2+ days: streak = 0
4. Batch commits updates
```

### Daily Digest Delivery

```
1. Scheduled function fires every hour at :00 UTC
2. Get current UTC hour
3. Query users: dailyDigest=true AND preferredHour matches
4. For each user:
   a. buildDailyDigest() → aggregate last 24h notifications + credits
   b. Enqueue DAILY_DIGEST notification (PUSH + EMAIL channels)
5. Queue processor sends to each channel
```

---

## File Locations

### Shared Packages

```
packages/shared-types/src/models/engagement/
├── EngagementModel.ts       # UserEngagement, EngagementLevel, LEVEL_THRESHOLDS
├── CreditModel.ts           # CreditRule, CreditTransaction, CreditAction
├── PermissionModel.ts       # ACTION_LEVEL_REQUIREMENTS, permission functions
├── NotificationModel.ts     # NotificationFrequency, TriggerType, QueueItem
├── DigestModel.ts           # DigestContent, DigestItem
├── HookModel.ts             # HookPhase, ActionLevel
└── index.ts                 # Re-exports

packages/engagement-core/src/
├── creditUtils.ts           # DAILY_CREDIT_CAP, diminishing returns, cooldown
├── levelUtils.ts            # calculateLevel, getLevelProgress, didLevelUp
├── streakUtils.ts           # updateStreakForActivity, isStreakAtRisk
├── permissionUtils.ts       # canUserPerformAction, getLockedActionMessage
└── index.ts                 # Re-exports all + types
```

### Cloud Functions

```
functions/src/engagement/
├── credits/
│   ├── creditEngine.ts      # awardCredit(), atomic transaction
│   ├── creditRules.ts       # loadCreditRules(), getCreditRule()
│   ├── defaultCreditRules.ts # 12 preconfigured rules
│   ├── levelProgression.ts  # checkAndNotifyLevelUp()
│   ├── badgeEngine.ts       # checkAndAwardBadges(), 10 badge definitions
│   └── trackEngagement.ts   # trackStatementCreation, trackEvaluation, etc.
├── notifications/
│   ├── queueProcessor.ts    # processQueueItem(), processPendingQueueItems()
│   ├── channelRouter.ts     # routeToChannels() → PUSH, IN_APP, EMAIL
│   └── socialProofTrigger.ts # checkSocialProofMilestone, checkConsensusShift
└── scheduled/
    ├── streakCalculator.ts  # performStreakCalculation() (daily 00:05 UTC)
    ├── dailyDigest.ts       # sendDailyDigests() (hourly)
    ├── weeklyDigest.ts      # sendWeeklyDigests() (daily 10:00 UTC)
    └── digestAggregator.ts  # buildDailyDigest(), buildWeeklyDigest()
```

### Main App Frontend

```
src/redux/engagement/
└── engagementSlice.ts       # Redux state, actions, selectors

src/controllers/db/engagement/
├── db_engagement.ts         # Firestore listeners (userEngagement, creditLedger)
└── db_branchPreferences.ts  # Subscription frequency management

src/controllers/hooks/
├── useEngagement.ts         # Main engagement data hook
├── usePermissionGate.ts     # Access control hook
├── useCreditAnimation.ts    # Credit toast trigger hook
└── useBranchBell.ts         # Notification frequency state hook

src/view/pages/
├── engagement/
│   └── EngagementDashboard.tsx  # "My Impact" page
└── subscriptions/
    └── SubscriptionManager.tsx  # Subscription frequency management page

src/view/components/atomic/
├── atoms/
│   ├── BranchBell/BranchBell.tsx
│   ├── LevelBadge/LevelBadge.tsx
│   ├── LevelProgress/LevelProgress.tsx
│   ├── CreditToast/CreditToast.tsx
│   ├── StreakIndicator/StreakIndicator.tsx
│   └── ProfileAvatar/ProfileAvatar.tsx
└── molecules/
    └── FrequencySelector/FrequencySelector.tsx

src/view/components/engagementNotificationCard/
└── EngagementNotificationCard.tsx
```

### SCSS Styles

```
src/view/style/
├── atoms/
│   ├── _branch-bell.scss         # BranchBell styles (152 lines)
│   ├── _level-badge.scss         # LevelBadge + LevelProgress + CreditToast + StreakIndicator (258 lines)
│   └── _profile-avatar.scss      # ProfileAvatar styles (110 lines)
└── molecules/
    ├── _frequency-selector.scss  # FrequencySelector popover (178 lines)
    ├── _engagement-dashboard.scss # Dashboard page styles (170 lines)
    └── _subscription-manager.scss # Subscription page styles (56 lines)
```

### Other Apps

```
apps/sign/src/store/
└── engagementStore.ts            # Zustand engagement store

apps/mass-consensus/src/
├── hooks/useEngagement.ts        # React hook for engagement
└── components/engagement/
    ├── LevelBadge.tsx            # Level display
    ├── CreditsSummary.tsx        # Credits with count-up animation
    └── EngagementSummary.tsx     # Compact overview (level + credits + streak)

apps/flow/src/
├── lib/engagement.ts             # Module-level state management
└── engagement/components/
    ├── LevelPill.ts              # Inline level pill
    ├── CreditFeedback.ts         # "+N credits" inline feedback
    └── FlowCompletionEngagement.ts # End-of-flow summary
```

---

## Design Tokens & Styling

### Engagement Color Palette

| Token | CSS Variable | Usage |
|-------|-------------|-------|
| Level 0 (Observer) | `--engagement-level-0` = `--text-caption` | Gray |
| Level 1 (Participant) | `--engagement-level-1` = `--btn-primary` | Blue (#5f88e5) |
| Level 2 (Contributor) | `--engagement-level-2` = `--agree` | Teal (#4ecdc4) |
| Level 3 (Advocate) | `--engagement-level-3` = `--option` | Gold (#f5a623) |
| Level 4 (Leader) | `--engagement-level-4` = `--group` | Purple (#9b59b6) |
| Streak Flame | `--streak-flame` | Orange (#ff6b35) |
| Credit Earn | `--credit-earn` = `--agree` | Teal |
| Progress Track | `--progress-track` = `--border-light` | Light gray |
| Progress Fill | `--progress-fill` = `--btn-primary` | Blue |

### Animations

| Animation | Duration | Element | Behavior |
|-----------|----------|---------|----------|
| `creditFloat` | 1.5s | CreditToast | Float up + fade out |
| `streakPulse` | 1.5s | StreakIndicator (at-risk) | Pulse opacity |
| `frequencyPopoverIn` | 0.15s | FrequencySelector | Slide up + fade in |
| `countUp` | 0.8s | MC CreditsSummary | Scale + slide up |

All animations include `@media (prefers-reduced-motion: reduce)` fallbacks.

### BEM Naming

All engagement SCSS follows BEM convention:

```scss
.level-badge              // Block
.level-badge__icon        // Element
.level-badge__name        // Element
.level-badge--observer    // Modifier (level)
.level-badge--large       // Modifier (size)
.level-badge--icon-only   // Modifier (variant)
```

---

## Translation Keys

All engagement translations are under the `engagement.*` namespace in `packages/shared-i18n/src/languages/`.

### Dashboard

| Key | English |
|-----|---------|
| `engagement.myImpact` | My Impact |
| `engagement.currentLevel` | Current Level |
| `engagement.progressToNext` | {{current}} / {{needed}} to next level |
| `engagement.impactStats` | Impact Stats |
| `engagement.totalCredits` | Total Credits |
| `engagement.evaluationsGiven` | Evaluations Given |
| `engagement.optionsCreated` | Options Created |
| `engagement.badges` | Badges |
| `engagement.recentActivity` | Recent Activity |

### Levels

| Key | English |
|-----|---------|
| `engagement.observer` | Observer |
| `engagement.participant` | Participant |
| `engagement.contributor` | Contributor |
| `engagement.advocate` | Advocate |
| `engagement.leader` | Leader |

### Stats & Streaks

| Key | English |
|-----|---------|
| `engagement.credits` | Credits |
| `engagement.streak` | Streak |
| `engagement.daysStreak` | {{count}} day streak |
| `engagement.level` | Level |
| `engagement.atRisk` | at risk! |
| `engagement.streakAtRisk` | Your streak is at risk! |

### Notifications

| Key | English |
|-----|---------|
| `engagement.creditsEarned` | +{{amount}} credits |
| `engagement.levelUp` | Level Up! |
| `engagement.youReached` | You reached {{level}}! |

### Frequency Selector

| Key | English |
|-----|---------|
| `engagement.frequency.instant` | Instant |
| `engagement.frequency.daily` | Daily digest |
| `engagement.frequency.weekly` | Weekly digest |
| `engagement.frequency.mute` | Mute |
| `engagement.frequency.instantDesc` | Get notified immediately |
| `engagement.frequency.dailyDesc` | One summary per day |
| `engagement.frequency.weeklyDesc` | One summary per week |
| `engagement.frequency.muteDesc` | No notifications |

### Empty States

| Key | English |
|-----|---------|
| `engagement.noBadgesYet` | No badges earned yet |
| `engagement.keepParticipating` | Keep participating to earn badges! |
| `engagement.noActivity` | No recent activity |

Translations are available in 6 languages: English, Hebrew, Arabic, Spanish, German, Dutch.

---

## Deployment & Configuration

### Seeding Credit Rules

On first deployment, seed the default credit rules to Firestore:

```typescript
import { seedDefaultCreditRules } from './engagement/credits/creditRules';

// Run once (idempotent - won't overwrite existing rules)
await seedDefaultCreditRules();
```

### Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `calculateStreaks` | Daily 00:05 UTC | Reset inactive streaks, mark grace days |
| `sendDailyDigests` | Hourly :00 UTC | Send daily digest to eligible users |
| `sendWeeklyDigests` | Daily 10:00 UTC | Send weekly digest to eligible users |

### Deploying Functions

```bash
# Deploy engagement functions to production
npm run deploy:f:prod

# Deploy to test environment
npm run deploy:f:test
```

### Admin Configuration

Credit rules are stored in Firestore (`creditRules` collection) and cached for 5 minutes on the server. Admins can modify rules directly in Firestore to adjust:

- `baseAmount` — Credits per action
- `cooldownMs` — Minimum time between awards
- `dailyLimit` — Max awards per action per day
- `qualityGate` — Minimum content quality (e.g., character count)
- `enabled` — Toggle individual actions on/off

Changes take effect within 5 minutes (cache TTL).

---

## Key Design Patterns

### Non-Blocking Engagement Tracking

All engagement tracking uses `.catch()` to prevent engagement failures from breaking core app functionality:

```typescript
// Pattern used throughout
trackEvaluationEngagement(userId, evaluationId).catch(err =>
  logger.warn('Engagement tracking failed', err)
);
```

### Atomic Credit Transactions

Credits are always awarded inside a Firestore `runTransaction()` to ensure:
- No double-crediting for the same action
- Credit + engagement doc update are atomic
- Concurrent actions don't create race conditions

### Multi-App State Consistency

All apps listen to the **same Firestore documents**, ensuring engagement state is always in sync regardless of which app the user is using. The state management adapter differs per framework:

| App | State Management | Listener Pattern |
|-----|-----------------|-----------------|
| Main | Redux Toolkit | `onSnapshot` → dispatch |
| Sign | Zustand | `onSnapshot` → setState |
| MC | React useState | `onSnapshot` → setState |
| Flow | Module variables | `onSnapshot` → reassign + m.redraw() |
