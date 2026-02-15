# Mass Consensus - Full Tinder-Style Redesign Prompt

## Project Overview

Transform the Mass Consensus app into a "Smart Tinder for Ideas" - a swipe-based interface for gathering broad consensus on proposals and ideas. The goal is to make civic participation feel like a game, not a chore.

**Project Location:** `/Users/talyaron/Documents/Freedi-app/apps/mass-consensus`

## Design Philosophy

### Core Concept
Instead of filling out surveys, users "play" with ideas - swiping through proposals, rating them, suggesting improvements, and seeing their impact in real-time. The experience should be:
- **Intuitive** - Anyone can use it immediately
- **Engaging** - Feels like a game, not work
- **Social** - Shows community activity and connection
- **Rewarding** - Users see their impact

### Color Palette (Pastel Theme)
```css
/* Primary Colors */
--color-primary: #7C9EB2;      /* Soft teal-blue - main CTA */
--color-secondary: #B8D4E3;    /* Light blue */
--color-lavender: #D9D4E7;     /* Soft purple */
--color-peach: #F5DDD6;        /* Warm peach */
--color-mint: #C9E4DE;         /* Fresh mint green */

/* Rating Colors (5-point scale) */
--rating-love: #ffe4e6;        /* Pink - ❤️ Love it */
--rating-like: #d1fae5;        /* Green - 👍 Like */
--rating-neutral: #f1f5f9;     /* Gray - 😐 Neutral */
--rating-dislike: #fef3c7;     /* Yellow - 👎 Dislike */
--rating-hate: #fee2e2;        /* Red - ❌ Strongly dislike */

/* Background */
--background: linear-gradient(180deg, rgba(184, 212, 227, 0.25), rgba(242, 226, 210, 0.25));
```

### Typography & Spacing
- Clean, readable fonts
- Generous whitespace
- 8px grid system for spacing
- Large touch targets (minimum 44px)

---

## Features to Implement

### 1. Welcome/Intro Screen (Per Question)
Each question/survey opens with a calming intro screen:
- **What's being asked** - Clear question title
- **Why it matters** - Brief context
- **Time estimate** - "Takes about 2-3 minutes"
- **Reassurance** - "You can stop anytime"
- **Start button** - Large, inviting CTA

**File to create/modify:** `src/components/question/QuestionIntro.tsx`

### 2. Tinder-Style Card Interface
The main interaction screen shows proposals as swipeable cards:

**Card Features:**
- Stacked card visual (see 2-3 cards behind)
- Drag/swipe gestures with rotation
- LIKE/NOPE overlays during swipe
- Throw animation when released
- Card enter animation for new cards

**5-Point Rating System:**
| Rating | Emoji | Color | Swipe Direction |
|--------|-------|-------|-----------------|
| Love | ❤️/😍 | Pink | Strong right |
| Like | 👍 | Green | Right |
| Neutral | 😐/🤷 | Gray | Tap only |
| Dislike | 👎 | Yellow | Left |
| Hate | ❌/😠 | Red | Strong left |

**Files involved:**
- `src/components/question/SwipeCard.tsx` ✅ (Created)
- `src/components/question/SwipeCard.module.css` ✅ (Created)
- `src/components/question/EvaluationButtons.tsx` ✅ (Updated)
- `src/components/question/SolutionFeedClient.tsx` ✅ (Updated)

### 3. Improvement Suggestions
When a user likes (or almost likes) a proposal, show an option:
- **Button:** "I have a suggestion to improve this" 💡
- **Opens:** Simple text field for one-sentence improvement
- **Emphasis:** Keep it brief, not an essay

**File to modify:** `src/components/question/SolutionPromptModal.tsx`
- Add "improvement mode" vs "new proposal mode"
- Simplify the UI for quick suggestions

### 4. Periodic Invitation for New Ideas
Every N cards (e.g., 5-7), gently prompt:
- "Want to propose your own idea?"
- Easy to dismiss/skip
- Non-pushy tone

**Implementation:** Add to `SolutionFeedClient.tsx`
- Track card count
- Show modal/prompt periodically
- Store dismissal preference

### 5. Multi-Question Survey Flow
For surveys with multiple questions:
- Progress indicator showing current question
- Smooth transitions between questions
- Each question has:
  1. Intro screen
  2. Interaction screen (Swipe / Open text / Demographics)

**Question Types to Support:**
- **Consensus questions** - The main swipe interface
- **Demographic questions:**
  - Range slider
  - Free text
  - Radio buttons (single select)
  - Checkboxes (multi select)

**Files involved:**
- `src/components/survey/SurveyNavigation.tsx`
- `src/components/survey/QuestionRenderer.tsx`
- Create demographic question components

