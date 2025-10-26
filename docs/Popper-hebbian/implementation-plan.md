# Popper-Hebbian System - Implementation Plan

## Executive Summary

This document outlines the implementation plan for integrating the "Popper-Hebbian" collaborative thinking system into the Freedi app. The system combines Popperian falsification (scientific method) with semi-Hebbian reinforcement (weighted evidence) to create a platform for collaborative intellectual progress rather than debate-style engagement.

### Quick Start (MVP Approach)

**What we're building**:
- AI Refinery: Gemini 2.5 Flash helps users clarify ideas before posting
- Discussion: Support/Challenge evidence system with weighted scoring
- Synthesis: Scoreboard showing status, evolution prompts for improvements

**Why simple for MVP**:
- ✅ Use Gemini 2.5 Flash (free tier, 1-package setup)
- ✅ Basic weighted scoring (no complex Hebbian ledger yet)
- ✅ Manual evidence typing (no AI classification yet)
- ✅ All functionality, minimal complexity

**Setup time**: ~30 minutes
1. Get Gemini API key (2 min)
2. Install `@google/generative-ai` package (1 min)
3. Configure Firebase (5 min)
4. Ready to build!

## System Philosophy

### Core Principles

1. **Popperian Falsification (The Engine)**
   - Ideas must be clear and testable (falsifiable)
   - Community challenges ideas with high-quality evidence
   - Ideas succeed by surviving rigorous challenges or evolving when they fail
   - Focus on evidence-based discussion, not winning debates

2. **Semi-Hebbian Rationality (The Ledger)**
   - Evidence strength is dynamic and weighted
   - Successfully reinforced evidence gains trust weight
   - High-quality data-backed arguments valued over anecdotes
   - Builds a self-reinforcing library of trusted knowledge

3. **User Experience Philosophy**
   - Complex philosophy abstracted from users
   - Simple, encouraging, collaborative language
   - AI Guide handles structural and analytical heavy lifting
   - Feels like a guided workshop, not a technical exam
   - **User-Friendly Language**: Negative support values displayed as "Challenges" or "Strongly Challenges" instead of raw numbers

## System Components

### 1. The "Idea" (Hypothesis)
The central object of discussion - a clear, testable proposition that can be evaluated.

**In Freedi's Context**:
- The "Idea" = `Statement` with `statementType: StatementType.option`
- The parent "Question" = `Statement` with `statementType: StatementType.question`
- Evidence posts = `Statement` with `statementType: StatementType.statement` (children of options)
- When Popper-Hebbian mode is enabled on a **question**, all its **option** children become "Ideas" to discuss
- Evidence posts are regular statements created as children of option statements
- They carry metadata indicating whether they support or challenge the option
- Standalone statements (not under a Popper-Hebbian question) work normally

**Data Hierarchy**:
```
Question Statement (statementType: StatementType.question, popperianDiscussionEnabled: true)
├── Option Statement 1 (statementType: StatementType.option) - "Idea 1"
│   ├── Evidence Post (statementType: StatementType.statement, support)
│   │   ├── Vote 1 (helpful)
│   │   └── Vote 2 (not-helpful)
│   ├── Evidence Post (statementType: StatementType.statement, challenge)
│   └── Evidence Post (statementType: StatementType.statement, support)
├── Option Statement 2 (statementType: StatementType.option) - "Idea 2"
│   ├── Evidence Post (statementType: StatementType.statement, support)
│   └── Evidence Post (statementType: StatementType.statement, challenge)
└── Option Statement 3 (statementType: StatementType.option) - "Idea 3"
    └── Evidence Post (statementType: StatementType.statement, support)

Note: Evidence posts are regular statements (StatementType.statement) that are children of options.
They are marked as support/challenge via metadata, not via statementType.
```

**Flow**:
1. Admin creates a **question** statement (`statementType: StatementType.question`)
2. Admin enables `popperianDiscussionEnabled: true` in statement settings
3. Users create **option** statements (`statementType: StatementType.option`) as children of the question
4. If refinery is enabled, options go through AI refinement before publishing
5. Each option gets its own discussion page with Support/Challenge interface
6. Users post evidence for/against each option
7. Community votes on evidence quality (helpful/not-helpful)
8. System calculates weighted scores for each option
9. Options show status: looking-good, under-discussion, or needs-fixing

**Important**: Only works with question → option hierarchy. Regular statements (`statementType: StatementType.statement`) are standalone and don't participate in Popper-Hebbian discussions.

### 2. The "Post" (Evidence/Argument)
The unit of contribution with the following types:
- **Empirical/Data**: Research, studies, statistics (highest weight)
- **Anecdote**: Personal stories, individual experiences (lowest weight)
- **Logical Argument**: Reasoned positions (medium weight)
- **Fallacy**: Off-topic or logically flawed (flagged, low/negative weight)

### 3. The "AI Guide" (Moderator/Facilitator)
Responsible for:
- Refining vague ideas into testable propositions
- Classifying evidence types
- Detecting logical fallacies
- Synthesizing discussions
- Prompting idea evolution

### 4. The "Ledger" (Hebbian Backend)
Tracks:
- `Evidence_Weight`: Dynamic weight of each piece of evidence
- `User_Reputation_Score`: Based on history of quality contributions
- Weighted scoring algorithms for idea evaluation

## Three-Stage System Flow

### Stage 1: "Sharpen Your Idea" (The Refinery)

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

**Implementation Details**: See Phase 6 below for complete AI Refinery implementation

---

### Stage 2: "The Discussion" (The Gauntlet)

**Goal**: Collect and analyze supporting and challenging evidence

**Process**:
1. Users contribute via two paths: Support or Challenge
2. AI Guide analyzes and tags each post
3. Community validates posts as "helpful"
4. Ledger updates evidence weights
5. Weighted scores accumulate

**UI Components**:

**Primary Actions**:
- `[+] I Support This` button
- `[-] I Challenge This` button

**AI Classification Tags**:
- `[Personal Story]`: "A great example! (Keep in mind it's one person's experience.)"
- `[Data / Research]`: "This looks like strong proof! It's from a study."
- `[Off-Topic]`: "Heads up! This comment seems to be attacking the person, not the idea."

**Community Validation** (Positive & Negative Feedback):
- Two buttons on each post:
  - `[👍 Helpful]` - This evidence strengthens the argument
  - `[👎 Not Helpful]` - This evidence is weak or flawed
- Net score = Helpful votes - Not Helpful votes
- Not simple "likes" - specifically for evidence quality assessment
- Helps community filter high-quality vs low-quality evidence

**Backend Scoring**:
```
Evidence_Weight Calculation:
- [Data] + high validation = significant weight increase
- [Personal Story] = minimal, fixed weight
- [Fallacy] = low or negative weight

Post_Score = Evidence_Weight * User_Reputation * Validation_Count
```

---

### Stage 3: "Improve the Idea" (Synthesis & Evolution)

**Goal**: Synthesize discussion and facilitate idea evolution

**UI Components**:

**Live Dashboard** - "Idea Scoreboard":
```
Status: [Looking Good! | Under Discussion | Needs Fixing]
Support Score: ████████ 8
Challenge Score: ███ 3
```

**Status Logic**:
- `Looking Good`: Corroborated by strong evidence
- `Under Discussion`: Balanced evidence on both sides
- `Needs Fixing`: Falsified or strongly challenged

**Score Display**:
- Weighted sum (not simple count)
- Visual bars showing relative strength
- Numbers represent Hebbian weights, not post counts

**Evolution Prompt** (when Status = `Needs Fixing`):
```
AI Guide: "Great discussion, everyone! It looks like the original
idea has a problem: [simple summary of core challenge].

This is awesome! This is how we learn and find better answers.

Can we improve this idea based on what we just found?"

[Button: Click here to suggest an 'Improved Version']
```

**Version Linking**:
- New "Version 2" idea created
- Pre-linked to "Version 1" as predecessor
- Re-enters Stage 1 or 2
- Title: `"Improved Idea (Version 2)"` with link to original

