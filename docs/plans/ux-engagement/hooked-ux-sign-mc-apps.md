# Engagement System UI/UX Design Plan
## Sign App + Mass Consensus (MC) App

---

# PART 1: SIGN APP ENGAGEMENT SYSTEM

---

## 1. In-App Notification Bell + Panel

### Placement Rationale
The notification bell belongs in the existing `topBar` (`.topBar` in DocumentView.module.scss), positioned between the Admin button and UserAvatar. This maintains the established visual hierarchy where branding sits left, actions sit right. The bell acts as a bridge between admin tools and the user identity cluster.

### ASCII Wireframe: Top Bar with Notification Bell

```
DESKTOP (>600px)
+-----------------------------------------------------------------------+
|  [Logo]                          [Admin]  [Bell(3)]  [Avatar: JD v]  |
+-----------------------------------------------------------------------+

MOBILE (<600px)
+---------------------------------------------+
|  [TOC] [Logo]        [Bell(3)] [Avatar: JD] |
+---------------------------------------------+
```

### ASCII Wireframe: Notification Panel (Desktop Dropdown)

```
                                        +----------------------------------+
                                        |  Notifications           [Mark all]|
                                        +----------------------------------+
                                        |  [*] Your suggestion on Para 5   |
                                        |      was accepted                |
                                        |      2 hours ago                 |
                                        +----------------------------------+
                                        |  [ ] New comment on Paragraph 3  |
                                        |      "I think this clause..."    |
                                        |      5 hours ago                 |
                                        +----------------------------------+
                                        |  [ ] Document updated            |
                                        |      3 paragraphs changed        |
                                        |      Yesterday                   |
                                        +----------------------------------+
                                        |  [ ] 5 new signatures            |
                                        |      Document now has 47 signers |
                                        |      Yesterday                   |
                                        +----------------------------------+
                                        |       View all notifications     |
                                        +----------------------------------+
```

### ASCII Wireframe: Notification Panel (Mobile - Bottom Sheet)

```
+---------------------------------------------+
|                                             |
|          (document content behind,          |
|           dimmed overlay)                   |
|                                             |
+=============================================+
|  --- (drag handle) ---                      |
|                                             |
|  Notifications                   [Mark all] |
|                                             |
|  +---------------------------------------+  |
|  | [DOC] Your suggestion was accepted    |  |
|  |       Paragraph 5 - 2 hours ago       |  |
|  +---------------------------------------+  |
|  | [MSG] New comment on Paragraph 3      |  |
|  |       "I think this clause..." - 5h   |  |
|  +---------------------------------------+  |
|  | [PEN] Document updated                |  |
|  |       3 paragraphs changed - 1d       |  |
|  +---------------------------------------+  |
|  | [SIG] 5 new signatures               |  |
|  |       Now 47 total - 1d              |  |
|  +---------------------------------------+  |
|                                             |
|         [ View all notifications ]          |
|                                             |
+---------------------------------------------+
```

### Component Hierarchy

**Atom: NotificationBadge**
- File: `apps/sign/src/components/notifications/NotificationBadge.tsx` + `.module.scss`
- Displays unread count (red dot with number, max "99+")
- States: empty (no badge), 1-9 (small circle), 10-99 (pill), 99+ (pill with "+")
- Uses `var(--disagree)` for the badge background (red = attention)

**Atom: NotificationItem**
- File: `apps/sign/src/components/notifications/NotificationItem.tsx` + `.module.scss`
- Single notification row with icon, title, description, timestamp
- States: unread (left border accent + bold title), read (normal weight), hover (subtle background)
- Icon types: comment (chat bubble), suggestion (pencil), update (doc), signature (pen/checkmark)

**Molecule: NotificationPanel**
- File: `apps/sign/src/components/notifications/NotificationPanel.tsx` + `.module.scss`
- Desktop: dropdown positioned below bell icon, max-height 400px, scrollable
- Mobile: bottom sheet with drag handle, max-height 70vh
- Header: "Notifications" title + "Mark all read" button
- Footer: "View all notifications" link
- Empty state: "No notifications yet" with illustration

**Integration point**: Add bell to `DocumentView.tsx` inside `.topBarActions` div, between adminButton and UserAvatar.

### Notification Types & Visual Treatment

| Type | Icon | Color Accent | Example |
|------|------|-------------|---------|
| Comment | Chat bubble SVG | `var(--btn-primary)` | "New comment on Paragraph 3" |
| Suggestion accepted | Checkmark SVG | `var(--agree)` | "Your suggestion was incorporated" |
| Suggestion rejected | X circle SVG | `var(--disagree)` | "Your suggestion was not accepted" |
| Document updated | Document SVG | `var(--warning)` | "3 paragraphs were updated" |
| Signature milestone | Star SVG | `#FFD700` (gold) | "Document reached 50 signatures" |
| New signatures | Pen SVG | `var(--text-secondary)` | "5 new signatures today" |

### State Descriptions

**Bell icon states:**
- Default: Outline bell SVG, `var(--text-secondary)` color
- Has unread: Bell + red badge circle with count, slight pulse animation on new notification arrival
- Active/open: Bell filled, `var(--btn-primary)` color

**Panel animation:**
- Desktop: fade-in + translateY(-8px to 0), 150ms, matches existing dropdown pattern in Layout.module.scss
- Mobile: slide up from bottom, 300ms ease-out
- Respects `prefers-reduced-motion`

---

## 2. Document-Level Subscription Preferences

### Subscription Model

**Auto-subscribe on first meaningful interaction** (not just viewing). Trigger events:
- User signs the document
- User leaves a comment
- User submits a suggestion
- User explicitly clicks "Follow" button

