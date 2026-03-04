# Freedi User Engagement Plan -- Nir Eyal's Hook Model Analysis

## Context

Freedi is a deliberative democracy platform with solid core functionality (discussions, evaluations, voting, real-time chat, visualizations) and mature notification infrastructure (FCM push, in-app notifications, service worker badges). However, the app lacks **re-engagement loops** -- there is nothing that proactively pulls inactive users back or rewards them for returning. All notifications are purely reactive (triggered only on new replies). There is no gamification, no progress tracking, no social validation feedback, and no "what you missed" experience. This plan applies Nir Eyal's Hook Model (Trigger -> Action -> Variable Reward -> Investment) to identify high-impact, buildable engagement features.

---

## Hook Model Analysis of Current State

```
TRIGGER              ACTION                VARIABLE REWARD          INVESTMENT
-----------------    -------------------   ---------------------    -----------------
Push on reply        Easy guest login      Consensus scores         Subscriptions
In-app badge         FAB creation          Real-time votes          Creating options
PWA badge            Thumbs up/down        Online users             Evaluating
PIN invite           AI idea assist        Community badge          Joining teams
Google Docs import                         Hebbian score
Shareable links

MISSING:             MISSING:              MISSING:                 MISSING:
Re-engagement        Swipe voting UX       Social validation        Progress tracking
Digest               Micro-animations      "What you missed"        Streaks
Deadline remind      Progressive reveal    Leaderboard/impact       Completion goals
FOMO triggers                              Statement evolution      "My Impact" dashboard
Milestone triggers                         Dynamic heatmaps
```

---

## Recommendations

### PHASE 1: TRIGGERS -- Bringing Users Back

#### 1. Social Proof Notifications -- "5 people agreed with your suggestion"

**Hook Phase:** TRIGGER (external) + VARIABLE REWARD (social validation)
**Complexity:** M | **Impact:** HIGH

When someone evaluates a user's option and it crosses a milestone (1st, 5th, 10th evaluation, or becomes top-rated), notify the creator via FCM push + in-app notification.

Examples:
- "3 people just backed your suggestion on [Topic]. Join the chat!"
- "Your option is now the top-rated in 'Park Design'"

**Why:** Social validation is the #1 driver of return visits. Currently evaluations are tracked but *never surfaced back to the option creator*. This closes the feedback loop.

**Leverage existing:**
- `functions/src/evaluation/onCreateEvaluation.ts` -- already fires on every evaluation
- `functions/src/fn_statementCreation.ts` lines 368-482 -- `createNotificationsForStatement()` pattern for both in-app + FCM
- `processFcmNotificationsImproved()` -- handles token batching, retry, cleanup
- `notificationsSlice.ts` -- client already renders in-app notifications

**Build:**
- Add milestone detection logic after consensus recalculation in the evaluation trigger
- Query creator's subscription for FCM tokens
- Create in-app + push notification using existing patterns
- Rate limit: max 1 social notification per option per hour
- Add `notificationType: 'social_proof'` to distinguish from reply notifications

---

#### 2. Contextual Consensus Shift Notifications -- "The consensus just shifted 15%!"

**Hook Phase:** TRIGGER (external) + VARIABLE REWARD (hunt/competition)
**Complexity:** M | **Impact:** MEDIUM-HIGH

When the top-ranked option in a question changes or consensus shifts significantly (>15%), push-notify all subscribers with the specific context of what changed.

Examples:
- "The consensus on [Statement] just shifted by 15%. See why."
- "New leading option in 'Budget': 'Schools' surpassed 'Park' -- see the results!"

**Why:** Leaderboard shifts trigger curiosity and competitive instinct. Leverages loss aversion (your preferred option might lose). The specificity of "shifted by 15%" is more compelling than generic alerts.

**Leverage existing:**
- `functions/src/evaluation/statementEvaluationUpdater.ts` -- consensus recalculation
- Same notification pipeline as #1
- Subscription system with `getPushNotification` flags