---

## Implementation Plan

### Phase 1: Data Models & Settings

#### 1.1 Update delib-npm StatementSettings
**File**: `node_modules/delib-npm/src/models/statement/StatementSettings.ts`

Add to StatementSettingsSchema:
```typescript
popperHebbian: optional(boolean())
```

#### 1.2 Update delib-npm Collections Enum

First, add new collections to `delib-npm`:

**File**: `node_modules/delib-npm/src/models/collections.ts` (or similar)

```typescript
export enum Collections {
  // Existing collections...
  statements = 'statements',
  evaluations = 'evaluations',
  // ... other existing collections

  // New Popper-Hebbian collections
  refinementSessions = 'refinementSessions',
  evidencePosts = 'evidencePosts',
  evidenceVotes = 'evidenceVotes'
}
```

#### 1.3 Evidence Data Models (Using delib-npm)

Evidence posts use the standard `Statement` type from delib-npm with the `evidence` field populated:

```typescript
import { Statement, EvidenceType } from 'delib-npm';

// Evidence posts are regular Statement objects (statementType: StatementType.statement)
// with the evidence field populated
// Example:
// {
//   statementId: "evidence123",
//   statementType: StatementType.statement,
//   parentId: "option456", // The option this is evidence for
//   statement: "This is my evidence...",
//   creatorId: "user789",
//   createdAt: 1234567890,
//   evidence: {
//     evidenceType: EvidenceType.data,
//     support: 0.8, // Strong support (0.8 on -1 to 1 scale)
//     evidenceWeight: 3.24, // Calculated weight
//     helpfulCount: 5,
//     notHelpfulCount: 2,
//     netScore: 3 // helpfulCount - notHelpfulCount
//   }
// }
//
// Support scale examples:
//  1.0 = Strongly supports the idea (displayed as "Strongly Supports")
//  0.5 = Moderately supports (displayed as "Supports")
//  0.0 = Neutral (displayed as "Neutral")
// -0.5 = Moderately challenges (displayed as "Challenges")
// -1.0 = Strongly challenges/refutes the idea (displayed as "Strongly Challenges")
//
// IMPORTANT: Negative support values should ALWAYS be displayed using user-friendly
// language like "Challenges" or "Strongly Challenges" - NEVER show raw negative numbers
// to users in the UI (except in debug/admin views)

export interface PopperHebbianScore {
  statementId: string;
  totalScore: number; // Sum of all (support * weight) - positive = supporting, negative = challenging
  status: 'looking-good' | 'under-discussion' | 'needs-fixing';
  lastCalculated: number;
}
```

#### 1.4 Evidence Weight Rules (MVP - Simple)
```typescript
import { Statement, EvidenceType } from 'delib-npm';

const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
  [EvidenceType.data]: 3.0,       // Research, studies
  [EvidenceType.testimony]: 2.0,  // Expert testimony
  [EvidenceType.argument]: 1.0,   // Logical reasoning
  [EvidenceType.anecdote]: 0.5,   // Personal stories
  [EvidenceType.fallacy]: 0.1     // Flagged content
};

// Calculate weight for an evidence post
function calculatePostWeight(post: Statement): number {
  if (!post.evidence?.evidenceType) return 1.0;

  const baseWeight = EVIDENCE_WEIGHTS[post.evidence.evidenceType];
  const netScore = (post.evidence.helpfulCount || 0) - (post.evidence.notHelpfulCount || 0);

  // Positive net score increases weight, negative decreases
  // Each net vote changes weight by 10%
  const multiplier = 1 + (netScore * 0.1);

  // Ensure weight never goes below 0.1
  return Math.max(0.1, baseWeight * multiplier);
}
```

### Phase 2: Settings UI

#### 2.1 Add Toggle to AdvancedSettings
**File**: `src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`

Add new category section:
```typescript
{/* Discussion Framework Category */}
<div className={styles.category}>
  <div className={styles.categoryHeader}>
    <span className={styles.categoryTitle}>
      {t('Discussion Framework')}
    </span>
  </div>
  <div className={styles.categoryContent}>
    <Checkbox
      label={t('Enable Popper-Hebbian Mode')}
      isChecked={settings.popperHebbian ?? false}
      onChange={(checked) =>
        handleSettingChange('popperHebbian', checked)
      }
    />
    <p className={styles.helperText}>
      {t('Transforms discussion into evidence-based Support/Challenge format with weighted scoring')}
    </p>
  </div>
</div>
```

### Phase 3: Discussion/Gauntlet UI (Stage 2)

#### 3.1 Conditional Rendering in EvaluationPage
**File**: `src/view/pages/statement/components/evaluations/StatementsEvaluationPage.tsx`

```typescript
const isPopperHebbian = statement.statementSettings?.popperHebbian;

return isPopperHebbian ? (
  <PopperHebbianDiscussion statement={statement} />
) : (
  // Existing evaluation UI
  <SuggestionCards />
);
```

#### 3.2 Create PopperHebbianDiscussion Component
**New File**: `src/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion.tsx`

Helper function for converting support values to user-friendly labels:
```typescript
function getSupportLabel(supportLevel: number): string {
  if (supportLevel > 0.7) return 'Strongly Supports';
  if (supportLevel > 0.3) return 'Supports';
  if (supportLevel > -0.3) return 'Neutral';
  if (supportLevel > -0.7) return 'Challenges';
  return 'Strongly Challenges';
}
```

Structure:
```typescript
<div className={styles.popperHebbianDiscussion}>
  <IdeaScoreboard statement={statement} />

  <div className={styles.addEvidence}>
    <h3>Add Your Evidence</h3>
    <textarea
      placeholder="Share your evidence or reasoning..."
      value={evidenceText}
      onChange={(e) => setEvidenceText(e.target.value)}
    />

    <div className={styles.supportSlider}>
      <label>How much does this evidence support or challenge the idea?</label>
      <input
        type="range"
        min="-1"
        max="1"
        step="0.1"
        value={supportLevel}
        onChange={(e) => setSupportLevel(parseFloat(e.target.value))}
      />
      <div className={styles.sliderLabels}>
        <span>Strongly Challenges (-1)</span>
        <span>Neutral (0)</span>
        <span>Strongly Supports (+1)</span>
      </div>
      <div className={styles.currentValue}>
        {getSupportLabel(supportLevel)}
      </div>
    </div>

    <div className={styles.evidenceTypeSelector}>
      <label>What kind of evidence is this?</label>
      <select
        value={evidenceType}
        onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
      >
        <option value={EvidenceType.data}>Data/Research (highest weight)</option>
        <option value={EvidenceType.testimony}>Expert Testimony</option>
        <option value={EvidenceType.argument}>Logical Argument</option>
        <option value={EvidenceType.anecdote}>Personal Experience</option>
      </select>
    </div>

    <Button onClick={handleSubmitEvidence}>
      Submit Evidence
    </Button>
  </div>

  <div className={styles.evidenceList}>
    <h3>All Evidence</h3>
    {evidencePosts
      .sort((a, b) => Math.abs(b.evidence?.support || 0) - Math.abs(a.evidence?.support || 0))
      .map(post => (
        <EvidencePost key={post.statementId} post={post} />
      ))}
  </div>

  {showEvolutionPrompt && <EvolutionPrompt statement={statement} />}
</div>
```

#### 3.3 Create EvidencePost Component
**New File**: `src/view/pages/statement/components/popperHebbian/components/EvidencePost/EvidencePost.tsx`

Features:
- Display post content
- Show support level (-1 to 1)
- Badge showing evidence type
- Positive and negative voting buttons
- Net score display
- Author info and timestamp