This avoids notification spam for drive-by visitors while ensuring engaged users stay connected.

### ASCII Wireframe: Follow Button in Document Header

```
+-----------------------------------------------------------------------+
|  [Logo]                          [Admin]  [Bell(3)]  [Avatar: JD v]  |
+-----------------------------------------------------------------------+
|                                                                       |
|  Document Title Here                            [v1.2 dropdown]       |
|  =========================================                            |
|  [||||||||||||||||70%||||||||||       ] 14 of 20 paragraphs reviewed  |
|                                                                       |
|  [Follow: Instant v]                                                  |
|                                                                       |
```

### ASCII Wireframe: Follow Button (Expanded Dropdown)

```
  [Following: Instant v]
  +-------------------------------+
  |  Notification Frequency       |
  +-------------------------------+
  |  (*) Instant                  |
  |      Get notified immediately |
  |  ( ) Daily digest             |
  |      Summary once per day     |
  |  ( ) Weekly digest            |
  |      Summary once per week    |
  +-------------------------------+
  |  ( ) None                     |
  |      Unfollow this document   |
  +-------------------------------+
```

### ASCII Wireframe: Auto-Subscribe Toast (after first comment/suggestion)

```
+---------------------------------------------+
|                                             |
|    (document content...)                    |
|                                             |
+=============================================+
| [Bell] You're now following this document   |
|        Frequency: Instant  [Change]         |
+=============================================+
```

### Component Hierarchy

**Atom: FollowButton**
- File: `apps/sign/src/components/notifications/FollowButton.tsx` + `.module.scss`
- Two visual states: "Follow" (outline, not following) and "Following: [frequency]" (filled)
- Not following: outline border `var(--btn-primary)`, bell+ icon
- Following: filled `var(--btn-primary)` background, white text, bell icon
- Hover on "Following": text changes to "Unfollow" with `var(--disagree)` background (Twitter pattern)

**Molecule: FrequencySelector**
- Dropdown that appears below FollowButton
- Radio-button list: Instant, Daily, Weekly, None
- Each option has label + short description
- "None" acts as unfollow

### Placement
Below the progress bar in the document header area, inline with the document flow. On mobile, it collapses to just an icon button that opens a bottom sheet.

### Per-Section Following

For V1, NO per-section subscription. Rationale:
- Documents in Sign app are typically read as a whole
- Per-section adds significant complexity
- Can be added later if users request it
- The notification itself tells users WHICH section was affected, so they can jump there

---

## 3. Level Badge + Permission Gating

### Level System for Sign App

| Level | Name | Requirements | Capabilities |
|-------|------|-------------|-------------|
| 0 | Observer | Default (visit document) | Read document only |
| 1 | Participant | Login + first interaction | Sign/reject, react to paragraphs |
| 2 | Contributor | 50+ credits | Comment, suggest edits |
| 3 | Advocate | 200+ credits | Create documents |
| 4 | Leader | 500+ credits + admin invite | Manage sections, admin features |

### ASCII Wireframe: Level Badge in User Avatar Dropdown

```
  [Avatar: JD v]
  +-------------------------------+
  |  John Doe                     |
  |  [==Contributor==]  150 pts   |
  |  [||||||||||||75%|||       ]  |
  |  50 more to Advocate          |
  +-------------------------------+
  |  My Profile & Badges          |
  |  Admin Panel                  |
  |  Switch Account               |
  +-------------------------------+
```

### ASCII Wireframe: Locked Action State (Comment button on paragraph)

```
NORMAL STATE (Contributor+):
  +-------------------------------------------+
  |  Paragraph text here about policy...      |
  |                                           |
  |  [Thumbs Up: 12]  [Comment: 3]  [Suggest] |
  +-------------------------------------------+

LOCKED STATE (Observer/Participant):
  +-------------------------------------------+
  |  Paragraph text here about policy...      |
  |                                           |
  |  [Thumbs Up: 12]  [Comment:Lock]  [Suggest:Lock] |
  +-------------------------------------------+

  Tooltip on hover over locked button:
  +-----------------------------+
  | Reach Contributor level     |
  | to comment on paragraphs.  |
  | [Learn more]               |
  +-----------------------------+
```

### ASCII Wireframe: Level-Up Promotion Banner (appears inline)

```
+-----------------------------------------------------------------------+
|                                                                       |
|  Paragraph 7 text...                                                  |
|                                                                       |
|  [Thumbs Up]  [Comment: Locked]  [Suggest: Locked]                   |
|                                                                       |
+-----------------------------------------------------------------------+
|  +---------------------------------------------------------------+    |
|  |  [Star] You're 10 credits away from unlocking Comments!       |    |
|  |         Sign this document (+10) or react to paragraphs (+5)  |    |
|  +---------------------------------------------------------------+    |
+-----------------------------------------------------------------------+
```

### Component Hierarchy

**Atom: LevelBadge**
- File: `apps/sign/src/components/engagement/LevelBadge.tsx` + `.module.scss`
- Pill-shaped badge showing level name
- Color coding per level:
  - Observer: `var(--text-caption)` bg, `var(--text-body)` text
  - Participant: `var(--card-blue)` bg, `var(--btn-primary)` text
  - Contributor: `var(--card-green)` bg, `var(--agree)` text
  - Advocate: `var(--card-orange)` bg, `var(--warning)` text
  - Leader: gradient gold bg, white text

**Atom: LevelProgress**
- Thin progress bar showing credits toward next level
- Uses `var(--agree)` for fill color

**Atom: LockedAction**
- Wrapper component for action buttons
- When locked: reduces opacity to 0.4, shows lock icon overlay, cursor: not-allowed
- On click/hover: shows tooltip explaining required level
- Uses CSS `filter: grayscale(1)` plus the lock overlay