**Build:**
- After consensus recalc, compare new vs previous `consensus` value and check if top option changed
- Store `topOptionId` and `previousConsensus` on parent statement
- Fire notifications on significant shifts or leader changes
- Rate limit: max 1 per question per 6 hours

---

#### 3. Milestone Completion Triggers -- "You were one of the first!"

**Hook Phase:** TRIGGER (external) + VARIABLE REWARD (self)
**Complexity:** S-M | **Impact:** MEDIUM-HIGH

When a statement a user voted on early finally reaches consensus or a decision, trigger them back with a personalized notification celebrating their early participation.

Examples:
- "You were one of the first to vote on this. See the final result!"
- "A statement you helped shape just reached consensus!"

**Build:**
- Track early voters (first 20% of evaluations) on each statement
- When statement reaches consensus threshold or voting deadline, notify early participants
- Can piggyback on existing `fn_handleVotingDeadline` scheduled function

---

#### 4. FOMO & Urgency Triggers -- Countdown Timers

**Hook Phase:** TRIGGER (internal) + VARIABLE REWARD (hunt)
**Complexity:** S | **Impact:** MEDIUM

Show countdown timers when a statement is nearing its decision deadline. Create healthy urgency.

**Build:**
- Visual countdown component on statements with voting deadlines
- Pre-deadline push notification: "Vote closes in 24 hours on [Topic]"
- Leverage existing `fn_handleVotingDeadline` -- add a 24h-before check

---

#### 5. Daily Activity Digest Push -- "12 new replies across 3 discussions"

**Hook Phase:** TRIGGER (external) + VARIABLE REWARD (hunt/curiosity)
**Complexity:** M | **Impact:** HIGH

A scheduled Firebase Function sends a single daily FCM push summarizing activity across all subscribed discussions. Skips users active in the last 4 hours.

**Why:** Addresses the biggest gap -- zero re-engagement for dormant users. Aggregates novelty across discussions into one compelling notification.

**Leverage existing:**
- `fn_tokenCleanup.ts` -- exact `onSchedule` pattern (lines 31-50)
- `pushNotifications` collection -- all active FCM tokens grouped by userId
- `statementsSubscribe` collection -- subscriptions with `lastUpdate` timestamps

**Build:**
- New `fn_activityDigest.ts` scheduled function (daily at 10:00 AM UTC)
- For each user: aggregate subscriptions updated since `lastDigestSent`
- Compose summary FCM notification
- Skip recently active users

---

#### 6. Weekly Email Digest for Inactive Users

**Hook Phase:** TRIGGER (external)
**Complexity:** M | **Impact:** MEDIUM

Weekly email to users inactive 7+ days summarizing their subscribed discussions' activity.

**Leverage existing:**
- `fn_emailNotifications.ts` -- complete email pipeline
- `email-templates.ts` -- `createBaseEmailTemplate()` with styled HTML
- Existing unsubscribe endpoint

---

### PHASE 2: ACTIONS -- Reducing Friction, Increasing Delight

#### 7. Swipe-to-Vote Cards -- "Tinder for Deliberation"

**Hook Phase:** ACTION (reduce friction)
**Complexity:** M | **Impact:** HIGH

When users have multiple options to evaluate, present them as swipeable cards (left = disagree, right = agree, up = skip). Mimics addictive feed patterns and reduces decision fatigue.

**Why:** Current evaluation requires tapping individual thumbs on a scrollable list. A swipe interface is faster, more engaging, and creates a flow state. B = MAT -- this dramatically increases Ability.

**Build:**
- New `SwipeEvaluation` component as an alternative evaluation UI
- Gesture handling (touch swipe + mouse drag)
- Card stack animation (next card visible behind current)
- Admin toggle in evaluation settings: `evaluationUI: 'swipe'`
- Falls back to standard view on desktop or when few options exist