```typescript
interface EvidencePostProps {
  post: Statement; // Statement with evidence field populated
  currentUserVote?: 'helpful' | 'not-helpful' | null;
}

const EvidencePost: FC<EvidencePostProps> = ({ post, currentUserVote }) => {
  const evidence = post.evidence;
  if (!evidence) return null;

  const handleVote = (voteType: 'helpful' | 'not-helpful') => {
    if (currentUserVote === voteType) {
      removeVote(post.statementId);
    } else {
      submitVote(post.statementId, voteType);
    }
  };

  // Convert numeric support (-1 to 1) to user-friendly language
  const supportLevel = evidence.support || 0;
  const supportColor = supportLevel > 0.3 ? 'support' : supportLevel < -0.3 ? 'challenge' : 'neutral';
  const supportLabel =
    supportLevel > 0.7 ? 'Strongly Supports' :
    supportLevel > 0.3 ? 'Supports' :
    supportLevel > -0.3 ? 'Neutral' :
    supportLevel > -0.7 ? 'Challenges' :
    'Strongly Challenges';

  return (
    <div className={`${styles.evidencePost} ${styles[supportColor]}`}>
      <div className={styles.header}>
        <div className={styles.supportIndicator}>
          <span className={styles.supportLabel}>{supportLabel}</span>
          <span className={styles.supportValue}>
            {supportLevel > 0 ? '+' : ''}{supportLevel.toFixed(1)}
          </span>
        </div>
        <EvidenceTypeBadge type={evidence.evidenceType} />
        <UserInfo user={post.creator} />
      </div>

      <div className={styles.content}>
        {post.statement}
      </div>

      <div className={styles.footer}>
        <div className={styles.voteButtons}>
          <Button
            variant="subtle"
            className={currentUserVote === 'helpful' ? styles.active : ''}
            onClick={() => handleVote('helpful')}
          >
            👍 Helpful ({evidence.helpfulCount || 0})
          </Button>

          <Button
            variant="subtle"
            className={currentUserVote === 'not-helpful' ? styles.active : ''}
            onClick={() => handleVote('not-helpful')}
          >
            👎 Not Helpful ({evidence.notHelpfulCount || 0})
          </Button>
        </div>

        <div className={`${styles.netScore} ${(evidence.netScore || 0) >= 0 ? styles.positive : styles.negative}`}>
          Net: {(evidence.netScore || 0) > 0 ? '+' : ''}{evidence.netScore || 0}
        </div>
      </div>
    </div>
  );
};
```

### Phase 4: Synthesis/Dashboard (Stage 3)

#### 4.1 Create IdeaScoreboard Component
**New File**: `src/view/pages/statement/components/popperHebbian/components/IdeaScoreboard/IdeaScoreboard.tsx`

Helper function for interpreting total scores:
```typescript
function getScoreInterpretation(totalScore: number): string {
  if (totalScore > 5) return 'Strong evidence supports this idea';
  if (totalScore > 2) return 'Evidence leans toward supporting this idea';
  if (totalScore > -2) return 'Evidence is mixed - discussion ongoing';
  if (totalScore > -5) return 'Evidence is challenging this idea';
  return 'Strong challenges suggest this idea needs rethinking';
}
```

```typescript
<div className={styles.ideaScoreboard}>
  <h3>Idea Scoreboard</h3>

  <StatusIndicator status={score.status} />

  <div className={styles.scoreDisplay}>
    <div className={styles.totalScore}>
      <label>Overall Score</label>
      <span className={score.totalScore >= 0 ? styles.positive : styles.negative}>
        {score.totalScore > 0 ? '+' : ''}{score.totalScore.toFixed(1)}
      </span>
      <p className={styles.scoreInterpretation}>
        {getScoreInterpretation(score.totalScore)}
      </p>
    </div>
  </div>
</div>
```

Status colors:
- `looking-good`: Green with checkmark
- `under-discussion`: Yellow with balance icon
- `needs-fixing`: Red with alert icon

#### 4.2 Create EvolutionPrompt Component
**New File**: `src/view/pages/statement/components/popperHebbian/components/EvolutionPrompt/EvolutionPrompt.tsx`

Shows when `status === 'needs-fixing'`:

```typescript
<div className={styles.evolutionPrompt}>
  <div className={styles.aiGuide}>
    <LightBulbIcon />
    <p>
      Great discussion, everyone! It looks like the original idea
      has a problem: {summarizeMainChallenge(challengePosts)}
    </p>
    <p>
      This is awesome! This is how we learn and find better answers.
      Can we <strong>improve this idea</strong> based on what we just found?
    </p>
  </div>

  <Button onClick={handleCreateImprovedVersion}>
    Click here to suggest an 'Improved Version'
  </Button>
</div>
```

### Phase 5: Backend Integration

#### 5.1 Firestore Structure

**Collection**: `evidencePosts` (or reuse `evaluations` with new fields)
```
evidencePosts/{postId}
  - postId: string
  - statementId: string
  - userId: string
  - content: string
  - isSupport: boolean
  - evidenceType: EvidenceType
  - evidenceWeight: number
  - helpfulCount: number
  - createdAt: number
  - lastUpdate: number
```

**Computed Field on Statement**:
```
statements/{statementId}
  - popperHebbianScore: {
      supportScore: number
      challengeScore: number
      status: string
      lastCalculated: number
    }
```

#### 5.2 Firebase Functions

**File**: `functions/src/fn_popperHebbian_onEvidencePost.ts`

Triggered on evidence post creation:
```typescript
export const onEvidencePostCreate = functions.firestore
  .document('evidencePosts/{postId}')
  .onCreate(async (snap, context) => {
    // 1. Set default evidence type (for MVP: 'argument')
    // 2. Calculate initial weight
    // 3. Trigger score recalculation
    // 4. [FUTURE] Call AI to classify evidence type
  });
```

**File**: `functions/src/fn_popperHebbian_recalculateScore.ts`

Calculate weighted score:
```typescript
import { Statement, EvidenceType } from 'delib-npm';

async function recalculateScore(statementId: string) {
  const posts = await getEvidencePosts(statementId);

  let totalScore = 0; // Cumulative score from all evidence

  for (const post of posts) {
    const evidence = post.evidence;
    if (!evidence) continue;

    const weight = calculatePostWeight(post);
    const contribution = (evidence.support || 0) * weight;
    totalScore += contribution;
  }

  const status = determineStatus(totalScore);

  await updateStatementScore(statementId, {
    totalScore,
    status,
    lastCalculated: Date.now()
  });
}

function calculatePostWeight(post: Statement): number {
  const evidence = post.evidence;
  if (!evidence?.evidenceType) return 1.0;

  const baseWeight = EVIDENCE_WEIGHTS[evidence.evidenceType];
  const netScore = (evidence.helpfulCount || 0) - (evidence.notHelpfulCount || 0);

  // Each net vote changes weight by 10%
  const multiplier = 1 + (netScore * 0.1);

  // Ensure weight never goes below 0.1
  return Math.max(0.1, baseWeight * multiplier);
}

function determineStatus(totalScore: number): Status {
  // Total score is sum of all (support * weight) values
  // Positive = more support, Negative = more challenge
  if (totalScore > 2) return 'looking-good';
  if (totalScore < -2) return 'needs-fixing';
  return 'under-discussion';
}
```

**File**: `functions/src/fn_popperHebbian_onVote.ts`

Triggered when vote counts change:
```typescript
export const onVote = functions.firestore
  .document('evidencePosts/{postId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if vote counts changed
    const votesChanged =
      before.helpfulCount !== after.helpfulCount ||
      before.notHelpfulCount !== after.notHelpfulCount;

    if (votesChanged) {
      // Update net score
      const netScore = after.helpfulCount - after.notHelpfulCount;
      await change.after.ref.update({ netScore });

      // Recalculate statement score
      await recalculateScore(after.statementId);
    }
  });
```

### Phase 6: Stage 1 - AI Refinery Implementation

#### 6.1 Overview
The AI Refinery intercepts new statement submissions and guides users through a Socratic dialogue to refine vague ideas into clear, testable propositions before they're published for discussion.

#### 6.2 Data Models

**New Interface**: `src/models/popperHebbian/RefineryModels.ts`