### 6. Social Layer (Real-time Activity Feed)
A subtle, non-intrusive feed showing live activity:
- "Proposal #45 just got 3 likes"
- "3 other participants are active now"
- "Someone suggested an improvement to #678"

**Features:**
- Collapsible/expandable
- "Live" badge with pulsing indicator
- Slide-in animations for new items
- Hebrew names for demo (דני, מיכל, יוסי...)

**Files involved:**
- `src/components/question/SocialFeed.tsx` ✅ (Created)
- `src/components/question/SocialFeed.module.css` ✅ (Created)

### 7. Personal Feedback & Impact
Show users their impact:
- "Your proposal got 5 likes"
- "2 people suggested improvements"
- "Your idea is currently in the top 10"

**Implementation:**
- Update `CompletionScreen.tsx`
- Add user stats tracking
- Create personal dashboard view

### 8. User Profile / Contributions Area
Allow users to:
- Return to their proposals
- See proposals they marked for improvement
- Track changes and updates

**Files to create:**
- `src/components/profile/UserContributions.tsx`
- `src/components/profile/MyProposals.tsx`
- `src/components/profile/SavedForLater.tsx`

### 9. Survey Completion & Follow-up
**Completion Screen:**
- Show where user's proposals rank
- General summary (without overwhelming data)
- Option to receive updates

**Follow-up (Future):**
- Email after 24 hours with updates
- Notifications when someone improves their proposal
- Opt-in/opt-out for notifications

### 10. Email Notification System (Double Opt-in)

**User Flow:**
1. **Email Collection** - At completion or anytime, user can enter email
2. **Confirmation Required** - User must click link in confirmation email
3. **Preferences** - User can customize notification types
4. **Unsubscribe** - Easy one-click unsubscribe in every email

**Email Collection UI:**
```
┌─────────────────────────────────────────────────────┐
│  📬 Stay Updated on Your Ideas                      │
│                                                     │
│  Get notified when:                                 │
│  • Someone suggests an improvement to your idea     │
│  • Your proposals gain traction                     │
│  • Daily summary of activity                        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ your@email.com                              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [ ] Daily digest (recommended)                     │
│  [ ] Instant notifications for improvements         │
│                                                     │
│         [  Subscribe for Updates  ]                 │
│                                                     │
│  🔒 We'll send a confirmation email.                │
│     You can unsubscribe anytime.                    │
└─────────────────────────────────────────────────────┘
```

**Confirmation Email:**
```
Subject: Confirm your Mass Consensus notifications

Hi there! 👋

You requested to receive updates about your contributions
to [Survey Name].

Click below to confirm your subscription:

    [ Confirm My Email ]

If you didn't request this, simply ignore this email.

---
Mass Consensus Team
```

**Notification Types:**

| Type | Trigger | Frequency |
|------|---------|-----------|
| Daily Digest | Scheduled | Once per day (if activity) |
| Improvement Alert | Someone suggests improvement | Instant (if opted in) |
| Milestone | Proposal reaches threshold | As it happens |
| Survey Results | Survey closes | Once |

**Daily Digest Email:**
```
Subject: 📊 Your Daily Mass Consensus Update

Hi [Name/there]!

Here's what happened with your contributions today:

🎯 YOUR PROPOSALS
━━━━━━━━━━━━━━━━━━
"[Proposal title...]"
  ↑ 12 new votes • Now ranked #3
  💡 2 new improvement suggestions

"[Another proposal...]"
  ↑ 5 new votes • Steady at #8

📈 SURVEY ACTIVITY
━━━━━━━━━━━━━━━━━━
• 47 new participants today
• 23 new proposals submitted
• Your proposals received 17 total votes

[  View Full Results  ]

---
Don't want these emails? [Unsubscribe] or [Manage preferences]
```

**Improvement Alert Email:**
```
Subject: 💡 Someone wants to improve your idea!

Hi there!

Great news! Someone suggested an improvement to your proposal:

YOUR PROPOSAL:
"[Original proposal text...]"

SUGGESTED IMPROVEMENT:
"[Improvement suggestion text...]"

[  View & Respond  ]

---
[Unsubscribe] | [Manage preferences]
```

**Database Schema:**
```sql
-- Email subscriptions table
CREATE TABLE email_subscriptions (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  question_id VARCHAR(255),           -- NULL = all questions
  survey_id VARCHAR(255),             -- NULL = all surveys

  -- Confirmation
  confirmed BOOLEAN DEFAULT FALSE,
  confirmation_token VARCHAR(255),
  confirmed_at TIMESTAMP,

  -- Preferences
  daily_digest BOOLEAN DEFAULT TRUE,
  instant_improvements BOOLEAN DEFAULT FALSE,
  milestone_alerts BOOLEAN DEFAULT TRUE,

  -- Unsubscribe
  unsubscribed BOOLEAN DEFAULT FALSE,
  unsubscribe_token VARCHAR(255),
  unsubscribed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email log table
CREATE TABLE email_log (
  id UUID PRIMARY KEY,
  subscription_id UUID REFERENCES email_subscriptions(id),
  email_type VARCHAR(50),             -- 'confirmation', 'daily_digest', 'improvement', etc.
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP
);
```