---

#### 8. Micro-Animations & Haptic Feedback on Voting

**Hook Phase:** ACTION (satisfaction)
**Complexity:** S | **Impact:** MEDIUM-HIGH

Make voting feel physically satisfying. Add snappy animations the moment a user casts an evaluation: color burst, subtle bounce, haptic feedback on mobile.

**Why:** The act of voting should feel like pressing a perfectly clicky button. Micro-rewards at the action step increase repeat behavior.

**Build:**
- CSS animation on evaluation buttons (scale + color pulse)
- `navigator.vibrate()` for subtle haptic on mobile
- Confetti/particle burst on milestone votes (first vote, 10th vote)
- Add to existing evaluation components: `SimpleEvaluation`, `EnhancedEvaluation`, `CommunityVoiceEvaluation`

---

#### 9. Progressive Disclosure -- "What would change your mind?"

**Hook Phase:** ACTION (guided depth)
**Complexity:** S | **Impact:** MEDIUM

Don't overwhelm users with the full discussion UI immediately. Let them vote first. Only if they disagree with an option, smoothly reveal an input field: "What would change your mind?" This lowers the barrier to constructive criticism.

**Why:** Currently the evaluation page and chat are separate tabs. This creates a natural bridge from passive voting to active contribution, exactly at the moment of highest motivation (disagreement).

**Build:**
- Conditional expand on negative evaluation in `SuggestionCard`
- Animated slide-down of a mini text input
- Posts as a reply to the option (creates a chat sub-statement)
- Can be disabled per-statement by admins

---

### PHASE 3: VARIABLE REWARDS -- The Unpredictable Payoff

#### 10. "Top Consensus Builders" Leaderboard

**Hook Phase:** VARIABLE REWARD (tribe) + INVESTMENT
**Complexity:** M | **Impact:** MEDIUM-HIGH

Highlight users whose suggestions consistently bridge divides -- not who votes the most, but whose words unite people. Show on the collaboration index screen or as a periodic notification.

**Why:** This rewards quality over quantity. Users who see their name as a "consensus builder" feel mastery and social recognition. It is variable because the ranking shifts with new evaluations.

**Build:**
- Aggregate per-user: average consensus score of their options, weighted by evaluator count
- New `ConsensusBuilders` component on the collaboration index page
- Optional: periodic notification to top builders

---

#### 11. Impact Metrics -- "Your suggestions have influenced 400 voters"

**Hook Phase:** VARIABLE REWARD (self) + INVESTMENT
**Complexity:** S-M | **Impact:** HIGH

Show users their personal impact: total evaluations received across all their options, total voters influenced, number of options that reached consensus.

Examples:
- "Your suggestions have influenced 400 voters"
- "3 of your options are in the top 5"

**Build:**
- Aggregate from existing evaluation data (evaluations where `statementCreatorId === userId`)
- Display on profile page (`My.tsx`) or as a header widget
- Periodic milestone notifications: "You just hit 100 evaluations received!"

---

#### 12. Statement Evolution Timeline -- "See how your words shaped the outcome"

**Hook Phase:** VARIABLE REWARD (self/mastery)
**Complexity:** M-L | **Impact:** MEDIUM

Show a visual timeline of how a statement evolved through the deliberation process -- like a beautiful git history. Users can see their specific contributions integrated into the final version.

**Why:** Seeing your edit appear in the "master version" creates a profound sense of mastery and ownership. This is especially powerful in the Sign app's suggestion integration flow.

**Build:**
- Track statement version history (edits, integrations)
- Timeline visualization component
- Highlight the current user's contributions in the timeline

---

#### 13. Dynamic Consensus Heatmaps

**Hook Phase:** VARIABLE REWARD (hunt)
**Complexity:** M | **Impact:** MEDIUM

Enhance the existing collaboration index / agreement map with dynamic, interactive heatmaps. Let users "hunt" for the exact wording changes that flip a demographic from disagreement to agreement.