```typescript
export enum IdeaRefinementStatus {
  draft = 'draft',
  inRefinement = 'in-refinement',
  readyForDiscussion = 'ready-for-discussion',
  rejected = 'rejected'
}

export interface RefinementSession {
  sessionId: string;
  statementId: string;
  userId: string;
  originalIdea: string;
  refinedIdea: string;
  status: IdeaRefinementStatus;
  conversationHistory: RefinementMessage[];
  vagueTerm: string[];
  testabilityCriteria: string[];
  createdAt: number;
  lastUpdate: number;
  completedAt?: number;
}

export interface RefinementMessage {
  messageId: string;
  role: 'user' | 'ai-guide';
  content: string;
  timestamp: number;
  messageType: 'question' | 'answer' | 'clarification' | 'suggestion';
}

export interface FalsifiabilityAnalysis {
  isTestable: boolean;
  vagueTerms: string[];
  suggestions: string[];
  confidence: number; // 0-1
  reasoning: string;
}
```

#### 6.3 UI Components

**Modal Component**: `src/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal.tsx`

This modal intercepts the statement creation when Popper-Hebbian mode is enabled:

```typescript
interface IdeaRefineryModalProps {
  statement: Statement;
  onComplete: (refinedStatement: Statement) => void;
  onCancel: () => void;
}

const IdeaRefineryModal: FC<IdeaRefineryModalProps> = ({
  statement,
  onComplete,
  onCancel
}) => {
  const [session, setSession] = useState<RefinementSession | null>(null);
  const [userInput, setUserInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  // Start refinement session on mount
  useEffect(() => {
    startRefinementSession(statement);
  }, [statement.statementId]);

  return (
    <Modal className={styles.refineryModal}>
      <div className={styles.header}>
        <LightBulbIcon />
        <h2>AI Guide - Let's Sharpen Your Idea!</h2>
      </div>

      <div className={styles.originalIdea}>
        <label>Your Original Idea:</label>
        <p>{statement.statement}</p>
      </div>

      <div className={styles.conversation}>
        {session?.conversationHistory.map(msg => (
          <RefinementMessage key={msg.messageId} message={msg} />
        ))}
        {isAnalyzing && <ThinkingIndicator />}
      </div>

      {session?.status === 'in-refinement' && (
        <div className={styles.inputArea}>
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type your response..."
          />
          <Button onClick={handleSubmitResponse}>
            Send
          </Button>
        </div>
      )}

      {session?.status === 'ready-for-discussion' && (
        <div className={styles.completionArea}>
          <SuccessIcon />
          <p>Perfect! This is super clear now.</p>
          <div className={styles.refinedIdea}>
            <label>Your Refined Idea:</label>
            <p>{session.refinedIdea}</p>
          </div>
          <Button onClick={handlePublish}>
            Publish for Discussion
          </Button>
        </div>
      )}

      <Button variant="subtle" onClick={onCancel}>
        Cancel
      </Button>
    </Modal>
  );
};
```

**Chat Message Component**: `src/view/pages/statement/components/popperHebbian/refinery/RefinementMessage.tsx`

```typescript
interface RefinementMessageProps {
  message: RefinementMessage;
}

const RefinementMessage: FC<RefinementMessageProps> = ({ message }) => {
  const isAI = message.role === 'ai-guide';

  return (
    <div className={`${styles.message} ${isAI ? styles.aiMessage : styles.userMessage}`}>
      {isAI && (
        <div className={styles.aiAvatar}>
          <LightBulbIcon />
          <span>AI Guide</span>
        </div>
      )}
      <div className={styles.messageContent}>
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
      <span className={styles.timestamp}>
        {formatTimestamp(message.timestamp)}
      </span>
    </div>
  );
};
```

#### 6.4 Integration Point

**Modify**: `src/view/pages/statement/components/createStatementModal/CreateStatementModal.tsx`

```typescript
const CreateStatementModal: FC<Props> = ({ parentStatement, isOption }) => {
  const [showRefinery, setShowRefinery] = useState(false);
  const [draftStatement, setDraftStatement] = useState<Statement | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Create draft statement
    const newStatement = createStatementObject(/* ... */);

    // Check if parent has Popper-Hebbian enabled
    const isPopperHebbian = parentStatement?.statementSettings?.popperHebbian;

    if (isPopperHebbian) {
      // Store as draft and open refinery
      setDraftStatement(newStatement);
      setShowRefinery(true);
    } else {
      // Normal flow - publish directly
      await saveStatement(newStatement);
      navigate(`/statement/${newStatement.statementId}`);
    }
  };

  const handleRefineryComplete = async (refinedStatement: Statement) => {
    await saveStatement(refinedStatement);
    setShowRefinery(false);
    navigate(`/statement/${refinedStatement.statementId}`);
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        {/* Existing form fields */}
      </form>

      {showRefinery && draftStatement && (
        <IdeaRefineryModal
          statement={draftStatement}
          onComplete={handleRefineryComplete}
          onCancel={() => setShowRefinery(false)}
        />
      )}
    </>
  );
};
```

#### 6.5 Backend - Firebase Functions

**File**: `functions/src/fn_popperHebbian_analyzeFalsifiability.ts`

This function analyzes if an idea is testable and identifies vague terms:

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { model } from './config/gemini';

interface AnalyzeFalsifiabilityRequest {
  ideaText: string;
  context?: string;
}

interface AnalyzeFalsifiabilityResponse {
  analysis: FalsifiabilityAnalysis;
  initialMessage: string;
}

export const analyzeFalsifiability = onCall<
  AnalyzeFalsifiabilityRequest,
  Promise<AnalyzeFalsifiabilityResponse>
>(async (request) => {
  const { ideaText, context } = request.data;

  if (!ideaText) {
    throw new HttpsError('invalid-argument', 'Idea text is required');
  }

  const prompt = `You are the AI Guide for a collaborative thinking platform. Your job is to analyze ideas for testability and clarity.

An idea is "testable" if:
1. It makes specific, measurable claims
2. We could identify evidence that would prove it wrong
3. Key terms are clearly defined
4. Success/failure criteria are identifiable

Analyze this idea: "${ideaText}"
${context ? `Context: ${context}` : ''}

Provide your analysis in JSON format:
{
  "isTestable": boolean,
  "vagueTerms": ["term1", "term2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "confidence": 0.85,
  "reasoning": "brief explanation"
}

Use simple, encouraging language.`;

  try {
    // Call Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from AI');
    }

    const analysis: FalsifiabilityAnalysis = JSON.parse(jsonMatch[0]);

    // Generate initial AI message based on analysis
    let initialMessage: string;

    if (analysis.isTestable) {
      initialMessage = `Hey! That's an interesting idea, and it's already pretty clear!

However, I have a few questions to make it even stronger for discussion. This will help everyone understand exactly what you mean and how to evaluate it fairly.

Ready to sharpen it together?`;
    } else {
      initialMessage = `Hey! I'm the AI Guide. That's an interesting idea!

To help everyone discuss this fairly, **we need to make it crystal clear.** Right now, it's a bit vague.

${analysis.vagueTerms.length > 0 ? `For example, when you say **"${analysis.vagueTerms[0]}"**, what do you mean exactly?` : ''}

Let me ask you a few questions to help sharpen this idea. Sound good?`;
    }

    return {
      analysis,
      initialMessage
    };

  } catch (error) {
    console.error('Error analyzing falsifiability:', error);
    throw new HttpsError('internal', 'Failed to analyze idea');
  }
});
```

**File**: `functions/src/fn_popperHebbian_refineIdea.ts`

Handles the Socratic dialogue conversation:

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { model } from './config/gemini';

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

export const refineIdea = onCall<
  RefineIdeaRequest,
  Promise<RefineIdeaResponse>
>(async (request) => {
  const {
    userResponse,
    conversationHistory,
    originalIdea,
    currentRefinedIdea
  } = request.data;

  const conversationContext = conversationHistory
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const prompt = `You are the AI Guide conducting a Socratic dialogue to refine vague ideas into testable propositions.

