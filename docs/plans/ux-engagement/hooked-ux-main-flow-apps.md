# Engagement System ("Hooked") -- Detailed UI/UX Design Plan

## PART 1: MAIN APP (React + Redux + Vite PWA)

---

### 1. BRANCH BELL + FREQUENCY SELECTOR

#### UX Rationale
Users need granular control over how often they hear about specific branches of a discussion. The bell icon is an industry-standard affordance for notifications. By placing it directly on each statement card, we let users make subscription decisions in context -- right where the content lives -- rather than forcing them to navigate away to a settings page.

#### Placement
The bell icon lives in the **top-right area of each statement card** (MainCard, suggestion cards, question cards), next to the existing `StatementChatMore` three-dot menu. On RTL layouts, it mirrors to top-left. It does NOT replace the existing global notification bell in HomeHeader; that remains for viewing received notifications.

#### States (5 total)

```
STATE            ICON APPEARANCE                  BADGE BEHAVIOR
--------------------------------------------------------------------
Unsubscribed     Bell outline, muted gray          No badge
                 (var(--text-caption))

Instant          Bell filled, solid blue            Small lightning-bolt
                 (var(--btn-primary))               dot overlay

Daily            Bell filled, solid blue            Small "D" badge
                 (var(--btn-primary))               (badge--info)

Weekly           Bell filled, lighter blue          Small "W" badge
                 (var(--accent))                    (badge--info)

Muted            Bell with slash-through,           No badge
                 muted gray
                 (var(--text-caption), strikethrough)
```

#### ASCII Wireframe -- Bell on a Statement Card (MainCard)

```
+---------------------------------------------------------------+
|  [Avatar]  Discussion Title Here              [bell] [...]    |
|            Last update preview text...          ^               |
|            3h ago                                |               |
+---------------------------------------------------------------+
                                              bell icon
                                              (24x24px tap target 44x44)
```

#### Frequency Picker -- Popover Design

Triggered by tapping the bell icon. A small popover appears below/above the bell (based on available space). Uses the existing click-outside pattern (`useClickOutside` hook).

```
+----------------------------------+
|  Notify me:                      |
|                                  |
|  ( ) Instant      [lightning]    |   <-- radio-card style
|  ( ) Daily digest  [sun]         |
|  ( ) Weekly digest [calendar]    |
|  ( ) Muted         [bell-slash]  |
|                                  |
|  [Unsubscribe]                   |   <-- text button, destructive
+----------------------------------+
   ^-- popover arrow pointing to bell
```

#### Component Hierarchy

- **Atom**: `branch-bell` (SCSS in `src/view/style/atoms/_branch-bell.scss`)
  - `.branch-bell` -- container, relative positioned
  - `.branch-bell__icon` -- the SVG bell
  - `.branch-bell__badge` -- frequency indicator dot/letter
  - `.branch-bell--instant`, `--daily`, `--weekly`, `--muted`, `--unsubscribed` -- modifiers
- **Molecule**: `frequency-picker` (SCSS in `src/view/style/molecules/_frequency-picker.scss`)
  - `.frequency-picker` -- popover container
  - `.frequency-picker__option` -- each radio row
  - `.frequency-picker__option-icon` -- icon for each option
  - `.frequency-picker__option-label` -- text label
  - `.frequency-picker__option--selected` -- active state
  - `.frequency-picker__unsubscribe` -- bottom destructive action
- **React wrappers**: `BranchBell.tsx`, `FrequencyPicker.tsx`

#### Animation
- Clicking bell when unsubscribed: bell does a single gentle "ring" animation (2-frame scale: 1 -> 1.15 -> 1, 200ms, spring easing). After 200ms, the frequency picker fades in (150ms opacity transition).
- Changing frequency: selected option pill slides highlight with 150ms ease transition.
- Muting: bell icon transitions to slash-through with 200ms crossfade.

#### Mobile Considerations
- On mobile (<600px), the frequency picker renders as a **bottom sheet** (half-screen modal) instead of a popover, matching the existing modal pattern used elsewhere in the app.
- Touch target for bell: minimum 44x44px with padding.

---

### 2. SUBSCRIPTION MANAGER PAGE

#### UX Rationale
Power users who participate in many discussions need a single place to review and manage all their notification subscriptions. This avoids the tedium of visiting each discussion individually.

#### Navigation Location
Accessible from:
1. The existing HomeHeader hamburger menu -- new menu option: "My Subscriptions" (with bell icon)
2. The profile/settings page (future)
3. Deep link from notification preferences panel

#### Page Layout -- ASCII Wireframe

```
+================================================================+
| [<-]  My Subscriptions                        [Search icon]    |
+================================================================+
|                                                                 |
| [Search: Filter discussions...]                                 |
|                                                                 |
| FILTERS:  [All] [Instant] [Daily] [Weekly] [Muted]            |
|                                                                 |
+----------------------------------------------------------------+
| Discussion: "City Budget 2026"                    [Mute All]   |
| +---------------------------------------------------------+   |
| | Main thread                    [bell: Instant]  [v]     |   |
| | > Infrastructure options       [bell: Daily]    [v]     |   |
| | > Education options            [bell: Weekly]   [v]     |   |
| | > Healthcare options           [bell: Muted]    [v]     |   |
| +---------------------------------------------------------+   |
|                                                                 |
+----------------------------------------------------------------+
| Discussion: "Team Retreat Planning"               [Mute All]   |
| +---------------------------------------------------------+   |
| | Main thread                    [bell: Daily]    [v]     |   |
| | > Location options             [bell: Daily]    [v]     |   |
| +---------------------------------------------------------+   |
|                                                                 |
+----------------------------------------------------------------+
| Discussion: "Product Roadmap Q3"                  [Mute All]   |
| +---------------------------------------------------------+   |
| | Main thread                    [bell: Instant]  [v]     |   |
| +---------------------------------------------------------+   |
|                                                                 |
+================================================================+

[v] = small chevron that opens inline frequency picker
```

