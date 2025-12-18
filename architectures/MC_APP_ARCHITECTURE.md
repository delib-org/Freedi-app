# Mass Consensus (MC) App Architecture

This document provides a comprehensive overview of the Mass Consensus application architecture.

## Overview

The Mass Consensus app is a **Next.js 14** application designed for large-scale crowdsourced consensus building. It provides a streamlined interface for evaluating solutions, submitting suggestions, and viewing aggregated results.

**Key Goal:** Enable thousands of anonymous participants to evaluate solutions and reach consensus on complex questions.

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router, SSR) |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (optional) |
| AI | Google Gemini API |
| Styling | CSS Modules + SCSS |
| i18n | @freedi/shared-i18n |
| Types | delib-npm, @freedi/shared-types |

## Directory Structure

```
/apps/mass-consensus
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── ai/feedback/          # AI feedback generation
│   │   ├── evaluations/[id]/     # Evaluation submission
│   │   ├── questions/            # Question management
│   │   ├── statements/[id]/      # Statement operations
│   │   │   ├── batch/           # Random batch loading
│   │   │   ├── check-similar/   # Similarity detection
│   │   │   ├── detect-multi/    # Multi-suggestion detection
│   │   │   ├── stats/           # Statistics
│   │   │   └── submit/          # Solution submission
│   │   ├── surveys/[id]/        # Survey management
│   │   └── user-evaluations/    # User tracking
│   ├── admin/                    # Admin dashboard
│   ├── q/[statementId]/         # Single question (SSR)
│   ├── s/[surveyId]/            # Multi-question surveys
│   ├── login/                    # Authentication
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page
│
├── src/
│   ├── components/              # React components
│   │   ├── admin/              # Admin dashboard
│   │   ├── auth/               # Authentication
│   │   ├── completion/         # Completion screens
│   │   ├── question/           # Question components
│   │   ├── results/            # Results display
│   │   ├── shared/             # Modal, Toast, Skeleton
│   │   └── survey/             # Survey components
│   │
│   ├── lib/                     # Core logic
│   │   ├── auth/               # Authorization
│   │   ├── firebase/           # Firebase integration
│   │   │   ├── admin.ts        # Admin SDK
│   │   │   ├── client.ts       # Client SDK
│   │   │   ├── queries.ts      # Firestore queries
│   │   │   └── surveys.ts      # Survey operations
│   │   └── utils/
│   │       ├── consensusColors.ts
│   │       ├── errorHandling.ts
│   │       ├── proposalSampler.ts  # Thompson Sampling batch selection
│   │       ├── sampling.ts         # Sampling utilities & priority scoring
│   │       └── user.ts
│   │
│   ├── constants/              # Application constants
│   └── types/                  # TypeScript types
│
├── public/                      # Static assets
├── next.config.js              # Next.js config
└── package.json                # Dependencies
```

## Application Flow

### User Journey

```
Home Page (/)
    │
    ├── Participant Flow
    │   └── Question Page (/q/[statementId])
    │       ├── Batch Loading (6 solutions at a time)
    │       ├── Evaluation (5-point scale)
    │       ├── Solution Submission (optional)
    │       └── Results View
    │
    └── Admin Flow
        └── Admin Dashboard (/admin)
            ├── Survey Creation
            ├── Question Management
            └── Statistics View
```

### Data Flow

```
Firebase Firestore
       │
       ▼
API Routes (Server)
       │
       ▼
React Components (Client)
       │
       ▼
Local State (useState, useEffect)
```

## Key Features

### 1. Anonymous Participation

- No login required for evaluation
- Anonymous user ID generated: `anon_[timestamp]_[random]`
- Stored in localStorage and cookies
- Full participation without friction

### 2. Batch Loading

The app supports two batch loading strategies:

#### 2.1 Random Batch Loading (Fallback)

Basic random batch loading using `randomSeed` field (used for anonymous users):

```typescript
async function getRandomOptions(questionId: string, params: BatchParams) {
  const { size = 6, userId, excludeIds = [] } = params;

  // Random seed-based sampling
  const randomValue = Math.random();

  // Query both sides of random value for fairness
  const upperQuery = collection
    .where('parentId', '==', questionId)
    .where('randomSeed', '>=', randomValue)
    .limit(size);

  const lowerQuery = collection
    .where('parentId', '==', questionId)
    .where('randomSeed', '<', randomValue)
    .orderBy('randomSeed', 'desc')
    .limit(size);

  // Merge and deduplicate results
  return mergeAndShuffle(upperResults, lowerResults, size);
}
```