**Molecule: LevelUpPrompt**
- Contextual banner that appears near locked actions
- Shows: how many credits needed, 2-3 suggested actions to earn them
- Dismissable (X button), remembers dismissal for session
- Background: `var(--card-blue)` with left border `var(--btn-primary)`

### Integration Points

1. **UserAvatar dropdown**: Add LevelBadge + LevelProgress below user name
2. **ParagraphCard**: Wrap comment/suggest buttons with LockedAction when user level < required
3. **SignButton/RejectButton**: No gating (Level 1 = logged in, which is already gated)
4. **InteractionBar**: The existing bar in ParagraphCard needs to check user level

### Locked Button Visual States

| State | Opacity | Icon | Cursor | Interaction |
|-------|---------|------|--------|-------------|
| Available | 1.0 | Normal | pointer | Clickable |
| Locked (hover) | 0.4 | Lock overlay | not-allowed | Tooltip appears |
| Locked (focus) | 0.4 | Lock overlay | - | Tooltip for a11y |
| Almost unlocked | 0.6 | Lock + sparkle | help | Shows "X credits away" |

---

## 4. Credit Feedback

### Design Philosophy: Whisper, Don't Shout

The Sign app is a professional document tool. Credit feedback must be **peripheral** -- visible but never disruptive. The user should never feel like they're in a game; instead, credits feel like a natural consequence of participation.

### ASCII Wireframe: Credit Toast (after signing)

```
                                    +-----------------------------+
                                    |  [Checkmark] +10 credits   |
                                    |  for signing the document   |
                                    +-----------------------------+
                                                  |
                                                  v (fades after 3s)
```

### ASCII Wireframe: Credit Toast (suggestion accepted - elevated)

```
                                    +-----------------------------+
                                    |  [Star] +30 credits         |
                                    |  Your suggestion on Para 5  |
                                    |  was accepted!              |
                                    +-----------------------------+
                                                  |
                                                  v (fades after 4s)
```

### Toast Positioning & Behavior

- Position: top-right corner (desktop), top-center (mobile)
- Reuses existing `Toast.tsx` component pattern from Sign app
- Duration: 3 seconds for standard credits, 4 seconds for milestone/special
- Animation: fade-in + slide-down (200ms), then fade-out (200ms)
- Maximum 2 toasts stacked simultaneously
- No sound, no confetti (this is a document app)

### Credit Award Table (Sign App)

| Action | Credits | Toast Message |
|--------|---------|--------------|
| Sign document | +10 | "+10 for signing" |
| React to paragraph (thumbs) | +5 | "+5 for reviewing" |
| Post comment | +10 | "+10 for commenting" |
| Submit suggestion | +15 | "+15 for suggesting" |
| Suggestion accepted | +30 | "+30 suggestion accepted!" |
| First time signing any doc | +20 | "+20 welcome bonus" |
| Read entire document | +5 | "+5 for reading" |

### Component Hierarchy

**Atom: CreditToast**
- Extends existing Toast pattern but with a specific "credit" variant
- Left accent icon (coin/star SVG), credit amount in bold, description text
- Uses `var(--card-green)` as subtle background, `var(--agree)` for the accent icon
- The credit number uses a "count up" micro-animation (0 to +10 in 300ms)

**Integration**: Hook into existing Toast system. When a credit-earning action completes, dispatch a credit toast alongside the action confirmation.

---

## 5. Engagement Dashboard

### Placement
Accessible from the UserAvatar dropdown menu as "My Activity" or from a dedicated `/profile` page. This is NOT shown on the document page itself -- it's a separate view.

### ASCII Wireframe: Engagement Dashboard

```
+-----------------------------------------------------------------------+
|  [Logo]                                           [Back to Document]  |
+-----------------------------------------------------------------------+
|                                                                       |
|  +-----------------------------+  +-----------------------------+     |
|  |  John Doe                   |  |  Level: Contributor         |     |
|  |  Member since Jan 2025      |  |  [==============75%=====]  |     |
|  |                             |  |  150 / 200 to Advocate      |     |
|  +-----------------------------+  +-----------------------------+     |
|                                                                       |
|  ACTIVITY SUMMARY                                                     |
|  +-------------------+  +-------------------+  +-------------------+  |
|  |       5           |  |       12          |  |       23          |  |
|  |  Documents        |  |  Suggestions      |  |  Signatures       |  |
|  |  influenced       |  |  accepted         |  |  given            |  |
|  +-------------------+  +-------------------+  +-------------------+  |
|                                                                       |
|  BADGES                                                               |
|  +-------------------+  +-------------------+  +-------------------+  |
|  | [Star] First      |  | [Pen] Prolific    |  | [Check] Early     |  |
|  | Signer            |  | Reviewer          |  | Adopter           |  |
|  +-------------------+  +-------------------+  +-------------------+  |
|                                                                       |
|  RECENT ACTIVITY                                                      |
|  +---------------------------------------------------------------+    |
|  |  [Check] Signed "Budget Proposal 2025"         - 2 days ago   |    |
|  |  [Star]  Suggestion accepted on "Privacy Policy" - 5 days ago |    |
|  |  [Chat]  Commented on "Community Guidelines"    - 1 week ago  |    |
|  +---------------------------------------------------------------+    |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Component Hierarchy

**Organism: EngagementDashboard**
- File: `apps/sign/src/components/engagement/EngagementDashboard.tsx` + `.module.scss`
- Page-level component, accessed via `/profile` route or modal

**Molecule: StatsGrid**
- 3-column grid of stat cards
- Each card: large number + label
- CSS Grid on desktop, stack on mobile

**Molecule: BadgeShowcase**
- Horizontal scrollable row of earned badges
- Unearned badges shown as ghosted/locked (20% opacity)

**Molecule: ActivityFeed**
- Chronological list of recent actions
- Each item: icon + description + relative timestamp

---

## 6. Document Evolution Reward

### ASCII Wireframe: "What Changed" Banner (appears on return visit)

```
+-----------------------------------------------------------------------+
|  [Logo]                          [Admin]  [Bell(3)]  [Avatar: JD v]  |
+-----------------------------------------------------------------------+
|                                                                       |
|  +---------------------------------------------------------------+    |
|  |  [Refresh] This document has changed since your last visit     |    |
|  |                                                                |    |
|  |  - 2 paragraphs updated                                       |    |
|  |  - 1 new paragraph added                                      |    |
|  |  - Your suggestion on Para 5 was incorporated!                 |    |
|  |                                                                |    |
|  |  [Show Changes]                              [Dismiss]         |    |
|  +---------------------------------------------------------------+    |
|                                                                       |
|  Document Title Here                                                  |
```

### ASCII Wireframe: Diff Highlights in Document

```
  +-------------------------------------------+
  |  Paragraph 5 (updated)                    |
  |                                           |
  |  The committee shall review all proposals |
  |  [HIGHLIGHTED: within 30 business days]   |  <-- yellow highlight
  |  and provide written feedback.            |  <-- for changed text
  |                                           |
  |  [Your suggestion] was incorporated here  |  <-- green pill badge
  |                                           |
  +-------------------------------------------+
