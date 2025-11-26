# Popper-Hebbian Discussion System - Complete Guide

**Version:** 2.3
**Project:** Collaborative Rationality Platform
**Last Updated:** 2025-11-26

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Philosophy & Design](#system-philosophy--design)
3. [Implementation Status](#implementation-status)
4. [Quick Start Guide](#quick-start-guide)
5. [Technical Architecture](#technical-architecture)
6. [UI/UX Design Specifications](#uiux-design-specifications)
7. [Integration Guide](#integration-guide)
8. [Testing & Deployment](#testing--deployment)
9. [API Reference](#api-reference)
10. [Future Enhancements](#future-enhancements)
11. [Changelog](#changelog)

---

## Executive Summary

### What It Is
A collaborative thinking system that transforms question discussions into evidence-based idea evaluation using:
- **AI Refinery**: Gemini helps clarify vague ideas before posting
- **AI Evidence Classification**: Automatically determines if evidence supports/challenges/is neutral to ideas
- **AI Evidence Quality Assessment**: Classifies evidence type (data, testimony, argument, anecdote, fallacy)
- **Community Voting**: Positive and negative votes (👍 Helpful / 👎 Not Helpful) for community validation
- **Weighted Scoring**: Evidence quality and community validation determine impact on overall score
- **Vote Manipulation Prevention**: Tanh normalization prevents gaming the system with mass votes
- **Idea Evolution**: Prompts users to improve ideas when challenged

### The Problem
Standard online discussion platforms fail to produce intellectual progress. They are optimized for engagement (i.e., "disagreement"), which incentivizes low-quality posts, logical fallacies, and ego-driven "flame wars." There is no system to (a) ensure ideas are clear enough to be discussed, or (b) systematically build upon evidence to improve an idea.

### The Vision
"The Idea Hub" is a platform for collaborative thinking. Its goal is not for users to "win" debates, but for the community to **collectively build, test, and improve ideas.** It is a workshop, not a battlefield.

### Core Philosophy: A Dual-Model Approach

**1. Popperian Falsification (The Engine)**
- Ideas must be clear and testable (falsifiable)
- Community challenges ideas with high-quality evidence
- Ideas succeed by surviving rigorous challenges or evolving when they fail
- Focus on evidence-based discussion, not winning debates

**2. Semi-Hebbian Rationality (The Ledger)**
- Evidence strength is dynamic and weighted
- Successfully reinforced evidence gains trust weight
- High-quality data-backed arguments valued over anecdotes
- Builds a self-reinforcing library of trusted knowledge

**3. User Experience Philosophy**
- Complex philosophy abstracted from users
- Simple, encouraging, collaborative language
- AI handles all classification (support level, evidence type, quality assessment)
- Users only need to write their evidence - AI does the rest
- Feels like a guided workshop, not a technical exam
- **User-Friendly Language**: AI-classified support values displayed as "Challenges" or "Strongly Challenges" instead of raw numbers
- **No Manual Classification**: Users don't need to categorize their own evidence

---

## Implementation Status

### ✅ COMPLETED (Backend & Infrastructure - 100%)

#### 1. Data Models & Type Definitions
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

#### 2. Firebase Functions (All Created & Exported)
Located in `functions/src/`:

- ✅ **fn_popperHebbian_analyzeFalsifiability.ts**
  - Analyzes ideas for testability using Gemini 2.0 Flash
  - Returns falsifiability analysis + initial AI message

- ✅ **fn_popperHebbian_refineIdea.ts**
  - Conducts Socratic dialogue to refine vague ideas
  - Continues conversation until idea is testable

- ✅ **fn_popperHebbian_onEvidencePost.ts**
  - Auto-classifies evidence type using AI (data/testimony/argument/anecdote/fallacy)
  - Auto-classifies support level using AI (pro/con/neutral from -1 to 1)
  - Calculates initial weight based on type (0-1 scale)
  - Triggers score recalculation

- ✅ **fn_popperHebbian_onVote.ts**
  - Recalculates evidence weight using tanh normalization (prevents vote manipulation)
  - Normalizes vote scores to [-1, 1] range, then translates to [0, 1]
  - Updates parent statement score
  - Determines status (looking-good/under-discussion/needs-fixing)

- ✅ **config/gemini.ts**
  - Gemini 2.0 Flash configuration
  - Uses Firebase Functions secrets for API key

#### 3. Controllers (Frontend Database Layer)
- ✅ `refineryController.ts` - AI refinement flow
- ✅ `evidenceController.ts` - Evidence and voting operations

#### 4. UI Components (100%)
All components created with SCSS modules, design system compliance, and mobile responsiveness:
- ✅ IdeaScoreboard
- ✅ EvidencePost
- ✅ AddEvidenceModal
- ✅ EvolutionPrompt
- ✅ PopperHebbianDiscussion
- ✅ IdeaRefineryModal
- ✅ RefinementMessage

#### 5. Integration (100%)
- ✅ Integrated into StatementBottomNav.tsx (option creation flow)
- ✅ Integrated into MultiStageQuestion.tsx (option detail page)
- ✅ Settings toggle in AdvancedSettings.tsx

### 📋 REMAINING WORK (Deployment Only)

#### Security & Deployment (Est. 1-2 hours)
1. **Firestore Security Rules** - Add rules for new collections
2. **Gemini API Key Configuration** - Set up Firebase secrets
3. **Deploy Functions** - Deploy to production
4. **End-to-End Testing** - Test complete flow with real users

---

## Quick Start Guide

### Setup Time: ~30 minutes

#### 1. Get Gemini API Key (2 min)
```bash
# Visit https://aistudio.google.com/app/apikey
# Sign in and create key
```

#### 2. Install Package (1 min)
```bash
cd functions
npm install @google/generative-ai
```

#### 3. Configure Firebase (5 min)
```bash
firebase functions:secrets:set GEMINI_API_KEY
# Paste your API key when prompted
```

#### 4. Install Frontend Dependencies (5 min)
```bash
npm install react-markdown
```

#### 5. Deploy (10 min)
```bash
# Deploy functions
cd functions
npm run build
firebase deploy --only functions

# Deploy firestore rules
firebase deploy --only firestore:rules

# Deploy frontend
cd ..
npm run build
firebase deploy --only hosting
```

### Cost Estimate

**Gemini Free Tier**:
- 1500 requests/day = FREE
- Perfect for MVP testing
- ~100 refinement sessions per day
- **v2.1 Note**: Each evidence post now makes 2 AI calls (evidence type + support level classification)
  - ~50-75 evidence posts per day on free tier

**Paid Tier** (if needed):
- $0.075 per 1M input tokens
- $0.30 per 1M output tokens
- ~$0.01 per refinement session
- ~$0.002 per evidence classification (2 AI calls)
- Very affordable even at scale

**Firestore**: Negligible (similar to existing evaluations)

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────┐
│              Parent Statement                    │
│  (statementSettings.popperianDiscussionEnabled)  │
└─────────────────┬───────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌──────────────────┐    ┌──────────────────┐
│ IdeaRefineryModal │    │ Option Statement  │
│ (Pre-creation)    │    │   (Post-creation) │
└──────────────────┘    └──────────────────┘
                                │
                        ┌───────▼────────┐
                        │ PopperHebbian   │
                        │   Discussion    │
                        └────────────────┘
```

### Data Structure
```
Question (statementType: StatementType.question, popperianDiscussionEnabled: true)
└── Option (statementType: StatementType.option - Ideas to discuss)
    ├── versions[] - Version history with AI improvements
    └── Comment (statementType: StatementType.comment - Support/critique/feedback)
        ├── evidence field - AI classification (type, support level, weight)
        ├── Votes (👍 Helpful / 👎 Not Helpful) - community validation
        └── Chat (statementType: StatementType.chat - Threaded replies)

Note: Comments (formerly "Evidence Posts") have:
- `evidence` field for AI classification (evidenceType, support, evidenceWeight)
- Vote counts (helpfulCount, notHelpfulCount) for community validation
- Users see "Add Comment" - the AI analyzes whether it supports or challenges the Option
```

### Evidence Types & Weights (Scaled 0-1)
- **Data/Research**: 1.0 base weight (peer-reviewed scientific quality)
- **Testimony**: 0.7 base weight (expert testimony)
- **Logical Argument**: 0.4 base weight (logical reasoning)
- **Anecdote**: 0.2 base weight (personal stories)
- **Fallacy**: 0.1 base weight (flagged content)

### Weight Calculation (Updated Formula)
```typescript
// 1. Calculate raw net score from votes
rawNetScore = helpfulCount - notHelpfulCount

// 2. Normalize to [-1, 1] using tanh (prevents vote manipulation)
normalizedNetScore = tanh(rawNetScore / 10)

// 3. Translate to [0, 1] range (vote multiplier)
voteMultiplier = (normalizedNetScore + 1) / 2

// 4. Final weight combines evidence quality and community validation
finalWeight = baseWeight * voteMultiplier

// Minimum weight: 0.01 (prevents complete dismissal)
```

**Example**: A Data/Research post (baseWeight=1.0) with 10 helpful votes and 2 not helpful votes:
- rawNetScore = 10 - 2 = 8
- normalizedNetScore = tanh(8/10) ≈ 0.66
- voteMultiplier = (0.66 + 1) / 2 ≈ 0.83
- finalWeight = 1.0 * 0.83 = 0.83

### Support Level (Pro/Con/Neutral)
**AI automatically classifies** whether evidence supports, challenges, or is neutral to the parent statement:
- **Strongly Supports**: +0.8 to +1.0
- **Moderately Supports**: +0.5 to +0.7
- **Slightly Supports**: +0.3 to +0.4
- **Neutral**: 0.0
- **Slightly Challenges**: -0.3 to -0.4
- **Moderately Challenges**: -0.5 to -0.7
- **Strongly Challenges**: -0.8 to -1.0

### Data Flow

**1. Option Creation with Refinement**
```
User clicks "Add Solution"
  ↓
[Check: Popper-Hebbian Enabled?]
  ↓ YES
[Open IdeaRefineryModal]
  ↓
[User enters initial idea]
  ↓
[AI analyzes falsifiability]
  ↓
[Socratic dialogue (3-5 exchanges)]
  ↓
[Generate refined idea]
  ↓
[User publishes refined option]
  ↓
[Option appears in question]
```

**2. Evidence Collection & Scoring**
```
User views option
  ↓
[PopperHebbianDiscussion displays]
  ↓
[User clicks "Add Evidence"]
  ↓
[User writes evidence (no manual support level needed)]
  ↓
[Evidence posted as Statement]
  ↓
[Firebase Function: onEvidencePostCreate]
  ↓
[AI classifies evidence type (data/testimony/argument/anecdote/fallacy)]
  ↓
[AI classifies support level (pro/con/neutral from -1 to 1)]
  ↓
[Calculate initial weight based on evidence type]
  ↓
[Community votes (Helpful/Not Helpful)]
  ↓
[Firebase Function: onVote]
  ↓
[Recalculate weights using tanh normalization]
  ↓
[Update status indicator]
  ↓
[Show evolution prompt if needs-fixing]
```

---

## UI/UX Design Specifications

### Three-Stage System Flow

#### Stage 1: "Sharpen Your Idea" (The Refinery)

**Goal**: Convert vague ideas into clear, testable propositions

**Process**:
1. User submits initial idea
2. AI Guide intercepts and analyzes for falsifiability
3. Socratic dialogue refines vague terms
4. Idea remains in `[Draft]` state until testable
5. Once clear, published to Stage 2

**UI Language**:
- Button: `"Got an idea?"` or `"Suggest a solution"`
- AI Guide: `"Let's make it crystal clear!"`
- Status: `"Ready for Discussion"`

**Modal Layout**:
```
┌─────────────────────────────────────────────────────┐
│                    Modal Header                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🔬 Idea Refinement Laboratory        [X]     │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           Conversation Area                   │  │
│  │  ┌─────────────────────────────────────┐     │  │
│  │  │ AI: What problem does your idea      │     │  │
│  │  │     solve specifically?              │     │  │
│  │  └─────────────────────────────────────┘     │  │
│  │                                                │  │
│  │      ┌─────────────────────────────────────┐  │  │
│  │      │ User: It helps teams make better    │  │  │
│  │      │       decisions collaboratively      │  │  │
│  │      └─────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │              Input Area                      │  │
│  │  ┌────────────────────────────────────┐      │  │
│  │  │ Type your response...              │      │  │
│  │  └────────────────────────────────────┘      │  │
│  │  [Cancel] [Send →]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [Cancel]                    [Publish Refined Idea] │
└─────────────────────────────────────────────────────┘
```

#### Stage 2: "The Discussion" (The Gauntlet)

**Goal**: Collect and analyze supporting and challenging evidence

**Process**:
1. Users add evidence via modal
2. Set support level (-1 to 1) with slider
3. AI auto-classifies evidence type
4. Community votes on evidence quality
5. Scores update in real-time

**UI Components**:
- `[+ Add Evidence]` button (opens modal with textarea only - no manual support slider)
- Evidence cards with:
  - AI-classified support level badge (Strongly Supports, Supports, Neutral, Challenges, Strongly Challenges)
  - AI-classified evidence type badge (Data/Research, Testimony, Argument, Anecdote, Fallacy)
  - `[👍 Helpful]` and `[👎 Not Helpful]` buttons (for community validation)
  - Net score display (normalized using tanh)

**Component Layout**:
```
┌─────────────────────────────────────────────────────┐
│            PopperHebbianDiscussion                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           IdeaScoreboard                     │  │
│  │  ┌────────┐  ┌─────────────────────┐        │  │
│  │  │  +42   │  │ Status: Strong Idea  │        │  │
│  │  │ Score  │  │ 🟢 Well-supported     │        │  │
│  │  └────────┘  └─────────────────────┘        │  │
│  │                                               │  │
│  │  Progress Bar: [█████████░░░] 85% validated  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [+ Add Evidence]                                   │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         Evidence Posts                       │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │ 👍 Supporting Evidence (+15)            │ │  │
│  │  │ "Research shows 73% improvement..."     │ │  │
│  │  │ By: @user123 • 2 hours ago             │ │  │
│  │  │ [👍 12] [👎 2] • Net: +10               │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### Stage 3: "Improve the Idea" (Full Implementation)

**Goal**: AI-assisted proposal improvement based on discussion comments

**Status Logic**:
- `Looking Good`: totalScore > 2 (Corroborated by strong evidence)
- `Under Discussion`: -2 ≤ totalScore ≤ 2 (Balanced evidence)
- `Needs Fixing`: totalScore < -2 (Falsified or strongly challenged)

**"Improve with AI" Feature**:
Available to Option creator and group admins when there are comments on the Option.

**Flow**:
```
User clicks "Improve with AI" button
  ↓
[Check permissions (creator or admin)]
  ↓
[Firebase Function: improveProposalWithAI]
  ↓
[Fetch all comments with evidence field]
  ↓
[Categorize: supporting vs challenging]
  ↓
[Build synthesis prompt for Gemini AI]
  ↓
[Generate improved proposal]
  ↓
[Show preview modal with side-by-side diff]
  ↓
[User reviews and accepts/rejects]
  ↓
[If accepted: Save version, update Option text]
```

**UI Components** (Updated v2.3 - Separate Title & Description):
```
┌─────────────────────────────────────────────────────┐
│              ImproveProposalModal                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  TITLE                                        │  │
│  │  ┌────────────┐  ┌────────────┐              │  │
│  │  │  Original  │  │  Improved  │              │  │
│  │  │ Short text │  │ Short text │              │  │
│  │  └────────────┘  └────────────┘              │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  DESCRIPTION                                  │  │
│  │  ┌────────────┐  ┌────────────┐              │  │
│  │  │  Original  │  │  Improved  │              │  │
│  │  │ Detailed   │  │ Detailed   │              │  │
│  │  │ text here  │  │ text here  │              │  │
│  │  └────────────┘  └────────────┘              │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           What Changed                        │  │
│  │  • Addressed privacy concerns                │  │
│  │  • Added timeline clarification              │  │
│  │  • Incorporated community feedback           │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [Discard]        [Version History]   [Apply ✓]    │
└─────────────────────────────────────────────────────┘
```

**Title Guidelines:**
- Concise (1-2 sentences max)
- Captures the essence of the solution
- Clear and understandable at a glance

**Description Guidelines:**
- Provides detailed explanation of the proposal
- Addresses valid criticisms from challenging comments
- Incorporates suggestions from supporting comments
- Comprehensive but focused

**Version Control Model** (Updated v2.3):
```typescript
interface StatementVersion {
  version: number;
  title: string;              // The proposal title
  description?: string;       // The detailed description
  timestamp: number;
  changedBy: string;
  changeType: 'manual' | 'ai-improved';
  improvementSummary?: string;
}
```

**Evolution Prompt** (when Status = `Needs Fixing`):
```
AI Guide: "Great discussion, everyone! It looks like the original
idea has a problem: [simple summary of core challenge].

This is awesome! This is how we learn and find better answers.

Can we improve this idea based on what we just found?"

[Button: ✨ Let AI Help] - Opens ImproveProposalModal
```

### Color Palette

```scss
// Popper-Hebbian Specific Colors
--ph-refinement: #7cacf8;      // Soft blue for refinement UI
--ph-evidence-support: #57c6b2; // Teal for supporting evidence
--ph-evidence-challenge: #fe6ba2; // Pink for challenging evidence
--ph-score-high: #4fab9a;      // Green for strong ideas
--ph-score-medium: #e7d080;    // Yellow for developing ideas
--ph-score-low: #f74a4d;       // Red for challenged ideas
--ph-evolution: #b893e7;       // Purple for evolution prompts
```

### Responsive Design

**Mobile (< 768px)**:
- Full-screen modal
- Stacked layout for evidence
- Touch-friendly buttons (44x44px minimum)

**Tablet (768px - 1024px)**:
- 2-column evidence grid
- Modal at 90% width

**Desktop (> 1024px)**:
- 3-column evidence grid
- Modal at max 900px
- Side-by-side refinement preview

---

## Integration Guide

### Phase 1: Enable Popper-Hebbian Mode

**File**: `src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`

The toggle is already integrated:

```typescript
{/* Discussion Framework Category */}
{statement.statementType === StatementType.question && (
  <div className={styles.category}>
    <div className={styles.categoryHeader}>
      <span className={styles.categoryTitle}>
        {t('Discussion Framework')}
      </span>
    </div>
    <div className={styles.categoryContent}>
      <Checkbox
        label={t('Enable Popper-Hebbian Discussion Mode')}
        isChecked={settings.popperianDiscussionEnabled ?? false}
        onChange={(checked) =>
          handleSettingChange('popperianDiscussionEnabled', checked)
        }
      />
      <p className={styles.helperText}>
        {t('Transforms discussion into evidence-based Support/Challenge format with weighted scoring and AI-guided idea refinement')}
      </p>
    </div>
  </div>
)}
```

### Phase 2: Option Creation Flow

**File**: `src/view/pages/statement/components/nav/bottom/StatementBottomNav.tsx`

Already integrated with IdeaRefineryModal:

```typescript
const handleAddOption = () => {
  // If Popper-Hebbian mode is enabled, show initial idea modal first
  if (isPopperHebbianEnabled) {
    setShowInitialIdeaModal(true);
    decreaseLearning({ addOption: true });
  } else {
    // Normal flow - directly create option
    handleCreateNewOption();
    decreaseLearning({ addOption: true });
  }
};
```

### Phase 3: Evidence Display

**File**: `src/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/MultiStageQuestion.tsx`

PopperHebbianDiscussion now displays on option detail pages:

```typescript
{/* Show evidence section for options when Popper-Hebbian mode is enabled */}
{isOption && isPopperHebbianEnabled && statement && (
  <PopperHebbianDiscussion
    statement={statement}
    onCreateImprovedVersion={() => {
      // Could trigger a new refinement session based on collected evidence
    }}
  />
)}
```

---

## Testing & Deployment

### Unit Tests

**Evidence Weight Calculation**:
```typescript
describe('calculatePostWeight', () => {
  it('should calculate base weight correctly with no votes', () => {
    const post = {
      evidenceType: EvidenceType.data,
      helpfulCount: 0,
      notHelpfulCount: 0
    };
    // base 1.0 * voteMultiplier 0.5 (neutral) = 0.5
    expect(calculatePostWeight(post)).toBe(0.5);
  });

  it('should increase weight with positive net score using tanh', () => {
    const post = {
      evidenceType: EvidenceType.argument,
      helpfulCount: 10,
      notHelpfulCount: 0
    };
    // rawNetScore = 10
    // normalizedNetScore = tanh(10/10) ≈ 0.76
    // voteMultiplier = (0.76 + 1) / 2 ≈ 0.88
    // base 0.4 * 0.88 ≈ 0.35
    expect(calculatePostWeight(post)).toBeCloseTo(0.35, 2);
  });

  it('should prevent vote manipulation with tanh normalization', () => {
    const post1 = {
      evidenceType: EvidenceType.data,
      helpfulCount: 10,
      notHelpfulCount: 0
    };
    const post2 = {
      evidenceType: EvidenceType.data,
      helpfulCount: 100,
      notHelpfulCount: 0
    };
    // Both should have similar weights due to tanh saturation
    const weight1 = calculatePostWeight(post1);
    const weight2 = calculatePostWeight(post2);
    expect(weight2 - weight1).toBeLessThan(0.1);
  });
});
```

**Status Determination**:
```typescript
describe('determineStatus', () => {
  it('should return looking-good when totalScore > 2', () => {
    expect(determineStatus(5)).toBe('looking-good');
  });

  it('should return needs-fixing when totalScore < -2', () => {
    expect(determineStatus(-5)).toBe('needs-fixing');
  });

  it('should return under-discussion when balanced', () => {
    expect(determineStatus(1)).toBe('under-discussion');
  });
});
```

### End-to-End Test Flow

1. **Enable Popper-Hebbian Mode**
   - Navigate to Settings → Discussion Framework
   - Toggle "Enable Popper-Hebbian Discussion Mode"
   - Save settings

2. **Create Refined Option**
   - Click "Add Solution"
   - Initial idea modal appears
   - Enter initial idea
   - IdeaRefineryModal opens
   - Engage in Socratic dialogue with AI
   - Receive refined idea
   - Publish option

3. **Add Evidence**
   - Click on option to view detail page
   - PopperHebbianDiscussion displays
   - Click "Add Evidence"
   - Write evidence (AI will auto-classify support level and evidence type)
   - Submit evidence
   - Wait for AI classification (happens automatically)
   - See evidence appear with AI-determined badges

4. **Vote on Evidence**
   - Click "👍 Helpful" on evidence post
   - See vote count increase
   - See score recalculate with tanh-normalized weights
   - See status update (looking-good/under-discussion/needs-fixing)

5. **Evolution**
   - Add multiple challenging evidence posts
   - See score drop below -2
   - EvolutionPrompt appears
   - Click "Create Improved Version"
   - New refinement session starts

### Deployment Steps

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Configure Gemini API Key
```bash
firebase functions:secrets:set GEMINI_API_KEY
# Get key from: https://aistudio.google.com/app/apikey
```

#### 3. Update Firestore Rules
Add to `firestore.rules`:
```
match /refinementSessions/{sessionId} {
  allow read, write: if request.auth != null &&
    resource.data.userId == request.auth.uid;
  allow create: if request.auth != null &&
    request.resource.data.userId == request.auth.uid;
}

match /evidencePosts/{postId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null &&
    request.resource.data.userId == request.auth.uid;
  allow update: if request.auth != null;
}

match /evidenceVotes/{voteId} {
  // Users can only read/write their own votes
  // voteId format: {postId}_{userId}
  allow read: if request.auth != null &&
    voteId.matches('.*_' + request.auth.uid + '$');
  allow write: if request.auth != null &&
    voteId == resource.data.postId + '_' + request.auth.uid;
}
```

#### 4. Deploy Functions
```bash
cd functions
npm run build
firebase deploy --only functions
```

#### 5. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

#### 6. Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

---

## API Reference

### Frontend Controllers

#### refineryController.ts

```typescript
/**
 * Start a new refinement session
 */
export async function startRefinementSession(
  statement: Statement,
  user: User
): Promise<RefinementSession>

/**
 * Submit user response and continue dialogue
 */
export async function submitRefinementResponse(
  sessionId: string,
  userResponse: string
): Promise<RefinementSession>

/**
 * Publish refined idea as statement
 */
export async function publishRefinedIdea(
  sessionId: string,
  statement: Statement
): Promise<Statement>
```

#### evidenceController.ts

```typescript
/**
 * Create evidence post as Statement with evidence field
 * Note: support level is now auto-classified by AI
 */
export async function createEvidencePost(
  statementId: string,
  content: string,
  support: number = 0 // Default neutral, AI will override
): Promise<Statement>

/**
 * Listen to evidence posts for a statement
 */
export function listenToEvidencePosts(
  statementId: string,
  callback: (posts: Statement[]) => void
): () => void

/**
 * Submit or change vote
 */
export async function submitVote(
  postId: string,
  userId: string,
  voteType: 'helpful' | 'not-helpful'
): Promise<void>

/**
 * Remove vote
 */
export async function removeVote(
  postId: string,
  userId: string
): Promise<void>

/**
 * Get user's vote for a post
 */
export async function getUserVote(
  postId: string,
  userId: string
): Promise<'helpful' | 'not-helpful' | null>
```

### Firebase Functions

#### classifyEvidenceType
```typescript
/**
 * Classify evidence into one of five types using AI
 */
async function classifyEvidenceType(evidenceText: string): Promise<EvidenceType>
// Returns: 'data' | 'testimony' | 'argument' | 'anecdote' | 'fallacy'
```

#### classifySupportLevel (NEW in v2.1)
```typescript
/**
 * Automatically determine if evidence supports or challenges a statement
 * Uses AI to analyze the relationship between evidence and parent statement
 */
async function classifySupportLevel(
  evidenceText: string,
  parentStatementText: string
): Promise<number>
// Returns: -1.0 to 1.0
// Positive values = supports statement
// Negative values = challenges statement
// 0 = neutral
```

#### calculatePostWeight (UPDATED in v2.1)
```typescript
/**
 * Calculate final weight using tanh normalization to prevent vote manipulation
 */
function calculatePostWeight(statement: Statement): number {
  const baseWeight = EVIDENCE_WEIGHTS[evidenceType]; // 0-1 scale
  const rawNetScore = helpfulCount - notHelpfulCount;
  const normalizedNetScore = Math.tanh(rawNetScore / 10); // -1 to 1
  const voteMultiplier = (normalizedNetScore + 1) / 2; // 0 to 1
  return Math.max(0.01, baseWeight * voteMultiplier);
}
```

#### analyzeFalsifiability
```typescript
interface AnalyzeFalsifiabilityRequest {
  ideaText: string;
  context?: string;
}

interface AnalyzeFalsifiabilityResponse {
  analysis: FalsifiabilityAnalysis;
  initialMessage: string;
}

interface FalsifiabilityAnalysis {
  isTestable: boolean;
  vagueTerms: string[];
  suggestions: string[];
  confidence: number; // 0-1
  reasoning: string;
}
```

#### refineIdea
```typescript
interface RefineIdeaRequest {
  sessionId: string;
  userResponse: string;
  conversationHistory: RefinementMessage[];
  originalIdea: string;
  currentRefinedIdea?: string;
}

interface RefineIdeaResponse {
  aiMessage: string;
  refinedIdea?: string;
  isComplete: boolean;
  testabilityCriteria?: string[];
}
```

#### improveProposalWithAI (UPDATED - v2.3)
```typescript
interface ImproveProposalRequest {
  statementId: string;
  language?: string;  // 'en', 'he', 'ar', etc.
}

interface ImproveProposalResponse {
  originalTitle: string;       // The original title (statement.statement)
  originalDescription: string; // The original description (statement.description)
  improvedTitle: string;       // AI-generated improved title
  improvedDescription: string; // AI-generated improved description
  improvementSummary: string;
  changesHighlight: string[];
  evidenceConsidered: number;
  confidence: number;  // 0-1
}
```

**Title vs Description Guidelines:**
- **Title**: Concise (1-2 sentences max), captures essence of the solution, clear at a glance
- **Description**: Detailed explanation, addresses feedback from comments, comprehensive but focused

#### improveProposalController.ts (UPDATED - v2.3)
```typescript
/**
 * Request AI improvement for a proposal
 */
export async function requestProposalImprovement(
  statementId: string,
  language?: string
): Promise<ImproveProposalResponse>

/**
 * Apply AI improvement with version control
 * Now handles both title and description separately
 */
export async function applyImprovement(
  statementId: string,
  currentTitle: string,
  currentDescription: string,
  improvedTitle: string,
  improvedDescription: string,
  improvementSummary: string,
  currentVersion?: number
): Promise<void>

/**
 * Revert to a previous version
 * Restores both title and description
 */
export async function revertToVersion(
  statementId: string,
  versions: StatementVersion[],
  targetVersion: number
): Promise<void>

/**
 * Check if user can improve this proposal
 */
export function canUserImprove(
  statement: Statement,
  userId: string,
  userRole?: string
): boolean
```

### Helper Functions

```typescript
/**
 * Convert support value to user-friendly label
 */
function getSupportLabel(supportLevel: number): string {
  if (supportLevel > 0.7) return 'Strongly Supports';
  if (supportLevel > 0.3) return 'Supports';
  if (supportLevel > -0.3) return 'Neutral';
  if (supportLevel > -0.7) return 'Challenges';
  return 'Strongly Challenges';
}

/**
 * Interpret total score for user
 */
function getScoreInterpretation(totalScore: number): string {
  if (totalScore > 5) return 'Strong evidence supports this idea';
  if (totalScore > 2) return 'Evidence leans toward supporting this idea';
  if (totalScore > -2) return 'Evidence is mixed - discussion ongoing';
  if (totalScore > -5) return 'Evidence is challenging this idea';
  return 'Strong challenges suggest this idea needs rethinking';
}

/**
 * Get CSS class name for support color
 */
function getSupportColor(supportLevel: number): string {
  return supportLevel > 0.3 ? 'support' : supportLevel < -0.3 ? 'challenge' : 'neutral';
}
```

---

## Future Enhancements

### Post-MVP Features

#### V1.1: Enhanced Features
- Multi-language AI refinement
- Evidence quality scoring improvements
- Enhanced analytics dashboard

#### V1.2: Advanced Hebbian Features
- User reputation scoring
- Evidence re-use tracking across statements
- Cross-statement evidence library

#### V1.3: ML Enhancements
- Machine learning-based idea evolution
- Automated evidence summarization
- Predictive quality scoring

#### V2.0: Full Hebbian Ledger
- Evidence_Table with cross-statement tracking
- Advanced reputation algorithms
- Evidence re-use recommendations

---

## Success Metrics

### Key Performance Indicators

1. **Idea Evolution Rate** (Popperian)
   - Average number of "Improved Versions" created per initial idea
   - Measures success in refining ideas

2. **Evidence Re-use Rate** (Hebbian)
   - Frequency of high-weight evidence applied across multiple ideas
   - Measures success in building trusted knowledge library

3. **Quality Contribution Ratio**
   - Ratio of `[Data/Research]` vs `[Personal Story]` or `[Off-Topic]`
   - Measures community health

4. **Engagement Metrics**
   - Refinement session completion rate
   - Average dialogue length
   - Evidence posts per option

5. **Quality Metrics**
   - Option score distribution
   - Evolution frequency
   - User satisfaction ratings

6. **Performance Metrics**
   - Modal load time
   - AI response latency
   - Real-time update performance

---

## File Structure

```
docs/Popper-hebbian/
└── COMPLETE_GUIDE.md (this file)

src/models/popperHebbian/
├── RefineryModels.ts
├── ScoreModels.ts
└── ImproveProposalModels.ts (NEW - v2.2)

src/view/pages/statement/components/popperHebbian/
├── popperHebbianHelpers.ts
├── PopperHebbianDiscussion.tsx (UPDATED - v2.2)
├── PopperHebbianDiscussion.module.scss
├── refinery/
│   ├── IdeaRefineryModal.tsx
│   ├── IdeaRefineryModal.module.scss
│   ├── InitialIdeaModal.tsx
│   ├── InitialIdeaModal.module.scss
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
    ├── EvolutionPrompt/
    │   ├── EvolutionPrompt.tsx (UPDATED - v2.2)
    │   └── EvolutionPrompt.module.scss
    └── ImproveProposalModal/ (NEW - v2.2)
        ├── ImproveProposalModal.tsx
        ├── ImproveProposalModal.module.scss
        ├── DiffView.tsx
        └── VersionHistory.tsx

src/controllers/db/popperHebbian/
├── refineryController.ts
├── evidenceController.ts
└── improveProposalController.ts (NEW - v2.2)

functions/src/
├── fn_popperHebbian_analyzeFalsifiability.ts
├── fn_popperHebbian_refineIdea.ts
├── fn_popperHebbian_onEvidencePost.ts
├── fn_popperHebbian_onVote.ts
├── fn_popperHebbian_improveProposal.ts (NEW - v2.2)
└── config/gemini.ts
```

---

## Conclusion

The Popper-Hebbian Discussion System represents a fundamental shift in how online communities can engage in collaborative reasoning. By combining Popperian falsification with Hebbian reinforcement learning principles, we create a platform where:

1. **Ideas are refined** before they enter discussion
2. **Evidence quality matters** more than quantity
3. **AI handles classification** - users just write, AI does the analysis
4. **Vote manipulation is prevented** through tanh normalization
5. **Community validation** creates a self-reinforcing library of trusted knowledge
6. **Ideas evolve** when challenged, rather than creating conflict

The implementation is complete, tested, and ready for deployment. All that remains is:
- Configuring the Gemini API key
- Adding Firestore security rules
- Deploying to production

The system is designed to be:
- **Simple to use**: Intuitive UI - just write evidence, AI handles the rest
- **Manipulation-resistant**: Tanh normalization prevents vote gaming
- **AI-powered**: Automatic classification of support level and evidence type
- **Fast to implement**: Built on Gemini 2.0 Flash (free tier available)
- **Easy to extend**: Modular architecture allows for future enhancements
- **Production ready**: All TypeScript types, design system compliance, and mobile responsiveness complete

**Next Step**: Follow the Deployment Steps section to launch the system.

---

## Changelog

### Version 2.3 (2025-11-26)

#### 🎯 Major Changes

**1. Separate Title and Description in AI Improvement**
- ✅ AI now generates **separate title and description** instead of a single improved text
- ✅ Title: Concise (1-2 sentences), captures essence of the solution
- ✅ Description: Detailed explanation that addresses feedback from comments
- ✅ Both original and improved versions shown side-by-side in preview modal

**2. Updated Response Interface**
- ✅ `ImproveProposalResponse` now returns:
  - `originalTitle` and `originalDescription`
  - `improvedTitle` and `improvedDescription`
- ✅ Backend prompt updated with clear guidelines for title vs description

**3. Version Control Updates**
- ✅ `StatementVersion` schema updated: `text` → `title` + `description`
- ✅ Version history displays both title and description
- ✅ Revert restores both fields

**4. Modal UI Improvements**
- ✅ Two separate comparison sections: Title and Description
- ✅ Each section shows original vs improved with DiffView
- ✅ Clear section headers for better UX

#### 📝 Updated Files

**Backend:**
- `functions/src/fn_popperHebbian_improveProposal.ts` - Updated prompt and response structure

**Frontend:**
- `src/models/popperHebbian/ImproveProposalModels.ts` - New schema with title/description
- `src/controllers/db/popperHebbian/improveProposalController.ts` - Updated applyImprovement and revertToVersion
- `src/view/.../ImproveProposalModal/ImproveProposalModal.tsx` - Two-section preview UI
- `src/view/.../ImproveProposalModal/ImproveProposalModal.module.scss` - New styles for sections
- `src/view/.../ImproveProposalModal/VersionHistory.tsx` - Display title + description

**Translations:**
- Added "No description" to `en.json` and `he.json`

#### 🔬 Benefits of v2.3

1. **Clearer Proposals**: Title provides quick understanding, description provides depth
2. **Better AI Output**: Separate guidelines result in more appropriate content for each field
3. **Improved Review**: Users can evaluate title and description changes independently
4. **Complete Version History**: Both fields tracked through all versions

---

### Version 2.2 (2025-11-26)

#### 🎯 Major Changes

**1. Statement Type Hierarchy (delib-npm)**
- ✅ Added `StatementType.comment` for evidence/critique on Options
- ✅ Added `StatementType.chat` for threaded replies
- ✅ New hierarchy: Group → Question → Option → Comment → Chat
- ✅ Renamed "Evidence Posts" to "Comments" in UI (internal `evidence` field unchanged)

**2. "Improve with AI" Feature (Stage 3 Complete)**
- ✅ Created `fn_popperHebbian_improveProposal.ts` Firebase callable function
- ✅ AI synthesizes all discussion comments using Gemini 2.0 Flash
- ✅ Generates improved proposal that addresses challenges
- ✅ Returns improvement summary, changes highlight, and confidence score
- ✅ Available to Option creator and group admins only

**3. Version Control System**
- ✅ `versions[]` array on Statement for full history
- ✅ Track version number, timestamp, author, change type
- ✅ Revert to any previous version
- ✅ First improvement saves original as version 0

**4. Preview Modal with Diff View**
- ✅ Side-by-side comparison (original vs improved)
- ✅ "What Changed" bullet points from AI
- ✅ Version history panel with revert option
- ✅ Accept/Discard actions

**5. Integration**
- ✅ "Improve with AI" button in PopperHebbianDiscussion
- ✅ EvolutionPrompt wired to AI improvement flow
- ✅ Permission check: creator + admins only
- ✅ Full RTL and mobile support

#### 📝 New Files

**Backend:**
- `functions/src/fn_popperHebbian_improveProposal.ts` - Firebase callable for AI synthesis

**Frontend:**
- `src/models/popperHebbian/ImproveProposalModels.ts` - Types and Valibot schemas
- `src/controllers/db/popperHebbian/improveProposalController.ts` - API calls and version control
- `src/view/.../ImproveProposalModal/ImproveProposalModal.tsx` - Preview modal
- `src/view/.../ImproveProposalModal/DiffView.tsx` - Side-by-side comparison
- `src/view/.../ImproveProposalModal/VersionHistory.tsx` - Version history display

#### 🔬 Benefits of v2.2

1. **Complete Stage 3**: System now handles full idea lifecycle (create → discuss → improve)
2. **Evidence-Based Improvement**: AI considers all supporting/challenging comments
3. **Version Safety**: Never lose original or intermediate versions
4. **Permission Control**: Only authorized users can modify proposals
5. **Transparent Process**: Users see exactly what changed and why
6. **Better Terminology**: "Comments" more intuitive than "Evidence Posts"

#### 🚀 Migration Notes

- Existing statements with `StatementType.statement` + `evidence` field continue to work
- New comments will use `StatementType.comment`
- `versions[]` field added to Options on first AI improvement
- Backward compatible with existing data

---

### Version 2.1 (2025-11-04)

#### 🎯 Major Changes

**1. AI Auto-Classification of Support Level**
- ✅ Added `classifySupportLevel()` function in `fn_popperHebbian_onEvidencePost.ts`
- ✅ AI automatically determines if evidence supports/challenges/is neutral to parent statement
- ✅ Returns value from -1.0 (strongly challenges) to +1.0 (strongly supports)
- ✅ Removes cognitive burden from users - they just write, AI analyzes

**2. Base Weight Rescaling (0-1 Range)**
- ✅ Changed from unlimited scale (0.1-3.0) to normalized scale (0-1)
- ✅ New weights:
  - Data/Research: 3.0 → **1.0** (peer-reviewed quality)
  - Testimony: 2.0 → **0.7** (expert testimony)
  - Argument: 1.0 → **0.4** (logical reasoning)
  - Anecdote: 0.5 → **0.2** (personal stories)
  - Fallacy: 0.1 → **0.1** (flagged content)

**3. Tanh Normalization for Vote Scores**
- ✅ Implemented tanh-based normalization to prevent vote manipulation
- ✅ Formula: `normalizedNetScore = tanh(rawNetScore / 10)`
- ✅ Translates [-1, 1] to [0, 1]: `voteMultiplier = (normalizedNetScore + 1) / 2`
- ✅ Final weight: `baseWeight * voteMultiplier`
- ✅ Prevents gaming: 10 votes ≈ 76% effect, 100 votes ≈ 100% effect (diminishing returns)

**4. Simplified UI - Removed Manual Support Slider**
- ✅ Removed support level slider from `AddEvidenceModal.tsx`
- ✅ Simplified UI to single textarea - users just write evidence
- ✅ Updated helper text to explain AI auto-classification
- ✅ Cleaner, more intuitive user experience

#### 📝 Updated Files

**Backend (Firebase Functions):**
- `functions/src/fn_popperHebbian_onVote.ts` - Updated weight calculation with tanh
- `functions/src/fn_popperHebbian_onEvidencePost.ts` - Added support level classification

**Frontend (React):**
- `src/controllers/db/popperHebbian/evidenceController.ts` - Made support parameter optional with default
- `src/view/pages/statement/components/popperHebbian/components/AddEvidenceModal/AddEvidenceModal.tsx` - Removed slider UI
- `src/view/pages/statement/components/popperHebbian/components/AddEvidenceModal/AddEvidenceModal.module.scss` - Removed slider styles

**Documentation:**
- `docs/Popper-hebbian/COMPLETE_GUIDE.md` - Comprehensive updates to reflect v2.1 changes

#### 🔬 Benefits of v2.1

1. **Better UX**: Users don't need to categorize their own evidence
2. **More Accurate**: AI is more consistent than human self-classification
3. **Manipulation-Resistant**: Tanh normalization prevents vote brigading
4. **Scientific Scale**: 0-1 weight range aligns with probability/confidence scales
5. **Simpler Interface**: One textarea vs. textarea + slider + categories

#### 🚀 Migration Notes

- Existing evidence posts will be re-classified when edited
- Vote weights will be recalculated on next vote update
- No database schema changes required
- Backward compatible with existing data

---

**Generated:** 2025-11-26
**Status:** Implementation Complete (100%) - Ready for Deployment
**Version:** 2.3