#### 2.2 Adaptive Batch Loading (Thompson Sampling)

Based on the paper "Adaptive Sampling Mechanisms for Large-Scale Deliberative Democracy Platforms" (December 2024), this mechanism addresses the fundamental challenge of enabling millions of participants to contribute proposals while ensuring fair evaluation coverage.

##### 2.2.1 The Consensus Scoring Model

Participants rate proposals on a continuous scale from -1 (strongly dislike) to +1 (strongly like). Each proposal's consensus strength is measured using:

```
Consensus Score = μ - SEM
```

Where μ is the mean rating and SEM (Standard Error of Mean) is `σ/√n`. This formulation is deliberately conservative: proposals with fewer evaluations (higher SEM) receive lower consensus scores, reflecting uncertainty about their true population support.

##### 2.2.2 Problems Addressed

| Problem | Description |
|---------|-------------|
| **Temporal Bias** | Earlier proposals accumulate more evaluations, achieving statistical reliability while newer proposals languish |
| **Uniform Treatment** | All under-evaluated proposals treated equally, ignoring that some need more evaluations (high variance) while others have converged |
| **No Early Stopping** | Proposals that have clearly converged continue consuming evaluation bandwidth |
| **Semantic Redundancy** | Users may be shown multiple similar proposals, reducing coverage of the idea space |

##### 2.2.3 Priority Score Formula

Each proposal's priority for selection is computed as a weighted combination of five factors:

```
Priority = (0.4 × Base) + (0.25 × Uncertainty) + (0.2 × Recency) + (0.15 × Threshold) × SkipPenalty
```

| Component | Weight | Formula | Description |
|-----------|--------|---------|-------------|
| **Base Priority** | 40% | `max(0, 1 - evaluationCount/targetEvaluations)` | Under-evaluated proposals get higher priority |
| **Uncertainty Bonus** | 25% | `min(1, currentSEM/targetSEM)` | High SEM proposals need more data for reliable estimates |
| **Recency Boost** | 20% | `hoursOld < boostWindow ? (1 - hoursOld/boostWindow) : 0` | Newer proposals get temporary priority boost (counteracts temporal bias) |
| **Near-Threshold Bonus** | 15% | `|mean - threshold| < SEM × 1.96 ? min(1, CI_width/(distance + 0.1)) : 0` | Proposals with confidence intervals overlapping decision thresholds get priority |
| **Skip Penalty** | multiplier | `skipRate > maxSkipRate ? 0.5 : 1.0` | Frequently skipped proposals receive reduced priority |

##### 2.2.4 Thompson Sampling Integration

Thompson Sampling is a multi-armed bandit technique that balances exploration (evaluating uncertain proposals) with exploitation (gathering data on promising ones). Each proposal's rating distribution is modeled as a Beta distribution:

```typescript
// Transform ratings from [-1, 1] to Beta distribution parameters
const alpha = positiveRatings + neutralRatings * 0.5 + 1;  // +1 prior
const beta = negativeRatings + neutralRatings * 0.5 + 1;

// Sample from Beta distribution
const thompsonSample = sampleBeta(alpha, beta);

// Final selection score combines deterministic priority with Thompson sample
adjustedPriority = priority × (1 - explorationWeight) + thompsonSample × explorationWeight;
```

This injects principled stochasticity that naturally balances exploration and exploitation.

##### 2.2.5 Early Stopping for Stable Proposals

Proposals achieving both sufficient evaluations and low SEM are marked as "stable" and graduated from active sampling:

```typescript
isStable = (evaluationCount >= minEvaluations) && (SEM < targetSEM)
```

This frees evaluation bandwidth for proposals that still need data, improving overall system efficiency.

##### 2.2.6 Semantic Diversity Constraints (Future Enhancement)

When millions of proposals exist, many will express similar ideas. To ensure users see diverse options:
- Pre-cluster proposals using embedding-based similarity
- Limit selections to at most K proposals per cluster
- Reduces redundancy and improves coverage of the idea space

##### 2.2.7 Stratified Time Cohorts (Future Enhancement)

As an additional safeguard against temporal bias, proposals can be grouped into time cohorts (e.g., hourly buckets), with sampling drawing proportionally from each cohort:

