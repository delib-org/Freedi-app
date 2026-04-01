# WizCol.com - Mass Consensus Production Plan

<div align="center">

![WizCol](https://wizcol.com/logo.png)

**WizCol.com** - Collective Intelligence Platform

</div>

---

## Overview
Development plan for preparing Mass Consensus for production on the **WizCol.com** platform.

---

## 1. 🔒 Enforce Proposal Submission Before Evaluation ✅ COMPLETED

### Current State
- Hook `useEvaluationGuard.ts` exists which checks the `askUserForASolutionBeforeEvaluation` setting
- Component `AddSolutionPrompt.tsx` exists which displays an alert modal
- The logic exists but needs to verify it works in all the right places

### Tasks

#### 1.1 Check Existing Logic
- [x] Verify `useEvaluationGuard` returns correct values
- [x] Check that `askUserForASolutionBeforeEvaluation` setting is saved and read properly from DB
- [x] Verify the guard is activated in `RandomSuggestions.tsx`

#### 1.2 Improve User Experience
- [x] If user hasn't submitted a proposal - redirect them directly to the proposal submission stage
- [x] Add a clear message explaining why they need to submit a proposal first
- [x] Hide navigation buttons to evaluation until user submits a proposal

#### 1.3 Relevant Files
```
src/controllers/hooks/useEvaluationGuard.ts
src/view/components/evaluation/AddSolutionPrompt.tsx
src/view/pages/massConsensus/randomSuggestions/RandomSuggestions.tsx
src/view/pages/massConsensus/MassConsensusVM.ts
```

---

## 2. 📍 Add Solution Modal with Similar Detection ✅ COMPLETED

### Current State
- Replaced fixed bottom input panel with a large "Add a Solution" button
- Modal opens with full similar-solution detection flow
- Background blur effect when modal is open

### Tasks

#### 2.1 Solution Modal Implementation
- [x] Create modal-based solution input instead of bottom panel
- [x] Large "Add a Solution" button fixed at bottom of page
- [x] Modal with check-similar API integration
- [x] Shows similar solutions if found (user can choose existing or add new)
- [x] Background blur effect (`backdrop-filter: blur(8px)`)
- [x] Smooth animations (fade-in for overlay, slide-up for modal)

#### 2.2 Textarea Auto-Grow Feature
- [x] Textarea starts small (2 rows)
- [x] Grows automatically as text is added
- [x] Stops growing at 8 lines and enables scrolling
- [x] Character count display (e.g., "67/500")

#### 2.3 Flow States
The modal handles multiple states:
1. **Input** - User types solution, sees character count, submit when valid
2. **Submitting** - Shows loading indicator while checking for similar solutions
3. **Similar** - Shows similar existing solutions, user can select one or use their own
4. **Success** - Confirmation message, auto-closes modal

#### 2.4 Implementation Details
**Updated Files (apps/mass-consensus):**
- `src/components/question/SolutionPromptModal.tsx` - Full modal with check-similar flow
- `src/components/question/SolutionPromptModal.module.css` - Modal content styles
- `src/components/question/SolutionFeedClient.tsx` - Replaced AddSolutionFlow with button + modal
- `src/components/question/SolutionFeed.module.css` - Button styles with fixed positioning
- `src/components/shared/Modal.module.css` - Added blur effect and animations

#### 2.5 AI-Generated Title & Description
When a user submits a solution, the AI generates:
- **Title** (`statement.statement`): Short 2-5 word rephrased title
- **Description** (`statement.description`): 10-25 word explanation with benefits

**Implementation:**
- [x] `generateTitleAndDescription()` function in `ai-service.ts`
- [x] Language detection (Hebrew/English prompts)
- [x] Higher temperature (0.8) for creative variation
- [x] Fallback handling if AI fails

**AI Configuration:**
- Model: `gemini-2.0-flash` (configured in `functions/.env`)
- API Key: Set via `GOOGLE_API_KEY` in `functions/.env`

#### 2.6 Relevant Files
```
apps/mass-consensus/src/components/question/SolutionPromptModal.tsx
apps/mass-consensus/src/components/question/SolutionFeedClient.tsx
apps/mass-consensus/src/components/question/SimilarSolutions.tsx
apps/mass-consensus/src/components/question/EnhancedLoader.tsx
apps/mass-consensus/src/components/question/SuccessMessage.tsx
apps/mass-consensus/src/components/shared/Modal.tsx
apps/mass-consensus/src/components/shared/Modal.module.css
functions/src/services/ai-service.ts
functions/src/fn_findSimilarStatements.ts
functions/.env (AI_MODEL_NAME, GOOGLE_API_KEY)
```

---

## 3. 🚀 Push to Vercel

### Tasks

#### 3.1 Pre-Deploy Checks
- [ ] Run `npm run check-all` (lint, typecheck, build)
- [ ] Verify all tests pass
- [ ] Verify no TypeScript errors

#### 3.2 Vercel Configuration
- [ ] Verify `vercel.json` file exists with correct settings
- [ ] Check Environment Variables in Vercel
- [ ] Configure appropriate domain/subdomain

#### 3.3 Deploy
```bash
# Build locally first
npm run build

# Push to branch
git add .
git commit -m "Prepare mass-consensus for production"
git push origin claude/mass-consensus-production-013vQPV9qibXPci9x4gAGzZd

# Vercel will auto-deploy from branch (or manual trigger)
```

#### 3.4 Post-Deploy Checks
- [ ] Verify site loads at correct URL
- [ ] Test Mass Consensus functionality end-to-end
- [ ] Test mobile compatibility
- [ ] Check performance (Lighthouse)

---

## 4. 🏗️ Set Up New Wizcol Environment

### Tasks

#### 4.1 Environment Preparation
- [ ] Create new Firebase project (or use existing)
- [ ] Configure Firestore rules
- [ ] Configure Authentication providers
- [ ] Configure Cloud Functions (if needed)

#### 4.2 Environment Variables
- [ ] Create `.env.wizcol` or `.env.production.wizcol` file
- [ ] Configure Firebase config:
  ```
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_STORAGE_BUCKET=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=
  ```

#### 4.3 Relevant Files
```
.env.example
firebase.json
firestore.rules
firestore.indexes.json
```

---

## 5. 🔗 Connect Wizcol and Vercel

### Tasks

#### 5.1 Vercel Project Configuration
- [ ] Create new project in Vercel for wizcol
- [ ] Connect to Git repository
- [ ] Configure deployment branch (production branch)

#### 5.2 Environment Variables in Vercel
- [ ] Copy all environment variables from `.env.wizcol`
- [ ] Configure different variables for Preview/Production

#### 5.3 Domain Configuration
- [ ] Configure custom domain (if applicable)
- [ ] Configure SSL certificate
- [ ] Check DNS settings

#### 5.4 Integration Tests
- [ ] Verify automatic deploy works from push
- [ ] Verify preview deployments work
- [ ] Verify production deploy works

---

## 6. 🌐 Multi-Language Support with Admin Control

### Overview
Enable multi-language support for Mass Consensus with admin ability to set the default language per statement/conversation.

### Tasks

#### 6.1 Admin Default Language Setting
- [ ] Add `defaultLanguage` field to Statement model (in delib-npm if needed)
- [ ] Create language selector component for admin settings
- [ ] Save default language preference to Firestore with statement
- [ ] Load and apply default language when users access the statement

#### 6.2 Language Selection UI
- [ ] Add language dropdown/selector in admin panel (statement settings)
- [ ] Display current default language in settings
- [ ] Support common languages: English, Hebrew, Arabic, Spanish, German, French, etc.
- [ ] Add language labels in their native scripts (e.g., "עברית", "العربية", "Español")

#### 6.3 User Language Experience
- [ ] Apply admin's default language as initial language for new users
- [ ] Allow users to override with their own preference (stored locally)
- [ ] Remember user's language preference per session
- [ ] Handle RTL languages properly (Hebrew, Arabic)

#### 6.4 Translation Infrastructure
- [ ] Ensure all Mass Consensus UI strings are in translation files
- [ ] Add any missing translation keys to language JSON files
- [ ] Verify translations exist for all supported languages
- [ ] Add fallback to English for missing translations

#### 6.5 Technical Implementation
```typescript
// Statement model addition
interface Statement {
  // ... existing fields
  defaultLanguage?: LanguagesEnum; // Admin-set default language
}

// Admin settings component
interface LanguageSettingProps {
  statementId: string;
  currentLanguage: LanguagesEnum;
  onLanguageChange: (lang: LanguagesEnum) => void;
}
```

#### 6.6 Relevant Files
```
src/view/pages/statement/components/settings/statementSettingsAdmin/
src/controllers/general/helpers.ts (language utilities)
src/assets/Languages/*.json (translation files)
src/model/languageModel.ts
delib-npm (Statement type if field needs to be added)
```

---

## 2.7 Post-Evaluation Completion Screen ✅ COMPLETED

### Overview
After user completes evaluating their first batch of solutions, show a completion screen with:
- Celebration animation (checkmark + confetti)
- Achievement badges earned
- "Results coming in X days" message
- Email subscription for notifications

### Implementation

#### Components Created
- [x] `CompletionScreen.tsx` - Main completion modal with celebration, badges, email form
- [x] `AchievementBadge.tsx` - Badge component with 4 badge types
- [x] SCSS styling with animations (confetti, checkmark draw, slide-up)

#### Achievement Badge Types
- **Early Bird** - Among first 50 participants
- **Deep Thinker** - Evaluated 5+ solutions
- **Innovator** - Submitted own solution
- **Team Player** - Completed full flow

#### API Routes Created
- [x] `POST /api/statements/[id]/subscribe` - Subscribe email for result notifications
- [x] `GET /api/statements/[id]/stats` - Get participant count and statistics

#### Integration
- [x] Integrated into `SolutionFeedClient.tsx`
- [x] Triggers after first batch evaluation is complete
- [x] Shows only once per session

#### Relevant Files
```
apps/mass-consensus/src/components/completion/CompletionScreen.tsx
apps/mass-consensus/src/components/completion/AchievementBadge.tsx
apps/mass-consensus/src/components/completion/index.ts
apps/mass-consensus/app/api/statements/[id]/subscribe/route.ts
apps/mass-consensus/app/api/statements/[id]/stats/route.ts
apps/mass-consensus/src/components/question/SolutionFeedClient.tsx
```

---

## 2.8 Public Results Page

### Overview
Create a public-facing results page showing the consensus outcomes for a question.

### Tasks

#### 2.8.1 Results Page Design
- [ ] Show question title and description
- [ ] Display top solutions ranked by consensus score
- [ ] Show participant statistics (total participants, total evaluations)
- [ ] Visual representation (bar charts, progress bars)
- [ ] Responsive design for mobile

#### 2.8.2 Results Page Features
- [ ] Sort options: By consensus, By evaluations, Most recent
- [ ] Filter: Show all vs Top 10
- [ ] Share button (copy link, social share)
- [ ] Export results (CSV, PDF)

#### 2.8.3 Implementation
```
Route: /q/[statementId]/results
Components:
- ResultsHeader.tsx - Question info + stats
- ResultsChart.tsx - Visual representation
- ResultsList.tsx - Ranked solutions list
- ShareResults.tsx - Share/export options
```

#### 2.8.4 Relevant Files
```
apps/mass-consensus/app/q/[statementId]/results/page.tsx (exists - needs enhancement)
apps/mass-consensus/src/components/results/ResultsList.tsx (exists - needs enhancement)
apps/mass-consensus/src/components/results/ResultsChart.tsx (new)
apps/mass-consensus/src/components/results/ShareResults.tsx (new)
```

---

## 2.9 Admin Results Notification System

### Overview
Allow admins to send results to subscribed users with a personal note.

### Data Model

#### Email Subscriptions (Already Implemented)
```typescript
// Collection: resultSubscriptions
interface ResultSubscription {
  email: string;
  statementId: string;
  userId: string;
  createdAt: number;
  notified: boolean;  // Track if notification was sent
  notifiedAt?: number;
}
```

#### Results Notification
```typescript
// Collection: resultNotifications
interface ResultNotification {
  notificationId: string;
  statementId: string;
  adminId: string;
  adminNote: string;      // Personal message from admin
  resultsUrl: string;     // Link to results page
  sentAt: number;
  recipientCount: number; // How many emails sent
}
```

### Tasks

#### 2.9.1 Admin Panel UI
- [ ] List of subscribed emails for a question
- [ ] Text area for admin's personal note/message
- [ ] Preview email before sending
- [ ] Send button with confirmation
- [ ] History of sent notifications

#### 2.9.2 Email Sending
- [ ] Cloud Function to send emails
- [ ] Email template with:
  - Admin's personal note
  - Link to results page
  - Summary of top solutions
  - Unsubscribe link
- [ ] Rate limiting to prevent spam
- [ ] Track delivery status

#### 2.9.3 API Routes
```
POST /api/admin/statements/[id]/notify
  - Send results notification to all subscribers
  - Body: { adminNote: string }

GET /api/admin/statements/[id]/subscribers
  - List all subscribed emails for a question

GET /api/admin/statements/[id]/notifications
  - History of sent notifications
```

#### 2.9.4 Implementation Files
```
apps/mass-consensus/app/api/admin/statements/[id]/notify/route.ts
apps/mass-consensus/app/api/admin/statements/[id]/subscribers/route.ts
apps/mass-consensus/src/components/admin/NotifySubscribersPanel.tsx
functions/src/fn_sendResultsNotification.ts (Cloud Function for email)
```

#### 2.9.5 Email Service Integration
- [ ] Choose email provider (SendGrid, Mailgun, Firebase Extensions)
- [ ] Configure email templates
- [ ] Set up sender domain/email
- [ ] Handle bounces and unsubscribes

---

## 📋 Recommended Priority Order

| Priority | Task | Status | Notes |
|----------|------|--------|-------|
| 1 | Enforce proposal submission before evaluation | ✅ Done | Critical for correct user experience |
| 2 | Add Solution Modal with Similar Detection | ✅ Done | Modal with blur effect, check-similar flow, animations |
| 2.5 | Post-Evaluation Completion Screen | ✅ Done | Badges, email subscription, celebration |
| 2.8 | Public Results Page | Pending | Enhanced results display with charts |
| 2.9 | Admin Results Notification | Pending | Send results to subscribers with note |
| 3 | Tests and checks | Pending | Before deploy |
| 4 | Deploy to Vercel | Pending | Test in real environment |
| 5 | Set up Wizcol environment | Pending | Infrastructure |
| 6 | Connect Wizcol-Vercel | Pending | Final integration |
| 7 | Multi-language support with admin control | Pending | Internationalization |

---

## 🧪 Pre-Production Checklist

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] ESLint passes without errors
- [ ] Build succeeds
- [ ] Tested on mobile
- [ ] Tested on different browsers (Chrome, Firefox, Safari)
- [ ] Complete error handling
- [ ] Analytics configured
- [ ] Performance checked (Lighthouse > 80)
- [ ] Multi-language support verified (RTL and LTR languages)

---

## 📝 Technical Notes

### Main Hook - useEvaluationGuard
```typescript
// src/controllers/hooks/useEvaluationGuard.ts
const { canEvaluate, requiresSolution, hasSubmittedSolution } = useEvaluationGuard(statement);

// canEvaluate = true if:
//   1. askUserForASolutionBeforeEvaluation is false, OR
//   2. askUserForASolutionBeforeEvaluation is true AND user has submitted solution
```

### Stage Flow
```
introduction → question → random-suggestions → top-suggestions → voting → results
```

### Redux State
```typescript
// massConsensusSlice - key selectors
selectRandomStatements
selectCanGetNewSuggestions
selectAllOptionsEvaluated
selectCurrentBatchEvaluationProgress
```

---

*Created: 2025-11-23*