Your goals:
1. Ask clarifying questions about vague terms
2. Help the user define success/failure criteria
3. Ensure the idea is specific and measurable
4. Use encouraging, collaborative language
5. Keep questions short and focused (one at a time)
6. When the idea is clear, provide a refined version

Guidelines:
- Use "Simple Folks" language - no jargon
- Be encouraging: "Great!" "That helps!" "Perfect!"
- Focus on clarity, not criticism
- Ask: "What would we look for?" "How would we know if it worked?"
- Max 3-5 rounds of questions before proposing refined version

Original idea: "${originalIdea}"
${currentRefinedIdea ? `Current refined version: "${currentRefinedIdea}"` : ''}

Conversation so far:
${conversationContext}

User's latest response: "${userResponse}"

Continue the Socratic dialogue or provide the final refined idea if clear enough.

Response format (JSON):
If more refinement needed:
{
  "aiMessage": "Great! That helps. Now, when you say X, what exactly do you mean?",
  "isComplete": false
}

If ready:
{
  "aiMessage": "Perfect! This is super clear now.",
  "refinedIdea": "The clear, testable version of their idea",
  "isComplete": true,
  "testabilityCriteria": ["How we'd measure success", "What would prove it wrong"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from AI');
    }

    const refinementResult: RefineIdeaResponse = JSON.parse(jsonMatch[0]);

    return refinementResult;

  } catch (error) {
    console.error('Error refining idea:', error);
    throw new HttpsError('internal', 'Failed to refine idea');
  }
});
```

#### 6.6 Controller Functions

**File**: `src/controllers/db/popperHebbian/refineryController.ts`

```typescript
export async function startRefinementSession(
  statement: Statement,
  user: User
): Promise<RefinementSession> {
  // Call Firebase Function to analyze falsifiability
  const analyzeFalsifiability = httpsCallable<
    AnalyzeFalsifiabilityRequest,
    AnalyzeFalsifiabilityResponse
  >(functions, 'analyzeFalsifiability');

  const result = await analyzeFalsifiability({
    ideaText: statement.statement,
    context: statement.description
  });

  const { analysis, initialMessage } = result.data;

  // Create refinement session
  const sessionId = generateId();
  const session: RefinementSession = {
    sessionId,
    statementId: statement.statementId,
    userId: user.uid,
    originalIdea: statement.statement,
    refinedIdea: '',
    status: analysis.isTestable
      ? IdeaRefinementStatus.readyForDiscussion
      : IdeaRefinementStatus.inRefinement,
    conversationHistory: [
      {
        messageId: generateId(),
        role: 'ai-guide',
        content: initialMessage,
        timestamp: Date.now(),
        messageType: 'question'
      }
    ],
    vagueTerms: analysis.vagueTerms,
    testabilityCriteria: [],
    createdAt: Date.now(),
    lastUpdate: Date.now()
  };

  // Save to Firestore
  await setDoc(
    doc(FireStore, Collections.refinementSessions, sessionId),
    session
  );

  return session;
}

export async function submitRefinementResponse(
  sessionId: string,
  userResponse: string
): Promise<RefinementSession> {
  // Get current session
  const sessionRef = doc(FireStore, Collections.refinementSessions, sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    throw new Error('Session not found');
  }

  const session = sessionSnap.data() as RefinementSession;

  // Add user message to history
  const userMessage: RefinementMessage = {
    messageId: generateId(),
    role: 'user',
    content: userResponse,
    timestamp: Date.now(),
    messageType: 'answer'
  };

  const updatedHistory = [...session.conversationHistory, userMessage];

  // Call Firebase Function to continue dialogue
  const refineIdea = httpsCallable<RefineIdeaRequest, RefineIdeaResponse>(
    functions,
    'refineIdea'
  );

  const result = await refineIdea({
    sessionId,
    userResponse,
    conversationHistory: updatedHistory,
    originalIdea: session.originalIdea,
    currentRefinedIdea: session.refinedIdea
  });

  const { aiMessage, refinedIdea, isComplete, testabilityCriteria } = result.data;

  // Add AI message to history
  const aiMessageObj: RefinementMessage = {
    messageId: generateId(),
    role: 'ai-guide',
    content: aiMessage,
    timestamp: Date.now(),
    messageType: isComplete ? 'suggestion' : 'question'
  };

  const finalHistory = [...updatedHistory, aiMessageObj];

  // Update session
  const updatedSession: RefinementSession = {
    ...session,
    conversationHistory: finalHistory,
    refinedIdea: refinedIdea || session.refinedIdea,
    status: isComplete
      ? IdeaRefinementStatus.readyForDiscussion
      : IdeaRefinementStatus.inRefinement,
    testabilityCriteria: testabilityCriteria || session.testabilityCriteria,
    lastUpdate: Date.now(),
    completedAt: isComplete ? Date.now() : undefined
  };

  await updateDoc(sessionRef, updatedSession);

  return updatedSession;
}

export async function publishRefinedIdea(
  sessionId: string,
  statement: Statement
): Promise<Statement> {
  const sessionRef = doc(FireStore, Collections.refinementSessions, sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    throw new Error('Session not found');
  }

  const session = sessionSnap.data() as RefinementSession;

  if (session.status !== IdeaRefinementStatus.readyForDiscussion) {
    throw new Error('Session not ready for publication');
  }

  // Update statement with refined text
  const refinedStatement: Statement = {
    ...statement,
    statement: session.refinedIdea,
    refinementMetadata: {
      wasRefined: true,
      originalIdea: session.originalIdea,
      refinementSessionId: sessionId,
      testabilityCriteria: session.testabilityCriteria,
      refinedAt: Date.now()
    }
  };

  // Save refined statement
  await setDoc(
    doc(FireStore, Collections.statements, statement.statementId),
    refinedStatement
  );

  return refinedStatement;
}
```

#### 6.7 Firestore Structure

**Collection**: `refinementSessions/{sessionId}`
```
{
  sessionId: string
  statementId: string
  userId: string
  originalIdea: string
  refinedIdea: string
  status: 'draft' | 'in-refinement' | 'ready-for-discussion'
  conversationHistory: [
    {
      messageId: string
      role: 'user' | 'ai-guide'
      content: string
      timestamp: number
      messageType: 'question' | 'answer' | 'clarification' | 'suggestion'
    }
  ]
  vagueTerms: string[]
  testabilityCriteria: string[]
  createdAt: number
  lastUpdate: number
  completedAt?: number
}
```

**Add to Statement model**:
```typescript
refinementMetadata?: {
  wasRefined: boolean
  originalIdea: string
  refinementSessionId: string
  testabilityCriteria: string[]
  refinedAt: number
}
```

#### 6.8 AI API Configuration

**File**: `functions/src/config/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as functions from 'firebase-functions';

const GEMINI_API_KEY = functions.config().gemini?.key;

if (!GEMINI_API_KEY) {
  console.error('Gemini API key not configured');
}

export const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Use Gemini 2.5 Flash for fast, cost-effective responses
export const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-latest'
});
```

**Configuration Command**:
```bash
firebase functions:config:set gemini.key="YOUR_GEMINI_API_KEY"
```

**Get API Key**:
1. Go to https://aistudio.google.com/app/apikey
2. Create new API key
3. Copy and use in configuration above

#### 6.9 Styling

**File**: `src/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal.module.scss`

```scss
.refineryModal {
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;

  .header {
    display: flex;
    align-items: center;
    gap: var(--padding);
    padding: var(--padding);
    border-bottom: 1px solid var(--border-color);

    svg {
      width: 32px;
      height: 32px;
      color: var(--btn-primary);
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
    }
  }

  .originalIdea {
    padding: var(--padding);
    background-color: var(--bg-light);
    border-left: 3px solid var(--btn-primary);

    label {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    p {
      margin: 0.5rem 0 0;
      font-style: italic;
    }
  }

  .conversation {
    flex: 1;
    overflow-y: auto;
    padding: var(--padding);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .inputArea {
    padding: var(--padding);
    border-top: 1px solid var(--border-color);

    textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--padding);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      resize: vertical;
    }

    button {
      margin-top: 0.5rem;
    }
  }

  .completionArea {
    padding: var(--padding);
    background-color: var(--agree-light);
    border-radius: 8px;
    text-align: center;

    svg {
      width: 48px;
      height: 48px;
      color: var(--agree);
    }

    .refinedIdea {
      margin: 1rem 0;
      padding: var(--padding);
      background-color: var(--bg-white);
      border-radius: 8px;
      text-align: left;

      label {
        font-weight: 600;
      }

      p {
        margin: 0.5rem 0 0;
        font-size: 1.1rem;
      }
    }
  }
}