```typescript
// Create time cohorts
const cohorts = groupProposalsBySubmissionHour(proposals);

// Sample proportionally from each cohort
const perCohort = Math.ceil(totalSampleSize / cohorts.length);
for (const cohort of cohorts) {
  selected.push(...sampler.selectFromCohort(cohort, perCohort));
}
```

##### 2.2.8 Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `targetEvaluations` | 30 | Ideal number of evaluations per proposal |
| `targetSEM` | 0.15 | SEM threshold for considering a proposal stable |
| `explorationWeight` | 0.3 | Weight of Thompson sampling vs. deterministic priority |
| `recencyBoostHours` | 24 | Window during which new proposals receive priority boost |
| `maxSkipRate` | 0.5 | Skip rate above which proposals get flagged |
| `diversityClusters` | 2 | Max proposals from same semantic cluster per sample |

##### 2.2.9 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client: SolutionFeedClient.tsx                                  │
│  - Requests batch with userId (no excludeIds needed)            │
│  - Server manages all filtering and prioritization              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  API: app/api/statements/[id]/batch/route.ts                    │
│  - Calls getAdaptiveBatch() for logged-in users                 │
│  - Falls back to getRandomOptions() for anonymous users         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Query: src/lib/firebase/queries.ts                             │
│  - getAdaptiveBatch(): Fetches proposals + user history         │
│  - Uses ProposalSampler for intelligent selection               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sampler: src/lib/utils/proposalSampler.ts                      │
│  - ProposalSampler class                                         │
│  - scoreProposals(): Calculate priority for all proposals       │
│  - selectForUser(): Filter evaluated + select by priority       │
│  - calculateStats(): Return batch statistics                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Utilities: src/lib/utils/sampling.ts                           │
│  - calculateStatsFromAggregates(): O(1) stats from aggregates   │
│  - calculatePriority(): Multi-factor priority scoring           │
│  - thompsonSample(): Beta distribution sampling                 │
│  - isStable(): Check if proposal has converged                  │
└─────────────────────────────────────────────────────────────────┘
```

##### 2.2.10 Response Format

```typescript
{
  solutions: Statement[];      // Selected proposals (priority-ordered)
  hasMore: boolean;            // More proposals available
  count: number;               // Number returned
  stats: {
    totalCount: number;        // Total proposals for question
    evaluatedCount: number;    // User's evaluated count
    stableCount: number;       // Converged proposals (graduated)
    remainingCount: number;    // Still available for evaluation
  };
  method: 'adaptive' | 'random';
}
```

##### 2.2.11 Advantages Over Baseline Random Sampling

| Aspect | Random (randomSeed) | Adaptive (Thompson Sampling) |
|--------|---------------------|------------------------------|
| **Selection Method** | Random with exclusion filter | Priority-based + principled exploration |
| **Temporal Fairness** | None (earlier = more evaluations) | Recency boost counteracts temporal bias |
| **Resource Efficiency** | Wastes bandwidth on converged | Early stopping frees bandwidth |
| **Uncertainty Handling** | Ignored | Prioritizes high-SEM proposals |
| **Near-Threshold** | Random coverage | Focuses on proposals needing decisive data |
| **Skip Behavior** | Ignored | Penalizes frequently skipped proposals |
| **Server Handling** | Client sends excludeIds | Server manages evaluation history |

##### 2.2.12 Computational Complexity

- **Priority Scoring**: O(n) where n is active proposals - acceptable for real-time serving
- **Proposals can be pre-scored and cached** for performance optimization
- **Semantic Clustering** (future): O(n × d) offline process where d is embedding dimensionality

##### 2.2.13 References

- Thompson, W.R. (1933). On the Likelihood that One Unknown Probability Exceeds Another in View of the Evidence of Two Samples. *Biometrika*, 25(3/4), 285-294.
- Russo, D., Van Roy, B., et al. (2018). A Tutorial on Thompson Sampling. *Foundations and Trends in Machine Learning*, 11(1), 1-96.
- Fishkin, J.S. (2018). Democracy When the People Are Thinking. Oxford University Press.
- Small, C., et al. (2021). Polis: Scaling Deliberation by Mapping High Dimensional Opinion Spaces. *Recerca*, 26(2).

### 3. 5-Point Evaluation

```typescript
const EVALUATION_VALUES = [-1, -0.5, 0, 0.5, 1];