#### Component Hierarchy

- **Organism**: `SubscriptionManager` page
  - **Molecule**: `subscription-card` -- one per discussion
    - `.subscription-card` -- card wrapper
    - `.subscription-card__header` -- discussion title + "Mute All" button
    - `.subscription-card__list` -- branch list
  - **Molecule**: `subscription-row` -- one per branch within a discussion
    - `.subscription-row` -- flex row
    - `.subscription-row__name` -- branch name (truncated)
    - `.subscription-row__depth` -- indentation indicator (> arrows for nesting)
    - `.subscription-row__bell` -- uses BranchBell atom
    - `.subscription-row__chevron` -- expand for inline frequency change
  - **Atom**: `filter-chips` -- horizontal scrolling filter bar
    - `.filter-chips` -- container
    - `.filter-chips__chip` -- each filter option
    - `.filter-chips__chip--active` -- selected filter

#### States
- **Loading**: Skeleton cards (using existing `_skeleton.scss` atom)
- **Empty**: "You haven't subscribed to any discussions yet. Start by joining a discussion!" + CTA button
- **Filtered with no results**: "No subscriptions match this filter"
- **Error**: Card with error variant, retry button

#### Interactions
- **Search**: Debounced text filter (UI.DEBOUNCE_DELAY from constants)
- **Filter chips**: Single-select, horizontal scroll on mobile
- **Mute All**: Confirmation toast ("Muted all branches in Discussion X. [Undo]")
- **Inline frequency change**: Tapping chevron expands the row to show radio options inline (no popover on this page, since there's space)

#### Mobile Adaptation
- Full-width cards, no side margins
- Search bar becomes sticky below header on scroll
- Filter chips horizontally scrollable with fade-out edge indicators
- Each discussion card is collapsible (tap header to toggle branch list)

---

### 3. LEVEL PROGRESS + PERMISSION GATING UI

#### Level System Visual Design

**5 Levels:**
```
Level 0: Observer    -- Gray shield    -- Can view only
Level 1: Participant -- Blue shield    -- Can evaluate
Level 2: Contributor -- Green shield   -- Can create options
Level 3: Advocate    -- Purple shield  -- Can create questions
Level 4: Leader      -- Gold shield    -- Full access + moderation
```

#### Level Badge Placement

**A. Header (always visible):**
In the HomeHeader, next to the notification bell and menu icons, a small level badge appears. It shows the shield icon with current level number.

```
+================================================================+
| Delib.Org                    [Lv.2 shield] [bell] [menu]      |
+================================================================+
         ^-- small badge, 28x28px
             Tap opens quick level summary popover
```

**B. Statement Header (in-discussion context):**
The level badge appears subtly next to the user's name/avatar when viewing their own statements. Other users also see level badges next to names in chat and statement cards.

**C. Profile page (detailed):**
Full level display with progress ring (see Section 4).

#### Level Badge Atom

```scss
// _level-badge.scss

.level-badge
  .level-badge__shield    -- SVG shield icon
  .level-badge__number    -- level number overlay
  .level-badge--observer  -- gray (var(--text-caption))
  .level-badge--participant -- blue (var(--btn-primary))
  .level-badge--contributor -- green (var(--agree))
  .level-badge--advocate  -- purple (var(--group))
  .level-badge--leader    -- gold (var(--option))
  .level-badge--small     -- 20x20 for inline use
  .level-badge--medium    -- 28x28 for header
  .level-badge--large     -- 48x48 for profile
```

#### Permission Gating UI

When a user tries to access a feature above their level, gating should be **encouraging, not blocking**. Three patterns:

**Pattern A: Grayed Button with Tooltip**
For inline actions (e.g., "Add Option" button when user is Level 0 Observer):

```
+----------------------------------------------+
|  [+ Add Option]  <-- grayed out, 0.5 opacity |
|                                               |
|  Tooltip on hover/tap:                        |
|  +------------------------------------------+|
|  | Unlock at Contributor level (Lv.2)       ||
|  | Evaluate 5 more options to level up!     ||
|  | [See my progress ->]                     ||
|  +------------------------------------------+|
+----------------------------------------------+
```

Tooltip uses existing `_tooltip.scss` atom with a new `--gated` modifier:
```scss
.tooltip--gated {
  background: var(--card-default);
  border: 1px solid var(--border-light);
  // wider than default tooltip
  max-width: 280px;
}
.tooltip__unlock-hint {
  color: var(--text-body);
  font-size: var(--font-size-sm);
}
.tooltip__progress-link {
  color: var(--btn-primary);
  font-weight: 500;
}
```

**Pattern B: Overlay Banner on Section**
For entire sections (e.g., "Create Question" tab in navigation):

```
+-----------------------------------------------+
| [Questions] [Options] [Chat] [Settings]        |
+-----------------------------------------------+
|                                                 |
|   +-----------------------------------------+  |
|   |  [Lock icon]                            |  |
|   |                                         |  |
|   |  Reach Advocate level to create         |  |
|   |  sub-questions                          |  |
|   |                                         |  |
|   |  You're 15 credits away!               |  |
|   |  [████████░░] 85/100                    |  |
|   |                                         |  |
|   |  [Keep participating ->]                |  |
|   +-----------------------------------------+  |
|                                                 |
+-----------------------------------------------+
```

This uses a new molecule: `permission-gate`
```scss
.permission-gate
  .permission-gate__icon     -- lock icon, centered
  .permission-gate__title    -- "Reach X level to..."
  .permission-gate__hint     -- "You're N credits away!"
  .permission-gate__progress -- mini progress bar
  .permission-gate__cta      -- link/button
```

**Pattern C: Inline Prompt (Non-blocking)**
For soft-gating where we want to encourage but not block:

```
+-----------------------------------------------+
| [+ Add your option]                            |
|                                                 |
| "Sign in to save your contributions and        |
|  earn credits toward Contributor level"         |
| [Sign in] or [Continue as guest]               |
+-----------------------------------------------+
```

#### Level-Up Celebration Animation

When a user crosses a level threshold, a **full-screen overlay** appears for 3 seconds (auto-dismisses, or tap to dismiss early):

```
+================================================+
|                                                  |
|           [Confetti particles falling]           |
|                                                  |
|              [Large Shield Icon]                 |
|              Pulsing glow effect                 |
|                                                  |
|           LEVEL UP!                              |
|                                                  |
|        You're now a Contributor                  |
|                                                  |
|     New abilities unlocked:                      |
|     * Create solution options                    |
|     * Start sub-discussions                      |
|                                                  |
|           [Awesome! ->]                          |
|                                                  |
+================================================+
```

Animation sequence:
1. 0ms: Dark overlay fades in (200ms)
2. 100ms: Shield icon scales from 0 to 1 with spring easing (400ms)
3. 300ms: "LEVEL UP!" text fades in from below (300ms)
4. 500ms: Level name and abilities fade in (300ms)
5. 700ms: Confetti particles start (CSS keyframes, 8-12 colored dots falling)
6. 1000ms: CTA button fades in
7. 3000ms: Auto-dismiss if not interacted

New molecule: `level-up-celebration`
```scss
.level-up-celebration
  .level-up-celebration__overlay     -- fixed, z-index 9999, dark bg
  .level-up-celebration__shield      -- centered large shield with glow
  .level-up-celebration__title       -- "LEVEL UP!" heading
  .level-up-celebration__level-name  -- new level name
  .level-up-celebration__abilities   -- list of unlocked features
  .level-up-celebration__cta         -- dismiss button
  .level-up-celebration__confetti    -- particle container
```

Accessibility: `prefers-reduced-motion` disables confetti and makes all transitions instant. Screen readers get an aria-live announcement: "Congratulations! You've reached Contributor level."

---

### 4. ENGAGEMENT DASHBOARD ("My Impact" Tab)

#### UX Rationale
This is the "Variable Reward" center of the Hook cycle. Users come here to see their progress, feel accomplishment, and discover what's next. It should feel like a personal achievement page -- motivating but not gamified to the point of feeling manipulative.

#### Navigation Location
New tab on the profile/home page. Accessed via:
1. Tapping the level badge in the header
2. A new "My Impact" item in the home menu
3. A "See my progress" link from any gating tooltip

#### Page Layout -- ASCII Wireframe

```
+================================================================+
| [<-]  My Impact                                                 |
+================================================================+
|                                                                  |
|  +--------------------------+  +---------------------------+    |
|  |     [Progress Ring]      |  |   [Flame icon]            |    |
|  |                          |  |                           |    |
|  |    [Shield Lv.2]         |  |    7-day streak!          |    |
|  |    Contributor            |  |    Keep it going          |    |
|  |                          |  |                           |    |
|  |   235 / 500 credits      |  |   Best: 14 days           |    |
|  |   [████████░░░] 47%      |  |                           |    |
|  |                          |  |                           |    |
|  |   Next: Advocate          |  |   [Mon][Tue][Wed][Thu]    |    |
|  +--------------------------+  |   [Fri][Sat][Sun]          |    |
|                                 |    ^active dots            |    |
|                                 +---------------------------+    |
|                                                                  |
|  BADGES                                          [See all ->]   |
|  +-----+  +-----+  +-----+  +-----+  +-----+  +-----+        |
|  | [*] |  | [*] |  | [*] |  | [?] |  | [?] |  | [?] |        |
|  |First|  |10   |  |Week |  |50   |  |Help |  |100  |        |
|  |Eval |  |Opts |  |Strk |  |Eval |  |5ppl |  |Opts |        |
|  +-----+  +-----+  +-----+  +-----+  +-----+  +-----+        |
|  earned    earned   earned   locked   locked   locked          |
|  (green)   (green)  (green)  (gray)   (gray)   (gray)          |
|                                                                  |
|  IMPACT STATS                                                    |
|  +----------------------------------------------------------+  |
|  |  12 discussions influenced                                |  |
|  |   3 consensus reached (your options!)                     |  |
|  |  47 evaluations given                                     |  |
|  |  89 people saw your contributions                         |  |
|  +----------------------------------------------------------+  |
|                                                                  |
|  RECENT ACTIVITY                                                 |
|  +----------------------------------------------------------+  |
|  | +5  Evaluated "Expand bus routes"          2 min ago      |  |
|  | +10 Created option "Bike lanes on Main"    1 hour ago     |  |
|  | +3  Daily login streak bonus               Today          |  |
|  | +5  Evaluated "More crosswalks"            Yesterday      |  |
|  | +20 LEVEL UP: Contributor!                 2 days ago     |  |
|  +----------------------------------------------------------+  |
|                                                                  |
+================================================================+
```

#### Component Hierarchy

- **Organism**: `EngagementDashboard` page
  - **Molecule**: `level-progress-card`
    - `.level-progress-card` -- card with progress ring
    - `.level-progress-card__ring` -- SVG circle progress (animated on mount)
    - `.level-progress-card__shield` -- level badge (large)
    - `.level-progress-card__level-name` -- current level text
    - `.level-progress-card__credits` -- "235 / 500 credits"
    - `.level-progress-card__bar` -- linear progress bar (backup to ring)
    - `.level-progress-card__next` -- "Next: Advocate"
  - **Molecule**: `streak-card`
    - `.streak-card` -- card with streak info
    - `.streak-card__flame` -- flame SVG icon (animated flicker)
    - `.streak-card__count` -- "7-day streak!"
    - `.streak-card__best` -- "Best: 14 days"
    - `.streak-card__week` -- 7 dots for current week
    - `.streak-card__day` -- individual day dot
    - `.streak-card__day--active` -- filled dot
    - `.streak-card__day--today` -- pulsing dot
  - **Molecule**: `badge-grid`
    - `.badge-grid` -- horizontal scrolling container
    - `.badge-grid__item` -- individual badge
    - `.badge-grid__item--earned` -- colored, with checkmark
    - `.badge-grid__item--locked` -- grayscale, with lock/question mark
    - `.badge-grid__icon` -- badge illustration
    - `.badge-grid__label` -- badge name
  - **Molecule**: `impact-stats`
    - `.impact-stats` -- card with stat rows
    - `.impact-stats__row` -- single stat
    - `.impact-stats__value` -- number (bold)
    - `.impact-stats__label` -- description
  - **Molecule**: `credit-feed`
    - `.credit-feed` -- scrollable list
    - `.credit-feed__item` -- single credit event
    - `.credit-feed__amount` -- "+5" with color coding (green for earn, gold for bonus)
    - `.credit-feed__action` -- description of what earned credits
    - `.credit-feed__time` -- relative timestamp
    - `.credit-feed__item--level-up` -- special styling for level-up events

#### Progress Ring Animation
SVG-based circular progress indicator. On mount:
- Ring animates from 0% to current% over 800ms with ease-out
- Credits number counts up from 0 to current over the same duration
- `prefers-reduced-motion`: no animation, shows final state immediately

#### Streak Card
- Flame icon: subtle CSS flicker animation (opacity 0.8 to 1, scale 1 to 1.05, alternating every 2s)
- Week dots: 7 circles, active days filled with `var(--agree)`, today has pulsing ring
- When streak is 0: flame is gray, text says "Start your streak! Participate today."

#### Badge Grid
- Horizontal scroll with snap points on mobile
- Earned badges: full color, subtle shadow, checkmark overlay
- Locked badges: grayscale filter, "?" overlay, lock icon
- Tapping an earned badge shows a toast with the badge description
- Tapping a locked badge shows a tooltip with "Earn this by..." hint

#### Mobile Adaptation
- Level progress card and streak card stack vertically (full width each)
- Badge grid becomes horizontally scrollable
- Impact stats become a 2x2 grid
- Credit feed shows last 5 items with "Load more" button

---

### 5. CREDIT ANIMATION

#### UX Rationale
Immediate feedback after an action creates the dopamine reward that drives the Hook cycle. The animation must be noticeable but NOT disruptive -- it should feel like a pleasant surprise, not an interruption to the user's workflow.

#### Design: Floating Credit Toast (not a blocking modal)

```
    +5 credits
    [Evaluated option]
         ^
         |  floats up from the action point
         |  fades out after 2s
```

#### Detailed Behavior

**Trigger**: After any credit-earning action (evaluate, create option, daily login, etc.)

**Animation sequence**:
1. A small floating element appears near the action point (e.g., near the thumb-up button after evaluating)
2. It contains: "+N" in bold green text + small description
3. It floats upward 40px over 1.5s with easing
4. Opacity fades from 1 to 0 during the last 500ms
5. Element is removed from DOM after animation completes

**Simultaneously**: The level badge in the header does a brief "pulse" (scale 1 -> 1.15 -> 1 over 300ms) to draw attention to the accumulating credits.

#### New Atom: `credit-pop`

```scss
.credit-pop {
  position: fixed;
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: var(--space-xs, 0.25rem);
  padding: 0.375rem 0.75rem;
  background: var(--card-default);
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  animation: creditFloat 1.5s ease-out forwards;

  &__amount {
    font-weight: 700;
    font-size: 1rem;
    color: var(--agree);
  }

  &__label {
    font-size: 0.75rem;
    color: var(--text-caption);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0; // just don't show it
  }
}

@keyframes creditFloat {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-40px);
  }
}
```

#### Alternative for Major Credits (10+)
For larger credit awards (creating an option, level-up bonus), use an enhanced version:
- Slightly larger (+10 text)
- Brief confetti burst (3-5 small colored dots) around the number
- Stays visible for 2.5s instead of 1.5s

#### Header Badge Update
When credits are earned, the level badge in the header:
1. Pulses once (scale animation, 300ms)
2. If the credit meter is > 80% to next level, the badge gets a subtle glow (box-shadow pulse)

---

### 6. ONBOARDING FLOW

#### UX Rationale
New users need to understand the value proposition quickly. The onboarding follows the "progressive disclosure" principle from the design guide -- we don't dump everything at once. Instead, we use contextual education at the moment of relevance.

#### Flow Sequence

**Step 1: First Visit Welcome (triggered on first app load)**

```
+================================================+
|                                                  |
|        Welcome to Freedi                         |
|                                                  |
|     Collaborate on decisions                     |
|     that matter to your community                |
|                                                  |
|     [Illustration: people deliberating]          |
|                                                  |
|     How it works:                                |
|     1. Join a discussion                         |
|     2. Evaluate options                          |
|     3. Propose solutions                         |
|     4. Reach consensus together                  |
|                                                  |
|     [Get Started ->]                             |
|                                                  |
|     Already have an account? [Sign in]           |
|                                                  |
+================================================+
```

- Full-screen, non-dismissible (first-time only)
- Uses `slide-in` page animation
- Stores `onboarding_completed: true` in localStorage after completion
- Clean, minimal -- no level/credit info yet (too early)

**Step 2: First Evaluation Tooltip (contextual)**

When user navigates to their first statement with evaluation controls, a tooltip appears near the thumb buttons:

```
+---------------------------------------------------+
|  [Option: "Expand bus routes to suburbs"]          |
|                                                    |
|     [thumb-down]  [thumb-up]                       |
|          ^                                         |
|          |                                         |
|  +-------------------------------------------+    |
|  |  [pointing hand icon]                     |    |
|  |  Rate this option! Tap thumbs up if you   |    |
|  |  agree, or thumbs down if you disagree.   |    |
|  |                                           |    |
|  |  You'll earn credits for each evaluation. |    |
|  |                                [Got it]   |    |
|  +-------------------------------------------+    |
+---------------------------------------------------+
```

- Uses existing `_tooltip.scss` with new `--onboarding` modifier
- Pulsing highlight ring around the evaluation buttons
- Dismisses on "Got it" tap or after first evaluation
- Stores `first_eval_tooltip_shown: true`

**Step 3: First Action Celebration**

After the user's very first evaluation:

```
+================================================+
|                                                  |
|            [Sparkle icon]                        |
|                                                  |
|         Great first step!                        |
|                                                  |
|     You just earned +5 credits                   |
|     toward Participant level                     |
|                                                  |
|     [████░░░░░░] 5/20                            |
|                                                  |
|     Keep evaluating to unlock                    |
|     more features!                               |
|                                                  |
|         [Continue ->]                            |
|                                                  |
+================================================+
```

- Modal overlay (not full screen), card-style
- Auto-dismisses after 5 seconds or on tap
- This is the first time the user learns about the credit/level system

**Step 4: Subscription Prompt (after 3 actions)**

After the user has performed 3 actions in the same discussion:

```
+--------------------------------------------------+
|                                                    |
|  [Bell icon]                                       |
|                                                    |
|  Stay updated on "City Budget 2026"?              |
|                                                    |
|  Get notified when others respond                  |
|  to your evaluations                               |
|                                                    |
|  [Notify me (instant)] [Maybe later]               |
|                                                    |
+--------------------------------------------------+
```

- Bottom sheet on mobile, centered modal on desktop
- "Notify me" defaults to instant, "Maybe later" dismisses
- Only shows once per discussion per session
- Stores count in session state

**Step 5: Getting Started Checklist (persistent widget)**

After the welcome screen, a small collapsible checklist appears in the bottom-right corner (or bottom of the home page on mobile):

```
+----------------------------------+
| Getting Started         [x]      |   <-- dismiss button
|                                  |
| [x] Join a discussion           |
| [x] Evaluate an option          |
| [ ] Create your first option    |
| [ ] Subscribe to updates        |
| [ ] Complete your profile        |
|                                  |
| 2 of 5 complete                  |
| [████░░░░░░]                     |
+----------------------------------+
```

- Collapsible to a small FAB-like circle: "[2/5]"
- Each completed item gets a checkmark with green color
- Completing all 5 triggers a badge ("Quick Starter") + bonus credits
- Persists across sessions via localStorage until all complete or dismissed
- On mobile: appears as a banner at bottom of home page, not floating

#### Component Hierarchy

- **Molecule**: `onboarding-welcome` -- full-screen welcome
- **Atom**: `onboarding-tooltip` -- contextual tip (extends tooltip)
- **Molecule**: `first-action-modal` -- celebration modal
- **Molecule**: `subscription-prompt` -- bottom sheet prompt
- **Molecule**: `getting-started-checklist`
  - `.getting-started` -- container
  - `.getting-started__header` -- title + dismiss
  - `.getting-started__item` -- each task
  - `.getting-started__item--complete` -- checked state
  - `.getting-started__progress` -- progress bar
  - `.getting-started--collapsed` -- FAB state

---

### 7. ENHANCED NOTIFICATION PANEL

#### UX Rationale
The existing InAppNotifications panel shows only content notifications (someone posted/replied). The engagement system introduces new notification types. These should feel visually distinct so users can quickly scan and prioritize.

#### New Notification Types

The existing `NotificationCard` component handles content notifications. We extend the notification panel to support new card variants:

```
+================================================================+
| Notifications                    [Mark all read] [Clear]        |
+================================================================+
|                                                                  |
| TODAY                                                            |
| +------------------------------------------------------------+ |
| | [+5 icon]  Earned 5 credits for evaluating       2m ago    | |  <-- credit
| +------------------------------------------------------------+ |
| | [shield]   LEVEL UP! You're now a Contributor    15m ago   | |  <-- level-up
| +------------------------------------------------------------+ |
| | [avatar]   Sarah replied to your option           1h ago   | |  <-- content (existing)
| +------------------------------------------------------------+ |
| | [badge]    Badge earned: "Week Warrior"           3h ago   | |  <-- badge
| +------------------------------------------------------------+ |
|                                                                  |
| YESTERDAY                                                        |
| +------------------------------------------------------------+ |
| | [people]   12 people evaluated your option        1d ago   | |  <-- social proof
| +------------------------------------------------------------+ |
| | [digest]   Your daily digest is ready             1d ago   | |  <-- digest
| +------------------------------------------------------------+ |
|                                                                  |
+================================================================+
```

#### Card Variants

Each variant has a distinct left-border color and icon:

```
VARIANT          BORDER COLOR               ICON
------------------------------------------------------
Content          var(--btn-primary) blue     user avatar
Credit           var(--agree) green          coin/plus icon
Level Up         var(--group) purple         shield icon
Badge            var(--option) gold          star icon
Social Proof     var(--accent) light blue    people icon
Digest Ready     var(--question) blue        mail icon
```

#### Extended NotificationCard Component

The existing `NotificationCard.tsx` receives a new `type` field and renders accordingly:

```
.notification-card
  .notification-card--content      // existing
  .notification-card--credit       // green left border
  .notification-card--level-up     // purple left border, slightly larger
  .notification-card--badge        // gold left border
  .notification-card--social-proof // light blue left border
  .notification-card--digest       // blue left border
  .notification-card__type-icon    // new element: replaces avatar for non-content types
```

#### Grouping
Notifications are grouped by date ("Today", "Yesterday", "This Week", "Earlier") with sticky section headers.

The level-up notification gets a special treatment: slightly larger card, gradient background (`linear-gradient` subtle purple to white), and the shield icon.

---

### 8. IN-TREE VISUAL INDICATORS

#### UX Rationale
When navigating the discussion tree or mind map, users need at-a-glance signals about where activity is happening, what's new, and where they're subscribed. These indicators work as "Triggers" in the Hook cycle -- pulling users toward engaging content.

#### Indicator Types

**A. Activity Heatmap (on statement cards)**

Each statement card gets a subtle temperature indicator showing recent activity level:

```
ACTIVITY LEVEL    VISUAL INDICATOR
------------------------------------------------------
Cold (no activity)   No indicator
Warm (1-5 actions    Small orange dot, bottom-right
 in 24h)
Hot (6+ actions      Small red-orange dot + subtle
 in 24h)             warm glow on card border

Trending (fastest    "Trending" mini-badge + flame
 growing)            icon, positioned top-right
```

Implementation as new modifiers on the card molecule:
```scss
.card--warm {
  &::after {
    content: '';
    position: absolute;
    bottom: 8px;
    right: 8px; // mirror in RTL
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-warning);
  }
}

.card--hot {
  border-color: rgba(239, 117, 80, 0.3); // warm tint
  &::after {
    content: '';
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-error);
    box-shadow: 0 0 6px rgba(247, 74, 77, 0.4);
  }
}
```

**B. New Content Badge**

When a subscribed branch has unread content:

```
+-----------------------------------------------+
|  Infrastructure Options       [3 new] [bell]   |
+-----------------------------------------------+
```

The "[3 new]" uses the existing `badge--unread` variant, positioned inline with the branch title.

**C. Subscription Status Indicator**

On the mind map view, subscribed nodes get a subtle ring:

```
Mind Map Node:
  +-------------------+
  | Infrastructure    |
  | Options           |
  |            [bell] |  <-- tiny bell icon, bottom-right of node
  +-------------------+
       |
  +----+----+
  |         |
[Bus]    [Rail]
          [bell]     <-- only nodes user is subscribed to
```

**D. "Your contribution" highlight**

Statements created by the current user get a subtle left border in their level color:

```
+-----------------------------------------------+
|  | "Expand bus routes to suburbs"              |  <-- blue left border
|  |  Created by You  *  12 evaluations          |     (Participant level color)
+-----------------------------------------------+
```

#### Mobile Considerations
- Heatmap dots are slightly larger on mobile (10px) for visibility
- New content badges use the large badge variant on mobile
- Mind map node subscription indicators show on tap/hold (not always visible, to reduce clutter)

---

---

## PART 2: FLOW APP (Mithril.js -- Soft Candy Aesthetic)

The Flow app has a fundamentally different UX paradigm from the Main App. It's a **guided, step-by-step wizard** with a "Soft Candy / Lollipop" visual aesthetic (pastel pinks, lavenders, mints). The engagement system must integrate without disrupting the focused, task-driven nature of the flow.

Design principle for Flow: **Engagement elements are secondary. The primary UX is completing the deliberation flow. Engagement elements appear as rewards and gentle encouragements, never as distractions or blockers.**

---

### 1. LEVEL BADGE + PROGRESS (Flow App)

#### Placement

The Flow app uses a minimal `.shell` layout with header, content, and footer. The level badge appears in the **header area**, tucked into the right side of the `.shell__header`, alongside the existing language picker.

```
+================================================+
|  [Lang: EN v]                     [Lv.1 badge] |   <-- header
+================================================+
|                                                  |
|  [Flow content here]                             |
|                                                  |
+================================================+
|  [Continue ->]                                   |   <-- footer
+================================================+
```

The badge is intentionally small (20x20px) and uses the candy-themed color palette:

```scss
// Flow-specific level badge colors (using flow tokens)
.flow-level-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);

  &--observer    { background: var(--bg-subtle); color: var(--text-muted); }
  &--participant { background: var(--color-accent-sky); color: var(--text-primary); }
  &--contributor { background: var(--color-accent-mint); color: var(--text-primary); }
  &--advocate    { background: var(--color-accent-lavender); color: var(--text-primary); }
  &--leader      { background: var(--color-accent-lemon); color: var(--text-primary); }
}
```

Tapping the badge shows a **small tooltip-like popover** with:
```
+----------------------------------+
|  Participant (Lv.1)              |
|  [████░░░░] 45/100 credits      |
|  Keep going!                     |
+----------------------------------+
```

---

### 2. PERMISSION GATING IN WIZARD CONTEXT

#### UX Rationale
In the Flow app, permission gating must be even gentler than in the Main app. Users arrive here to participate in a specific deliberation -- blocking them would feel hostile. Instead, we use **soft prompts** that explain what they need to do to unlock capabilities.

#### Gating Scenarios

**Scenario A: Observer (Lv.0) enters a flow**

The user CAN still participate in the evaluation stages (the core purpose of the flow). They are gated from:
- Writing needs (requires Participant)
- Writing solutions (requires Contributor)

When they reach a gated stage:

```
+================================================+
|  Step 2: Share Your Needs                        |
+================================================+
|                                                  |
|  [Pastel lock illustration]                      |
|                                                  |
|  You're almost there!                            |
|                                                  |
|  Complete a few evaluations first to unlock      |
|  this step. You need 5 more evaluations.         |
|                                                  |
|  [████████░░] 15/20 credits                      |
|                                                  |
|  This helps us ensure quality contributions.     |
|                                                  |
|  [Skip to evaluation ->]    [I'll come back]     |
|                                                  |
+================================================+
```

Key UX decisions:
- NOT a dead end -- user can skip to the evaluation stage
- Progress is shown so user sees they're close
- Friendly language, not authoritarian

**Scenario B: Available vs Locked Steps in Progress Bar**

The existing `ProgressBar` component shows step numbers. We extend it to show lock states:

```
  [1]----[2]----[3 lock]----[4]----[5]
  Intro  Eval   Needs       Eval   Done
         (done) (locked)    (avail)
```

Locked steps appear with reduced opacity and a small lock icon overlay:

```scss
.progress-step--locked {
  opacity: 0.4;
  position: relative;

  &::after {
    content: '';
    // small lock SVG as background-image
    position: absolute;
    width: 12px;
    height: 12px;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
  }
}
```

---

### 3. CREDIT FEEDBACK DURING FLOW

#### UX Rationale
Credit feedback in the Flow app must be inline and non-disruptive. The user is in a focused flow state -- we don't want to break their concentration with flying numbers or modal celebrations.

#### After Each Action (Evaluation, Need Written, Solution Written)

A small, inline credit indicator slides in below the action area:

```
+------------------------------------------------+
|  How much do you agree with this need?          |
|                                                  |
|  "Better public transportation"                  |
|                                                  |
|  [Strongly     [Disagree] [Neutral] [Agree]     |
|   Disagree]                          ^^^^^^^^    |
|                                      (tapped)    |
|                                                  |
|  +5 credits earned             [3/10 evaluated]  |
|  ^-- slides in, green text     ^-- progress      |
|      fades after 2s                              |
+------------------------------------------------+
```

Implementation:
```scss
.flow-credit-earned {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-agree-strong);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  animation: flowCreditSlide 2s ease-out forwards;
}

@keyframes flowCreditSlide {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  15% {
    opacity: 1;
    transform: translateY(0);
  }
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

#### Flow Completion Celebration

When the user completes the entire flow (reaches the "done" stage):

```
+================================================+
|                                                  |
|        [Checkmark in circle, animated]           |
|                                                  |
|     You did it!                                  |
|                                                  |
|     You earned 45 credits in this flow           |
|                                                  |
|     [Level progress bar, animated fill]          |
|     Participant -> Contributor (78%)             |
|                                                  |
|     Your impact:                                 |
|     * 3 needs shared                             |
|     * 10 options evaluated                       |
|     * 2 solutions proposed                       |
|                                                  |
|     [Share results] [Back to home]               |
|                                                  |
+================================================+
```

This replaces/extends the existing "done" stage screen. The confetti here uses the pastel candy colors (pinks, lavenders, mints) instead of the Main app's standard colors.

---

### 4. NOTIFICATION PREFERENCES (Flow App)

#### Placement
Minimal. A small gear/bell icon in the `.shell__header`, next to the level badge:

```
+================================================+
|  [Lang v]                  [bell/gear] [Lv.1]  |
+================================================+
```

#### Interaction
Tapping opens a small bottom sheet:

```
+--------------------------------------------------+
|  Notifications for this flow                      |
|                                                    |
|  (o) Instant -- get notified right away           |
|  ( ) Daily digest                                  |
|  ( ) Weekly digest                                 |
|  ( ) None -- I'll check back manually             |
|                                                    |
|  [Save]                                            |
+--------------------------------------------------+
```

Four simple radio options. No toggle complexity. The bottom sheet pattern matches the flow's existing modal patterns.

```scss
.flow-notification-sheet {
  background: var(--bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-lg);

  &__title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--space-md);
  }

  &__option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    cursor: pointer;
  }

  &__option-label {
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }

  &__option-desc {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }
}
```

---

### 5. IN-FLOW ENGAGEMENT INDICATORS

#### UX Rationale
Social proof is the most powerful engagement trigger in a collaborative context. Showing that others are participating creates a sense of community and urgency. But it must be subtle -- the flow is focused.

#### Indicator A: Live Participant Count

At the top of each stage (below the header):

```
+================================================+
| [Lang v]                    [bell] [Lv.1]       |
+================================================+
|  Step 2 of 5: Evaluate Needs                    |
|  [████████░░░░░░░░░░░░]                          |
|                                                  |
|  [people icon] 8 others are evaluating now       |
|  ^-- subtle, small text, var(--text-muted)       |
|                                                  |
```

This is a simple text line, not a full component. It uses:
```scss
.flow-social-proof {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  padding: var(--space-xs) 0;

  &__icon {
    width: 16px;
    height: 16px;
    opacity: 0.7;
  }

  &__count {
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }
}
```

#### Indicator B: Your Impact Feedback

After completing a stage, when returning to review:

```
+------------------------------------------------+
|  Your need "Better transit" was:                 |
|                                                  |
|  [star] Rated highly by 5 participants           |
|  [chart] In the top 3 needs overall              |
|                                                  |
+------------------------------------------------+
```

This appears as a small card in the `WelcomeBack` view or when users revisit their contributions.

#### Indicator C: Community Progress Comparison

On the progress bar, a subtle marker shows where the community average is:

```
  Your progress:    [████████░░░░░░░░░░] 40%
  Community avg:              ^-- small triangle marker at 60%