.message {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  &.aiMessage {
    align-items: flex-start;

    .messageContent {
      background-color: var(--bg-light);
      border-left: 3px solid var(--btn-primary);
    }
  }

  &.userMessage {
    align-items: flex-end;

    .messageContent {
      background-color: var(--btn-primary);
      color: white;
    }
  }

  .aiAvatar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--btn-primary);

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .messageContent {
    padding: var(--padding);
    border-radius: 12px;
    max-width: 80%;

    p {
      margin: 0;
    }

    strong {
      color: var(--btn-primary);
    }
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
}
```

#### 6.10 Security Rules

**Update**: `firestore.rules`

```
match /refinementSessions/{sessionId} {
  // Users can only read/write their own sessions
  allow read, write: if request.auth != null &&
    resource.data.userId == request.auth.uid;

  // Allow creating new sessions
  allow create: if request.auth != null &&
    request.resource.data.userId == request.auth.uid;
}
```

#### 6.11 Testing Strategy

**Unit Tests**:
- Falsifiability analysis parsing
- Conversation history management
- Status transitions

**Integration Tests**:
- Start refinement session → AI analyzes → Returns initial message
- Submit user response → AI refines → Conversation continues
- Complete refinement → Publish refined idea

**E2E Tests**:
1. Create statement in Popper-Hebbian mode
2. Refinery modal appears
3. User answers AI questions
4. AI suggests refined version
5. User publishes refined idea
6. Idea appears in discussion with refined text

### Phase 7: Controller Functions

**File**: `src/controllers/db/popperHebbian/setEvidencePost.ts`

```typescript
export async function createEvidencePost(
  statementId: string,
  content: string,
  isSupport: boolean,
  user: User
): Promise<EvidencePost> {
  const postId = generateId();
  const evidencePost: EvidencePost = {
    postId,
    statementId,
    userId: user.uid,
    content,
    isSupport,
    evidenceType: EvidenceType.argument, // MVP default
    evidenceWeight: 1.0,
    helpfulCount: 0,
    createdAt: Date.now(),
    lastUpdate: Date.now()
  };

  await setDoc(
    doc(FireStore, Collections.evidencePosts, postId),
    evidencePost
  );

  return evidencePost;
}
```

**File**: `src/controllers/db/popperHebbian/getEvidencePosts.ts`

```typescript
export function listenToEvidencePosts(
  statementId: string,
  callback: (posts: EvidencePost[]) => void
): () => void {
  const q = query(
    collection(FireStore, Collections.evidencePosts),
    where('statementId', '==', statementId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => doc.data() as EvidencePost);
    callback(posts);
  });
}
```

**File**: `src/controllers/db/popperHebbian/setVote.ts`

```typescript
import { doc, setDoc, updateDoc, deleteDoc, increment, getDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { Collections } from 'delib-npm';

export interface EvidenceVote {
  voteId: string;
  postId: string;
  userId: string;
  voteType: 'helpful' | 'not-helpful';
  createdAt: number;
}

// Submit or change vote
export async function submitVote(
  postId: string,
  userId: string,
  voteType: 'helpful' | 'not-helpful'
): Promise<void> {
  const voteId = `${postId}_${userId}`;
  const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
  const postRef = doc(FireStore, Collections.evidencePosts, postId);

  // Check if user already voted
  const existingVote = await getDoc(voteRef);

  if (existingVote.exists()) {
    const oldVote = existingVote.data() as EvidenceVote;

    // If changing vote type
    if (oldVote.voteType !== voteType) {
      // Decrement old vote type
      if (oldVote.voteType === 'helpful') {
        await updateDoc(postRef, {
          helpfulCount: increment(-1),
          lastUpdate: Date.now()
        });
      } else {
        await updateDoc(postRef, {
          notHelpfulCount: increment(-1),
          lastUpdate: Date.now()
        });
      }

      // Increment new vote type
      if (voteType === 'helpful') {
        await updateDoc(postRef, {
          helpfulCount: increment(1),
          lastUpdate: Date.now()
        });
      } else {
        await updateDoc(postRef, {
          notHelpfulCount: increment(1),
          lastUpdate: Date.now()
        });
      }

      // Update vote document
      await updateDoc(voteRef, {
        voteType,
        createdAt: Date.now()
      });
    }
  } else {
    // New vote - increment appropriate counter
    if (voteType === 'helpful') {
      await updateDoc(postRef, {
        helpfulCount: increment(1),
        lastUpdate: Date.now()
      });
    } else {
      await updateDoc(postRef, {
        notHelpfulCount: increment(1),
        lastUpdate: Date.now()
      });
    }

    // Create vote document
    const vote: EvidenceVote = {
      voteId,
      postId,
      userId,
      voteType,
      createdAt: Date.now()
    };

    await setDoc(voteRef, vote);
  }
}

// Remove vote
export async function removeVote(
  postId: string,
  userId: string
): Promise<void> {
  const voteId = `${postId}_${userId}`;
  const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
  const postRef = doc(FireStore, Collections.evidencePosts, postId);

  // Get existing vote
  const voteSnap = await getDoc(voteRef);

  if (voteSnap.exists()) {
    const vote = voteSnap.data() as EvidenceVote;

    // Decrement appropriate counter
    if (vote.voteType === 'helpful') {
      await updateDoc(postRef, {
        helpfulCount: increment(-1),
        lastUpdate: Date.now()
      });
    } else {
      await updateDoc(postRef, {
        notHelpfulCount: increment(-1),
        lastUpdate: Date.now()
      });
    }

    // Delete vote document
    await deleteDoc(voteRef);
  }
}

// Get user's vote for a post
export async function getUserVote(
  postId: string,
  userId: string
): Promise<'helpful' | 'not-helpful' | null> {
  const voteId = `${postId}_${userId}`;
  const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
  const voteSnap = await getDoc(voteRef);

  if (voteSnap.exists()) {
    const vote = voteSnap.data() as EvidenceVote;
    return vote.voteType;
  }

  return null;
}
```

---

## File Structure

```
docs/Popper-hebbian/
├── poper-hebbian-system.md         (original spec)
└── implementation-plan.md           (this file)

src/models/popperHebbian/
├── EvidenceModels.ts
└── index.ts

src/view/pages/statement/components/popperHebbian/
├── PopperHebbianDiscussion.tsx
├── PopperHebbianDiscussion.module.scss
├── popperHebbianCont.ts
├── refinery/
│   ├── IdeaRefineryModal.tsx
│   ├── IdeaRefineryModal.module.scss
│   ├── RefinementMessage.tsx
│   └── ThinkingIndicator.tsx
└── components/
    ├── IdeaScoreboard/
    │   ├── IdeaScoreboard.tsx
    │   └── IdeaScoreboard.module.scss
    ├── EvidencePost/
    │   ├── EvidencePost.tsx
    │   └── EvidencePost.module.scss
    ├── EvidenceTypeBadge/
    │   ├── EvidenceTypeBadge.tsx
    │   └── EvidenceTypeBadge.module.scss
    ├── SupportChallengeButtons/
    │   ├── SupportChallengeButtons.tsx
    │   └── SupportChallengeButtons.module.scss
    └── EvolutionPrompt/
        ├── EvolutionPrompt.tsx
        └── EvolutionPrompt.module.scss

src/controllers/db/popperHebbian/
├── refineryController.ts
├── setEvidencePost.ts
├── getEvidencePosts.ts
├── setVote.ts
└── listenToScore.ts

functions/src/
├── fn_popperHebbian_analyzeFalsifiability.ts
├── fn_popperHebbian_refineIdea.ts
├── fn_popperHebbian_onEvidencePost.ts
├── fn_popperHebbian_recalculateScore.ts
├── fn_popperHebbian_onVote.ts
└── config/
    └── gemini.ts
```

---

## Key Metrics for Success

From the original design document:

1. **Idea Evolution Rate** (Popperian)
   - Average number of "Improved Versions" created per initial idea
   - Measures success in refining ideas

2. **Evidence Re-use Rate** (Hebbian)
   - Frequency of high-weight evidence applied across multiple ideas
   - Measures success in building trusted knowledge library

3. **Quality Contribution Ratio**
   - Ratio of `[Data/Research]` vs `[Personal Story]` or `[Off-Topic]`
   - Measures community health

---

## MVP Scope (Initial Implementation)

**INCLUDED (Full System)**:
- ✅ **Stage 1: AI Refinery**
  - Falsifiability analysis
  - Socratic dialogue to refine ideas
  - Draft mode with refinement before publication
  - Conversation history tracking
- ✅ **Stage 2: Discussion/Gauntlet**
  - Settings toggle for Popper-Hebbian mode
  - Support/Challenge button interface
  - Evidence post display with type badges
  - "Helpful" voting system
  - Simple weighted scoring (type-based + helpful multiplier)
- ✅ **Stage 3: Synthesis**
  - Idea Scoreboard with status indicator
  - Evolution prompt when idea "needs fixing"
  - Version linking for improved ideas
- ✅ **Backend Infrastructure**
  - Firebase Functions for AI integration
  - Anthropic Claude API integration
  - Firestore collections for refinement and evidence
  - Real-time score calculation

**DEFERRED TO FUTURE**:
- ⏳ Full Hebbian Ledger with Evidence_Table (cross-statement evidence tracking)
- ⏳ User reputation scoring (multi-statement contribution tracking)
- ⏳ AI classification of evidence types (automatic post analysis)
- ⏳ AI fallacy detection (automatic post flagging)
- ⏳ Evidence re-use tracking across statements
- ⏳ Advanced analytics dashboard

---

## User Experience Considerations

### Navigation Flow

**For Question Admins**:
1. Create question statement
2. Navigate to Settings → Discussion Framework
3. Toggle "Enable Popper-Hebbian Mode"
4. Save settings
5. System now treats all option statements as "Ideas"

**For Participants Creating Ideas**:
1. View question with Popper-Hebbian enabled
2. Click "Add New Idea/Option" button
3. If refinery enabled: Modal appears with AI Guide
4. Engage in dialogue to refine idea
5. Publish refined idea
6. Idea appears in options list

**For Participants Discussing Ideas**:
1. View question and see list of option statements (ideas)
2. Click on an option to see its discussion page
3. See two main buttons: [+] Support This | [-] Challenge This
4. Click button to add evidence
5. Write evidence post
6. View existing evidence posts with voting buttons
7. Vote on evidence quality (👍 Helpful / 👎 Not Helpful)
8. See scoreboard showing weighted support vs challenge

### UI/UX Decisions

**Evidence Post Display**:
- Show in two columns: Support (left) | Challenge (right)
- Each post shows: author, timestamp, content, evidence type badge
- Vote buttons always visible (not hidden behind menu)
- Net score displayed prominently with color coding:
  - Green: positive net score
  - Red: negative net score
  - Gray: zero net score

**Scoreboard Visibility**:
- Always visible at top of discussion page
- Live updates as votes come in
- Clear visual indication of status
- Color-coded status indicator:
  - 🟢 Looking Good (support > challenge * 2)
  - 🟡 Under Discussion (balanced)
  - 🔴 Needs Fixing (challenge > support * 1.5)

**Evolution Prompt**:
- Appears only when status = "Needs Fixing"
- Non-intrusive but visible
- Clear call-to-action button
- Explains why improvement is needed

**Mobile Considerations**:
- Stack support/challenge columns vertically on mobile
- Make vote buttons touch-friendly (min 44px height)
- Collapsible scoreboard to save screen space
- Bottom sheet for adding evidence

---

## Implementation Order

1. **Sprint 1: Foundation & Data Models**
   - Data models (Evidence, Refinery, Scoreboard)
   - Settings UI toggle
   - Basic component structure
   - AI API configuration setup

2. **Sprint 2: Stage 1 - AI Refinery**
   - IdeaRefineryModal component
   - RefinementMessage component
   - Firebase Functions for falsifiability analysis
   - Firebase Functions for Socratic dialogue
   - Integration with CreateStatementModal

3. **Sprint 3: Stage 2 - Discussion/Gauntlet Core UI**
   - PopperHebbianDiscussion component
   - Support/Challenge buttons
   - Evidence post display
   - Helpful voting
   - Evidence post creation

4. **Sprint 4: Stage 3 - Synthesis & Scoring**
   - Scoreboard component
   - Backend score calculation
   - Status determination logic
   - Evolution prompt
   - Version linking

5. **Sprint 5: Integration & Testing**
   - End-to-end flow testing
   - AI prompt refinement
   - Error handling
   - Loading states

6. **Sprint 6: Polish & Launch**
   - Styling per design guide
   - Accessibility review
   - Performance optimization
   - User documentation
   - Analytics setup

---

## Design Considerations

### Following Design System
Per `docs/design-guide.md`:

**Colors**:
- Support: Use `var(--agree)` (green)
- Challenge: Use `var(--disagree)` (red)
- Neutral/Discussion: Use `var(--neutral)` (yellow)
- Primary actions: Use `var(--btn-primary)`

**Typography**:
- Scoreboard title: `h3`
- Post content: `p` with base font size
- Badges: Small text with design tokens

**Spacing**:
- Use `var(--padding)` for consistent spacing
- 8-point grid system

**Accessibility**:
- WCAG AA compliance
- Clear button labels
- Keyboard navigation support
- Screen reader friendly

---

## Testing Strategy

### 1. Unit Tests

**Evidence Weight Calculation** (`src/models/popperHebbian/EvidenceModels.test.ts`):
```typescript
describe('calculatePostWeight', () => {
  it('should calculate base weight correctly', () => {
    const post = {
      evidenceType: EvidenceType.data,
      helpfulCount: 0,
      notHelpfulCount: 0
    };
    expect(calculatePostWeight(post)).toBe(3.0);
  });

  it('should increase weight with positive net score', () => {
    const post = {
      evidenceType: EvidenceType.argument,
      helpfulCount: 5,
      notHelpfulCount: 2
    };
    // base 1.0 * (1 + 3 * 0.1) = 1.3
    expect(calculatePostWeight(post)).toBe(1.3);
  });

  it('should decrease weight with negative net score', () => {
    const post = {
      evidenceType: EvidenceType.argument,
      helpfulCount: 1,
      notHelpfulCount: 4
    };
    // base 1.0 * (1 + (-3) * 0.1) = 0.7
    expect(calculatePostWeight(post)).toBe(0.7);
  });

  it('should never go below 0.1', () => {
    const post = {
      evidenceType: EvidenceType.argument,
      helpfulCount: 0,
      notHelpfulCount: 20
    };
    expect(calculatePostWeight(post)).toBe(0.1);
  });
});
```

**Status Determination**:
```typescript
describe('determineStatus', () => {
  it('should return looking-good when support > challenge * 2', () => {
    expect(determineStatus(10, 4)).toBe('looking-good');
  });

  it('should return needs-fixing when challenge > support * 1.5', () => {
    expect(determineStatus(5, 8)).toBe('needs-fixing');
  });

  it('should return under-discussion when balanced', () => {
    expect(determineStatus(6, 5)).toBe('under-discussion');
  });
});
```

### 2. Integration Tests

**Evidence Post Creation Flow**:
```typescript
describe('Evidence Post Creation', () => {
  it('should create evidence post with correct fields', async () => {
    const post = await createEvidencePost(
      'statement123',
      'This is evidence',
      true,
      mockUser
    );

    expect(post.statementId).toBe('statement123');
    expect(post.isSupport).toBe(true);
    expect(post.helpfulCount).toBe(0);
    expect(post.notHelpfulCount).toBe(0);
    expect(post.netScore).toBe(0);
  });
});
```

**Voting Updates Score**:
```typescript
describe('Voting System', () => {
  it('should increment helpful count on vote', async () => {
    await submitVote(postId, userId, 'helpful');
    const post = await getEvidencePost(postId);
    expect(post.helpfulCount).toBe(1);
  });

  it('should allow vote change', async () => {
    await submitVote(postId, userId, 'helpful');
    await submitVote(postId, userId, 'not-helpful');
    const post = await getEvidencePost(postId);
    expect(post.helpfulCount).toBe(0);
    expect(post.notHelpfulCount).toBe(1);
  });

  it('should trigger score recalculation', async () => {
    await submitVote(postId, userId, 'helpful');
    // Wait for Firebase function to execute
    await waitFor(() => {
      const statement = getStatement(statementId);
      expect(statement.popperHebbianScore).toBeDefined();
    });
  });
});
```

### 3. End-to-End Tests

**Complete Popper-Hebbian Flow**:
```typescript
describe('Popper-Hebbian E2E', () => {
  it('should complete full workflow', async () => {
    // 1. Admin enables Popper-Hebbian mode
    await navigateTo('/statement/question123/settings');
    await clickCheckbox('Enable Popper-Hebbian Mode');
    await clickButton('Save');

    // 2. User creates option (idea)
    await navigateTo('/statement/question123');
    await clickButton('Add New Idea');

    // 3. AI Refinery appears
    await expectVisible('AI Guide Modal');
    await typeInto('textarea', 'My vague idea');
    await clickButton('Send');
    await waitForAIResponse();
    await typeInto('textarea', 'Clarified version');
    await clickButton('Publish for Discussion');

    // 4. Navigate to option discussion
    await clickElement('[data-option-id="option123"]');

    // 5. Add support evidence
    await clickButton('[+] Support This');
    await typeInto('textarea', 'This is strong evidence');
    await clickButton('Submit');

    // 6. Vote on evidence
    await clickButton('👍 Helpful');
    await expectText('Net: +1');

    // 7. Check scoreboard updates
    await expectVisible('Looking Good!');
    await expectScoreGreaterThan('supportScore', 0);
  });

  it('should show evolution prompt when needs fixing', async () => {
    // Create multiple challenge posts with high scores
    for (let i = 0; i < 5; i++) {
      await createEvidencePost(statementId, 'Challenge', false);
      await voteHelpful(postId, 5);
    }

    // Navigate to page
    await navigateTo(`/statement/${statementId}`);

    // Should show needs fixing status
    await expectVisible('🔴 Needs Fixing');

    // Should show evolution prompt
    await expectVisible('Evolution Prompt');
    await expectText('Can we improve this idea');
    await expectVisible('Click here to suggest an Improved Version');
  });
});
```

### 4. Firebase Functions Tests

**Gemini API Integration**:
```typescript
describe('Gemini API Functions', () => {
  it('should analyze falsifiability', async () => {
    const result = await analyzeFalsifiability({
      ideaText: 'We should make things better'
    });

    expect(result.analysis.isTestable).toBe(false);
    expect(result.analysis.vagueTerms).toContain('better');
    expect(result.initialMessage).toContain('AI Guide');
  });

  it('should refine idea through dialogue', async () => {
    const result = await refineIdea({
      sessionId: 'session123',
      userResponse: 'By better I mean faster response times',
      conversationHistory: [...],
      originalIdea: 'We should make things better'
    });

    expect(result.aiMessage).toBeDefined();
    expect(result.isComplete).toBe(false);
  });
});
```

### 5. Load Testing

**Concurrent Votes**:
- Test 100 users voting on same post simultaneously
- Verify vote counts are accurate
- Verify no race conditions

**Score Calculation Performance**:
- Test with 1000 evidence posts
- Measure recalculation time
- Should complete within 2 seconds

**AI API Rate Limits**:
- Test Gemini free tier limits
- Implement queue system if needed
- Add retry logic for failed requests

---

## Notes

- **Full Three-Stage Implementation**: Includes AI Refinery, Discussion/Gauntlet, and Synthesis stages
- **Simple AI Integration**: Uses Google Gemini 2.5 Flash - easy setup, free tier, no complexity
- **MVP-Focused**: Basic weighted scoring with helpful multiplier (advanced Hebbian features deferred)
- **Backward Compatible**: Existing evaluation system completely unchanged
- **Extensible**: Easy to add advanced Hebbian features or switch AI providers later
- **User Language**: All UI text uses "Simple Folks" language from spec
- **TypeScript**: No `any` types - all properly typed per CLAUDE.md
- **CSS**: Only CSS modules, no global style imports per CLAUDE.md
- **Free to Start**: Gemini free tier is generous enough for MVP testing
- **Quick Setup**: Get API key in 2 minutes from Google AI Studio

---

## Dependencies & Prerequisites

### NPM Packages Required

**Frontend**:
```json
{
  "dependencies": {
    "react-markdown": "^9.0.0",  // For rendering AI messages
    "valibot": "^0.30.0"          // Already installed - for schemas
  }
}
```

**Functions**:
```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",  // Google Gemini API
    "firebase-functions": "^4.6.0",       // Already installed
    "firebase-admin": "^12.0.0"           // Already installed
  }
}
```

### Environment Configuration

**Firebase Functions Config**:
```bash
# Set Gemini API key
firebase functions:config:set gemini.key="YOUR_GEMINI_API_KEY"