**API Endpoints:**
```
POST   /api/email/subscribe
       Body: { email, userId, questionId?, preferences }
       Response: { success, message: "Confirmation email sent" }

GET    /api/email/confirm/:token
       Confirms the subscription
       Redirects to success page

GET    /api/email/unsubscribe/:token
       Unsubscribes the user
       Redirects to confirmation page

PUT    /api/email/preferences/:token
       Updates notification preferences

GET    /api/email/preferences/:token
       Gets current preferences for management page
```

**Components to Create:**
```
src/components/email/
├── EmailSubscribeForm.tsx      # Email input + preferences
├── EmailSubscribeModal.tsx     # Modal wrapper for the form
├── ConfirmationSuccess.tsx     # "Email confirmed!" page
├── UnsubscribeSuccess.tsx      # "You've been unsubscribed" page
├── PreferencesPage.tsx         # Manage notification settings
└── EmailSubscribe.module.css   # Styles
```

**Implementation Notes:**
1. Use a proper email service (SendGrid, Mailgun, AWS SES)
2. Store tokens securely (hashed)
3. Rate limit subscription attempts
4. Include unsubscribe link in EVERY email (required by law)
5. Track opens/clicks for analytics
6. Batch daily digests efficiently (don't send empty digests)
7. Use job queue for sending emails (don't block requests)

**Privacy & Compliance:**
- Double opt-in required (GDPR compliant)
- Clear unsubscribe in every email (CAN-SPAM compliant)
- Don't share email with third parties
- Delete email data on request
- Show privacy policy link in subscription form

---

## Technical Implementation Guide

### Animation Keyframes (Already in globals.css)
```css
@keyframes throw-right {
  to {
    transform: translateX(150%) rotate(30deg);
    opacity: 0;
  }
}

@keyframes throw-left {
  to {
    transform: translateX(-150%) rotate(-30deg);
    opacity: 0;
  }
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

### Component Structure
```
src/components/
├── question/
│   ├── QuestionIntro.tsx          # New - Welcome screen
│   ├── SwipeCard.tsx              # ✅ Tinder-style card
│   ├── SwipeCard.module.css       # ✅ Card styles
│   ├── EvaluationButtons.tsx      # ✅ 5-point rating buttons
│   ├── EvaluationButtons.module.css # ✅ Button styles
│   ├── SolutionFeedClient.tsx     # ✅ Main feed (rewritten)
│   ├── SolutionFeed.module.css    # ✅ Feed styles
│   ├── SocialFeed.tsx             # ✅ Real-time activity
│   ├── SocialFeed.module.css      # ✅ Social feed styles
│   ├── SolutionPromptModal.tsx    # Update for improvements
│   └── ImprovementSuggestion.tsx  # New - Quick improvement input
├── survey/
│   ├── SurveyIntro.tsx            # New - Survey welcome
│   ├── SurveyProgress.tsx         # New - Progress indicator
│   ├── QuestionTransition.tsx     # New - Smooth transitions
│   └── demographics/
│       ├── RangeQuestion.tsx      # New
│       ├── RadioQuestion.tsx      # New
│       ├── CheckboxQuestion.tsx   # New
│       └── TextQuestion.tsx       # New
├── completion/
│   ├── CompletionScreen.tsx       # Update with new design
│   ├── ImpactSummary.tsx          # New - Show user impact
│   └── FollowUpOptions.tsx        # New - Email/notification opt-in
├── profile/
│   ├── UserContributions.tsx      # New
│   ├── MyProposals.tsx            # New
│   └── SavedItems.tsx             # New
└── email/
    ├── EmailSubscribeForm.tsx     # New - Email + preferences form
    ├── EmailSubscribeModal.tsx    # New - Modal wrapper
    ├── ConfirmationSuccess.tsx    # New - Email confirmed page
    ├── UnsubscribeSuccess.tsx     # New - Unsubscribed page
    ├── PreferencesPage.tsx        # New - Manage notifications
    └── EmailSubscribe.module.css  # New - Styles
```

### State Management
The app uses React state with custom events for cross-component communication:
- `solution-evaluated` - When user rates a card
- `solutions-loaded` - When batch loads
- `user-solution-count` - Track user submissions
- `show-view-progress` - Toggle progress view

### API Endpoints Used
- `GET /api/user-solutions/{questionId}` - Check user submissions
- `POST /api/evaluations/{solutionId}` - Submit rating
- `POST /api/statements/{questionId}/batch` - Get new batch
- `GET /api/statements/{questionId}/stats` - Get statistics

### API Endpoints to Create (Email System)
- `POST /api/email/subscribe` - Subscribe to notifications
- `GET /api/email/confirm/:token` - Confirm email (double opt-in)
- `GET /api/email/unsubscribe/:token` - Unsubscribe
- `PUT /api/email/preferences/:token` - Update preferences
- `GET /api/email/preferences/:token` - Get preferences
- `POST /api/email/send-digest` - Cron job endpoint for daily digest

---

## Implementation Priority

### Phase 1: Core Swipe Experience ✅ (Completed)
- [x] SwipeCard component with animations
- [x] EvaluationButtons with pastel design
- [x] SolutionFeedClient Tinder-style rewrite
- [x] SocialFeed component
- [x] Updated color palette in globals.css

### Phase 2: Welcome & Transitions (Next)
- [ ] QuestionIntro component
- [ ] Survey progress indicator
- [ ] Smooth question transitions
- [ ] Survey intro screen

### Phase 3: Improvements & Proposals
- [ ] Quick improvement suggestion flow
- [ ] Periodic "propose your idea" prompts
- [ ] Simplified proposal submission

### Phase 4: Demographics & Question Types
- [ ] Range slider question
- [ ] Radio button question
- [ ] Checkbox question
- [ ] Text input question

### Phase 5: Personal Impact & Profile
- [ ] Enhanced completion screen
- [ ] User contributions view
- [ ] Impact statistics
- [ ] Saved items functionality

### Phase 6: Email Notification System
- [ ] EmailSubscribeForm component
- [ ] EmailSubscribeModal component
- [ ] Email confirmation flow (double opt-in)
- [ ] API endpoints for subscribe/confirm/unsubscribe
- [ ] Daily digest email template
- [ ] Improvement alert email template
- [ ] Preferences management page
- [ ] Unsubscribe flow
- [ ] Email service integration (SendGrid/Mailgun)
- [ ] Job queue for email sending

---

## Key UX Principles

1. **Never feel like work** - Every interaction should feel light and playful
2. **Show progress** - Users should always know where they are
3. **Celebrate contributions** - Make users feel their input matters
4. **Gentle nudges, not demands** - Suggestions, not requirements
5. **Mobile-first** - Touch gestures are primary interaction
6. **Accessibility** - Buttons available for those who can't swipe

---

## Marketing Summary
"Instead of filling out a survey, you play with ideas, influence directions, and see how your voice changes the picture."

---

## Files Already Modified (Reference)

1. **globals.css** - New color palette, animation keyframes
2. **SwipeCard.tsx** - Tinder-style card with drag/throw
3. **SwipeCard.module.css** - Card styling and animations
4. **EvaluationButtons.tsx** - 5-point pastel rating buttons
5. **EvaluationButtons.module.css** - Button styling
6. **SolutionFeedClient.tsx** - Main feed rewritten for single-card flow
7. **SolutionFeed.module.css** - Feed layout and styling
8. **SocialFeed.tsx** - Real-time activity component
9. **SocialFeed.module.css** - Social feed styling

---

## Usage Instructions for Claude Code

When starting a new session, use this prompt:

```
I'm working on the Mass Consensus project at /Users/talyaron/Documents/Freedi-app/apps/mass-consensus

Please read the design specification at [path to this file] and continue implementing the Tinder-style redesign.

Current status: Phase 1 (Core Swipe Experience) is complete.

Next task: Implement Phase 2 - Welcome screens and transitions.

Please:
1. Read the existing SwipeCard.tsx and SolutionFeedClient.tsx to understand the current implementation
2. Create the QuestionIntro.tsx component following the design spec
3. Update the survey flow to include intro screens
4. Maintain the pastel color palette and animation style
```

---

## Appendix: Hebrew Text for Social Feed

```javascript
const hebrewNames = [
  'דני', 'מיכל', 'יוסי', 'שרה', 'אבי', 'רונית',
  'משה', 'תמר', 'עמית', 'נועה', 'גיל', 'יעל',
  'רון', 'ליאת', 'אורי', 'דנה'
];

const actionTexts = {
  voted: ['הצביע/ה', 'השתתף/ה בהצבעה', 'שיתף/ה דעה'],
  suggested: ['הציע/ה שיפור', 'הגיש/ה הצעה'],
  proposed: ['הציע/ה רעיון חדש', 'הוסיף/ה הצעה']
};
```