```

```scss
.flow-community-marker {
  position: absolute;
  bottom: -8px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 6px solid var(--color-accent-lavender);
  // positioned via left: calc(community-progress-%)
}
```

---

### 6. SUBSCRIPTION TO FLOW UPDATES

#### UX Rationale
Users who complete a flow want to know what happens next: Did the group reach consensus? What were the final results? Were their ideas chosen? This is the "Investment" phase of the Hook cycle.

#### Trigger Point

At the end of the flow (sign-in / done stage), after the completion celebration:

```
+================================================+
|                                                  |
|  Stay in the loop?                               |
|                                                  |
|  Get notified when:                              |
|  [x] Results are ready                           |
|  [x] Consensus forms on your ideas               |
|  [ ] New participants join                        |
|                                                  |
|  How often?                                      |
|  (o) When it happens                             |
|  ( ) Daily summary                                |
|  ( ) Weekly summary                               |
|                                                  |
|  [Subscribe]  [No thanks]                        |
|                                                  |
+================================================+
```

Checkboxes let users choose WHAT they care about. Radio buttons control frequency. This appears as part of the flow's "done" stage -- not a separate screen.

If the user is not signed in (anonymous), subscribing prompts for email:

```
+--------------------------------------------------+
|  Enter your email to get updates:                 |
|                                                    |
|  [email input field]                               |
|                                                    |
|  Or [Sign in with Google] for more features       |
+--------------------------------------------------+
```

---

---

## CROSS-APP DESIGN TOKEN ALIGNMENT

### Engagement-Specific CSS Variables

Both apps need new CSS variables for engagement elements. These should be added to their respective token files.

**Main App** (add to `:root` in the variables partial):
```scss
// Engagement system colors
--credit-earned: var(--agree);
--credit-bonus: var(--option);
--level-observer: var(--text-caption);
--level-participant: var(--btn-primary);
--level-contributor: var(--agree);
--level-advocate: var(--group);
--level-leader: var(--option);
--streak-active: var(--agree);
--streak-flame: var(--text-warning);
--badge-earned: var(--option);
--badge-locked: var(--text-caption);
--heatmap-warm: var(--text-warning);
--heatmap-hot: var(--text-error);
```

**Flow App** (add to `:root` in `tokens.scss`):
```scss
// Engagement system colors (candy palette)
--credit-earned: var(--color-agree-strong);
--credit-bonus: var(--color-accent-lemon);
--level-observer: var(--text-muted);
--level-participant: var(--color-accent-sky);
--level-contributor: var(--color-accent-mint);
--level-advocate: var(--color-accent-lavender);
--level-leader: var(--color-accent-lemon);
```

---

## COMPLETE FILE INVENTORY (New files to create)

### Main App -- New SCSS Atoms
1. `src/view/style/atoms/_branch-bell.scss`
2. `src/view/style/atoms/_level-badge.scss`
3. `src/view/style/atoms/_credit-pop.scss`
4. `src/view/style/atoms/_filter-chips.scss`

### Main App -- New SCSS Molecules
5. `src/view/style/molecules/_frequency-picker.scss`
6. `src/view/style/molecules/_subscription-card.scss`
7. `src/view/style/molecules/_subscription-row.scss`
8. `src/view/style/molecules/_level-progress-card.scss`
9. `src/view/style/molecules/_streak-card.scss`
10. `src/view/style/molecules/_badge-grid.scss`
11. `src/view/style/molecules/_impact-stats.scss`
12. `src/view/style/molecules/_credit-feed.scss`
13. `src/view/style/molecules/_permission-gate.scss`
14. `src/view/style/molecules/_level-up-celebration.scss`
15. `src/view/style/molecules/_getting-started.scss`
16. `src/view/style/molecules/_onboarding-welcome.scss`
17. `src/view/style/molecules/_subscription-prompt.scss`

### Main App -- New React Components
18. `src/view/components/atomic/atoms/BranchBell/BranchBell.tsx`
19. `src/view/components/atomic/atoms/LevelBadge/LevelBadge.tsx`
20. `src/view/components/atomic/atoms/CreditPop/CreditPop.tsx`
21. `src/view/components/atomic/atoms/FilterChips/FilterChips.tsx`
22. `src/view/components/atomic/molecules/FrequencyPicker/FrequencyPicker.tsx`
23. `src/view/components/atomic/molecules/LevelProgressCard/LevelProgressCard.tsx`
24. `src/view/components/atomic/molecules/StreakCard/StreakCard.tsx`
25. `src/view/components/atomic/molecules/BadgeGrid/BadgeGrid.tsx`
26. `src/view/components/atomic/molecules/PermissionGate/PermissionGate.tsx`
27. `src/view/components/atomic/molecules/LevelUpCelebration/LevelUpCelebration.tsx`
28. `src/view/components/atomic/molecules/GettingStarted/GettingStarted.tsx`
29. `src/view/pages/engagement/EngagementDashboard.tsx`
30. `src/view/pages/subscriptions/SubscriptionManager.tsx`

### Main App -- Modified Existing Files
31. `src/view/components/notificationCard/NotificationCard.tsx` -- add type variants
32. `src/view/components/notificationCard/NotificationCard.module.scss` -- add type styles
33. `src/view/components/inAppNotifications/InAppNotifications.tsx` -- add grouping, new types
34. `src/view/pages/home/HomeHeader.tsx` -- add level badge
35. `src/view/pages/home/main/mainCard/MainCard.tsx` -- add branch bell
36. `src/view/style/atoms/_index.scss` -- import new atoms
37. `src/view/style/molecules/_index.scss` -- import new molecules

### Flow App -- New/Modified Files
38. `apps/flow/src/components/FlowLevelBadge.ts` -- Mithril level badge component
39. `apps/flow/src/components/FlowCreditEarned.ts` -- inline credit feedback
40. `apps/flow/src/components/FlowNotificationSheet.ts` -- notification preferences
41. `apps/flow/src/components/FlowSocialProof.ts` -- participant count indicator
42. `apps/flow/src/components/FlowSubscription.ts` -- end-of-flow subscription
43. `apps/flow/src/styles/components.scss` -- add engagement component styles
44. `apps/flow/src/styles/tokens.scss` -- add engagement color tokens
45. `apps/flow/src/views/Wizard.ts` -- integrate level badge in header
46. `apps/flow/src/views/Dashboard.ts` -- add level badge
47. `apps/flow/src/index.ts` -- add level badge to FlowController header

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Foundation (Week 1-2)
1. Level badge atom (both apps)
2. Credit pop animation (Main App)
3. Flow credit earned inline (Flow App)
4. CSS variables / tokens for both apps

### Phase 2: Core Engagement (Week 2-3)
5. Permission gating UI (both apps)
6. Level-up celebration (Main App)
7. Branch bell + frequency picker (Main App)
8. Flow notification sheet (Flow App)

### Phase 3: Dashboard + Subscriptions (Week 3-4)
9. Engagement Dashboard page (Main App)
10. Subscription Manager page (Main App)
11. Flow subscription (end-of-flow)

### Phase 4: Social + Onboarding (Week 4-5)
12. In-tree visual indicators (Main App)
13. In-flow engagement indicators (Flow App)
14. Enhanced notification panel (Main App)
15. Onboarding flow (Main App)

### Phase 5: Polish + Getting Started (Week 5-6)
16. Getting Started checklist
17. Badge grid + badge system
18. Streak card
19. Animation polish and accessibility audit