```

### Component Hierarchy

**Molecule: DocumentChangesBanner**
- File: `apps/sign/src/components/engagement/DocumentChangesBanner.tsx` + `.module.scss`
- Appears between topBar and document header on return visits
- Background: `var(--card-blue)` with left border `var(--btn-primary)`
- Lists change summary (paragraph counts)
- Highlights user's accepted suggestions specifically
- "Show Changes" button activates diff highlighting
- "Dismiss" removes banner (stored in session/local storage)
- Auto-dismisses after 30 seconds

**Atom: DiffHighlight**
- Inline highlight wrapper for changed text
- Background: `rgba(255, 235, 59, 0.3)` (subtle yellow)
- With a small "changed" pill badge in the margin

**Atom: ContributionMarker**
- Small green pill "Your suggestion" next to paragraphs where user's suggestion was accepted
- Background: `var(--agree)` at 15% opacity, text `var(--agree)`

### Data Flow
On page load, compare user's `lastVisitTimestamp` with document's `lastUpdate`. If document changed, fetch change diff from API and show banner. The `DocumentVisitTracker` component already tracks visits.

---

## 7. Signature Milestone Celebrations

### Design: Subtle and Professional

Milestones should feel like a shared community achievement, not a personal game event. Think "LinkedIn post milestone" not "mobile game level up."

### ASCII Wireframe: Milestone Banner (in footer area)

```
  +-------------------------------------------+
  |  [Star] 50 signatures reached!            |
  |  This document has been signed by 50      |
  |  people. Thank you for being part of it.  |
  +-------------------------------------------+
```

### ASCII Wireframe: Personal Badge (in notification)

```
  +-----------------------------+
  | [Trophy] Pioneer Badge      |
  | You were among the first    |
  | 10 signers of this document |
  +-----------------------------+
```

### Milestones Table

| Threshold | Celebration | Intensity |
|-----------|-------------|-----------|
| 10 | Small toast notification | Very subtle |
| 50 | Banner in footer area | Subtle |
| 100 | Banner + subtle border glow on doc | Moderate |
| 500 | Banner + "community landmark" message | Moderate |
| 1000 | Special badge for all signers | Celebratory |

### Personal Badges

| Badge | Condition | Icon |
|-------|----------|------|
| Pioneer | Among first 10 signers | Shield/Star |
| Trailblazer | Among first 50 signers | Trail/Path |
| Contributor | Suggestion was accepted | Lightbulb |
| Voice | Most comments on a document | Megaphone |

### Component: MilestoneBanner
- File: `apps/sign/src/components/engagement/MilestoneBanner.tsx` + `.module.scss`
- Appears at the top of the footer area or as a toast
- Background: linear-gradient from `var(--card-blue)` to transparent
- Auto-dismisses after 8 seconds
- Shows only once per milestone per user (stored in localStorage)

---

# PART 2: MASS CONSENSUS (MC) APP ENGAGEMENT SYSTEM

---

## 1. In-App Notification System

### Design Rationale
MC sessions are short and intense (5-10 min). Notifications should NOT interrupt the swipe flow. Instead, notifications serve two purposes:
1. **Between sessions**: Bring users BACK (new round, results ready)
2. **During session**: Absolutely minimal (no bell during swipe)

### Placement Strategy

**During swipe session**: NO notification bell visible. The swipe interface must be distraction-free.

**On results page / landing / between questions**: Show notification bell in the header area.

### ASCII Wireframe: Landing/Results Page Header with Bell

```
+---------------------------------------------+
|  [Freedi MC]       [Bell(2)]  [Avatar: JD]  |
+---------------------------------------------+
```

### ASCII Wireframe: Notification Panel (MC)

```
                           +----------------------------------+
                           |  Updates                [Clear]  |
                           +----------------------------------+
                           |  [NEW] New consensus round!      |
                           |  "Budget Priorities" - Round 2   |
                           |  10 new solutions to evaluate    |
                           |  [Start Evaluating -->]          |
                           |  2 hours ago                     |
                           +----------------------------------+
                           |  Results published!              |
                           |  "Transportation Policy" results |
                           |  are ready. See where consensus  |
                           |  landed.                         |
                           |  [View Results -->]              |
                           |  Yesterday                       |
                           +----------------------------------+
                           |  Your solution reached consensus!|
                           |  "Add bike lanes" was included   |
                           |  in the top cluster.             |
                           |  1 day ago                       |
                           +----------------------------------+
