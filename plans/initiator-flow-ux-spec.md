# Initiator Flow -- Complete UX Specification

## Document Purpose

This is a comprehensive UX specification for the **initiator flow** in Freedi's Bot (deliberation) app. While the participant flow lets people contribute to an existing deliberation via a shared link, the initiator flow lets someone **create** a deliberation when they have a challenge to solve, then share it with their community.

This spec covers every screen, interaction, wizard question, data transformation, transition, edge case, and component needed to implement the full initiator experience.

---

## Table of Contents

1. [Design Foundations](#1-design-foundations)
2. [Architecture Overview](#2-architecture-overview)
3. [User Journey Map](#3-user-journey-map)
4. [Screen Inventory](#4-screen-inventory)
   - [Screen 1: Home / Landing (Updated)](#screen-1-home--landing-updated)
   - [Screen 2: Challenge Input](#screen-2-challenge-input)
   - [Screen 3: Wizard -- Structure Your Deliberation](#screen-3-wizard)
   - [Screen 4: Review & Launch](#screen-4-review--launch)
   - [Screen 5: Share](#screen-5-share)
   - [Screen 6: Dashboard](#screen-6-dashboard)
   - [Screen 7: Deliberation Detail (Initiator View)](#screen-7-deliberation-detail)
5. [Wizard Questions Flow](#5-wizard-questions-flow)
6. [Share Screen Design](#6-share-screen-design)
7. [Dashboard Design](#7-dashboard-design)
8. [State Machine](#8-state-machine)
9. [Edge Cases](#9-edge-cases)
10. [Component Inventory](#10-component-inventory)
11. [i18n Keys](#11-i18n-keys)
12. [Route Map](#12-route-map)
13. [Data Model Extensions](#13-data-model-extensions)
14. [Implementation Roadmap](#14-implementation-roadmap)

---

## 1. Design Foundations

### Target Initiator Profile

The initiator persona is distinct from the participant. They are:

- A **team lead, teacher, community organizer, or facilitator** who has a real challenge
- They have **5-10 minutes** to set up a deliberation
- They may be on **mobile or desktop** (unlike participants who are overwhelmingly mobile)
- They need the process to feel **simple enough that they try it**, but structured enough that it produces useful output
- They want to **share quickly** via WhatsApp, email, or QR code
- They want to **see results** without a complex admin panel

### Design Principles for the Initiator Flow

1. **Conversational, not bureaucratic** -- The wizard should feel like talking to a helpful colleague, not filling out a government form
2. **Smart defaults** -- Every wizard step has sensible defaults so the initiator can skip ahead
3. **Progressive complexity** -- Start with just "what's your challenge?" and layer in structure
4. **Immediate value** -- They should reach the share screen in under 3 minutes
5. **No dead ends** -- Every screen has a clear forward action and an escape hatch

### Design Tokens (Same as Participant Flow)

All designs use the established bot app design tokens from `tokens.scss`:

```
Colors:
  --color-primary: #5f88e5    (action/trust)
  --color-primary-dark: #3d5fa0
  --color-agree: #6bc26b      (success/confirmation)
  --color-disagree: #e57373   (warning/cancel)
  --color-warning: #ffa726    (attention)
  --bg-page: #f8f9fb          (background)
  --bg-card: #ffffff           (surface)

Typography:
  Body: 1rem (16px), line-height 1.5
  H1: 2rem, H2: 1.5rem, H3: 1.125rem

Spacing: 8-point grid (4, 8, 16, 24, 32, 48)
Touch targets: 48px minimum height
Border radius: 8px (sm), 12px (md), 16px (lg), 9999px (full/pills)
Max width: 480px (mobile-first shell)
```

---

## 2. Architecture Overview

### The Three Journeys (Updated Mental Model)

```
                    User opens the app
                          |
                +---------+---------+
                |                   |
          [HAS A LINK]        [NO LINK]
                |                   |
         Participant Flow    Initiator Flow
          (existing)          (NEW)
                                    |
                      +------+------+------+
                      |      |      |      |
                   Challenge Wizard Share  Dashboard
                      |      |      |      |
                      +------+------+------+
                                    |
                              Share link
                                    |
                            Participants arrive
                            via Participant Flow
```

### Route Architecture (New + Existing)

```
EXISTING:
  /                      -> Home (landing)
  /d/:id                 -> Participant Forward Flow
  /d/:id/back            -> Return Journey Hub
  /d/:id/back/my         -> My Solutions
  /d/:id/back/top        -> Top Solutions
  /d/:id/back/search     -> Search Solutions

NEW (Initiator):
  /                      -> Home (UPDATED: shows CTA + dashboard)
  /create                -> Challenge Input (step 1)
  /create/wizard         -> Wizard flow (steps 2-5)
  /create/review         -> Review & Launch
  /create/share/:id      -> Share screen (after creation)
  /my                    -> Dashboard (my deliberations)
  /d/:id/manage          -> Initiator's view of their deliberation
```

---

## 3. User Journey Map

### Primary Happy Path (3 minutes to share)

```
Step 1          Step 2          Step 3          Step 4          Step 5
CHALLENGE       WIZARD          REVIEW          LAUNCH          SHARE
"What's your    3-5 quick       See preview     Creates in      QR + link +
challenge?"     questions       of setup        Firestore       social
                                                                buttons
  [text]    ->  [guided]   ->  [confirm]  ->  [creating...] -> [share!]
  input         Q&A             screen          auto            screen
```

**Time breakdown:**
- Challenge input: 30-60 seconds
- Wizard: 60-90 seconds (smart defaults allow skipping)
- Review: 15-30 seconds
- Launch: 2-3 seconds (automatic)
- Share: As long as they want

### Returning Initiator Path

```
Opens app  ->  Dashboard  ->  Tap deliberation  ->  See results / reshare
   /            /my              /d/:id/manage
```

---

## 4. Screen Inventory

### Screen 1: Home / Landing (Updated)

The current home page is a bare placeholder. The updated version serves two audiences: first-time visitors who want to create, and returning users who want to see their deliberations.

**Wireframe:**

```
+----------------------------------+
|            [max 480px]           |
|                                  |
|           F R E E D I            |
|    Collective Decision Making    |
|                                  |
|  +----------------------------+  |
|  |                            |  |
|  |    I have a challenge      |  |
|  |    I need to solve         |  |
|  |                            |  |
|  |  [  Start a Deliberation ] |  |
|  |        (btn--primary)      |  |
|  +----------------------------+  |
|                                  |
|  - - - - -  or  - - - - - - -   |
|                                  |
|  Have a link? Paste it here:     |
|  +----------------------------+  |
|  | https://...                |  |
|  +----------------------------+  |
|  [  Join  ]  (btn--secondary)    |
|                                  |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~    |
|  (only if signed in + has data)  |
|                                  |
|  My Deliberations                |
|  +----------------------------+  |
|  | [card] Budget Discussion   |  |
|  | 12 participants | 3 days   |  |
|  +----------------------------+  |
|  +----------------------------+  |
|  | [card] Team Priorities     |  |
|  | 5 participants | 1 day     |  |
|  +----------------------------+  |
|                                  |
|  [  See all  ->  ]               |
|                                  |
+----------------------------------+
```

**Behavior:**
- The primary CTA ("Start a Deliberation") navigates to `/create`
- The link input auto-detects Freedi deliberation URLs and navigates to `/d/:id`
- "My Deliberations" section only appears if the user has created or participated in deliberations (checked via localStorage keys + Firestore query if signed in)
- If the user has deliberations, the section shows the 2 most recent, with "See all" linking to `/my`

**Accessibility:**
- Skip link targets the main CTA
- Link input has proper label and aria-describedby for instructions
- Cards are focusable with keyboard navigation

---

### Screen 2: Challenge Input

This is the "what is your challenge?" screen -- the very first step of the wizard, but visually separated to feel conversational and low-pressure.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|                                  |
|                                  |
|         What challenge           |
|         would you like           |
|         to solve?                |
|                                  |
|  Tell us in your own words.      |
|  We'll help you structure it     |
|  for a group discussion.         |
|                                  |
|  +----------------------------+  |
|  |                            |  |
|  |  e.g. "Our team can't     |  |
|  |  agree on how to           |  |
|  |  allocate the budget"      |  |
|  |                            |  |
|  +----------------------------+  |
|                           0/500  |
|                                  |
|  +----------------------------+  |
|  |  Examples:                 |  |
|  |  * "How should we          |  |
|  |    prioritize features?"   |  |
|  |  * "What should our        |  |
|  |    neighborhood improve?"  |  |
|  |  * "Which solution best    |  |
|  |    fits our community?"    |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+
|  [      Continue     ]           |
|  (btn--primary, disabled until   |
|   10+ chars entered)             |
+----------------------------------+
```

**Behavior:**
- The textarea uses the existing `.text-input` component
- Placeholder disappears on focus (standard behavior)
- "Continue" button enables once text is >= 10 characters
- The examples card is tappable -- tapping an example fills the textarea with that text (the user can then edit it)
- "Back" navigates to `/` (home)
- Text is stored in a local creation state object (not yet saved to Firestore)

**Emotional Design:**
- The headline uses a large, warm font to feel inviting
- The subtitle reassures them: "We'll help you structure it"
- Examples reduce blank-page anxiety by showing what others have done

**Accessibility:**
- Textarea has `aria-label="Describe your challenge"`
- Examples use `role="button"` and `aria-label="Use this example: ..."`
- Character counter is connected via `aria-describedby`

---

### Screen 3: Wizard -- Structure Your Deliberation

The wizard is a multi-step conversational flow that takes the raw challenge text and configures the deliberation structure. Each step is presented one at a time, with the ability to accept defaults and skip.

The wizard has **5 steps** presented as individual screens. A progress indicator at the top shows advancement.

#### Wizard Step 3A: Title & Description

Takes the raw challenge text and helps refine it into a clear title and description.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|  [====___________] Step 1 of 5   |
|                                  |
|  Let's shape your question       |
|                                  |
|  Based on what you told us:      |
|  "Our team can't agree on how    |
|   to allocate the budget"        |
|                                  |
|  Suggested title:                |
|  +----------------------------+  |
|  | How should we allocate     |  |
|  | our team budget?           |  |
|  +----------------------------+  |
|                         12/100   |
|                                  |
|  Description (optional):         |
|  +----------------------------+  |
|  | Help us decide how to      |  |
|  | distribute this year's     |  |
|  | budget across projects.    |  |
|  +----------------------------+  |
|                         60/300   |
|                                  |
+----------------------------------+
|  [     Looks Good     ]          |
|  (btn--primary)                  |
+----------------------------------+
```

**Behavior:**
- The title field is pre-filled by transforming the challenge text:
  - Strip leading "I want to..." / "We need to..." / "Our challenge is..."
  - Capitalize first letter
  - Add "?" if not present and text reads as a question
  - Truncate to 100 chars
- Description is auto-generated from the challenge text if it differs from the title, otherwise left blank with a placeholder
- Both fields are editable
- "Looks Good" advances to step 3B
- The progress bar uses the existing `.progress` component

#### Wizard Step 3B: Deliberation Structure

Determines what phases the participant flow will include.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|  [========_______] Step 2 of 5   |
|                                  |
|  What should participants do?    |
|                                  |
|  Choose the stages of your       |
|  deliberation:                   |
|                                  |
|  +----------------------------+  |
|  | [x] Share Needs            |  |
|  |     Participants describe   |  |
|  |     their needs and         |  |
|  |     priorities first        |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | [x] Propose Solutions      |  |
|  |     Participants suggest    |  |
|  |     solutions to address    |  |
|  |     the needs               |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | [x] Evaluate & Rate        |  |
|  |     Everyone rates each     |  |
|  |     other's contributions   |  |
|  |     (always on)             |  |
|  +----------------------------+  |
|                                  |
|  Recommended: All stages         |
|  for best results                |
|                                  |
+----------------------------------+
|  [     Continue     ]            |
|  (btn--primary)                  |
+----------------------------------+
```

**Behavior:**
- All three options default to checked (recommended path)
- "Share Needs" can be unchecked -- if unchecked, participants skip straight to solutions
- "Propose Solutions" can be unchecked -- if unchecked, the initiator must pre-populate solutions (handled in step 3D)
- "Evaluate & Rate" is always on (disabled checkbox with explanation) -- evaluation is core to deliberation
- At least one of Needs or Solutions must remain checked
- If both Needs and Solutions are unchecked, show an inline validation message: "At least one content stage is required"

**Data impact:**
- These choices determine which stages appear in the participant's `FlowStage` progression
- If needs are off: skip `needs-write` and `needs-evaluate` stages
- If solutions are off: skip `solutions-write` stage (but still show `solutions-evaluate` with pre-populated options)

#### Wizard Step 3C: Limits & Timing

Configures the quantitative guardrails for the deliberation.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|  [============___] Step 3 of 5   |
|                                  |
|  Set the pace                    |
|                                  |
|  How many contributions per      |
|  participant?                    |
|                                  |
|  Needs:    [ 3 ]  [-] [+]       |
|  Solutions: [ 3 ]  [-] [+]       |
|                                  |
|  How many items should each      |
|  participant evaluate?           |
|                                  |
|  Evaluations: [ 10 ]  [-] [+]   |
|                                  |
|  Estimated time for              |
|  participants:                   |
|                                  |
|  +----------------------------+  |
|  |   ~  8  minutes            |  |
|  |   (based on 3 needs,       |  |
|  |    3 solutions, 10 evals)  |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+
|  [     Continue     ]            |
|  (btn--primary)                  |
+----------------------------------+
```

**Behavior:**
- Stepper controls for each value (min 1, max 10 for contributions, max 30 for evaluations)
- The time estimate updates dynamically:
  - Base: 1 minute for intro
  - Per need written: 45 seconds
  - Per solution written: 60 seconds
  - Per evaluation: 15 seconds
  - Formula: `1 + (needs * 0.75) + (solutions * 1) + (evaluations * 0.25)` minutes, rounded
- If needs or solutions were disabled in step 3B, their stepper is hidden
- Defaults: 3 needs, 3 solutions, 10 evaluations (~8 minutes)

**Smart defaults rationale:**
- 3 contributions balances depth vs. fatigue
- 10 evaluations provides statistical significance while staying under 3 minutes of evaluation time

#### Wizard Step 3D: Seed Content (Optional)

Lets the initiator pre-populate needs or solutions to prime the discussion.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|  [================_] Step 4 of 5 |
|                                  |
|  Seed the discussion             |
|  (optional)                      |
|                                  |
|  Add starting ideas that         |
|  participants will see and       |
|  build upon.                     |
|                                  |
|  +----------------------------+  |
|  | Add a starting need...     |  |
|  +----------------------------+  |
|  [  + Add  ]                     |
|                                  |
|  Your seeds:                     |
|  +----------------------------+  |
|  | 1. "Budget transparency"   |x |
|  | 2. "Fair allocation"       |x |
|  +----------------------------+  |
|                                  |
|  These will appear alongside     |
|  participant contributions.      |
|                                  |
+----------------------------------+
|  [     Continue     ]            |
|  [  Skip this step  ]  (ghost)   |
+----------------------------------+
```

**Behavior:**
- The input field and "+ Add" button let the initiator type and submit seed items
- Each seed appears in a list below with an "x" remove button
- Seeds are tagged with the initiator's user ID but flagged as `isSeed: true` in Firestore
- If solutions were disabled (step 3B) and no seeds are provided, the deliberation only has the needs phase -- which is valid (pure needs-gathering mode)
- "Skip this step" advances without adding seeds
- Maximum 10 seeds
- If solutions stage was disabled in step 3B but the initiator is expected to provide seed solutions, this step becomes mandatory with messaging: "Since participants won't write solutions, add the options they'll evaluate"

#### Wizard Step 3E: Privacy & Identity

Configures who can see what.

**Wireframe:**

```
+----------------------------------+
|  <- Back                         |
|  [====================] Step 5/5 |
|                                  |
|  Privacy settings                |
|                                  |
|  Who can participate?            |
|  +----------------------------+  |
|  | (*) Anyone with the link   |  |
|  | ( ) Only signed-in users   |  |
|  +----------------------------+  |
|                                  |
|  Show contributor names?         |
|  +----------------------------+  |
|  | (*) Anonymous              |  |
|  |     (recommended)          |  |
|  | ( ) Show names             |  |
|  +----------------------------+  |
|                                  |
|  Your name as facilitator:       |
|  +----------------------------+  |
|  |                            |  |
|  +----------------------------+  |
|  Shown to participants as        |
|  the discussion host.            |
|                                  |
+----------------------------------+
|  [   Review & Launch   ]        |
|  (btn--primary)                  |
+----------------------------------+
```

**Behavior:**
- "Anyone with the link" is the default -- matches the anonymous-first participant flow
- "Only signed-in users" requires participants to sign in with Google before contributing (the intro screen will show a sign-in gate)
- Anonymous is the default for contributor names -- this encourages honest participation
- The facilitator name field is optional -- if provided, it appears on the participant intro screen as "Hosted by [name]"
- "Review & Launch" navigates to the review screen

---

### Screen 4: Review & Launch

A confirmation screen showing the full deliberation configuration before creating it.

**Wireframe:**

```
+----------------------------------+
|  <- Back to editing              |
|                                  |
|  Review Your Deliberation        |
|                                  |
|  +----------------------------+  |
|  |  TITLE                     |  |
|  |  "How should we allocate   |  |
|  |   our team budget?"        |  |
|  |                        [e] |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  STRUCTURE                 |  |
|  |  Needs -> Solutions ->     |  |
|  |  Evaluation -> Results     |  |
|  |                        [e] |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  LIMITS                    |  |
|  |  3 needs, 3 solutions      |  |
|  |  10 evaluations each       |  |
|  |  ~ 8 min per participant   |  |
|  |                        [e] |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  SEEDS: 2 starting needs   |  |
|  |                        [e] |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  PRIVACY                   |  |
|  |  Open link, anonymous      |  |
|  |                        [e] |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+
|  [    Launch Deliberation    ]   |
|  (btn--primary, large)           |
+----------------------------------+
```

**Behavior:**
- Each card has an edit icon `[e]` that navigates back to the relevant wizard step
- "Launch Deliberation" triggers the Firestore creation process:
  1. Require user authentication (at minimum anonymous, but prompt for Google sign-in with a soft ask)
  2. Create the root statement document with `deliberationConfig`
  3. Create the needs question sub-document (if needs enabled)
  4. Create the solutions question sub-document (if solutions enabled)
  5. Create seed statements under the appropriate questions
  6. Navigate to `/create/share/:id` on success
- During creation, the button shows a spinner and "Creating..." text
- If creation fails, show an error toast with retry option
- The creation process sets the `creatorId` field on the root document

**Authentication gate:**
- If the user is still anonymous (tier 0), show a soft prompt before launch:
  "Sign in to manage your deliberation and get notified when people participate"
  with "Sign in with Google" (primary) and "Continue as guest" (ghost)
- If they continue as guest, the deliberation is still created but linked to their anonymous ID
- They can sign in later from the dashboard to claim ownership

---

### Screen 5: Share

Appears immediately after successful deliberation creation. This is the highest-impact screen -- it must make sharing effortless.

**Wireframe:**

```
+----------------------------------+
|                                  |
|         Your deliberation        |
|           is live!               |
|                                  |
|  "How should we allocate         |
|   our team budget?"              |
|                                  |
|  +----------------------------+  |
|  |                            |  |
|  |       +----------+        |  |
|  |       |          |        |  |
|  |       |  QR CODE |        |  |
|  |       |  200x200 |        |  |
|  |       |          |        |  |
|  |       +----------+        |  |
|  |                            |  |
|  |  Scan to participate       |  |
|  +----------------------------+  |
|                                  |
|  Share via:                      |
|  +------+ +------+ +------+     |
|  | [wa] | | [tg] | | [em] |     |
|  | What | | Tele | | Email|     |
|  | sApp | | gram | |      |     |
|  +------+ +------+ +------+     |
|                                  |
|  Or copy the link:               |
|  +------------------------+--+  |
|  | freedi.app/d/abc123     |CP|  |
|  +------------------------+--+  |
|  (Link copied!)                  |
|                                  |
+----------------------------------+
|  [  Go to Dashboard  ]          |
|  (btn--secondary)                |
+----------------------------------+
```

**Behavior:**
- The QR code is generated client-side using a lightweight library (e.g., `qrcode` npm package, similar to main app's `qrcode.react` approach but vanilla JS compatible)
- The share URL format: `{app-origin}/d/{deliberationId}`
- Share buttons use the Web Share API where available (mobile), falling back to direct links:
  - WhatsApp: `https://wa.me/?text={encodedMessage}`
  - Telegram: `https://t.me/share/url?url={url}&text={text}`
  - Email: `mailto:?subject={title}&body={message}`
- The share message template: "I'd like your input: {title}\nJoin the discussion: {url}"
- Copy button uses `navigator.clipboard.writeText()` with visual feedback ("Copied!" for 3 seconds)
- Auto-copy on page load (same pattern as main app's ShareModal)
- "Go to Dashboard" navigates to `/my`

**Accessibility:**
- QR code has `alt` text describing what it links to
- Share buttons have clear `aria-label` attributes
- Copy confirmation uses `role="status"` for screen reader announcement

---

### Screen 6: Dashboard

The initiator's home base showing all their deliberations and deliberations they have participated in.

**Wireframe:**

```
+----------------------------------+
|  Freedi          [avatar/login]  |
|                                  |
|  +----------------------------+  |
|  | [Created]  [Participated]  |  |
|  +----------------------------+  |
|  (tab bar / segmented control)   |
|                                  |
|  --- CREATED TAB ---             |
|                                  |
|  +----------------------------+  |
|  | How should we allocate     |  |
|  | our team budget?           |  |
|  |                            |  |
|  | 12 participants            |  |
|  | 8 needs, 15 solutions      |  |
|  | Created 3 days ago         |  |
|  |                            |  |
|  | [Share]  [Results]         |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | What should our team       |  |
|  | priorities be for Q2?      |  |
|  |                            |  |
|  | 0 participants             |  |
|  | Created just now           |  |
|  |                            |  |
|  | [Share]  [Results]         |  |
|  +----------------------------+  |
|                                  |
|  --- PARTICIPATED TAB ---        |
|                                  |
|  +----------------------------+  |
|  | How should we improve      |  |
|  | our neighborhood?          |  |
|  |                            |  |
|  | My contributions: 3 needs, |  |
|  | 2 solutions                |  |
|  | Last visited 5 days ago    |  |
|  |                            |  |
|  | [Go Back]                  |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+
|  [  + New Deliberation  ]       |
|  (FAB / bottom button)           |
+----------------------------------+
```

**Behavior:**
- **Created tab** shows deliberations where `creatorId === currentUser.uid`
  - Sorted by `createdAt` descending
  - Each card shows: title, participant count, content counts, creation date
  - "Share" re-opens the share screen for that deliberation
  - "Results" navigates to `/d/:id/manage` (initiator detail view)
- **Participated tab** shows deliberations found in localStorage sessions
  - Each card shows: title, the user's contribution counts, last visit date
  - "Go Back" navigates to `/d/:id/back` (the existing return journey)
- The avatar/login button in the header:
  - If signed in: shows avatar or initial, tap opens a small menu with "Sign out"
  - If anonymous: shows "Sign in" link
- The "+ New Deliberation" button navigates to `/create`

**Empty States:**
- Created tab empty: "You haven't created any deliberations yet." + [Start one now] CTA
- Participated tab empty: "You haven't participated in any deliberations yet." + "Open a link to get started"

**Data sources:**
- Created: Firestore query on `statements` collection where `creatorId === user.uid && deliberationConfig exists`
- Participated: localStorage scan for `bot_session_*` keys, combined with Firestore reads for titles/stats

---

### Screen 7: Deliberation Detail (Initiator View)

When an initiator taps "Results" on one of their deliberations, they see a richer version of the CurrentState screen with management actions.

**Wireframe:**

```
+----------------------------------+
|  <- Dashboard                    |
|                                  |
|  "How should we allocate         |
|   our team budget?"              |
|                                  |
|  +----------------------------+  |
|  | 12       | 8       | 15   |  |
|  | joined   | needs   | sols |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | [Share] [Copy] [QR]       |  |
|  +----------------------------+  |
|  (action bar for resharing)      |
|                                  |
|  Top Needs                       |
|  +----------------------------+  |
|  | 1. Budget transparency     |  |
|  |    78% consensus           |  |
|  | 2. Fair allocation         |  |
|  |    65% consensus           |  |
|  | 3. Project visibility      |  |
|  |    52% consensus           |  |
|  +----------------------------+  |
|                                  |
|  Top Solutions                   |
|  +----------------------------+  |
|  | 1. Quarterly review board  |  |
|  |    71% consensus           |  |
|  | 2. Transparent dashboard   |  |
|  |    68% consensus           |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | [  Participate  ]          |  |
|  | (join as a participant)    |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+
```

**Behavior:**
- Shows the same ranked lists as the participant's CurrentState view, but with more items (top 10 instead of top 5)
- The action bar provides quick resharing options
- "Participate" lets the initiator go through the participant flow themselves (navigates to `/d/:id`)
- Future: could add "Close deliberation", "Export results", "AI Summary"
- Back button returns to `/my`

---

## 5. Wizard Questions Flow

### Flow Diagram

```
                Challenge Input (/create)
                "What's your challenge?"
                        |
                        v
        +--- Wizard Step 1: Title & Description ---+
        |   Pre-fills from challenge text            |
        |   User refines title and description       |
        +--------------------------------------------+
                        |
                        v
        +--- Wizard Step 2: Structure ---------------+
        |   Checkboxes: Needs / Solutions / Evaluate  |
        |   Default: all on                           |
        |   At least one content stage required       |
        +--------------------------------------------+
                        |
                        v
        +--- Wizard Step 3: Limits & Timing ---------+
        |   Steppers: needs/solutions/evaluations     |
        |   Dynamic time estimate shown               |
        |   Respects structure choices                 |
        +--------------------------------------------+
                        |
                        v
        +--- Wizard Step 4: Seed Content (optional) -+
        |   Add starting needs/solutions              |
        |   Required if solutions stage disabled      |
        |   Skippable otherwise                       |
        +--------------------------------------------+
                        |
                        v
        +--- Wizard Step 5: Privacy -----------------+
        |   Open link vs signed-in only               |
        |   Anonymous vs named contributions          |
        |   Facilitator name                          |
        +--------------------------------------------+
                        |
                        v
                Review & Launch (/create/review)
                        |
                        v
                   Share (/create/share/:id)
```

### Branching Logic

```
IF structure.needsEnabled === false:
  - Hide needs stepper in Step 3
  - Change seed content label to "seed solutions" in Step 4
  - Participant flow skips needs-write and needs-evaluate

IF structure.solutionsEnabled === false:
  - Hide solutions stepper in Step 3
  - Step 4 becomes REQUIRED (must seed at least 2 options for evaluation)
  - Participant flow skips solutions-write

IF both needsEnabled AND solutionsEnabled === false:
  - BLOCKED: show validation error in Step 2
  - "At least one content stage is required"
```

### Wizard State Object

```typescript
interface WizardState {
  // From challenge input
  challengeText: string;

  // Step 1: Title & Description
  title: string;
  description: string;

  // Step 2: Structure
  needsEnabled: boolean;
  solutionsEnabled: boolean;

  // Step 3: Limits
  maxNeedsPerUser: number;
  maxSolutionsPerUser: number;
  evaluationsPerStage: number;
  timeEstimateMinutes: number; // computed

  // Step 4: Seeds
  seedNeeds: string[];
  seedSolutions: string[];

  // Step 5: Privacy
  accessMode: 'open' | 'signed-in';
  anonymousContributions: boolean;
  facilitatorName: string;

  // Meta
  currentStep: number; // 0-4
}
```

### Default Values

```typescript
const WIZARD_DEFAULTS: WizardState = {
  challengeText: '',
  title: '',
  description: '',
  needsEnabled: true,
  solutionsEnabled: true,
  maxNeedsPerUser: 3,
  maxSolutionsPerUser: 3,
  evaluationsPerStage: 10,
  timeEstimateMinutes: 8,
  seedNeeds: [],
  seedSolutions: [],
  accessMode: 'open',
  anonymousContributions: true,
  facilitatorName: '',
  currentStep: 0,
};
```

---

## 6. Share Screen Design

### Share Message Templates

**English:**
```
I'd like your input on this:

"{title}"

Share your needs and solutions -- it takes about {time} minutes.

Join here: {url}
```

**Hebrew:**
```
אשמח לשמוע את דעתך:

"{title}"

שתפ/י את הצרכים והפתרונות שלך -- זה לוקח בערך {time} דקות.

הצטרפ/י כאן: {url}
```

**Arabic:**
```
اود سماع رايك:

"{title}"

شارك احتياجاتك وحلولك -- يستغرق حوالي {time} دقائق.

انضم هنا: {url}
```

### QR Code Specification

- Size: 200x200 pixels
- Error correction level: M (15%)
- Include margin: yes (quiet zone)
- Color: dark foreground on white background (standard, best for scanning)
- Content: The full deliberation URL

### Share Channels

| Channel | Method | Availability |
|---------|--------|-------------|
| Web Share API | `navigator.share()` | Mobile browsers |
| WhatsApp | Deep link | Universal |
| Telegram | Deep link | Universal |
| Email | `mailto:` link | Universal |
| Copy Link | Clipboard API | Universal |
| QR Code | Visual display | Visual / in-person |

### Web Share API Integration

```typescript
async function shareViaWebAPI(title: string, url: string, text: string): Promise<boolean> {
  if (!navigator.share) return false;

  try {
    await navigator.share({ title, url, text });
    return true;
  } catch {
    return false; // User cancelled or not supported
  }
}
```

If Web Share API is available (primarily mobile), show a single "Share" button that opens the native share sheet. The individual channel buttons (WhatsApp, Telegram, Email) serve as fallbacks on desktop or when the API is unavailable.

---

## 7. Dashboard Design

### Tab System

The dashboard uses a segmented control (two-tab bar) at the top to switch between "Created" and "Participated" views. This is implemented as a simple toggle, not a router-level distinction.

### Deliberation Card Component

Each card in the dashboard displays:

**Created Card:**
```
+----------------------------+
| Title (2 lines max)        |
|                            |
| 12 participants            |
| 8 needs, 15 solutions      |
| Created 3 days ago         |
|                            |
| [Share]    [Results ->]    |
+----------------------------+
```

**Participated Card:**
```
+----------------------------+
| Title (2 lines max)        |
|                            |
| You: 3 needs, 2 solutions  |
| Last visit: 5 days ago     |
|                            |
| [Return to discussion ->]  |
+----------------------------+
```

### Data Loading Strategy

1. **Created deliberations**: Firestore query -- requires the user to be signed in (Google auth, tier 2). If anonymous, show a "Sign in to see your created deliberations" prompt.

2. **Participated deliberations**: Scan localStorage for `bot_session_*` keys. For each found session, load the deliberation data from Firestore to get the title and current stats. Cache results to avoid repeated reads.

3. **Merge strategy**: If the user signs in after creating deliberations anonymously, we need to migrate their anonymous `creatorId` to their Google UID. This happens automatically during the auth upgrade (linkWithRedirect merges accounts).

### Relative Time Display

Use a simple relative time formatter:
- < 1 minute: "just now"
- < 60 minutes: "X minutes ago"
- < 24 hours: "X hours ago"
- < 7 days: "X days ago"
- < 30 days: "X weeks ago"
- Else: formatted date

---

## 8. State Machine

### Initiator Flow State Machine

```
                    [idle]
                      |
                (user opens /create)
                      |
                      v
              [challenge-input]  <--- text input
                      |
                (Continue clicked)
                      |
                      v
              [wizard-title]     <--- step 1
                      |
                (Looks Good clicked)
                      |
                      v
              [wizard-structure]  <--- step 2
                      |
                (Continue clicked)
                      |
                      v
              [wizard-limits]    <--- step 3
                      |
                (Continue clicked)
                      |
                      v
              [wizard-seeds]     <--- step 4
                      |
                (Continue or Skip clicked)
                      |
                      v
              [wizard-privacy]   <--- step 5
                      |
                (Review & Launch clicked)
                      |
                      v
                [reviewing]      <--- review screen
                      |
                (Launch clicked)
                      |
                      v
                [creating]       <--- Firestore writes in progress
                     / \
                    /   \
                   v     v
            [created]  [error]
                |         |
                v         v
            [sharing]  (retry or back)
                |
                v
             [done]      <--- user goes to dashboard or closes
```

### State Persistence

The wizard state is stored in `sessionStorage` under the key `bot_wizard_state`. This means:
- Refreshing the page preserves progress within the wizard
- Closing the tab/browser discards incomplete wizard state (intentional -- incomplete deliberations should not linger)
- After successful creation, the wizard state is cleared

### Navigation Guards

- If the user navigates to `/create/wizard` without a challenge text, redirect to `/create`
- If the user navigates to `/create/review` without completing the wizard, redirect to the first incomplete step
- If the user navigates to `/create/share/:id` for a deliberation they did not create, show a "Not your deliberation" message with a link to participate instead

---

## 9. Edge Cases

### Empty States

| Screen | Condition | Display |
|--------|-----------|---------|
| Home | No sessions, not signed in | Full CTA for creating first deliberation |
| Home | Has sessions but not signed in | Show participated deliberations from localStorage |
| Dashboard Created | Not signed in | "Sign in to see your deliberations" + sign in button |
| Dashboard Created | Signed in, no deliberations | "You haven't created any yet" + CTA |
| Dashboard Participated | No sessions in localStorage | "You haven't participated yet" + explanation |
| Deliberation Detail | 0 participants | "No one has participated yet. Share the link!" |

### Error States

| Error | Where | Handling |
|-------|-------|----------|
| Firestore write fails | Creating deliberation | Show error toast, enable retry button, preserve wizard state |
| Network offline | Any screen | Show offline indicator (existing component), queue navigation |
| Auth fails | Sign-in prompt | Show error message, allow "Continue as guest" |
| Invalid deliberation ID | Share screen via direct URL | "Deliberation not found" with link to create new |
| Clipboard API fails | Copy button | Fallback: select the text in the input field |

### Offline Scenarios

- **Wizard**: The wizard works entirely offline (all state in memory/sessionStorage). Only the "Launch" step requires connectivity.
- **Dashboard**: Show cached data from last load. Show offline indicator. Disable "Share" buttons (they open external apps which handle offline themselves, but the QR/copy still work).
- **Launch while offline**: Disable the "Launch" button with message: "You need an internet connection to launch your deliberation." Queue the creation and auto-launch when connectivity returns (similar to existing offline evaluation queue).

### RTL Considerations

- Back arrows flip direction: `->` becomes `<-` in LTR, and the arrow direction reverses in RTL
- Tab bar text alignment follows document direction
- Card content flows naturally with `dir="rtl"` on the root element
- QR code and share buttons remain LTR (QR codes are direction-agnostic, URLs are always LTR)
- Stepper controls ([-] [value] [+]) maintain LTR order even in RTL (number lines are universal)

### Rate Limiting

- Maximum deliberations per user per day: 10 (client-side check; server-side enforcement via security rules)
- Maximum seeds per deliberation: 10
- Title maximum: 100 characters
- Description maximum: 300 characters
- Challenge text maximum: 500 characters

---

## 10. Component Inventory

### New Components Needed

| Component | File | Type | BEM Block | Description |
|-----------|------|------|-----------|-------------|
| ChallengeInput | `views/ChallengeInput.ts` | View | `.challenge` | Full-screen text input for describing the challenge |
| Wizard | `views/Wizard.ts` | View | `.wizard` | Multi-step wizard container with progress |
| WizardStep | `components/WizardStep.ts` | Component | `.wizard-step` | Individual wizard step layout |
| ReviewScreen | `views/ReviewScreen.ts` | View | `.review` | Pre-launch confirmation screen |
| ShareScreen | `views/ShareScreen.ts` | View | `.share` | QR + sharing options |
| Dashboard | `views/Dashboard.ts` | View | `.dashboard` | Tab-based deliberation list |
| DelibDetail | `views/DelibDetail.ts` | View | `.delib-detail` | Initiator's view of results |
| Stepper | `components/Stepper.ts` | Component | `.stepper` | Numeric increment/decrement control |
| SegmentedControl | `components/SegmentedControl.ts` | Component | `.segment` | Two-option tab bar |
| ShareButton | `components/ShareButton.ts` | Component | `.share-btn` | Individual share channel button |
| QRDisplay | `components/QRDisplay.ts` | Component | `.qr-display` | QR code generator and display |
| DelibCard | `components/DelibCard.ts` | Component | `.delib-card` | Dashboard deliberation card |
| CheckboxCard | `components/CheckboxCard.ts` | Component | `.checkbox-card` | Selectable card with checkbox |
| RadioCard | `components/RadioCard.ts` | Component | `.radio-card` | Selectable card with radio button |
| SeedList | `components/SeedList.ts` | Component | `.seed-list` | Add/remove list for seed content |
| TimeEstimate | `components/TimeEstimate.ts` | Component | `.time-estimate` | Dynamic time display |
| AuthGate | `components/AuthGate.ts` | Component | `.auth-gate` | Soft sign-in prompt overlay |

### Existing Components Reused

| Component | Used In |
|-----------|---------|
| ProgressBar | Wizard (step progress) |
| `.btn` classes | All screens (primary, secondary, ghost) |
| `.card` classes | Review screen, dashboard cards |
| `.shell` layout | All screens |
| `.text-input` | Challenge input, wizard text fields |
| `.nav-cards` | Dashboard cards (adapted) |
| `.impact` | Deliberation detail stats |
| `.ranked-list` | Deliberation detail results |
| `.modal` | Auth gate overlay |
| `.offline-indicator` | Offline handling |

### New SCSS Additions (to components.scss)

```scss
// Wizard
.wizard {
  &__progress {
    padding: var(--space-sm) 0;
  }

  &__step-label {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
  }
}

// Stepper control
.stepper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);

  &__btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    border: 2px solid var(--border-light);
    background: var(--bg-card);
    font-size: var(--font-size-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--easing);

    &:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }

  &__value {
    min-width: 40px;
    text-align: center;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  &__label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-inline-end: var(--space-sm);
    min-width: 80px;
  }
}

// Segmented control (tabs)
.segment {
  display: flex;
  background: var(--border-light);
  border-radius: var(--radius-full);
  padding: 2px;

  &__btn {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast) var(--easing);

    &--active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }
  }
}

// Checkbox card
.checkbox-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg-card);
  border: 2px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--easing);

  &:hover {
    border-color: var(--color-primary-light);
  }

  &--checked {
    border-color: var(--color-primary);
    background: var(--bg-card-hover);
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &__check {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-medium);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    transition: all var(--duration-fast) var(--easing);
  }

  &--checked &__check {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--text-inverse);
  }

  &__body {
    flex: 1;
  }

  &__title {
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-xs);
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }
}

// Radio card
.radio-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg-card);
  border: 2px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--easing);

  &--selected {
    border-color: var(--color-primary);
    background: var(--bg-card-hover);
  }

  &__dot {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-medium);
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;

    &::after {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: var(--radius-full);
      background: transparent;
      transition: background var(--duration-fast) var(--easing);
    }
  }

  &--selected &__dot {
    border-color: var(--color-primary);

    &::after {
      background: var(--color-primary);
    }
  }

  &__body {
    flex: 1;
  }

  &__title {
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-xs);
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

// Share screen
.share {
  &__hero {
    text-align: center;
    padding: var(--space-lg) 0;
  }

  &__title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--space-sm);
    color: var(--color-agree);
  }

  &__question {
    font-size: var(--font-size-lg);
    color: var(--text-primary);
    margin-bottom: var(--space-lg);
  }

  &__qr-container {
    display: flex;
    justify-content: center;
    padding: var(--space-lg);
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
    margin-bottom: var(--space-lg);
  }

  &__channels {
    display: flex;
    justify-content: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  &__channel-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-md);
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--duration-fast) var(--easing);
    min-width: 72px;

    &:hover {
      border-color: var(--color-primary);
      box-shadow: var(--shadow-sm);
    }
  }

  &__channel-icon {
    font-size: 1.5rem;
  }

  &__channel-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  &__link-row {
    display: flex;
    gap: var(--space-xs);
  }

  &__link-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--border-light);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: var(--bg-card);

    &:focus {
      outline: none;
      border-color: var(--color-primary);
    }
  }

  &__copy-btn {
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--text-inverse);
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    white-space: nowrap;
    transition: opacity var(--duration-fast) var(--easing);

    &--copied {
      background: var(--color-agree);
      border-color: var(--color-agree);
    }
  }

  &__copied-msg {
    font-size: var(--font-size-sm);
    color: var(--color-agree);
    text-align: center;
    margin-top: var(--space-sm);
  }
}

// Seed list
.seed-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  &__input-row {
    display: flex;
    gap: var(--space-sm);
  }

  &__input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--border-light);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    background: var(--bg-card);

    &:focus {
      outline: none;
      border-color: var(--color-primary);
    }
  }

  &__add-btn {
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-primary);
    font-family: var(--font-family);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    white-space: nowrap;

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__items {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
  }

  &__item-text {
    flex: 1;
    font-size: var(--font-size-sm);
  }

  &__item-number {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    font-weight: var(--font-weight-bold);
    min-width: 20px;
  }

  &__remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--font-size-lg);
    padding: 0 var(--space-xs);

    &:hover {
      color: var(--color-disagree);
    }
  }
}

// Dashboard
.dashboard {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) 0;
  }

  &__logo {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary);
  }

  &__avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: var(--color-primary-light);
    color: var(--text-inverse);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
}

// Deliberation card (dashboard)
.delib-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  &__title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-bold);
    line-height: var(--line-height-tight);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__stats {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }

  &__date {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  &__actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-xs);
  }

  &__action {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-fast) var(--easing);

    &:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    &--primary {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--text-inverse);

      &:hover {
        background: var(--color-primary-dark);
        color: var(--text-inverse);
      }
    }
  }
}

// Time estimate display
.time-estimate {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--bg-card-hover);
  border-radius: var(--radius-md);

  &__icon {
    font-size: var(--font-size-xl);
  }

  &__text {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  &__subtitle {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}

// Review section card
.review-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  &__body {
    flex: 1;
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-xs);
  }

  &__value {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
  }

  &__edit {
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: var(--space-xs);
    flex-shrink: 0;
  }
}

// Auth gate (soft sign-in prompt)
.auth-gate {
  text-align: center;
  padding: var(--space-lg) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);

  &__icon {
    font-size: 2.5rem;
  }

  &__title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-2xl) var(--space-md);
  text-align: center;

  &__icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  &__title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    max-width: 280px;
    line-height: var(--line-height-normal);
  }
}

// Challenge input screen
.challenge {
  &__heading {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    line-height: var(--line-height-tight);
    text-align: center;
  }

  &__subtitle {
    color: var(--text-secondary);
    text-align: center;
    line-height: var(--line-height-normal);
  }

  &__examples {
    background: var(--bg-card-hover);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  &__examples-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }

  &__example {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    padding: var(--space-xs) 0;
    cursor: pointer;
    border: none;
    background: none;
    text-align: start;
    width: 100%;
    font-family: var(--font-family);
    transition: color var(--duration-fast) var(--easing);

    &:hover {
      color: var(--color-primary);
    }

    &::before {
      content: '* ';
      color: var(--color-primary);
    }
  }
}

// RTL additions for initiator flow
[dir='rtl'] {
  .stepper {
    direction: ltr; // numbers stay LTR
  }

  .share__link-input {
    direction: ltr; // URLs stay LTR
    text-align: left;
  }
}
```

---

## 11. i18n Keys

All new translation keys for the initiator flow:

```typescript
// Add to translations object in i18n.ts

// English
{
  // Home (updated)
  'home.tagline': 'Collective Decision Making',
  'home.cta_title': 'I have a challenge I need to solve',
  'home.cta_button': 'Start a Deliberation',
  'home.or': 'or',
  'home.link_label': 'Have a link? Paste it here:',
  'home.link_placeholder': 'https://...',
  'home.link_join': 'Join',
  'home.my_deliberations': 'My Deliberations',
  'home.see_all': 'See all',

  // Challenge input
  'challenge.heading': 'What challenge would you like to solve?',
  'challenge.subtitle': "Tell us in your own words. We'll help you structure it for a group discussion.",
  'challenge.placeholder': 'e.g. "Our team can\'t agree on how to allocate the budget"',
  'challenge.continue': 'Continue',
  'challenge.examples_title': 'Examples:',
  'challenge.example_1': 'How should we prioritize features?',
  'challenge.example_2': 'What should our neighborhood improve?',
  'challenge.example_3': 'Which solution best fits our community?',

  // Wizard general
  'wizard.step': 'Step {{current}} of {{total}}',
  'wizard.back': 'Back',

  // Wizard step 1: Title
  'wizard.title.heading': "Let's shape your question",
  'wizard.title.based_on': 'Based on what you told us:',
  'wizard.title.suggested': 'Suggested title:',
  'wizard.title.description': 'Description (optional):',
  'wizard.title.description_placeholder': 'Add more context for participants...',
  'wizard.title.confirm': 'Looks Good',

  // Wizard step 2: Structure
  'wizard.structure.heading': 'What should participants do?',
  'wizard.structure.subtitle': 'Choose the stages of your deliberation:',
  'wizard.structure.needs': 'Share Needs',
  'wizard.structure.needs_desc': 'Participants describe their needs and priorities first',
  'wizard.structure.solutions': 'Propose Solutions',
  'wizard.structure.solutions_desc': 'Participants suggest solutions to address the needs',
  'wizard.structure.evaluate': 'Evaluate & Rate',
  'wizard.structure.evaluate_desc': 'Everyone rates each other\'s contributions (always on)',
  'wizard.structure.recommended': 'Recommended: All stages for best results',
  'wizard.structure.validation': 'At least one content stage is required',
  'wizard.structure.continue': 'Continue',

  // Wizard step 3: Limits
  'wizard.limits.heading': 'Set the pace',
  'wizard.limits.contributions': 'How many contributions per participant?',
  'wizard.limits.needs_label': 'Needs:',
  'wizard.limits.solutions_label': 'Solutions:',
  'wizard.limits.evaluations_label': 'Evaluations:',
  'wizard.limits.eval_question': 'How many items should each participant evaluate?',
  'wizard.limits.time_estimate': 'Estimated time for participants:',
  'wizard.limits.time_value': '~ {{minutes}} minutes',
  'wizard.limits.time_basis': 'based on {{needs}} needs, {{solutions}} solutions, {{evaluations}} evals',
  'wizard.limits.continue': 'Continue',

  // Wizard step 4: Seeds
  'wizard.seeds.heading': 'Seed the discussion',
  'wizard.seeds.optional': '(optional)',
  'wizard.seeds.subtitle': 'Add starting ideas that participants will see and build upon.',
  'wizard.seeds.input_placeholder': 'Add a starting need...',
  'wizard.seeds.input_placeholder_solution': 'Add a starting solution...',
  'wizard.seeds.add': '+ Add',
  'wizard.seeds.your_seeds': 'Your seeds:',
  'wizard.seeds.note': 'These will appear alongside participant contributions.',
  'wizard.seeds.required_note': 'Since participants won\'t write solutions, add the options they\'ll evaluate.',
  'wizard.seeds.continue': 'Continue',
  'wizard.seeds.skip': 'Skip this step',
  'wizard.seeds.max_reached': 'Maximum 10 seeds',

  // Wizard step 5: Privacy
  'wizard.privacy.heading': 'Privacy settings',
  'wizard.privacy.access': 'Who can participate?',
  'wizard.privacy.access_open': 'Anyone with the link',
  'wizard.privacy.access_signed': 'Only signed-in users',
  'wizard.privacy.names': 'Show contributor names?',
  'wizard.privacy.anonymous': 'Anonymous',
  'wizard.privacy.anonymous_rec': '(recommended)',
  'wizard.privacy.show_names': 'Show names',
  'wizard.privacy.facilitator': 'Your name as facilitator:',
  'wizard.privacy.facilitator_placeholder': 'Your name (optional)',
  'wizard.privacy.facilitator_note': 'Shown to participants as the discussion host.',
  'wizard.privacy.launch': 'Review & Launch',

  // Review
  'review.heading': 'Review Your Deliberation',
  'review.title_label': 'TITLE',
  'review.structure_label': 'STRUCTURE',
  'review.limits_label': 'LIMITS',
  'review.seeds_label': 'SEEDS',
  'review.privacy_label': 'PRIVACY',
  'review.edit': 'Edit',
  'review.launch': 'Launch Deliberation',
  'review.creating': 'Creating...',
  'review.error': 'Failed to create. Please try again.',
  'review.back': 'Back to editing',
  'review.structure_needs': 'Needs',
  'review.structure_solutions': 'Solutions',
  'review.structure_evaluation': 'Evaluation',
  'review.structure_results': 'Results',
  'review.limits_format': '{{needs}} needs, {{solutions}} solutions, {{evaluations}} evaluations',
  'review.limits_time': '~ {{minutes}} min per participant',
  'review.seeds_count': '{{count}} starting ideas',
  'review.seeds_none': 'None',
  'review.privacy_open': 'Open link',
  'review.privacy_signed': 'Signed-in users only',
  'review.privacy_anonymous': 'anonymous',
  'review.privacy_named': 'named contributions',

  // Auth gate
  'auth.gate_title': 'Sign in to manage',
  'auth.gate_desc': 'Sign in to manage your deliberation and get notified when people participate.',
  'auth.gate_google': 'Sign in with Google',
  'auth.gate_skip': 'Continue as guest',

  // Share
  'share.hero_title': 'Your deliberation is live!',
  'share.qr_label': 'Scan to participate',
  'share.channels_label': 'Share via:',
  'share.whatsapp': 'WhatsApp',
  'share.telegram': 'Telegram',
  'share.email': 'Email',
  'share.copy_label': 'Or copy the link:',
  'share.copy': 'Copy',
  'share.copied': 'Copied!',
  'share.copied_msg': 'Link copied to clipboard!',
  'share.dashboard': 'Go to Dashboard',
  'share.message': "I'd like your input on this:\n\n\"{{title}}\"\n\nShare your needs and solutions -- it takes about {{minutes}} minutes.\n\nJoin here: {{url}}",

  // Dashboard
  'dashboard.created_tab': 'Created',
  'dashboard.participated_tab': 'Participated',
  'dashboard.participants': '{{count}} participants',
  'dashboard.needs_solutions': '{{needs}} needs, {{solutions}} solutions',
  'dashboard.created_ago': 'Created {{time}}',
  'dashboard.share': 'Share',
  'dashboard.results': 'Results',
  'dashboard.your_contributions': 'You: {{needs}} needs, {{solutions}} solutions',
  'dashboard.last_visit': 'Last visit: {{time}}',
  'dashboard.go_back': 'Return to discussion',
  'dashboard.new': '+ New Deliberation',
  'dashboard.empty_created': "You haven't created any deliberations yet.",
  'dashboard.empty_created_cta': 'Start one now',
  'dashboard.empty_participated': "You haven't participated in any deliberations yet.",
  'dashboard.empty_participated_cta': 'Open a link to get started.',
  'dashboard.sign_in_prompt': 'Sign in to see your created deliberations',

  // Deliberation detail
  'detail.back': 'Dashboard',
  'detail.joined': 'joined',
  'detail.needs': 'needs',
  'detail.solutions': 'solutions',
  'detail.participate': 'Participate',
  'detail.reshare': 'Share again',
  'detail.no_participants': 'No one has participated yet. Share the link!',

  // Time
  'time.just_now': 'just now',
  'time.minutes_ago': '{{count}} minutes ago',
  'time.hours_ago': '{{count}} hours ago',
  'time.days_ago': '{{count}} days ago',
  'time.weeks_ago': '{{count}} weeks ago',
}

// Hebrew
{
  'home.tagline': 'קבלת החלטות קולקטיבית',
  'home.cta_title': 'יש לי אתגר שאני צריך/ה לפתור',
  'home.cta_button': 'התחל דיון',
  'home.or': 'או',
  'home.link_label': 'יש לך קישור? הדבק/י כאן:',
  'home.link_placeholder': 'https://...',
  'home.link_join': 'הצטרף/י',
  'home.my_deliberations': 'הדיונים שלי',
  'home.see_all': 'ראה הכל',

  'challenge.heading': 'איזה אתגר תרצה/י לפתור?',
  'challenge.subtitle': 'ספר/י לנו במילים שלך. נעזור לך לבנות את זה לדיון קבוצתי.',
  'challenge.placeholder': 'לדוגמה: "הצוות שלנו לא מצליח להסכים איך לחלק את התקציב"',
  'challenge.continue': 'המשך',
  'challenge.examples_title': 'דוגמאות:',
  'challenge.example_1': 'איך כדאי לנו לתעדף פיצ\'רים?',
  'challenge.example_2': 'מה השכונה שלנו צריכה לשפר?',
  'challenge.example_3': 'איזה פתרון מתאים לקהילה שלנו?',

  'wizard.step': 'שלב {{current}} מתוך {{total}}',
  'wizard.back': 'חזרה',

  'wizard.title.heading': 'בואו נעצב את השאלה',
  'wizard.title.based_on': 'על פי מה שסיפרת לנו:',
  'wizard.title.suggested': 'כותרת מוצעת:',
  'wizard.title.description': 'תיאור (אופציונלי):',
  'wizard.title.description_placeholder': 'הוסף/י הקשר נוסף למשתתפים...',
  'wizard.title.confirm': 'נראה טוב',

  'wizard.structure.heading': 'מה המשתתפים צריכים לעשות?',
  'wizard.structure.subtitle': 'בחר/י את שלבי הדיון:',
  'wizard.structure.needs': 'שיתוף צרכים',
  'wizard.structure.needs_desc': 'משתתפים מתארים את הצרכים והעדיפויות שלהם',
  'wizard.structure.solutions': 'הצעת פתרונות',
  'wizard.structure.solutions_desc': 'משתתפים מציעים פתרונות לצרכים',
  'wizard.structure.evaluate': 'הערכה ודירוג',
  'wizard.structure.evaluate_desc': 'כולם מדרגים את התרומות של האחרים (תמיד פעיל)',
  'wizard.structure.recommended': 'מומלץ: כל השלבים לתוצאות הטובות ביותר',
  'wizard.structure.validation': 'נדרש לפחות שלב תוכן אחד',
  'wizard.structure.continue': 'המשך',

  'wizard.limits.heading': 'קבע את הקצב',
  'wizard.limits.contributions': 'כמה תרומות לכל משתתף?',
  'wizard.limits.needs_label': 'צרכים:',
  'wizard.limits.solutions_label': 'פתרונות:',
  'wizard.limits.evaluations_label': 'הערכות:',
  'wizard.limits.eval_question': 'כמה פריטים כל משתתף צריך להעריך?',
  'wizard.limits.time_estimate': 'זמן משוער למשתתפים:',
  'wizard.limits.time_value': '~ {{minutes}} דקות',
  'wizard.limits.time_basis': 'על בסיס {{needs}} צרכים, {{solutions}} פתרונות, {{evaluations}} הערכות',
  'wizard.limits.continue': 'המשך',

  'wizard.seeds.heading': 'זרע את הדיון',
  'wizard.seeds.optional': '(אופציונלי)',
  'wizard.seeds.subtitle': 'הוסף/י רעיונות התחלתיים שמשתתפים יראו ויבנו עליהם.',
  'wizard.seeds.input_placeholder': 'הוסף צורך התחלתי...',
  'wizard.seeds.input_placeholder_solution': 'הוסף פתרון התחלתי...',
  'wizard.seeds.add': '+ הוסף',
  'wizard.seeds.your_seeds': 'הזרעים שלך:',
  'wizard.seeds.note': 'אלו יופיעו לצד תרומות המשתתפים.',
  'wizard.seeds.required_note': 'מכיוון שמשתתפים לא יכתבו פתרונות, הוסף/י את האפשרויות שהם יעריכו.',
  'wizard.seeds.continue': 'המשך',
  'wizard.seeds.skip': 'דלג על שלב זה',
  'wizard.seeds.max_reached': 'מקסימום 10 זרעים',

  'wizard.privacy.heading': 'הגדרות פרטיות',
  'wizard.privacy.access': 'מי יכול להשתתף?',
  'wizard.privacy.access_open': 'כל מי שיש לו את הקישור',
  'wizard.privacy.access_signed': 'רק משתמשים מחוברים',
  'wizard.privacy.names': 'הצג שמות תורמים?',
  'wizard.privacy.anonymous': 'אנונימי',
  'wizard.privacy.anonymous_rec': '(מומלץ)',
  'wizard.privacy.show_names': 'הצג שמות',
  'wizard.privacy.facilitator': 'השם שלך כמנחה:',
  'wizard.privacy.facilitator_placeholder': 'השם שלך (אופציונלי)',
  'wizard.privacy.facilitator_note': 'מוצג למשתתפים כמארח הדיון.',
  'wizard.privacy.launch': 'סקירה והשקה',

  'review.heading': 'סקור את הדיון שלך',
  'review.title_label': 'כותרת',
  'review.structure_label': 'מבנה',
  'review.limits_label': 'מגבלות',
  'review.seeds_label': 'זרעים',
  'review.privacy_label': 'פרטיות',
  'review.edit': 'ערוך',
  'review.launch': 'השק דיון',
  'review.creating': 'יוצר...',
  'review.error': 'ההשקה נכשלה. נסה שוב.',
  'review.back': 'חזרה לעריכה',

  'auth.gate_title': 'התחבר/י כדי לנהל',
  'auth.gate_desc': 'התחבר/י כדי לנהל את הדיון ולקבל התראות כשאנשים משתתפים.',
  'auth.gate_google': 'התחבר עם Google',
  'auth.gate_skip': 'המשך כאורח',

  'share.hero_title': 'הדיון שלך באוויר!',
  'share.qr_label': 'סרוק כדי להשתתף',
  'share.channels_label': 'שתף דרך:',
  'share.whatsapp': 'WhatsApp',
  'share.telegram': 'Telegram',
  'share.email': 'אימייל',
  'share.copy_label': 'או העתק את הקישור:',
  'share.copy': 'העתק',
  'share.copied': 'הועתק!',
  'share.copied_msg': 'הקישור הועתק!',
  'share.dashboard': 'עבור ללוח הבקרה',
  'share.message': 'אשמח לשמוע את דעתך:\n\n"{{title}}"\n\nשתף/י את הצרכים והפתרונות שלך -- זה לוקח בערך {{minutes}} דקות.\n\nהצטרפ/י כאן: {{url}}',

  'dashboard.created_tab': 'נוצרו',
  'dashboard.participated_tab': 'השתתפתי',
  'dashboard.participants': '{{count}} משתתפים',
  'dashboard.needs_solutions': '{{needs}} צרכים, {{solutions}} פתרונות',
  'dashboard.created_ago': 'נוצר {{time}}',
  'dashboard.share': 'שתף',
  'dashboard.results': 'תוצאות',
  'dashboard.your_contributions': 'אתה: {{needs}} צרכים, {{solutions}} פתרונות',
  'dashboard.last_visit': 'ביקור אחרון: {{time}}',
  'dashboard.go_back': 'חזור לדיון',
  'dashboard.new': '+ דיון חדש',
  'dashboard.empty_created': 'עדיין לא יצרת דיונים.',
  'dashboard.empty_created_cta': 'התחל עכשיו',
  'dashboard.empty_participated': 'עדיין לא השתתפת בדיונים.',
  'dashboard.empty_participated_cta': 'פתח/י קישור כדי להתחיל.',
  'dashboard.sign_in_prompt': 'התחבר/י כדי לראות את הדיונים שלך',

  'detail.back': 'לוח בקרה',
  'detail.joined': 'הצטרפו',
  'detail.needs': 'צרכים',
  'detail.solutions': 'פתרונות',
  'detail.participate': 'השתתף',
  'detail.reshare': 'שתף שוב',
  'detail.no_participants': 'עוד אף אחד לא השתתף. שתף את הקישור!',

  'time.just_now': 'הרגע',
  'time.minutes_ago': 'לפני {{count}} דקות',
  'time.hours_ago': 'לפני {{count}} שעות',
  'time.days_ago': 'לפני {{count}} ימים',
  'time.weeks_ago': 'לפני {{count}} שבועות',
}

// Arabic (key additions to existing sparse Arabic translations)
{
  'home.cta_button': 'ابدا نقاشا',
  'challenge.heading': 'ما هو التحدي الذي تريد حله؟',
  'challenge.continue': 'متابعة',
  'wizard.title.confirm': 'يبدو جيدا',
  'wizard.structure.continue': 'متابعة',
  'wizard.limits.continue': 'متابعة',
  'wizard.seeds.skip': 'تخطي هذه الخطوة',
  'wizard.privacy.launch': 'مراجعة واطلاق',
  'review.launch': 'اطلاق النقاش',
  'share.hero_title': 'نقاشك مباشر!',
  'share.copy': 'نسخ',
  'share.copied': 'تم النسخ!',
  'dashboard.created_tab': 'انشأتها',
  'dashboard.participated_tab': 'شاركت',
  'dashboard.new': '+ نقاش جديد',
}
```

---

## 12. Route Map

### Complete Route Table

| Route | Component | Auth Required | Description |
|-------|-----------|--------------|-------------|
| `/` | Home (updated) | No | Landing with CTA + recent deliberations |
| `/create` | ChallengeInput | No | "What's your challenge?" |
| `/create/wizard` | Wizard | No | 5-step wizard (single route, internal step state) |
| `/create/review` | ReviewScreen | No | Pre-launch confirmation |
| `/create/share/:id` | ShareScreen | No | Post-creation share screen |
| `/my` | Dashboard | No (enhanced with auth) | Created + participated deliberations |
| `/d/:id` | FlowController | No | Participant forward flow (EXISTING) |
| `/d/:id/back` | GoBackHub | No | Return journey hub (EXISTING) |
| `/d/:id/back/my` | GoBackMy | No | My solutions (EXISTING) |
| `/d/:id/back/top` | GoBackTop | No | Top solutions (EXISTING) |
| `/d/:id/back/search` | GoBackSearch | No | Search solutions (EXISTING) |
| `/d/:id/manage` | DelibDetail | Soft (shows more with auth) | Initiator's result view |

### Router Registration (in index.ts)

```typescript
m.route(root, '/', {
  '/': Home,                       // UPDATED
  '/create': ChallengeInput,       // NEW
  '/create/wizard': WizardFlow,    // NEW
  '/create/review': ReviewScreen,  // NEW
  '/create/share/:id': ShareScreen,// NEW
  '/my': Dashboard,                // NEW
  '/d/:id': FlowController,       // EXISTING
  '/d/:id/back': GoBackHub,        // EXISTING
  '/d/:id/back/my': GoBackMy,      // EXISTING
  '/d/:id/back/top': GoBackTop,    // EXISTING
  '/d/:id/back/search': GoBackSearch, // EXISTING
  '/d/:id/manage': DelibDetail,    // NEW
});
```

---

## 13. Data Model Extensions

### New Fields on Deliberation Root Document

The existing `deliberationConfig` object on the root `statements` document needs these extensions:

```typescript
interface DeliberationConfig {
  // EXISTING
  needsQuestionId: string;
  solutionsQuestionId: string;
  settings: {
    timeEstimateMinutes: number;
    allowSkip: boolean;
    maxNeedsPerUser: number;
    maxSolutionsPerUser: number;
    evaluationsPerStage: number;
  };

  // NEW
  creatorId: string;               // UID of the person who created it
  structure: {
    needsEnabled: boolean;         // Whether needs phase is active
    solutionsEnabled: boolean;     // Whether solutions writing phase is active
  };
  privacy: {
    accessMode: 'open' | 'signed-in'; // Who can participate
    anonymousContributions: boolean;   // Whether names are hidden
    facilitatorName: string;           // Shown on intro screen
  };
}
```

### Seed Statements

Seed statements are regular `statements` documents with an additional flag:

```typescript
{
  statementId: string;
  statement: string;         // The seed text
  parentId: string;          // The needs or solutions question ID
  topParentId: string;       // The deliberation root ID
  statementType: 'option';   // Same as user-submitted options
  creatorId: string;         // The initiator's UID
  createdAt: number;
  lastUpdate: number;
  consensus: 0;
  isSeed: true;              // NEW: marks this as a pre-populated item
}
```

### Firestore Security Rules

The creation flow needs write permission to `statements` collection for:
1. Creating the root deliberation document
2. Creating sub-question documents
3. Creating seed statements

Current rules allow authenticated users (including anonymous) to write to `statements` with basic field validation. The initiator flow works within these existing rules.

### Deliberation Creation Function

```typescript
interface CreateDeliberationInput {
  title: string;
  description: string;
  needsEnabled: boolean;
  solutionsEnabled: boolean;
  maxNeedsPerUser: number;
  maxSolutionsPerUser: number;
  evaluationsPerStage: number;
  timeEstimateMinutes: number;
  accessMode: 'open' | 'signed-in';
  anonymousContributions: boolean;
  facilitatorName: string;
  seedNeeds: string[];
  seedSolutions: string[];
}

async function createDeliberation(input: CreateDeliberationInput): Promise<string> {
  // 1. Create root document (the "deliberation" statement)
  // 2. Create needs question sub-document (if enabled)
  // 3. Create solutions question sub-document (if enabled)
  // 4. Create seed statements under appropriate questions
  // 5. Return the deliberation ID (root statement ID)
  //
  // All writes happen as individual setDoc calls.
  // The root document stores the deliberationConfig with all settings.
  // Sub-question documents are regular statements with parentId = rootId.
  // Seed statements are regular statements with parentId = questionId.
}
```

---

## 14. Implementation Roadmap

### Phase 1: Core Flow (MVP)

**Priority: HIGH | Effort: 3-5 days**

1. Update Home screen with CTA and link input
2. Build ChallengeInput view
3. Build Wizard view (all 5 steps in a single component with internal state)
4. Build ReviewScreen view
5. Implement `createDeliberation()` in `lib/deliberation.ts`
6. Build ShareScreen view (QR code + copy link + WhatsApp/email deep links)
7. Register new routes in `index.ts`
8. Add all i18n keys (en + he)

**Delivers:** An initiator can create a deliberation and share it.

### Phase 2: Dashboard

**Priority: MEDIUM | Effort: 2-3 days**

1. Build Dashboard view with segmented control
2. Build DelibCard component
3. Implement Firestore query for created deliberations
4. Implement localStorage scan for participated deliberations
5. Build DelibDetail view (initiator's result view)
6. Add empty states

**Delivers:** Initiators can see all their deliberations and reshare them.

### Phase 3: Polish

**Priority: LOW | Effort: 2-3 days**

1. Add Web Share API integration (native share sheet on mobile)
2. Add Telegram share channel
3. Add auth gate (soft sign-in prompt before launch)
4. Add offline support for wizard state
5. Add QR code generation
6. Add Arabic translations for all keys
7. Accessibility audit and fixes

**Delivers:** Production-ready initiator flow with full feature set.

### Dependencies

- **QR code library**: Need to add a vanilla JS QR code generator (e.g., `qrcode` npm package). The main app uses `qrcode.react` but the bot app uses Mithril, not React.
- **No new Firebase dependencies**: The existing Firebase setup covers all needs.
- **No backend changes**: All writes use the existing `statements` and `evaluations` collections.

---

## Appendix A: Full Screen Flow Diagram

```
+===============+     +==================+     +==================+
|               |     |                  |     |                  |
|     HOME      | --> |  CHALLENGE INPUT | --> |     WIZARD       |
|               |     |                  |     |   (5 steps)      |
| [Start Delib] |     | "What challenge  |     | 1. Title         |
| [Paste link]  |     |  would you like  |     | 2. Structure     |
| [My Delibs]   |     |  to solve?"      |     | 3. Limits        |
|               |     |                  |     | 4. Seeds         |
+===============+     +==================+     | 5. Privacy       |
       |                                        +==================+
       |                                               |
       v                                               v
+===============+                               +==================+
|               |                               |                  |
|   DASHBOARD   |  <--------------------------- |    REVIEW        |
|               |                               |    & LAUNCH      |
| [Created]     |                               |                  |
| [Participated]|                               | [Launch btn]     |
|               |                               +==================+
| [+ New Delib] |                                      |
+===============+                                      v
       |                                        +==================+
       |                                        |                  |
       v                                        |    SHARE         |
+===============+                               |                  |
|               |                               | QR + links +     |
| DELIB DETAIL  |  <--------------------------- | social buttons   |
| (Initiator)   |                               |                  |
|               |                               | [Go to Dashboard]|
| Stats + top   |                               +==================+
| results +     |
| reshare       |
+===============+
       |
       v
+===============+
|               |
| PARTICIPANT   |
| FLOW          |
| (existing)    |
|               |
+===============+
```

---

## Appendix B: Interaction Timing

| Action | Expected Duration | Feedback |
|--------|------------------|----------|
| Type challenge text | 30-60 sec | Live character count |
| Each wizard step | 15-30 sec | Progress bar advances |
| Review all sections | 15-30 sec | Scrollable, edit icons |
| Launch deliberation | 2-5 sec | Spinner + "Creating..." |
| Copy link | < 1 sec | "Copied!" toast (3s) |
| Open WhatsApp | < 1 sec | External app opens |
| Load dashboard | 1-3 sec | Skeleton/spinner |
| Total time to share | **2-4 minutes** | Progressive milestone feedback |

---

## Appendix C: Accessibility Checklist

- [ ] All interactive elements have minimum 48px touch target
- [ ] Color contrast meets WCAG AA (4.5:1 for text, 3:1 for UI)
- [ ] All form fields have associated labels
- [ ] Progress indicator announces step changes to screen readers
- [ ] Error messages use `role="alert"` for immediate announcement
- [ ] Focus management: first focusable element receives focus on each wizard step
- [ ] Keyboard navigation works for all interactions (tabs, enter, escape)
- [ ] Skip link available on all screens
- [ ] RTL layout tested for Hebrew and Arabic
- [ ] Reduced motion preference respected (no animations)
- [ ] QR code has descriptive alt text
- [ ] Clipboard operations have screen reader announcements

---

*Document version: 1.0*
*Created: 2026-03-03*
*Scope: Bot app (apps/bot/) initiator flow*
*Related: participant-journey-ux-spec.md (participant flow)*