**Why:** The visual thrill of watching a chart shift from polarized (red) to united (green) is a powerful variable reward. The interactivity makes it explorable and unpredictable.

**Leverage existing:**
- `PolarizationIndex.tsx` -- current scatter plot visualization
- Demographic data from user surveys

**Build:**
- Add time-series animation (play/scrub through evaluation history)
- Demographic breakdown overlay
- Interactive tooltips showing what changed

---

### PHASE 4: INVESTMENT -- Building Value Users Can't Abandon

#### 14. Participation Progress Bar -- "You evaluated 5 of 8 options"

**Hook Phase:** INVESTMENT + VARIABLE REWARD (self/completion)
**Complexity:** S | **Impact:** MEDIUM-HIGH

Show a progress bar on the Solutions tab: "You evaluated X of Y options." Completion celebration when done. On home cards: "3 options need your input."

**Why:** Zeigarnik effect -- users who see 5/8 feel compelled to finish. Makes Investment explicit and trackable.

**Leverage existing:**
- `StatementsEvaluationPage.tsx` -- evaluation page
- Evaluation IDs follow pattern `${userId}--${statementId}`
- Redux store already has statements + evaluations
- `MainCard.tsx` -- home feed card

**Build:**
- Custom hook `useEvaluationProgress(parentId, userId)` -- pure client-side
- Progress bar component (atomic design, BEM naming)
- Badge on MainCard showing unevaluated count
- Confetti/celebration animation on 100% completion

---

#### 15. "My Impact" Dashboard

**Hook Phase:** INVESTMENT (stored value) + VARIABLE REWARD (self)
**Complexity:** M | **Impact:** HIGH

A private dashboard showing: "Statements you helped pass", "Words you contributed to the final charter", "Total voters influenced", "Your consensus-building score." The more history users build, the harder it is to abandon the platform (IKEA Effect).

**Build:**
- New page or section in profile (`My.tsx`)
- Aggregate user's: options created, evaluations received, consensus scores, statements reached consensus
- Visual cards with key metrics
- "Statements you helped pass" list with links

---

#### 16. The "After-Reward" Investment Ask

**Hook Phase:** INVESTMENT (loading the next trigger)
**Complexity:** S | **Impact:** MEDIUM-HIGH

The moment after a variable reward (user votes and sees they agree with majority, or their suggestion gets positive evaluations), ask for a small investment:
- "Want to track the fate of your suggestion? Install the app."
- "Save your voting history by creating a quick profile."
- "This statement needs more voices from [Demographic]. Can you share this link?"

**Why:** Investment should follow reward, not precede it. The current PWA prompt triggers on option creation -- this extends that pattern to more reward moments.

**Build:**
- Contextual prompt component triggered after positive evaluation feedback
- PWA install prompt variant after satisfying moments
- Share prompt after agreeing with majority (social recruiting)
- Profile creation prompt for anonymous users after their 3rd vote

---

#### 17. Contribution Streak Counter

**Hook Phase:** INVESTMENT + VARIABLE REWARD (self)
**Complexity:** S-M | **Impact:** MEDIUM

Track active days and display a streak counter in the home header. Consider "active days in last 7" variant (more forgiving than strict consecutive).

**Build:**
- New `userStreaks` Firestore collection
- Cloud Function trigger on evaluation/statement creation
- Client display component in `HomeHeader.tsx`

---

#### 18. "Welcome Back" Summary Screen

**Hook Phase:** VARIABLE REWARD (hunt/tribe) + TRIGGER (internal)
**Complexity:** S | **Impact:** MEDIUM

When returning after 24+ hours, show a summary: "Welcome back! 12 new replies across 3 discussions" with links to most active discussions. Auto-dismiss on scroll.

**Build:**
- `lastVisitTimestamp` in localStorage
- `WelcomeBackSummary` component above MainCard list
- Filter subscriptions with activity since last visit