```

### MC Notification Types

| Type | Icon | Action Button | When |
|------|------|--------------|------|
| New round | Refresh circle | "Start Evaluating" | New round begins |
| Results ready | Chart bar | "View Results" | Results published |
| Solution in consensus | Star | "View Results" | User's solution made it |
| Consensus shift | Trending arrow | "See Update" | Rankings changed significantly |

### Component Hierarchy

**Atom: MCNotificationBadge** (reuse pattern from Sign app)
- Same red badge pattern

**Atom: MCNotificationItem**
- Similar to Sign, but with inline CTA button per notification
- More action-oriented than Sign's informational notifications

**Molecule: MCNotificationPanel**
- Dropdown from header
- Notifications have embedded action buttons ("Start Evaluating", "View Results")
- Empty state: "All caught up! We'll notify you when there's something new."

### Integration: Only show bell in `AdminHeader` or equivalent non-swipe layouts. Use a layout-level check: if current route is swipe interface, hide bell.

---

## 2. Subscription to Process Updates

### ASCII Wireframe: Subscribe Toggle (on Results Page)

```
+---------------------------------------------+
|  Results: Budget Priorities                  |
|                                             |
|  +---------------------------------------+  |
|  |  [Bell] Get notified about this topic |  |
|  |  [Toggle: ON]  Frequency: [Instant v] |  |
|  +---------------------------------------+  |
|                                             |
|  #1  Add more parks     Score: 0.85        |
|  #2  Bike lanes          Score: 0.72        |
```

### ASCII Wireframe: Subscribe Prompt (on CompletionScreen)

```
  +-------------------------------------------+
  |          [Checkmark Animation]             |
  |                                           |
  |  Thank You!                                |
  |  Your voice matters.                       |
  |                                           |
  |  Solutions evaluated: 20                   |
  |  Total participants: 156                   |
  |                                           |
  |  +--------------------------------------+ |
  |  |  [Bell] Get notified when results    | |
  |  |  are ready                           | |
  |  |                                      | |
  |  |  [Email input______] [Subscribe]     | |
  |  |                                      | |
  |  |  [Toggle] Push notifications         | |
  |  +--------------------------------------+ |
  |                                           |
  |  (existing badges section)                |
  |                                           |
  |  [Continue Evaluating]                    |
  +-------------------------------------------+
```

### Frequency Options for MC

- **Instant** (default): Notified when new rounds start, results ready
- **Daily digest**: Summary of all process updates
- **None**: Unsubscribe

Weekly doesn't make sense for MC since processes are typically shorter.

### Component Hierarchy

**Molecule: ProcessSubscription**
- File: `apps/mass-consensus/src/components/engagement/ProcessSubscription.tsx` + `.module.scss`
- Reusable component that appears on CompletionScreen and Results page
- Contains: toggle switch, email input (if no push), frequency selector
- On CompletionScreen: integrates below stats, above badges
- On Results page: appears as a card above the results list

### Integration with existing CompletionScreen

Add `ProcessSubscription` component into the `scrollableContent` area of CompletionScreen, between the `timeline` section and the existing `subscribeForm`. The existing email subscription form can be REPLACED by ProcessSubscription, which is a superset (it handles email + push + frequency).

---

## 3. Level Badge + Permission Gating in Swipe Context

### MC Level System

| Level | Name | Requirements | Capabilities |
|-------|------|-------------|-------------|
| 0 | Viewer | Visit results page | View results only |
| 1 | Evaluator | Login | Swipe/evaluate solutions (THE core action) |
| 2 | Ideator | 50+ credits | Add new solutions to the pool |
| 3 | Facilitator | 200+ credits | Create new consensus processes |
| 4 | Architect | 500+ credits + invite | Full admin, manage processes |

### ASCII Wireframe: Locked Swipe Interface (Level 0 - View Only)

```
+---------------------------------------------+
|                                             |
|  Budget Priorities                          |
|  12 of 50 evaluated                        |
|  [||||||||24%|||||                     ]   |
|                                             |
|  +---------------------------------------+  |
|  |                                       |  |
|  |    [Lock Icon]                        |  |
|  |                                       |  |
|  |    Sign in to start                   |  |
|  |    evaluating solutions               |  |
|  |                                       |  |
|  |    [Sign In to Evaluate]              |  |
|  |                                       |  |
|  +---------------------------------------+  |
|                                             |
|  [--] [-] [0] [+] [++]  (greyed out)       |
|                                             |
+---------------------------------------------+
```

### ASCII Wireframe: Locked "Add Solution" (Level 1 - can swipe, can't propose)

```
+---------------------------------------------+
|  All done!                                  |
|                                             |
|  You've evaluated all 20 proposals.         |
|                                             |
|  [Submit Your Own Idea: Lock]               |
|                                             |
|  +---------------------------------------+  |
|  |  [Lightbulb] Reach Ideator level to   |  |
|  |  submit your own solutions.            |  |
|  |  12 more credits needed.               |  |
|  |  [Continue evaluating for credits]     |  |
|  +---------------------------------------+  |
|                                             |
+---------------------------------------------+
```

### ASCII Wireframe: Level Badge in MC Header

```
+---------------------------------------------+
|  [MC Logo]  [Evaluator Badge]  [Bell] [JD]  |
+---------------------------------------------+
```

### Component Hierarchy

**Atom: MCLevelBadge**
- File: `apps/mass-consensus/src/components/engagement/MCLevelBadge.tsx` + `.module.scss`
- Small pill in header showing current level
- Color matches level (same palette as Sign app for consistency)

**Molecule: LockedSwipeOverlay**
- Full card overlay when user can't swipe
- Shows lock icon, explanation, and CTA to sign in
- Semi-transparent backdrop over the card area
- Rating buttons below are visually disabled (greyed, no interaction)

**Molecule: LockedActionCard**
- Card that replaces locked CTA buttons (like "Submit Your Own Idea")
- Shows: locked action name, level required, credits needed, suggestion for earning

### Integration Points

1. **SwipeInterface**: Check user level before allowing swipe. If level 0, show LockedSwipeOverlay instead of SwipeCard
2. **Completion state**: Check level before showing "Submit Your Own Idea" button. If locked, show LockedActionCard
3. **SolutionPromptModal**: Gate by level check before opening
4. **Header**: Add MCLevelBadge in admin/results header areas

---

## 4. Credits Integration with Existing CompletionScreen

### ASCII Wireframe: Enhanced CompletionScreen with Credits

```
  +-------------------------------------------+
  |          [Checkmark Animation]             |
  |                                           |
  |  Thank You!                                |
  |  Your voice matters.                       |
  |                                           |
  |  +--- Stats Row (existing) ---+           |
  |  |  20 Solutions  |  156 Participants |    |
  |  +-------------------------------+        |
  |                                           |
  |  +--- Credits Earned (NEW) ------+        |
  |  |                               |        |
  |  |  [Coin] +45 credits earned    |        |
  |  |                               |        |
  |  |  20 evaluations    +40        |        |
  |  |  All solutions      +5 bonus  |        |
  |  |                               |        |
  |  |  Total: 195 credits           |        |
  |  |  [====Evaluator====78%====]   |        |
  |  |  5 more to Ideator!           |        |
  |  +-------------------------------+        |
  |                                           |
  |  +--- Badges (existing, enhanced) --+     |
  |  |  Achievements Earned             |     |
  |  |  [Early Bird] [Deep Thinker]     |     |
  |  |  [Innovator] [Team Player]       |     |
  |  |  [NEW: Speed Demon]             |     |
  |  +----------------------------------+    |
  |                                           |
  |  (subscription section...)                |
  |                                           |
  |  [Continue Evaluating]                    |
  +-------------------------------------------+