// Mapped to emojis
const EVALUATION_EMOJIS = ['😠', '😕', '😐', '🙂', '😊'];
```

### 4. Solution Submission

Workflow:
1. User enters text (3-500 characters)
2. AI checks for similar existing solutions
3. AI detects multiple suggestions
4. AI generates title/description
5. Solution created with +1 self-vote

### 5. Multi-Question Surveys

```typescript
interface Survey {
  surveyId: string;
  title: string;
  description: string;
  questionIds: string[];
  settings: SurveySettings;
  status: 'draft' | 'active' | 'closed';
}

interface SurveyProgress {
  surveyId: string;
  userId: string;
  currentQuestionIndex: number;
  completedQuestionIds: string[];
  isCompleted: boolean;
}
```

## Component Architecture

### Server/Client Split

**Server Components (RSC):**
- `QuestionHeader` - Static question display
- `SolutionFeed` - Initial data fetching
- `ResultsList` - Pre-fetched results

**Client Components ('use client'):**
- `SolutionFeedClient` - Interactive batch loading
- `SolutionCard` - Solution interactions
- `EvaluationButtons` - Rating UI
- `AddSolutionForm` - Submission form
- `AuthProvider` - Firebase auth context

### Component Hierarchy

```
Page (Server)
  └── PageClient (Client)
      ├── QuestionHeader
      ├── SolutionFeed
      │   └── SolutionCard[]
      │       ├── SolutionContent
      │       └── EvaluationButtons
      ├── AddSolutionForm
      │   └── SolutionPromptModal
      └── ResultsSection
          └── ResultCard[]
```

## State Management

### Minimal State Approach

No Redux or Zustand. Instead:

1. **React Context**: `AuthProvider` for auth state
2. **Local State**: `useState` for component state
3. **localStorage**: Anonymous user ID
4. **Cookies**: User ID for server access
5. **Firestore**: Source of truth for all data

### Auth Context

```typescript
interface AuthContext {
  user: User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}
```

## API Routes

### Endpoint Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/statements/[id]/batch` | POST | Get random batch |
| `/api/statements/[id]/submit` | POST | Submit solution |
| `/api/statements/[id]/check-similar` | POST | Find similar (AI) |
| `/api/statements/[id]/detect-multi` | POST | Detect multiple (AI) |
| `/api/statements/[id]/stats` | GET | Participant count |
| `/api/evaluations/[id]` | POST/GET | Submit/get evaluation |
| `/api/user-evaluations/[questionId]` | GET | User's evaluations |
| `/api/ai/feedback` | POST | AI improvement feedback |
| `/api/surveys/` | GET/POST | List/create surveys |
| `/api/surveys/[id]` | GET/PUT | Get/update survey |
| `/api/surveys/[id]/progress` | GET/POST | Track progress |

### Example: Batch Endpoint

```typescript
// /api/statements/[id]/batch/route.ts
export async function POST(req: Request, { params }) {
  const { id: questionId } = params;
  const { userId, excludeIds = [], size = 6 } = await req.json();

  // Get random options excluding already evaluated
  const options = await getRandomOptions(questionId, {
    size,
    userId,
    excludeIds,
  });

  return NextResponse.json({ options });
}
```

## Firebase Integration

### Queries (lib/firebase/queries.ts)

```typescript
// Get question by ID
export async function getQuestionFromFirebase(statementId: string): Promise<Statement | null>

// Get random batch
export async function getRandomOptions(questionId: string, params: BatchParams): Promise<Statement[]>

// Get sorted results
export async function getAllSolutionsSorted(questionId: string, limit?: number): Promise<Statement[]>

// Get user's solutions
export async function getUserSolutions(questionId: string, userId: string): Promise<Statement[]>

// Update consensus
export async function updateStatementConsensus(statementId: string): Promise<void>
```

### Collections

| Collection | Purpose |
|------------|---------|
| `statements` | Questions and solutions |
| `evaluations` | User evaluations |
| `surveys` | Survey definitions |
| `surveyProgress` | User progress tracking |

### Document Structure

```typescript
// Statement (Question or Solution)
{
  statementId: string;
  statement: string;           // Title
  description?: string;        // Details
  statementType: 'question' | 'option';
  parentId: string;            // Parent question ID
  creatorId: string;
  createdAt: number;           // Milliseconds
  consensus: number;           // -1 to +1
  randomSeed: number;          // 0-1 for sampling
  hide: boolean;               // Soft delete
}

// Evaluation
{
  evaluationId: `${userId}--${statementId}`;
  statementId: string;
  parentId: string;
  evaluatorId: string;
  evaluation: number;          // -1 to +1
  updatedAt: number;
}
```