---

### QUICK WIN: The "Impact Loop" (Celebration + Next Trigger)

**Complexity:** S | **Impact:** HIGH

When a user's suggestion is accepted (especially in the Sign app's `integrateSuggestions` flow), throw digital confetti and send an immediate celebratory notification that loads the next trigger: "Your wording was just made official! Want to tackle the next paragraph?"

This combines Variable Reward (celebration) with Investment (loading the next trigger) in a single delightful moment.

**Build:**
- Confetti animation component (reusable across #8, #14, and this)
- Trigger on suggestion acceptance event
- Notification with deep link to the next unresolved paragraph/statement

---

### QUICK WIN: Anonymous-to-Invested Conversion

**Complexity:** S | **Impact:** HIGH

Capitalize on the "no login required" advantage. Let anonymous users vote freely, show them satisfying live chart updates (Variable Reward), then prompt: "Save your vote by entering a username." This converts passive anonymous voters into invested users.

**Build:**
- After 3rd anonymous evaluation, show a gentle prompt
- "Your votes matter! Save them by picking a username."
- Smooth transition from anonymous to named user (preserve evaluation history)
- Leverage existing `EnterNameModal` component

---

## Implementation Priority

| Priority | Feature | Phase | Effort | Impact |
|----------|---------|-------|--------|--------|
| 1 | Social Proof Notifications (#1) | Trigger + Reward | M | HIGH |
| 2 | Impact Loop Quick Win | Reward + Investment | S | HIGH |
| 3 | Anonymous Conversion Quick Win | Investment | S | HIGH |
| 4 | Daily Digest Push (#5) | Trigger | M | HIGH |
| 5 | Impact Metrics (#11) | Reward + Investment | S-M | HIGH |
| 6 | Swipe-to-Vote (#7) | Action | M | HIGH |
| 7 | Participation Progress (#14) | Investment + Reward | S | MED-HIGH |
| 8 | Micro-Animations (#8) | Action | S | MED-HIGH |
| 9 | Consensus Shift Notifications (#2) | Trigger + Reward | M | MED-HIGH |
| 10 | Milestone Triggers (#3) | Trigger + Reward | S-M | MED-HIGH |
| 11 | Progressive Disclosure (#9) | Action | S | MEDIUM |
| 12 | "My Impact" Dashboard (#15) | Investment | M | HIGH |
| 13 | FOMO Countdown (#4) | Trigger | S | MEDIUM |
| 14 | Consensus Builders Leaderboard (#10) | Reward | M | MED-HIGH |
| 15 | Welcome Back Screen (#18) | Reward | S | MEDIUM |
| 16 | After-Reward Investment Ask (#16) | Investment | S | MED-HIGH |
| 17 | Streak Counter (#17) | Investment | S-M | MEDIUM |
| 18 | Weekly Email Digest (#6) | Trigger | M | MEDIUM |
| 19 | Statement Evolution Timeline (#12) | Reward | M-L | MEDIUM |
| 20 | Dynamic Heatmaps (#13) | Reward | M | MEDIUM |

---

## The Complete Hook Cycle (How These Work Together)

```
TRIGGER                        ACTION                    VARIABLE REWARD              INVESTMENT
"3 people backed your idea"    Swipe to vote             Consensus score shifts        Progress bar 5/8
"Consensus shifted 15%"        Micro-animation delight   "Top Consensus Builder!"      "My Impact" dashboard
"Vote closes in 24h"           Progressive disclosure    Impact metrics update          Streak: Day 5
Daily digest push              One-tap evaluate          Confetti on acceptance         Share with a friend
Milestone: "First to vote!"                             Evolution timeline              Save with username
```

Each phase loads the next: Trigger brings user in -> Action is frictionless and satisfying -> Variable Reward surprises them -> Investment stores value and loads the next Trigger.
