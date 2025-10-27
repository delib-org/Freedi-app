# Popper-Hebbian System - Implementation Status

## ✅ COMPLETED (Backend & Infrastructure - 100%)

### 1. Data Models & Type Definitions
- ✅ Verified `delib-npm` v5.6.62 includes all required types:
  - `EvidenceType` enum (data, testimony, argument, anecdote, fallacy)
  - `Collections.refinementSessions`
  - `Collections.evidencePosts`
  - `Collections.evidenceVotes`
  - `Statement.evidence` field with full structure
  - `StatementSettings.popperianDiscussionEnabled`

- ✅ Created custom models in `src/models/popperHebbian/`:
  - `RefinementModels.ts` - AI Refinery types
  - `ScoreModels.ts` - Scoring system types
  - All properly typed with Valibot schemas

### 2. Firebase Functions (All Created & Exported)
Located in `functions/src/`:

- ✅ **fn_popperHebbian_analyzeFalsifiability.ts**
  - Analyzes ideas for testability using Gemini 2.0 Flash
  - Returns falsifiability analysis + initial AI message
  - Uses Google Generative AI package

- ✅ **fn_popperHebbian_refineIdea.ts**
  - Conducts Socratic dialogue to refine vague ideas
  - Continues conversation until idea is testable
  - Returns refined idea when ready

- ✅ **fn_popperHebbian_onEvidencePost.ts**
  - Triggers when evidence statement created
  - Auto-classifies evidence type using AI
  - Calculates initial weight based on type
  - Triggers score recalculation for parent

- ✅ **fn_popperHebbian_onVote.ts**
  - Triggers when helpful/not-helpful votes change
  - Recalculates evidence weight based on net votes
  - Updates parent statement score
  - Determines status (looking-good/under-discussion/needs-fixing)

- ✅ **config/gemini.ts**
  - Gemini 2.0 Flash configuration
  - Uses Firebase Functions secrets for API key
  - Ready for production deployment

- ✅ All functions exported in `functions/src/index.ts`

### 3. Dependencies Installed
- ✅ `@google/generative-ai` v0.21.0 in functions
- ✅ `react-markdown` v9.0.0 added to package.json (needs `npm install`)
- ✅ Firebase Functions SDK configured in `src/controllers/db/config.ts`

### 4. Controllers (Frontend Database Layer)
Located in `src/controllers/db/popperHebbian/`:

- ✅ **refineryController.ts**
  - `startRefinementSession()` - Initiates AI refinement
  - `submitRefinementResponse()` - Continues dialogue
  - `publishRefinedIdea()` - Publishes final version

- ✅ **evidenceController.ts**
  - `createEvidencePost()` - Creates statement with evidence field
  - `listenToEvidencePosts()` - Real-time listener
  - `submitVote()` - Helpful/Not Helpful voting
  - `removeVote()` - Remove user vote
  - `getUserVote()` - Get current user's vote

### 5. Settings UI
- ✅ Added "Discussion Framework" category to AdvancedSettings.tsx
- ✅ Toggle for "Enable Popper-Hebbian Discussion Mode"
- ✅ Only shows for `StatementType.question`
- ✅ Helper text explains the feature

### 6. Helper Functions
- ✅ `popperHebbianHelpers.ts` created with:
  - `getSupportLabel()` - Converts -1 to 1 scale to friendly text
  - `getScoreInterpretation()` - Explains total score
  - `getSupportColor()` - Returns CSS class name

---

## 🚧 IN PROGRESS (Frontend UI Components)

### Component Structure Created
```
src/view/pages/statement/components/popperHebbian/
├── popperHebbianHelpers.ts ✅
├── refinery/
│   ├── IdeaRefineryModal.tsx
│   ├── IdeaRefineryModal.module.scss
│   ├── RefinementMessage.tsx
│   └── RefinementMessage.module.scss
└── components/
    ├── IdeaScoreboard/
    │   ├── IdeaScoreboard.tsx
    │   └── IdeaScoreboard.module.scss
    ├── EvidencePost/
    │   ├── EvidencePost.tsx
    │   └── EvidencePost.module.scss
    ├── AddEvidenceModal/
    │   ├── AddEvidenceModal.tsx
    │   └── AddEvidenceModal.module.scss
    └── EvolutionPrompt/
        ├── EvolutionPrompt.tsx
        └── EvolutionPrompt.module.scss
```

---

## 📋 REMAINING WORK

### Phase 1: Core UI Components (Est. 2-3 hours)

1. **IdeaScoreboard Component**
   - Shows overall score (totalScore)
   - Status indicator (looking-good/under-discussion/needs-fixing)
   - Score interpretation text
   - Color-coded visual

2. **EvidencePost Component**
   - Display evidence content
   - Show support level with friendly label
   - Evidence type badge
   - Helpful/Not Helpful voting buttons
   - Net score display
   - Author info

3. **AddEvidenceModal Component**
   - Textarea for evidence text
   - Slider for support level (-1 to 1)
   - Support label updates in real-time
   - Helper text about AI classification
   - Submit button