## AI Integration

### Gemini API Usage

```typescript
// Check for similar solutions
const response = await fetch(`/api/statements/${questionId}/check-similar`, {
  method: 'POST',
  body: JSON.stringify({ userInput }),
});
const { similarStatements } = await response.json();

// Detect multiple suggestions
const response = await fetch(`/api/statements/${questionId}/detect-multi`, {
  method: 'POST',
  body: JSON.stringify({ userInput }),
});
const { suggestions } = await response.json();

// Generate feedback
const response = await fetch('/api/ai/feedback', {
  method: 'POST',
  body: JSON.stringify({
    userSolution,
    topSolutions,
    context
  }),
});
const { feedback } = await response.json();
```

## Styling

### CSS Modules

Each component has its own `.module.scss` or `.module.css`:

```typescript
// Component
import styles from './SolutionCard.module.css';

return (
  <div className={styles.card}>
    <div className={styles.content}>{content}</div>
  </div>
);
```

### Global Styles

```scss
// app/globals.css
:root {
  --btn-primary: #5f88e5;
  --text-body: #3d4d71;
  --bg-muted: #f7fafc;
  --agree: #4caf50;
  --disagree: #f44336;
}
```

### Responsive Design

- Mobile-first approach
- Flexbox layouts
- CSS Grid for complex layouts
- Media queries for breakpoints

## Performance

### Optimization Strategies

1. **Server-Side Rendering**: Main pages use SSR
2. **Code Splitting**: Next.js automatic splitting
3. **Lazy Loading**: Components load on demand
4. **Efficient Sampling**: `randomSeed` index for O(1) random selection
5. **Batch Loading**: Load 6 at a time vs. all at once

### Performance Targets

| Metric | Target | Achieved |
|--------|--------|----------|
| First Contentful Paint | < 0.8s | ~0.6s |
| Largest Contentful Paint | < 1.2s | ~1.0s |
| Time to Interactive | < 2.0s | ~1.8s |
| Initial Bundle | < 80KB | ~65KB |

## Integration with Main App

### Shared Dependencies

- `delib-npm` - Core types (Statement, Evaluation)
- `@freedi/shared-i18n` - Internationalization
- Firebase project - Same Firestore database

### Data Compatibility

✅ Full compatibility with existing Freedi data:
- Uses same `statements` collection
- Same `evaluations` collection
- No migration required
- Seamless data sharing

### URL Strategy

| App | URL Pattern |
|-----|-------------|
| MC App | `discuss.freedi.app/[statementId]` |
| Main App | `freedi.app/statement/[statementId]` |

## Routing Structure

```
/                           Home (decision point)
├── /login                  Google sign-in
├── /q/[statementId]       Single question (SSR)
│   └── /results           Results view
├── /s/[surveyId]          Survey entry
│   └── /q/[index]         Survey question
│   └── /complete          Completion
└── /admin                  Admin dashboard
    ├── /surveys           Survey list
    ├── /surveys/new       Create survey
    └── /surveys/[id]      Edit survey
```

## Environment Configuration

```env
# Firebase Client (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=

# Firebase Admin (Private)
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# AI
GEMINI_API_KEY=
CHECK_SIMILARITIES_ENDPOINT=

# Development
USE_FIREBASE_EMULATOR=true
FIRESTORE_EMULATOR_HOST=localhost:8081
```

## Key Design Decisions

1. **Anonymous-First**: No login friction for participants
2. **Server-First**: SSR for performance and SEO
3. **Minimal State**: No Redux, just React Context + hooks
4. **API-Driven**: Client-agnostic API routes
5. **Adaptive Sampling**: Thompson Sampling for fair proposal selection (random fallback for anonymous)
6. **Batch Loading**: 6 solutions at a time for optimal UX
7. **Early Stopping**: Stable proposals excluded from active sampling to save bandwidth

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout with providers |
| `app/q/[statementId]/page.tsx` | Main question page |
| `app/api/statements/[id]/batch/route.ts` | Batch loading API endpoint |
| `src/lib/firebase/queries.ts` | Firestore queries (incl. getAdaptiveBatch) |
| `src/lib/utils/sampling.ts` | Thompson Sampling utilities & priority scoring |
| `src/lib/utils/proposalSampler.ts` | ProposalSampler class for batch selection |
| `src/lib/utils/user.ts` | Anonymous user utilities |
| `src/components/question/` | Question components |
| `src/constants/common.ts` | Application constants |