# View current config
firebase functions:config:get
```

**Get Gemini API Key**:
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API key"
4. Copy the key

**Local Development** (`.env` for emulator):
```
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

### Firestore Collections to Create

The following collections will be automatically created on first use:
- `refinementSessions` - Stores AI Refinery conversation sessions
- `evidencePosts` - Stores support/challenge evidence posts
- `evidenceVotes` - Stores individual user votes (helpful/not-helpful)

**Note on Collections**:
- **Option 1**: Create new `evidencePosts` collection (cleaner separation)
- **Option 2**: Reuse existing `evaluations` collection with additional fields (less duplication)
- Recommend **Option 1** for MVP to keep systems separate

### Security Rules Updates

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

### Why Gemini 2.5 Flash?

The implementation uses **Google Gemini 2.5 Flash** for the MVP because:

1. **Simple & Fast**: Easy to set up, very fast responses
2. **Cost-Effective**: Free tier with generous limits
3. **No Complexity**: Single package, straightforward API
4. **Good Quality**: Sufficient for dialogue and analysis tasks
5. **Free Tier**:
   - 15 RPM (requests per minute)
   - 1 million TPM (tokens per minute)
   - 1500 RPD (requests per day)
   - Perfect for MVP testing

### Estimated Costs (Gemini 2.5 Flash)

**Free Tier Usage**:
- Falsifiability analysis: ~500 tokens = FREE (within limits)
- Refinement dialogue turn: ~800 tokens = FREE (within limits)
- Average refinement session (3-5 turns): FREE
- Daily limit: 1500 requests - plenty for MVP

**Paid Tier** (if needed later):
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens
- Very affordable even at scale

**Firestore**:
- Negligible cost for refinement sessions (small documents)
- Standard costs for evidence posts (similar to current evaluations)

**MVP Recommendations**:
- Start with free tier
- Monitor usage via Firebase console
- Implement simple rate limiting if needed (e.g., max 10 refinements/user/day)
- Upgrade to paid tier only if you hit free limits