4. **EvolutionPrompt Component**
   - Shows when status = 'needs-fixing'
   - AI Guide message
   - Summary of main challenge
   - "Create Improved Version" button

### Phase 2: Main Discussion Component (Est. 1-2 hours)

5. **PopperHebbianDiscussion Component**
   - Container for entire Popper-Hebbian UI
   - Shows under option statement description
   - Includes:
     - IdeaScoreboard at top
     - "Add Evidence" button
     - List of evidence posts (sorted by support strength)
     - EvolutionPrompt (conditional)

### Phase 3: AI Refinery (Est. 2-3 hours)

6. **RefinementMessage Component**
   - Chat bubble for AI or user
   - Different styling for each role
   - Markdown support
   - Timestamp

7. **IdeaRefineryModal Component**
   - Full-screen modal
   - Shows original idea
   - Chat history
   - Input area for user responses
   - Completion state with refined idea
   - Publish button

8. **Integration with CreateStatementModal**
   - Intercept option creation when Popper-Hebbian enabled
   - Open IdeaRefineryModal instead of direct creation
   - Save refined idea on completion

### Phase 4: Styling (Est. 1-2 hours)

9. **Create SCSS Modules**
   - Follow design system from `docs/design-guide.md`
   - Use CSS variables (`var(--btn-primary)`, etc.)
   - Mobile-responsive
   - Accessibility compliant

### Phase 5: Security & Deployment (Est. 1 hour)

10. **Firestore Security Rules**
    ```
    match /refinementSessions/{sessionId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
    }

    match /evidencePosts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }

    match /evidenceVotes/{voteId} {
      allow read, write: if request.auth != null;
    }
    ```

11. **Gemini API Key Configuration**
    ```bash
    firebase functions:secrets:set GEMINI_API_KEY
    # Get key from: https://aistudio.google.com/app/apikey
    ```

---

## 🎯 TESTING CHECKLIST

### Unit Tests
- [ ] Evidence weight calculation
- [ ] Status determination logic
- [ ] Support label conversion
- [ ] Vote counting

### Integration Tests
- [ ] Evidence post creation → AI classification
- [ ] Vote submission → Score recalculation
- [ ] Refinement session → AI dialogue → Publication

### E2E Tests
- [ ] Enable Popper-Hebbian on question
- [ ] Create option → AI refinery → Publish
- [ ] Add evidence → Vote → See score update
- [ ] Status changes based on evidence

---

## 📊 ARCHITECTURE OVERVIEW

### Data Flow

```
1. QUESTION with popperianDiscussionEnabled: true
   └── OPTION statements (ideas to discuss)
       └── EVIDENCE statements (with evidence field)
           ├── evidence.support (-1 to 1)
           ├── evidence.evidenceType (auto-classified by AI)
           ├── evidence.evidenceWeight (calculated)
           └── evidence.helpfulCount/notHelpfulCount

2. VOTING
   User votes → evidenceVotes collection
   → Triggers onVoteUpdate function
   → Recalculates weights
   → Updates parent option's popperHebbianScore

3. SCORING
   popperHebbianScore: {
     totalScore: sum of (support * weight),
     status: 'looking-good' | 'under-discussion' | 'needs-fixing',
     lastCalculated: timestamp
   }
```

### AI Integration Points

1. **Idea Refinement** (analyzeFalsifiability + refineIdea)
   - When: User creates option in Popper-Hebbian question
   - Model: Gemini 2.0 Flash
   - Purpose: Ensure ideas are testable

2. **Evidence Classification** (onEvidencePostCreate)
   - When: Evidence statement created
   - Model: Gemini 2.0 Flash
   - Purpose: Auto-classify as data/testimony/argument/anecdote/fallacy

---

## 🚀 DEPLOYMENT STEPS

1. **Install remaining dependencies:**
   ```bash
   npm install
   ```

2. **Set Gemini API key:**
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   # Paste key from https://aistudio.google.com/app/apikey
   ```

3. **Build and deploy functions:**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

4. **Deploy firestore rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Deploy frontend:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

---

## 📝 NOTES

### Design Decisions
- Using Gemini 2.0 Flash for speed and cost-effectiveness
- Evidence stored as Statement objects (not separate collection)
- Scores calculated server-side for security
- Real-time updates via Firestore listeners

### Future Enhancements (Post-MVP)
- User reputation scoring
- Evidence re-use across statements
- Advanced Hebbian ledger
- Analytics dashboard
- Evidence library/database

---

## 🔗 RELATED DOCUMENTS

- Implementation Plan: `docs/Popper-hebbian/implementation-plan.md`
- System Spec: `docs/Popper-hebbian/poper-hebbian-system.md`
- Design Guide: `docs/design-guide.md`
- Project Guidelines: `CLAUDE.md`

---

**Last Updated:** 2025-10-27
**Status:** Backend Complete (100%), Frontend In Progress (30%)
**Next Step:** Create UI components listed in Phase 1
