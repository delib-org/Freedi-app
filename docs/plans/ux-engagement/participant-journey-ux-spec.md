# Freedi Participant Journey -- Complete UX Specification

## Document Purpose

This is a comprehensive UX specification for the participant journey in Freedi's deliberative democracy platform. It covers every screen, interaction, data point, transition, timing, emotional beat, and edge case across both the **Forward Flow** (first-time participation) and the **Return Journey** (re-engagement via notifications).

---

## Table of Contents

1. [Design Foundations](#1-design-foundations)
2. [Architecture Overview](#2-architecture-overview)
3. [BRANCH 1: FLOW -- Forward Journey](#3-branch-1-flow)
   - [Step 1: Intro](#step-1-intro)
   - [Step 2: What Are Your Needs?](#step-2-what-are-your-needs)
   - [Step 3: What Is Your Solution?](#step-3-what-is-your-solution)
   - [Step 4: Current State](#step-4-current-state)
   - [Step 5: Sign In to Get Updates](#step-5-sign-in-to-get-updates)
4. [BRANCH 2: GO BACK -- Return Journey](#4-branch-2-go-back)
   - [Section 1: My Solutions](#section-1-my-solutions)
   - [Section 2: Top Solutions](#section-2-top-solutions)
   - [Section 3: Searched Solutions](#section-3-searched-solutions)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
6. [State Machine & Session Management](#6-state-machine)
7. [Progressive Identity System](#7-progressive-identity)
8. [Notification & Re-engagement System](#8-notifications)
9. [Accessibility & Internationalization](#9-accessibility)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Design Foundations

### Target User Profile

The "mean participator" has 10-15 minutes per session, arrives on mobile via a shared link, and has no prior context about the platform. Based on the Rotem exercise data:

- 25% participated via MC (anonymous digital)
- 22.5% participated via Sign
- Only 5% participated in-person
- Async and mobile are dominant preferences

### Design Tokens (from existing system)

All designs use the established Freedi design tokens:

```
Colors:
  --mainBackground: #1f5895    (trust/authority)
  --agree: #57c6b2              (positive consensus)
  --disagree: #fe6ba2           (gentle disagreement)
  --question: #47b4ef           (inquiry)
  --option: #e7d080             (proposals)
  --statementBackground: #f2f6ff (breathing room)

Typography:
  Body: 17px (1rem), line-height 150%
  H1: 32px, H2: 27px, H3: 24px

Spacing: 8-point grid
Touch targets: minimum 44x44px
Border radius: buttons 20px, cards 8px
```

### Persona-to-Flow Mapping

| Persona | Primary Path | Time Budget | Key Concern |
|---------|-------------|-------------|-------------|
| Maya (Community Member) | Full Flow, returns often | 15 min | "Will my idea be heard?" |
| Oren (Manager) | Admin creates, skims results | 5 min participant view | "Show me the data" |
| Noa (Shy Student) | Writes carefully, evaluates all | 20 min | "Is this safe?" |
| Rami (Skeptic) | Evaluates critically, watches results | 10 min | "Can I trust this?" |
| Lina (Organizer) | Admin side, checks participant view | 10 min | "Will this scale?" |
| David (Busy Parent) | Quick evaluate only | 5 min | "Can I do this fast?" |

---

## 2. Architecture Overview

### The Two Branches

```
                     User gets a LINK
                          |
                    [FORWARD FLOW]
                          |
    +-----+-----+--------+--------+----------+
    |     |     |        |        |          |
  Intro  Needs  Solutions  State   Sign-in
         W  E   W  E              (optional)
                   C  S
                          |
                    [SESSION ENDS]
                          |
                   (time passes)
                          |
                  User gets NOTIFICATION
                          |
                    [RETURN JOURNEY]
                          |
         +----------------+--------------+
         |                |              |
    My Solutions    Top Solutions   Searched Solutions
     R    S          T    S          S    M
                          A
```

Legend:
- W = Write, E = Evaluate, C = Comment, S = Suggest improvement
- R = Review others, S = My best scores
- T = Top in group, S = Summary (Agreement map + AI), A = AI summary
- S = Similar to mine, M = Suggest merging

### Session State Model

```
STATES:
  anonymous_fresh    -> User just arrived, no data
  anonymous_active   -> User has started participating (write/evaluate)
  identified_email   -> User provided email at completion
  identified_auth    -> User signed in with Google
  returning          -> User came back via notification

TRANSITIONS:
  anonymous_fresh   --[views intro]-->     anonymous_fresh
  anonymous_fresh   --[writes/evaluates]--> anonymous_active
  anonymous_active  --[provides email]-->   identified_email
  anonymous_active  --[signs in]-->         identified_auth
  identified_email  --[clicks notif]-->     returning
  identified_auth   --[clicks notif]-->     returning
```

---

## 3. BRANCH 1: FLOW -- Forward Journey

### Step 1: Intro

**Purpose**: Orient the user. Answer "What is this?" and "Why should I care?" in under 30 seconds.

**Time Budget**: 20-30 seconds

**Emotional Design**: Curiosity, trust, low-stakes invitation. The user should feel "This is simple and worthwhile."

#### Screen Layout (Mobile, 375px)

```
+-----------------------------------+
|  [Org Logo]                       |
|                                   |
|  ================================ |
|  ||                            || |
|  ||    "How should we improve  || |
|  ||     our neighborhood       || |
|  ||     park?"                 || |
|  ||                            || |
|  ================================ |
|                                   |
|  Posted by: City Council          |
|  42 participants so far           |
|                                   |
|  +-----------------------------+  |
|  |  Your voice matters.        |  |
|  |  Share what you need,       |  |
|  |  propose solutions, and     |  |
|  |  help find what works       |  |
|  |  for everyone.              |  |
|  +-----------------------------+  |
|                                   |
|  How it works:                    |
|                                   |
|  1. Share your needs    ~2 min    |
|  2. Propose solutions   ~3 min   |
|  3. See where we stand  ~1 min   |
|                                   |
|  Estimated time: 6-8 minutes      |
|                                   |
|  +-----------------------------+  |
|  |      Let's Begin  ->       |  |
|  +-----------------------------+  |
|                                   |
|  No account needed.               |
|  Your input is anonymous.         |
+-----------------------------------+
```

#### Key Interactions

1. **"Let's Begin" button** -- Primary CTA, navigates to Step 2
2. **Scroll** -- Reveals the "How it works" steps (progressive disclosure)
3. **Participant count** -- Live counter, creates social proof ("42 people already joined")
4. **Org logo** -- Tappable, shows brief org context in a bottom sheet

#### Data Shown

- **Question/Topic title**: The deliberation question (from Statement.statement)
- **Organizer name**: Creator's display name or organization
- **Participant count**: Live count from evaluation data
- **Estimated time**: Calculated from number of sub-steps enabled
- **Description** (optional): If admin added context/description paragraphs

#### Transitions

- **Entry**: User arrives via shared URL (e.g., `freedi.app/d/{statementId}`)
- **Exit**: Tap "Let's Begin" --> fade transition to Step 2
- **Alternative**: If user has already participated (localStorage check), show "Welcome back" variant with option to continue or see results

#### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No description provided by admin | Hide description section, show question prominently |
| 0 participants | Show "Be the first to share your voice" instead of count |
| User arrived but deliberation is closed | Show "This deliberation has ended" with link to results |
| User already completed the flow | Show "Welcome back!" with option to see results or continue evaluating |
| Extremely long question text | Truncate at 3 lines with "Read more" expansion |
| RTL language | Mirror layout, logo to right, text alignment flips |
| Offline/slow connection | Show skeleton loader for participant count, cache question text |

#### Persona-Specific Considerations

- **Rami (Skeptic)**: The "How it works" transparency is crucial. He needs to see the process before committing.
- **David (Busy Parent)**: The time estimate reassures him this won't take long.
- **Noa (Shy Student)**: "Your input is anonymous" is the key trust signal.

---

### Step 2: What Are Your Needs?

This step has two sub-actions presented sequentially: **Write** first, then **Evaluate**.

**Purpose**: Surface the problems and needs the community has before jumping to solutions. This is the "divergent" phase.

**Time Budget**: 3-4 minutes total (1-2 min writing, 2-3 min evaluating)

**Emotional Design**: Empowerment ("your experience matters"), safety ("no wrong answers"), and validation ("others feel the same way").

#### Sub-Step 2A: Write Your Needs

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back          Step 1 of 3      |
|  [====...........]  33%           |
|                                   |
|  What challenges do you face      |
|  with the neighborhood park?      |
|                                   |
|  Share what matters to YOU.       |
|  What problems have you           |
|  experienced?                     |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |  Type your need here...     |  |
|  |                             |  |
|  |                             |  |
|  |                             |  |
|  +-----------------------------+  |
|  42/500 characters                |
|                                   |
|  +-----------------------------+  |
|  |     Share My Need  ->      |  |
|  +-----------------------------+  |
|                                   |
|  or  Skip to evaluating ->       |
|                                   |
+-----------------------------------+
```

##### After Submission (brief celebration + prompt for more)

```
+-----------------------------------+
|  < Back          Step 1 of 3      |
|  [====...........]  33%           |
|                                   |
|       [checkmark animation]       |
|                                   |
|  Need shared!                     |
|                                   |
|  "The playground equipment is     |
|   outdated and unsafe for         |
|   younger children"               |
|                                   |
|  +-----------------------------+  |
|  |  + Share Another Need      |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |  See What Others Need  ->  |  |
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Text input** -- Auto-expanding textarea, max 500 chars, live character count
2. **"Share My Need" button** -- Submits the need, shows brief celebration animation (0.5s checkmark + confetti particles)
3. **"Skip to evaluating"** -- Text link for users like David who want to jump ahead
4. **"Share Another Need"** -- After first submission, allows adding more needs
5. **"See What Others Need"** -- Transitions to evaluation sub-step

##### Data Shown

- **Question context** repeated (shortened) at top
- **Guiding prompt**: Customizable by admin, defaults to "What challenges do you face with [topic]?"
- **Character count**: Live, non-intrusive
- **Submitted needs count**: After submission, shows "You've shared X needs"

##### Transitions

- **Write --> Celebrate**: 0.5s animation, checkmark scales in, 2-3 confetti particles
- **Celebrate --> Write More or Evaluate**: User chooses
- **Write --> Similar Check**: Before submission, run similarity check against existing needs (using existing `SimilarSolutions` pattern). If >80% similar, show merge prompt.

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty submission | Button disabled, subtle shake on tap |
| Very short text (<10 chars) | Gentle prompt: "Can you tell us a bit more?" |
| Duplicate/similar to existing | Show existing similar need with merge option (leverage SimilarSolutions component pattern) |
| Network error on submit | Toast: "Could not save. Tap to retry." Keep text in input. |
| User writes in different language than UI | Allow it. Language detection is not needed at this point. |
| User presses back during submission | Save draft to localStorage, restore on return |

---

#### Sub-Step 2B: Evaluate Others' Needs

##### Screen Layout -- Swipe Interface (Mobile)

```
+-----------------------------------+
|  < Back          Step 1 of 3      |
|  [=====..........]  40%           |
|                                   |
|  Do you share this need?          |
|  3 of 12                          |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |  "There isn't enough        |  |
|  |   shade in the playground   |  |
|  |   area. Kids can't play     |  |
|  |   during summer afternoons" |  |
|  |                             |  |
|  |                             |  |
|  |       [comment icon]        |  |
|  +-----------------------------+  |
|                                   |
|  [--] [-] [o] [+] [++]          |
|   SD   D   N   A   SA            |
|                                   |
|  SD=Strongly Disagree ... SA=     |
|  Strongly Agree                   |
|                                   |
+-----------------------------------+
```

This reuses the existing **SwipeInterface** component pattern from MC (`apps/mass-consensus/src/components/swipe/SwipeInterface/SwipeInterface.tsx`), with these adaptations:

- The framing changes from "Rate this proposal" to "Do you share this need?"
- The rating scale semantics shift: SA = "This is very important to me too", SD = "This isn't relevant to my experience"

##### Key Interactions

1. **5-level rating buttons** -- Reuse existing `RatingButton` component with re-labeled tooltips
2. **Card swipe** -- Optional swipe gesture (left = disagree direction, right = agree direction)
3. **Comment icon** -- Opens `CommentModal` for adding nuance ("I agree but...")
4. **Progress indicator** -- "3 of 12" with visual progress bar
5. **Skip option** -- Swipe up or tap neutral to skip without strong opinion

##### Data Shown

- **Need text**: The statement content
- **Progress**: Current card / total cards
- **Previous rating indicator**: If user already rated this (returning user), highlight the previous rating button

##### Transitions

- **Card exit animation**: 300ms throw animation (left/right based on rating polarity)
- **Next card entrance**: 200ms slide-up from stack behind
- **All cards evaluated**: Celebration micro-animation, then auto-advance to Step 3
- **Early exit**: "See Results So Far" link appears after evaluating at least 3 cards

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Only 1-2 needs submitted by others | Show what exists, then: "Not many needs yet. Check back later or share yours!" |
| 0 needs from others | Skip evaluation entirely, go to Step 3 with message: "You're early! Come back to evaluate once others share." |
| User already evaluated all | Show completion state: "You've evaluated all needs! New ones may appear later." |
| Very long need text | Scrollable card content, max-height with fade-out gradient at bottom |
| User's own need appears | Skip automatically (never evaluate your own) |

---

### Step 3: What Is Your Solution?

This step mirrors Step 2's structure but for solutions: **Write** first, then **Evaluate** (which branches into Comment and Suggest Improvement).

**Purpose**: Generate and evaluate proposed solutions. This is where deliberation happens.

**Time Budget**: 4-5 minutes total (2 min writing, 3 min evaluating)

**Emotional Design**: Creative energy ("be bold"), collective intelligence ("build on others' ideas"), constructive dialogue ("improve, don't just criticize").

#### Sub-Step 3A: Write Your Solution

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back          Step 2 of 3      |
|  [==========.....]  66%           |
|                                   |
|  Now, propose a solution!         |
|                                   |
|  Based on what the community      |
|  needs, what would you suggest?   |
|                                   |
|  Top needs so far:                |
|  - Lack of shade (87% agree)     |
|  - Unsafe equipment (82% agree)  |
|  - No evening lighting (71%)     |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |  Describe your solution...  |  |
|  |                             |  |
|  |                             |  |
|  |                             |  |
|  |                             |  |
|  +-----------------------------+  |
|  78/500 characters                |
|                                   |
|  +-----------------------------+  |
|  |   Submit My Solution  ->   |  |
|  +-----------------------------+  |
|                                   |
|  or  Skip to evaluating ->       |
+-----------------------------------+
```

##### Key Differentiator from Step 2

The solution writing screen shows a **context panel** with the top 3 community needs (from Step 2 consensus data). This grounds the user's solution in what the community actually cares about, rather than their individual perspective alone.

##### Key Interactions

1. **Context panel** -- Collapsible, shows top needs with consensus percentages
2. **Text input** -- Same as Step 2 but with solution-oriented placeholder
3. **Submit** -- Triggers similarity check (existing `SimilarSolutions` component), then celebration
4. **AI polish** (optional) -- "Improve my wording" button that uses AI to clarify the solution while preserving meaning (leverages existing AI feedback patterns in MC)
5. **Skip** -- Goes directly to evaluation

##### Post-Submission: Similarity Check

Reuses the existing `SimilarSolutions` component with three modes:

```
+-----------------------------------+
|  Similar solutions found!         |
|                                   |
|  Your idea:                       |
|  "Install solar-powered lights    |
|   along all pathways"             |
|                                   |
|  85% similar to:                  |
|  +-----------------------------+  |
|  | "Add LED lighting to the    |  |
|  |  main walking paths and     |  |
|  |  parking area"              |  |
|  |  [17 supporters]            |  |
|  |                             |  |
|  |  [Merge & Strengthen]       |  |
|  +-----------------------------+  |
|                                   |
|  [Add as New Solution]            |
|                                   |
|  <- Back to Edit                  |
+-----------------------------------+
```

The three modes (encourage/balanced/restrict from existing `SimilarSolutions`) are admin-configurable via `SuggestionMode`.

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No needs data from Step 2 | Hide "Top needs" context panel, show general prompt |
| User skipped Step 2 entirely | Still allow writing solutions, no context panel |
| AI polish changes meaning | Show diff view: original vs. polished, user confirms |
| Network error during similarity check | Submit directly without similarity check, log error |

---

#### Sub-Step 3B: Evaluate Solutions (with Comment and Suggest Improvement)

##### Screen Layout -- Enhanced Swipe Card (Mobile)

```
+-----------------------------------+
|  < Back          Step 2 of 3      |
|  [===========....]  73%           |
|                                   |
|  Rate this solution               |
|  5 of 15                          |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |  "Plant 20 new shade trees  |  |
|  |   in the playground area    |  |
|  |   and install a splash pad  |  |
|  |   for summer cooling"       |  |
|  |                             |  |
|  |  Addresses: Lack of shade,  |  |
|  |  Summer heat                |  |
|  |                             |  |
|  |  [comment] [suggest edit]   |  |
|  +-----------------------------+  |
|                                   |
|  [--] [-] [o] [+] [++]          |
|   SD   D   N   A   SA            |
|                                   |
+-----------------------------------+
```

The critical addition here vs. Step 2 evaluation is the **two action buttons** on each card:

##### Comment Button (speech bubble icon)

Opens the existing `CommentModal` component. The comment is posted as a child statement to the solution.

```
+-----------------------------------+
|  Comment on this solution         |
|  -------------------------------- |
|                                   |
|  "Plant 20 new shade trees..."    |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |  Share your thoughts...     |  |
|  |                             |  |
|  +-----------------------------+  |
|                                   |
|  [AI can help rephrase your       |
|   comment constructively]         |
|                                   |
|  +-----------------------------+  |
|  |      Submit Comment        |  |
|  +-----------------------------+  |
|                                   |
|  [Cancel]                         |
+-----------------------------------+
```

##### Suggest Improvement Button (pencil/edit icon)

This is the key new interaction. It opens an editing interface where the user can propose changes to the solution text.

```
+-----------------------------------+
|  Suggest an Improvement           |
|  -------------------------------- |
|                                   |
|  Original:                        |
|  "Plant 20 new shade trees in     |
|   the playground area and install |
|   a splash pad for summer"        |
|                                   |
|  Your improved version:           |
|  +-----------------------------+  |
|  | "Plant 20 native shade      |  |
|  |  trees in the playground    |  |
|  |  and install a splash pad   |  |
|  |  with water recycling for   |  |
|  |  sustainability"            |  |
|  +-----------------------------+  |
|                                   |
|  What did you change and why?     |
|  +-----------------------------+  |
|  | Added native species and    |  |
|  | water recycling for environ.|  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |   Submit Suggestion  ->    |  |
|  +-----------------------------+  |
+-----------------------------------+
```

##### Key Interactions for Evaluation Sub-Step

1. **5-level rating** -- Same as Step 2 but for solutions
2. **Comment** -- Opens modal, posts as reply (reuse `CommentModal`)
3. **Suggest improvement** -- Opens edit view with original text pre-filled, user modifies and explains
4. **Progressive disclosure on disagree** -- When user rates SD or D, automatically slide down a prompt: "What would make this better?" with a small text input (from Hook Model plan item #9)
5. **Card progress** -- "5 of 15" with progress bar

##### Transition: Disagree Prompt (Progressive Disclosure)

```
+-----------------------------------+
|  You disagreed. What would        |
|  make this solution better?       |
|                                   |
|  +-----------------------------+  |
|  |  Quick thought... (optional)|  |
|  +-----------------------------+  |
|                                   |
|  [Send]  [Skip]                   |
+-----------------------------------+
```

This appears as a slide-down panel between the card and rating buttons, only when the user rates -0.5 or -1. It is optional and can be skipped.

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User tries to suggest improvement on their own solution | Redirect to "Edit your solution" instead |
| Suggestion is identical to original | Validation: "Your suggestion looks the same as the original. Try changing something." |
| User comments + rates + suggests on same card | All three allowed. Comment and suggestion are separate child statements. |
| Only 1 solution exists (user's own) | Show: "Waiting for others to propose solutions. Come back soon!" with option to share the link |
| 50+ solutions to evaluate | Show first 15, offer "See more" after completing initial set. Prioritize solutions with fewer evaluations. |

---

### Step 4: Current State

**Purpose**: Show the user where the deliberation stands right now. This is the "convergent" view -- what is emerging from the collective input.

**Time Budget**: 1-2 minutes (scanning and absorbing)

**Emotional Design**: Revelation ("look what we built together"), agency ("your input shaped this"), transparency ("everything is visible").

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back          Step 3 of 3      |
|  [===============]  90%           |
|                                   |
|  Here's where we stand            |
|                                   |
|  42 participants | 15 solutions   |
|                                   |
|  --- Top Community Needs ---      |
|                                   |
|  1. Lack of shade         87%     |
|     [=========>          ]        |
|  2. Unsafe equipment      82%     |
|     [========>           ]        |
|  3. No evening lighting   71%     |
|     [=======>            ]        |
|  4. Poor drainage         64%     |
|     [======>             ]        |
|                                   |
|  --- Leading Solutions ---        |
|                                   |
|  1. "Plant native shade trees     |
|      + splash pad + LED lights"   |
|     Consensus: 0.72               |
|     [=================>  ]        |
|     23 evaluations                |
|                                   |
|  2. "Complete renovation with     |
|      community input"             |
|     Consensus: 0.65               |
|     [===============>    ]        |
|     19 evaluations                |
|                                   |
|  3. "Focus budget on safety       |
|      first, aesthetics later"     |
|     Consensus: 0.58               |
|     [=============>      ]        |
|     21 evaluations                |
|                                   |
|  +-----------------------------+  |
|  | [Agreement Map]             |  |
|  |  (simplified visual)        |  |
|  |                             |  |
|  |     *   *  *                |  |
|  |   *    *  * *   *           |  |
|  |  *  *   *   *  * *          |  |
|  |                             |  |
|  |  Tap to explore in detail   |  |
|  +-----------------------------+  |
|                                   |
|  Your contribution:               |
|  - 1 need shared                  |
|  - 1 solution proposed            |
|  - 8 evaluations given            |
|                                   |
|  +-----------------------------+  |
|  |    Continue  ->             |  |
|  +-----------------------------+  |
+-----------------------------------+
```

##### Key Interactions

1. **Scrollable results** -- Vertical scroll through needs ranking, solutions ranking
2. **Agreement map thumbnail** -- Tappable, expands to full-screen interactive version (leverages existing `PolarizationIndex` component patterns)
3. **Solution cards** -- Tappable to expand and see full text + comments
4. **"Your contribution" summary** -- Personal impact metrics (from Hook Model plan)
5. **Continue button** -- Goes to Step 5 (sign-in)

##### Data Shown

- **Participant count**: Total unique participants
- **Solutions count**: Total submitted solutions
- **Ranked needs**: Top 5 needs by consensus score with visual bars
- **Ranked solutions**: Top 5 solutions by consensus score with evaluator count
- **Agreement map**: Simplified scatter plot showing agreement clusters
- **Personal contribution stats**: Needs shared, solutions proposed, evaluations given

##### Transitions

- **Entry**: Smooth scroll-up from Step 3
- **Agreement map tap**: Full-screen modal with interactive chart
- **Continue**: Slide to Step 5

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Very few participants (<5) | Show data but note: "Early results. More participants will reveal clearer patterns." |
| User contributed nothing (skipped everything) | Hide "Your contribution" section, show general stats |
| All solutions have same consensus | Note: "No clear leader yet. Every voice helps!" |
| Agreement map has insufficient data | Show placeholder: "Agreement map needs 10+ participants" |

---

### Step 5: Sign In to Get Updates

**Purpose**: Convert anonymous participants into identifiable users who can be re-engaged. This is the **end** of the forward flow, not the beginning. The user has already contributed value, creating reciprocity.

**Time Budget**: 30-60 seconds

**Emotional Design**: Gratitude ("thank you"), anticipation ("stay in the loop"), low pressure ("completely optional").

##### Screen Layout (Mobile)

```
+-----------------------------------+
|                                   |
|       [checkmark animation]       |
|                                   |
|  Thank you for participating!     |
|                                   |
|  Your voice matters.              |
|  You helped shape the future      |
|  of your neighborhood park.       |
|                                   |
|  --- Your Impact ---              |
|                                   |
|  [1]  Need shared                 |
|  [1]  Solution proposed           |
|  [8]  Evaluations given           |
|  [42] Fellow participants         |
|                                   |
|  --- Stay in the Loop ---         |
|                                   |
|  Get notified when:               |
|  - Results are finalized          |
|  - Your solution gets support     |
|  - The consensus shifts           |
|                                   |
|  +-----------------------------+  |
|  | your@email.com              |  |
|  +-----------------------------+  |
|  +-----------------------------+  |
|  |     Notify Me  ->          |  |
|  +-----------------------------+  |
|                                   |
|  -- or sign in for more --        |
|                                   |
|  +-----------------------------+  |
|  | [G] Continue with Google   |  |
|  +-----------------------------+  |
|                                   |
|  [Skip - I'm done]               |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Email input** -- Simple email field for lightweight notification subscription
2. **"Notify Me" button** -- Saves email, subscribes to updates (reuse existing `CompletionScreen` email subscription pattern)
3. **"Continue with Google"** -- Full authentication, links to profile, enables return journey features
4. **"Skip - I'm done"** -- Respects user choice, closes flow gracefully
5. **Achievement badges** -- Reuse existing `AchievementBadge` component for gamification

##### Progressive Identity Tiers

```
Tier 0: Anonymous     -- participated, data saved with anonymous ID
Tier 1: Email         -- email provided, can receive notifications
Tier 2: Google Auth   -- full profile, can track history, return journey
```

Each tier unlocks more features:

| Feature | Anon | Email | Auth |
|---------|------|-------|------|
| Participate in deliberation | Yes | Yes | Yes |
| See current results | Yes | Yes | Yes |
| Get email notifications | No | Yes | Yes |
| Get push notifications | No | No | Yes |
| "My Solutions" dashboard | No | No | Yes |
| Track impact over time | No | No | Yes |
| Participate in multiple deliberations | Limited* | Limited* | Yes |

*Anonymous and email users can participate in multiple deliberations but cannot see a unified view.

##### Transitions

- **Email submit**: Brief celebration ("You're subscribed!"), then soft transition to optional Google sign-in
- **Google sign-in**: Redirect to Google OAuth, return to confirmation screen
- **Skip**: Fade to a final "Thank you" card that auto-dismisses, redirect to results view or close

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Invalid email format | Inline validation: "Please enter a valid email" |
| Email already subscribed | "You're already subscribed! We'll keep you updated." |
| Google sign-in fails | Toast: "Sign in failed. You can try again or just leave your email." |
| User already signed in (returning user) | Skip this step entirely, show abbreviated thank you |
| User closes tab before completing | Anonymous data is already saved. Next visit restores session if same device. |

---

## 4. BRANCH 2: GO BACK -- Return Journey

### Trigger: What Brings the User Back?

The return journey begins with a **notification** (push, email, or in-app). Based on the Hook Model engagement plan, these triggers include:

1. **Social proof**: "5 people agreed with your suggestion"
2. **Consensus shift**: "The consensus just shifted 15%!"
3. **Milestone**: "Results are in for [Topic]"
4. **Daily digest**: "12 new replies across 3 discussions"
5. **Deadline**: "Voting closes in 24 hours"

Each notification deep-links to a specific section of the return journey.

### Return Journey Entry Point: Welcome Back

```
+-----------------------------------+
|                                   |
|  Welcome back!                    |
|                                   |
|  Since you left:                  |
|  - 15 new evaluations on your     |
|    solution                       |
|  - The top solution changed       |
|  - 8 new solutions were proposed  |
|                                   |
|  +-----------------------------+  |
|  | [My Solutions]              |  |
|  | See how your ideas are doing|  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | [Top Solutions]             |  |
|  | See what's leading          |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | [Find Similar]              |  |
|  | Solutions like yours        |  |
|  +-----------------------------+  |
|                                   |
|  [Continue Evaluating ->]         |
|                                   |
+-----------------------------------+
```

This acts as a navigation hub. If the user arrived via a specific notification, they are deep-linked past this screen to the relevant section.

---

### Section 1: My Solutions

Two sub-views: **Review Others & Improve** and **My Best Scores**.

#### 1A: Review Other Participants and Improve Upon

**Purpose**: Show the user solutions from other participants that are related to their own, enabling them to improve their solution or suggest improvements to others.

**Time Budget**: 3-5 minutes

**Emotional Design**: Collaborative spirit ("let's make this better together"), creative challenge ("can you improve on this?").

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     My Solutions          |
|                                   |
|  [Review & Improve] [My Scores]   |
|                                   |
|  Your solution:                   |
|  +-----------------------------+  |
|  | "Plant native shade trees   |  |
|  |  and install a splash pad   |  |
|  |  with water recycling"      |  |
|  |                             |  |
|  | Score: 0.72 | 23 evaluations|  |
|  | [Edit My Solution]          |  |
|  +-----------------------------+  |
|                                   |
|  Related solutions to review:     |
|                                   |
|  +-----------------------------+  |
|  | "Create shaded seating      |  |
|  |  areas with native plants"  |  |
|  |                             |  |
|  | Score: 0.68 | 19 evals      |  |
|  |                             |  |
|  | [Suggest Improvement]       |  |
|  | [Merge Into Mine]           |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | "Build a canopy structure   |  |
|  |  over the playground"       |  |
|  |                             |  |
|  | Score: 0.54 | 12 evals      |  |
|  |                             |  |
|  | [Suggest Improvement]       |  |
|  | [Merge Into Mine]           |  |
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **"Edit My Solution"** -- Opens edit interface for the user's own solution
2. **"Suggest Improvement"** -- Opens the same suggest improvement modal from Step 3B
3. **"Merge Into Mine"** -- Proposes combining the other solution into the user's, creating a stronger unified proposal
4. **Tab toggle** -- Switch between "Review & Improve" and "My Scores"

##### Data Shown

- User's own solution with current score and evaluation count
- Related solutions ranked by similarity (using existing semantic search)
- Each related solution shows score, eval count, and action buttons

---

#### 1B: My Best Scores

**Purpose**: Show the user how their contributions are performing. Highlight wins. This is the "variable reward" from the Hook Model.

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     My Solutions          |
|                                   |
|  [Review & Improve] [My Scores]   |
|                                   |
|  --- Your Impact ---              |
|                                   |
|  +-----------------------------+  |
|  |  Solutions Proposed:  2     |  |
|  |  Total Evaluations:   45    |  |
|  |  Best Score:          0.72  |  |
|  |  Rank:  #3 of 15            |  |
|  +-----------------------------+  |
|                                   |
|  Your solutions ranked:           |
|                                   |
|  #3  "Plant native shade trees    |
|       + splash pad"               |
|      Score: 0.72  [23 evals]      |
|      [arrow up] +0.08 since       |
|      last visit                   |
|                                   |
|  #9  "Add bike parking near       |
|       the entrance"               |
|      Score: 0.41  [15 evals]      |
|      [arrow down] -0.03 since     |
|      last visit                   |
|                                   |
|  --- Feedback Received ---        |
|                                   |
|  [3 new comments on your          |
|   solutions since last visit]     |
|                                   |
|  > "Great idea! Maybe also add    |
|    drought-resistant plants"      |
|    -- Anonymous, 2h ago           |
|                                   |
|  > "The splash pad idea is        |
|    brilliant for summer"          |
|    -- Anonymous, 5h ago           |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Score trend arrows** -- Visual up/down indicators since last visit
2. **Feedback thread** -- Tappable comments that expand to show full thread (reuse `FeedbackThread` from MySuggestionsPage)
3. **Reply to feedback** -- Inline reply to comments
4. **Share solution** -- Share link to specific solution for social recruiting

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User hasn't proposed any solutions | "You haven't proposed a solution yet. Want to add one?" with CTA |
| Score dropped since last visit | Show trend but frame positively: "Scores shift as more people participate" |
| No new feedback | "No new feedback yet. More participants will bring more perspectives." |
| User's solution was merged by admin | "Your solution was combined with a similar one for greater impact" with link |

---

### Section 2: Top Solutions

Two sub-views: **Top Solutions in Group** and **Summary** (Agreement Map + AI Summary).

#### 2A: Top Solutions in the Group

**Purpose**: Show what the community is converging on. This is the "hunt" reward -- the thrill of seeing consensus emerge.

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     Top Solutions         |
|                                   |
|  [Top Ranked]  [Summary]          |
|                                   |
|  42 participants | 15 solutions   |
|  Last updated: 2 hours ago        |
|                                   |
|  +-----------------------------+  |
|  | #1  Consensus: 0.78         |  |
|  |                             |  |
|  | "Comprehensive park renewal |  |
|  |  with native trees, splash  |  |
|  |  pad, LED paths, and        |  |
|  |  community garden area"     |  |
|  |                             |  |
|  | 31 evaluations              |  |
|  | [====================>  ]   |  |
|  |                             |  |
|  | [Rate] [Comment] [Details]  |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | #2  Consensus: 0.72         |  |
|  |                             |  |
|  | "Focus on safety first:     |  |
|  |  replace equipment, add     |  |
|  |  fencing, improve drainage" |  |
|  |                             |  |
|  | 28 evaluations              |  |
|  | [==================>    ]   |  |
|  |                             |  |
|  | [Rate] [Comment] [Details]  |  |
|  +-----------------------------+  |
|                                   |
|  ... (scrollable list)            |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Rate** -- Quick inline rating (reuse rating buttons, compact mode)
2. **Comment** -- Opens comment modal
3. **Details** -- Expands card to show full text, all comments, edit history
4. **Pull to refresh** -- Updates rankings with latest data

---

#### 2B: Summary -- Agreement Map + AI Summary

**Purpose**: Provide a high-level understanding of the deliberation landscape. Where is there agreement? Where is there tension?

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     Top Solutions         |
|                                   |
|  [Top Ranked]  [Summary]          |
|                                   |
|  --- Agreement Map ---            |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |     *   *  *                |  |
|  |   *    *  * *   *           |  |
|  |  *  *   *   *  * *          |  |
|  |                   *  *      |  |
|  |                             |  |
|  |  [Agree zone] [Tension zone]|  |
|  +-----------------------------+  |
|  Tap clusters to explore          |
|                                   |
|  --- AI Summary ---               |
|                                   |
|  +-----------------------------+  |
|  |  Key Findings:              |  |
|  |                             |  |
|  |  The community broadly      |  |
|  |  agrees on the need for     |  |
|  |  shade and safety           |  |
|  |  improvements. The main     |  |
|  |  tension is between those   |  |
|  |  who want comprehensive     |  |
|  |  renovation vs. targeted    |  |
|  |  safety-first approach.     |  |
|  |                             |  |
|  |  Areas of consensus:        |  |
|  |  - Native trees (87%)       |  |
|  |  - Equipment replacement    |  |
|  |  - Better lighting          |  |
|  |                             |  |
|  |  Areas of tension:          |  |
|  |  - Budget allocation        |  |
|  |  - Timeline (now vs phased) |  |
|  +-----------------------------+  |
|                                   |
|  Generated by AI based on all     |
|  42 participant responses.        |
|  [Regenerate]                     |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Interactive agreement map** -- Tappable clusters that show which solutions/needs cluster together
2. **AI summary** -- Generated from all contributions, highlights consensus areas and tension points
3. **Regenerate** -- User can regenerate summary if they want a different perspective
4. **Share** -- Share the summary as an image or link

##### Data Shown

- Agreement map (scatter plot from existing `PolarizationIndex`)
- AI-generated summary covering: key findings, consensus areas, tension points
- Participant count and contribution counts
- Timestamp of last update

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| <10 participants | Agreement map shows placeholder: "Need more participants for meaningful patterns" |
| AI summary fails | Show "Summary generation failed. Try again later." with Regenerate button |
| All participants agree | Highlight: "Strong consensus emerging!" with celebration visual |
| Highly polarized results | Show nuanced language: "Diverse perspectives on this topic" |

---

### Section 3: Searched Solutions

Two sub-views: **Similar to Mine** and **Suggest Merging**.

#### 3A: Similar to Mine

**Purpose**: Help the user discover solutions that overlap with theirs. This creates connection ("I'm not alone in thinking this") and identifies potential merges.

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     Find Similar          |
|                                   |
|  [Similar to Mine] [Merge]        |
|                                   |
|  Solutions similar to yours:      |
|                                   |
|  Your solution:                   |
|  "Plant native shade trees..."    |
|                                   |
|  +-----------------------------+  |
|  | 92% similar                 |  |
|  |                             |  |
|  | "Create a native plant      |  |
|  |  garden with shade trees    |  |
|  |  throughout the park"       |  |
|  |                             |  |
|  | Score: 0.65 | 18 evals      |  |
|  | [View] [Suggest Merge]      |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | 78% similar                 |  |
|  |                             |  |
|  | "Redesign the park with     |  |
|  |  trees, water features,     |  |
|  |  and natural play areas"    |  |
|  |                             |  |
|  | Score: 0.58 | 14 evals      |  |
|  | [View] [Suggest Merge]      |  |
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **Similarity percentage** -- Visual indicator of how similar each solution is
2. **"View"** -- Expands the full solution with all comments
3. **"Suggest Merge"** -- Initiates a merge proposal

---

#### 3B: Suggest Merging

**Purpose**: Enable users to consolidate similar solutions to avoid vote-splitting and strengthen consensus.

##### Screen Layout (Mobile)

```
+-----------------------------------+
|  < Back     Find Similar          |
|                                   |
|  [Similar to Mine] [Merge]        |
|                                   |
|  Merge Proposals                  |
|                                   |
|  You can suggest merging similar  |
|  solutions to create stronger     |
|  proposals.                       |
|                                   |
|  +-----------------------------+  |
|  | Merge Proposal              |  |
|  |                             |  |
|  | Solution A (yours):         |  |
|  | "Plant native shade trees   |  |
|  |  and install a splash pad"  |  |
|  |                             |  |
|  |        +                    |  |
|  |                             |  |
|  | Solution B:                 |  |
|  | "Create a native plant      |  |
|  |  garden with shade trees"   |  |
|  |                             |  |
|  |        =                    |  |
|  |                             |  |
|  | Merged version:             |  |
|  | +-------------------------+ |  |
|  | | "Create a comprehensive | |  |
|  | |  native plant and shade | |  |
|  | |  tree garden with a     | |  |
|  | |  splash pad feature"    | |  |
|  | +-------------------------+ |  |
|  |                             |  |
|  | [Submit Merge Proposal]     |  |
|  | [Edit Merged Version]       |  |
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

##### Key Interactions

1. **AI-assisted merge** -- AI generates a merged version that combines the best of both solutions
2. **Edit merged version** -- User can refine the AI-generated merge
3. **Submit merge proposal** -- Sends to both solution creators for approval
4. **Notification to other creator** -- "Someone wants to merge their solution with yours"

##### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Other creator is anonymous (no email) | Merge happens if the proposer confirms. Anonymous user sees the merged version on return. |
| Both creators reject merge | Solutions remain separate. Log the attempt for admin visibility. |
| Solutions are too different for meaningful merge | AI flags: "These solutions address different aspects. Consider keeping them separate." |
| Admin-initiated merge | Admin can force-merge without user approval, with notification to both creators |

---

## 5. Cross-Cutting Concerns

### Navigation Architecture

```
FORWARD FLOW:
  Intro --> Needs(Write) --> Needs(Evaluate) --> Solutions(Write) -->
  Solutions(Evaluate) --> Current State --> Sign In

RETURN JOURNEY:
  Welcome Back --> [My Solutions | Top Solutions | Searched Solutions]
                    |               |                |
                    +-- Review      +-- Top Ranked   +-- Similar
                    +-- Scores      +-- Summary      +-- Merge

PERSISTENT:
  - Back button always available (browser history compatible)
  - Progress bar shows position in flow
  - "Current State" is accessible from both branches
```

### Progress Persistence

All user progress is saved in three tiers:

1. **localStorage** -- Immediate, survives refresh, device-specific
2. **Anonymous ID cookie** -- Links to Firestore document for anonymous users
3. **User profile** -- Full persistence for authenticated users

```typescript
// Session state stored in localStorage
interface SessionProgress {
  deliberationId: string;
  currentStep: 'intro' | 'needs-write' | 'needs-evaluate' |
               'solutions-write' | 'solutions-evaluate' |
               'current-state' | 'sign-in' | 'complete';
  needsWritten: string[];
  solutionsWritten: string[];
  evaluationsGiven: Record<string, number>; // statementId -> rating
  lastVisit: number; // timestamp in ms
  anonymousId: string;
  identityTier: 0 | 1 | 2;
}
```

### The Flow-to-Return Bridge

The key mechanism connecting the Forward Flow to the Return Journey:

1. **Step 5 (Sign In)** loads the notification trigger
2. Notifications fire based on: social proof, consensus shifts, milestones, deadlines
3. Each notification deep-links to the most relevant Return Journey section
4. The Return Journey always shows "What changed since you left"

```
Forward Flow      Notification           Return Journey
-----------       ----------------       ---------------
User completes -> Email captured    ->   Digest email
                  or                     with deep link
                  Google auth       ->   Push notification
                                        with deep link
                                         |
                                         v
                                    Welcome Back screen
                                    (or direct to section)
```

### Loading States

Every screen follows the three-tier loading pattern from the design guide:

1. **Immediate** (0-200ms): Skeleton screen showing layout structure
2. **Short wait** (200ms-2s): Animated spinner within content area
3. **Long wait** (2s+): Enhanced loader with progress and messages (reuse `EnhancedLoader`)

### Empty States

Consistent empty state pattern across all screens:

```
+-----------------------------------+
|                                   |
|         [illustrative icon]       |
|                                   |
|    [Friendly message explaining   |
|     why this is empty]            |
|                                   |
|    [Clear CTA to resolve the      |
|     empty state]                  |
|                                   |
+-----------------------------------+
```

Examples:
- No needs yet: "Be the first to share what matters to you" + [Share a Need]
- No solutions yet: "The community is still thinking. Check back soon!" + [Propose a Solution]
- No similar solutions: "Your idea is unique! That's great." + [Back to Solutions]

---

## 6. State Machine & Session Management

### Full State Diagram

```
                    [URL Received]
                         |
                    [Intro Screen]
                         |
              +----------+----------+
              |                     |
         [New User]           [Returning User]
              |                     |
    [Check localStorage]    [Welcome Back Screen]
              |                     |
       [No progress]          [Has progress]
              |                     |
    [Start from Step 1]    [Resume from last step
              |              OR go to Return Journey]
              |
    [Needs: Write] ----skip----> [Needs: Evaluate]
              |                        |
    [Needs: Evaluate] <---all done-----+
              |
    [Solutions: Write] --skip--> [Solutions: Evaluate]
              |                        |
    [Solutions: Evaluate] <--all done--+
              |
    [Current State]
              |
    [Sign In / Subscribe]
              |
    [Complete] ---------> [Session ends]
                               |
                         [Notification]
                               |
                         [Return Journey]
                               |
              +----------------+----------------+
              |                |                |
        [My Solutions]   [Top Solutions]  [Searched Solutions]
```

### Session Restoration Logic

```typescript
function determineEntryPoint(
  deliberationId: string,
  userId: string | null
): EntryPoint {
  const stored = localStorage.getItem(`session_${deliberationId}`);

  if (!stored) {
    return { screen: 'intro', isNew: true };
  }

  const session: SessionProgress = JSON.parse(stored);
  const timeSinceLastVisit = Date.now() - session.lastVisit;

  // If returning after 24+ hours, show Welcome Back
  if (timeSinceLastVisit > 24 * 60 * 60 * 1000) {
    return { screen: 'welcome-back', isNew: false, session };
  }

  // If incomplete, resume from last step
  if (session.currentStep !== 'complete') {
    return { screen: session.currentStep, isNew: false, session };
  }

  // If complete but returning, go to Return Journey hub
  return { screen: 'return-hub', isNew: false, session };
}
```

---

## 7. Progressive Identity System

### Anonymous ID Generation

Every new visitor gets an anonymous ID:

```typescript
function getOrCreateAnonymousId(): string {
  const stored = localStorage.getItem('freedi_anon_id');
  if (stored) return stored;

  const newId = `anon_${crypto.randomUUID()}`;
  localStorage.setItem('freedi_anon_id', newId);
  return newId;
}
```

### Identity Upgrade Path

```
Anonymous -> Email -> Google Auth

Each upgrade PRESERVES all previous data:
- Evaluations remain linked
- Solutions remain attributed
- Comments remain visible
- Only the identity record is updated
```

### Conversion Prompts (from Hook Model plan)

Prompts appear at "reward moments" (never before the user has received value):

1. After first evaluation completion: "Save your progress?"
2. After solution gets positive evaluations: "Get notified about your idea?"
3. After seeing current state: "Stay updated on results?"

Each prompt is dismissible and respects a "don't ask again for this session" flag.

---

## 8. Notification & Re-engagement System

### Notification Types and Deep Links

| Trigger | Message Example | Deep Link Target |
|---------|----------------|-----------------|
| Social proof | "5 people agreed with your suggestion" | My Solutions > My Scores |
| Consensus shift | "The top solution just changed!" | Top Solutions > Top Ranked |
| New comment | "Someone commented on your solution" | My Solutions > Review |
| Milestone | "Results are ready for [Topic]" | Top Solutions > Summary |
| Deadline | "Voting closes in 24 hours" | Forward Flow > Step 3B (evaluate) |
| Digest | "12 new contributions since your last visit" | Welcome Back hub |

### Notification Frequency Caps

- Social proof: max 1 per solution per hour
- Consensus shift: max 1 per deliberation per 6 hours
- Digest: once per day at 10:00 AM user local time
- Deadline: once at 24h before, once at 1h before

---

## 9. Accessibility & Internationalization

### Accessibility Requirements

Every screen must meet:

- **WCAG AA contrast** (4.5:1 for normal text, 3:1 for large text)
- **Touch targets**: minimum 44x44px
- **Screen reader**: All interactive elements have ARIA labels
- **Keyboard navigation**: Full flow completable without mouse
- **Reduced motion**: All animations respect `prefers-reduced-motion`
- **RTL support**: Full bidirectional layout support (Hebrew, Arabic)

### Swipe Interface Accessibility

The swipe card interface must have alternative interaction modes:

1. **Button-only mode** (already implemented in MC SwipeInterface) -- 5 rating buttons below card
2. **Keyboard mode** -- Arrow keys to navigate, 1-5 keys to rate
3. **Screen reader mode** -- Each card is announced with full text, rating instructions read aloud

### Internationalization

All user-facing text uses `useTranslation()` hook. Translation files in `packages/shared-i18n/src/languages/`. New keys needed for this feature:

```json
{
  "flow.intro.title": "Your voice matters",
  "flow.intro.howItWorks": "How it works",
  "flow.intro.estimatedTime": "Estimated time: {{minutes}} minutes",
  "flow.intro.noAccountNeeded": "No account needed",
  "flow.intro.letsBegin": "Let's Begin",
  "flow.needs.writePrompt": "What challenges do you face?",
  "flow.needs.evaluatePrompt": "Do you share this need?",
  "flow.solutions.writePrompt": "Propose a solution",
  "flow.solutions.topNeeds": "Top needs so far",
  "flow.solutions.evaluatePrompt": "Rate this solution",
  "flow.state.hereWeStand": "Here's where we stand",
  "flow.signIn.thankYou": "Thank you for participating!",
  "flow.signIn.stayInLoop": "Stay in the loop",
  "return.welcomeBack": "Welcome back!",
  "return.sinceYouLeft": "Since you left:",
  "return.mySolutions": "My Solutions",
  "return.topSolutions": "Top Solutions",
  "return.findSimilar": "Find Similar",
  "return.suggestMerge": "Suggest Merging"
}
```

---

## 10. Implementation Roadmap

### Phase 1: Forward Flow (Core)

**Priority: P0 -- Ship first**

1. Intro screen with deliberation context
2. Needs: Write (with similarity check)
3. Needs: Evaluate (reuse SwipeInterface)
4. Solutions: Write (with context panel + similarity check)
5. Solutions: Evaluate (reuse SwipeInterface + comment modal)
6. Current State (ranked needs + ranked solutions)
7. Sign In / Email subscription (reuse CompletionScreen pattern)

**Existing components to reuse:**
- `SwipeInterface`, `SwipeCard`, `RatingButton`, `SurveyProgress`
- `CommentModal`, `SolutionPromptModal`, `SimilarSolutions`
- `CompletionScreen`, `AchievementBadge`
- `ResultsList`, `InlineMarkdown`

### Phase 2: Current State Enhancement

**Priority: P1 -- After core flow works**

1. Agreement map integration (from PolarizationIndex)
2. AI summary generation
3. Personal contribution stats

### Phase 3: Return Journey

**Priority: P1 -- After notifications are working**

1. Welcome Back screen
2. My Solutions: Review & Improve
3. My Solutions: My Best Scores (reuse MySuggestionsPage)
4. Top Solutions: Top Ranked (reuse ResultsList)
5. Top Solutions: Summary (agreement map + AI)

### Phase 4: Advanced Features

**Priority: P2 -- Growth features**

1. Searched Solutions: Similar to Mine
2. Searched Solutions: Suggest Merging
3. Progressive disclosure on disagree
4. Score trend indicators
5. Merge proposal workflow

### Technical Considerations

- **New route structure**: `/d/{deliberationId}/flow/{step}` for forward flow, `/d/{deliberationId}/return/{section}` for return journey
- **State management**: Extend existing Redux store with flow progress slice
- **API endpoints**: New endpoints for needs (separate from solutions), merge proposals, AI summaries
- **Data model**: May need new Firestore collections for needs (vs. solutions), merge proposals, session progress
- **Analytics**: Track drop-off at each step, time spent per step, conversion rates at sign-in

---

## Summary: The Complete Participant Journey

The participant journey is designed around one central insight: **participation must feel effortless, meaningful, and rewarding at every step.**

The Forward Flow takes the "mean participator" from zero context to full contribution in 6-8 minutes, with every step progressively building engagement. By placing sign-in at the END (not the beginning), we maximize the pool of contributors. By showing real-time consensus data throughout, we create the variable reward that makes participation addictive.

The Return Journey capitalizes on that initial investment by showing users that their contributions matter -- scores rising, feedback received, consensus shifting. Each notification is a hook that pulls users back into a cycle of contribution, evaluation, and improvement.

Together, these two branches create a complete engagement loop:

```
CONTRIBUTE --> SEE IMPACT --> GET NOTIFIED --> RETURN --> IMPROVE --> SEE GREATER IMPACT
```

This loop, combined with progressive identity (anonymous to email to full auth), creates a participation flywheel that compounds over time. Each participant's return visit makes the deliberation richer, which makes the notifications more compelling for everyone else, which brings more people back.

The design serves all six personas simultaneously: Maya gets her equal voice, Oren gets real team data, Noa gets a safe writing space, Rami gets transparent results, Lina gets scalable participation, and David gets a 5-minute mobile experience that makes him feel fully included.
