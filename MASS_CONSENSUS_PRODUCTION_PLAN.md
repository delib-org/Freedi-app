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

## 2. 📍 Proposals Box - Fixed to Bottom ✅ COMPLETED

### Current State
- Current footer (`FooterMassConsensus.tsx`) uses `position: sticky`
- Input box is located in `InitialQuestion.tsx`

### Tasks

#### 2.1 Design Input Box at Bottom
- [x] Create new component or update `InitialQuestion.tsx`
- [x] Move Textarea to bottom with `position: fixed`
- [x] Add padding-bottom to content so it doesn't hide content

#### 2.2 Textarea Auto-Grow Feature
- [x] Textarea starts small (1 line)
- [x] Grows automatically as text is added
- [x] Stops growing at 8 lines and enables scrolling

#### 2.3 Implementation Details
**Updated Files:**
- `src/view/components/textarea/Textarea.tsx` - Added `minRows` and `maxRows` props for auto-grow with scroll
- `src/view/components/textarea/Textarea.module.scss` - Added `--scrollable` modifier for overflow
- `src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.tsx` - Restructured with fixed bottom layout
- `src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.module.scss` - Added `.fixedInput` styles with shadow and proper positioning

#### 2.4 Relevant Files
```
src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.tsx
src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.module.scss
src/view/components/textarea/Textarea.tsx
src/view/components/textarea/Textarea.module.scss
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

## 📋 Recommended Priority Order

| Priority | Task | Status | Notes |
|----------|------|--------|-------|
| 1 | Enforce proposal submission before evaluation | ✅ Done | Critical for correct user experience |
| 2 | Fixed proposals box at bottom | ✅ Done | UX improvement - auto-grow textarea with scroll |
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