```

### Credits Breakdown Component

**Molecule: CreditsSummary**
- File: `apps/mass-consensus/src/components/engagement/CreditsSummary.tsx` + `.module.scss`
- Placed in CompletionScreen between stats and badges sections
- Shows:
  - Total credits earned this session (with count-up animation)
  - Itemized breakdown (evaluations, bonus, etc.)
  - Current total credits
  - Progress bar to next level
  - "X more to [next level]!" motivational text
- Background: `var(--card-default)` with subtle `box-shadow`
- The credit number uses a counting animation from 0 to final value

### MC Credit Award Table

| Action | Credits | Note |
|--------|---------|------|
| Evaluate 1 solution | +2 | Per card |
| Complete all evaluations | +5 bonus | Completion bonus |
| Submit a solution | +10 | Creative contribution |
| Solution reaches consensus | +25 | Big reward |
| Solution in top 3 | +15 | Quality reward |
| First evaluation in a round | +5 | Return engagement |
| Daily streak bonus | +3/day | Consistency reward |

### Integration with Existing AchievementBadge

The existing `AchievementBadge` component uses a `BadgeType` union type. Extend it with new credit-connected badges:

**New badge types to add:**

| Badge | Trigger | Icon | Color |
|-------|---------|------|-------|
| `speed-demon` | Complete all evaluations in under 5 min | Lightning | #FF6B35 |
| `streak-keeper` | 3+ day evaluation streak | Fire | #FF4444 |
| `consensus-builder` | Solution reached consensus | Handshake | #4CAF50 |
| `prolific-voter` | 100+ total evaluations | Chart | #2196F3 |

These extend the existing `BadgeType` in `AchievementBadge.tsx` and the `BADGE_CONFIG` record.

### Animation

The credits summary section uses a staggered entrance:
1. "Credits Earned" header fades in (0ms)
2. Credit amount counts up from 0 (200ms, 800ms duration)
3. Breakdown items slide in one by one (300ms stagger)
4. Progress bar fills (500ms after items)
5. "X more to..." text fades in (800ms)

All respect `prefers-reduced-motion`.

---

## 5. Swipe-Phase Engagement Boosters

### ASCII Wireframe: Enhanced Progress Counter

```
  +---------------------------------------------+
  |  12 of 50 evaluated     +24 credits so far  |
  |  [||||||||||24%|||||||                    ]  |
  +---------------------------------------------+
```

The existing `SurveyProgress` component gets a small extension: a credit counter on the right side of the text line.

### ASCII Wireframe: Social Proof on Completion

```
  +-------------------------------------------+
  |          [Checkmark Animation]             |
  |                                           |
  |  Thank You!                                |
  |  Your voice matters.                       |
  |                                           |
  |  +--- Social Proof (NEW) ----------+      |
  |  |  [People icon] 7 people agreed  |      |
  |  |  with your top pick             |      |
  |  |                                 |      |
  |  |  "Add bike lanes" is trending   |      |
  |  |  in the community               |      |
  |  +----------------------------------+     |
  |                                           |
  |  (stats, credits, badges...)              |
  +-------------------------------------------+
```

### Component Hierarchy

**Atom: CreditCounter (inline)**
- File: part of SurveyProgress enhancement
- Small text showing running credit total
- Color: `var(--text-secondary)`, not distracting
- Updates with subtle pulse when credits increase

**Molecule: SocialProofCard**
- File: `apps/mass-consensus/src/components/engagement/SocialProofCard.tsx` + `.module.scss`
- Shows on CompletionScreen
- "X people agreed with your top pick" (variable reward - social validation)
- "Your solution 'X' is trending" (if user submitted a solution)
- Background: subtle gradient similar to existing timeline section
- Uses existing CompletionScreen design patterns

### Integration
- CreditCounter: Extend `SurveyProgress.tsx` to accept optional `creditsEarned` prop
- SocialProofCard: Add to CompletionScreen between title/subtitle and stats

---

## 6. Results Page Enhancement

### ASCII Wireframe: Enhanced Results with Personal Impact

```
+---------------------------------------------+
|  [MC Logo]  [Evaluator]    [Bell(1)]  [JD]  |
+---------------------------------------------+
|                                             |
|  Results: Budget Priorities                  |
|  Round 2 - 156 participants                 |
|                                             |
|  +--- Your Impact (NEW) ----------------+  |
|  |                                       |  |
|  |  [Sparkle] Your evaluations helped    |  |
|  |  shape this consensus                 |  |
|  |                                       |  |
|  |  You evaluated: 20 solutions          |  |
|  |  Your top pick: #2 ranked overall     |  |
|  |                                       |  |
|  +---------------------------------------+  |
|                                             |
|  [All Solutions]  [My Solutions]             |
|                                             |
|  #1  Add more parks     Score: 0.85        |
|      [156 evaluations]                      |
|                                             |
|  #2  Bike lanes          Score: 0.72       |
|      [Star: Your solution!]    [Share]      |
|      [156 evaluations]                      |
|                                             |
|  #3  Public transport    Score: 0.68        |
|      [156 evaluations]                      |
|                                             |
|  +--- Share Results (NEW) ---------------+  |
|  |  [Share] Share these results           |  |
|  |  Help spread the consensus             |  |
|  +---------------------------------------+  |
|                                             |
+---------------------------------------------+
```

### Component Hierarchy

**Molecule: PersonalImpactCard**
- File: `apps/mass-consensus/src/components/engagement/PersonalImpactCard.tsx` + `.module.scss`
- Shows at top of results page for logged-in users
- Displays: evaluations count, top pick ranking, solutions in consensus
- Background: gradient similar to CompletionScreen's timeline section
- Only shown to users who participated

**Atom: UserSolutionMarker**
- Small pill badge on solutions created by the current user
- Text: "Your solution!" or "You proposed this"
- Color: `var(--agree)` at 15% bg, green text

**Molecule: ShareResultsCard**
- Bottom of results page
- "Share these results" with social share buttons
- Investment phase of hook cycle: sharing creates social commitment

### Integration
- PersonalImpactCard: Add at top of results page, before tab selector
- UserSolutionMarker: Add to ResultsList items where `solution.creatorId === userId`
- ShareResultsCard: Add at bottom of ResultsList

---

## 7. MC Engagement Dashboard

### ASCII Wireframe: MC Profile/Dashboard

```
+---------------------------------------------+
|  [MC Logo]  [Dashboard]   [Bell]    [JD]    |
+---------------------------------------------+
|                                             |
|  +--- Profile Card --------------------+    |
|  |  John Doe                           |    |
|  |  [===Evaluator===]   78 credits     |    |
|  |  [||||||||||78%||||||           ]   |    |
|  |  22 more to Ideator                 |    |
|  +-------------------------------------+   |
|                                             |
|  +--- Activity Stats ------------------+   |
|  |  8          |  5          |  2       |   |
|  |  Processes  |  Solutions  |  Reached |   |
|  |  joined     |  created    |  consensus|  |
|  +-------------------------------------+   |
|                                             |
|  +--- Streak Counter ------------------+   |
|  |  [Fire] 5 day streak!              |    |
|  |  M  T  W  T  F  S  S               |    |
|  |  [*] [*] [*] [*] [*] [ ] [ ]       |    |
|  |  Keep it going!                     |    |
|  +-------------------------------------+   |
|                                             |
|  +--- Badges --------------------------+   |
|  |  [Early Bird] [Deep Thinker]        |    |
|  |  [Speed Demon] [Streak Keeper]      |    |
|  |  [Locked: Consensus Builder]        |    |
|  +-------------------------------------+   |
|                                             |
|  +--- Recent Activity -----------------+   |
|  |  Evaluated "Budget Priorities" - 2d  |   |
|  |  Solution in top 3 - 5d             |   |
|  |  Completed "Transport" round - 1w    |   |
|  +-------------------------------------+   |
|                                             |
+---------------------------------------------+
```

### Component Hierarchy

**Organism: MCEngagementDashboard**
- File: `apps/mass-consensus/src/components/engagement/MCEngagementDashboard.tsx` + `.module.scss`
- Accessible from header dropdown or dedicated route

**Molecule: StreakCounter**
- File: `apps/mass-consensus/src/components/engagement/StreakCounter.tsx` + `.module.scss`
- Weekly calendar view with filled/unfilled dots
- Current streak number with fire icon
- Color: streak dots use `var(--agree)`, missed days use `var(--border-light, #e2e8f0)`

**Molecule: MCStatsGrid**
- Same pattern as Sign app StatsGrid
- 3 stat cards: Processes joined, Solutions created, Solutions in consensus

**Molecule: MCActivityFeed**
- Chronological list of recent actions
- Similar pattern to Sign app

### Integration
Add "My Dashboard" menu item to the MC header user dropdown. Route to a new page `/dashboard` or show as a modal.

---

# PART 3: CROSS-APP CONSIDERATIONS

---

## Shared Component Patterns

Both apps need these engagement primitives. They should be implemented independently per app (since they're separate Next.js apps) but follow identical visual patterns:

| Component | Sign App Style | MC App Style | Shared Pattern |
|-----------|---------------|-------------|----------------|
| Notification Bell | Professional, muted | Same | Red badge, outline bell |
| Level Badge | Pill with level name | Same | Same colors per level |
| Credit Toast | Subtle, top-right | Subtle, top-right | Same animation |
| Progress Bar | Thin green bar | Same | `var(--agree)` fill |
| Locked Action | Greyed + lock icon | Same | Same overlay pattern |

## Responsive Strategy (Both Apps)

| Breakpoint | Notification Panel | Dashboard | Toasts |
|------------|-------------------|-----------|--------|
| < 600px | Bottom sheet | Full page | Top center, full width |
| 600-1024px | Dropdown, max 350px wide | Side panel | Top right |
| > 1024px | Dropdown, max 400px wide | Side panel or page | Top right |

## Accessibility Requirements (Both Apps)

1. **All notifications**: Use `role="alert"` and `aria-live="polite"` for screen readers
2. **Badge counts**: Include `aria-label` (e.g., "3 unread notifications")
3. **Locked actions**: Locked buttons must still be focusable with clear aria-disabled state and tooltip explanation
4. **Credit toasts**: Must not be the only way to communicate credits (dashboard shows history)
5. **Level progress**: Progress bars need `role="progressbar"` with `aria-valuenow/min/max`
6. **Reduced motion**: All animations respect `prefers-reduced-motion: reduce`
7. **Color independence**: Level badges show level NAME, not just color
8. **Focus management**: When notification panel opens, focus moves to first notification; on close, focus returns to bell

## Animation Timing Reference

| Animation | Duration | Easing | Notes |
|-----------|----------|--------|-------|
| Toast enter | 200ms | ease-out | Slide down + fade |
| Toast exit | 200ms | ease-in | Slide up + fade |
| Panel open (desktop) | 150ms | ease | Dropdown fade |
| Panel open (mobile) | 300ms | ease-out | Bottom sheet slide |
| Credit count-up | 800ms | ease-out | Number animation |
| Badge pop-in | 300ms | cubic-bezier(.92,-0.02,.86,2.28) | Match existing |
| Progress bar fill | 500ms | ease-out | Smooth fill |
| Level-up celebration | 1000ms total | spring | Scale + glow |
| Locked action tooltip | 200ms | ease | Fade in |

---

## File Structure Summary

### Sign App New Files

```
apps/sign/src/components/
  notifications/
    NotificationBadge.tsx + .module.scss        (atom)
    NotificationItem.tsx + .module.scss         (atom)
    NotificationPanel.tsx + .module.scss        (molecule)
    FollowButton.tsx + .module.scss             (atom)
    FrequencySelector.tsx + .module.scss        (molecule)
  engagement/
    LevelBadge.tsx + .module.scss               (atom)
    LevelProgress.tsx + .module.scss            (atom)
    LockedAction.tsx + .module.scss             (atom)
    LevelUpPrompt.tsx + .module.scss            (molecule)
    CreditToast.tsx + .module.scss              (atom - extends Toast)
    EngagementDashboard.tsx + .module.scss      (organism)
    StatsGrid.tsx + .module.scss                (molecule)
    BadgeShowcase.tsx + .module.scss            (molecule)
    ActivityFeed.tsx + .module.scss             (molecule)
    DocumentChangesBanner.tsx + .module.scss    (molecule)
    DiffHighlight.tsx + .module.scss            (atom)
    ContributionMarker.tsx + .module.scss       (atom)
    MilestoneBanner.tsx + .module.scss          (molecule)
```

### MC App New Files

```
apps/mass-consensus/src/components/
  engagement/
    MCNotificationBadge.tsx + .module.scss      (atom)
    MCNotificationItem.tsx + .module.scss       (atom)
    MCNotificationPanel.tsx + .module.scss      (molecule)
    MCLevelBadge.tsx + .module.scss             (atom)
    LockedSwipeOverlay.tsx + .module.scss       (molecule)
    LockedActionCard.tsx + .module.scss         (molecule)
    CreditsSummary.tsx + .module.scss           (molecule)
    SocialProofCard.tsx + .module.scss          (molecule)
    ProcessSubscription.tsx + .module.scss      (molecule)
    PersonalImpactCard.tsx + .module.scss       (molecule)
    UserSolutionMarker.tsx + .module.scss       (atom)
    ShareResultsCard.tsx + .module.scss         (molecule)
    MCEngagementDashboard.tsx + .module.scss    (organism)
    StreakCounter.tsx + .module.scss            (molecule)
    MCStatsGrid.tsx + .module.scss             (molecule)
    MCActivityFeed.tsx + .module.scss           (molecule)
```

### Existing Files to Modify

**Sign App:**
- `DocumentView.tsx` - Add NotificationBadge to topBar, FollowButton to header
- `UserAvatar.tsx` - Add LevelBadge and dashboard link to dropdown
- `ParagraphCard.tsx` - Wrap action buttons with LockedAction
- `DocumentClient.tsx` - Add credit toast dispatch on actions
- `globals.scss` - No changes needed (all in module.scss)

**MC App:**
- `CompletionScreen.tsx` - Add CreditsSummary, SocialProofCard, ProcessSubscription (replace email form)
- `AchievementBadge.tsx` - Extend BadgeType with new types
- `SwipeInterface.tsx` - Add LockedSwipeOverlay check, credit counter integration
- `SurveyProgress.tsx` - Add optional credit counter display
- `ResultsList.tsx` - Add UserSolutionMarker, PersonalImpactCard above list
- `AdminHeader/Layout` - Add MCNotificationBadge, MCLevelBadge
