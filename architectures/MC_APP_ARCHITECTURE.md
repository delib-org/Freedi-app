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

Priority-based sampling using Thompson Sampling for logged-in users. This approach:
- Prioritizes under-evaluated proposals
- Boosts recent submissions (counteracts temporal bias)
- Graduates stable proposals (early stopping)
- Uses Thompson sampling for exploration/exploitation balance

**Priority Score Formula:**

```
Priority = (0.4 × Base) + (0.25 × Uncertainty) + (0.2 × Recency) + (0.15 × Threshold)
```

| Component | Weight | Description |
|-----------|--------|-------------|
| Base Priority | 40% | `1 - (evaluationCount / targetEvaluations)` |
| Uncertainty Bonus | 25% | `min(1, currentSEM / targetSEM)` |
| Recency Boost | 20% | Linear decay over 24 hours |
| Near-Threshold Bonus | 15% | Proposals near consensus threshold (0) |

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Client: SolutionFeedClient.tsx                                  │
│  - Requests batch with userId (no excludeIds needed)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  API: app/api/statements/[id]/batch/route.ts                    │
│  - Calls getAdaptiveBatch() or getRandomOptions()               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Query: src/lib/firebase/queries.ts                             │
│  - getAdaptiveBatch(): Fetches proposals + user history         │
│  - Uses ProposalSampler for selection                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sampler: src/lib/utils/proposalSampler.ts                      │
│  - ProposalSampler class                                         │
│  - scoreProposals(), selectForUser(), calculateStats()          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Utilities: src/lib/utils/sampling.ts                           │
│  - calculateStatsFromAggregates() - O(1) stats                  │
│  - calculatePriority() - Multi-factor scoring                   │
│  - thompsonSample() - Beta distribution sampling                │
│  - isStable() - Check if proposal has converged                 │
└─────────────────────────────────────────────────────────────────┘
```

**Thompson Sampling Implementation:**

```typescript
// Model ratings as Beta distribution
const alpha = positiveRatings + neutralRatings * 0.5 + 1;
const beta = negativeRatings + neutralRatings * 0.5 + 1;

// Sample from Beta distribution
const thompsonSample = sampleBeta(alpha, beta);

// Combine deterministic priority with exploration (30% exploration weight)
adjustedPriority = priority * 0.7 + thompsonSample * 0.3;
```

**Early Stopping (Stability):**

Proposals are considered "stable" when:
- `evaluationCount >= 30` (target evaluations)
- `SEM < 0.15` (target standard error)

Stable proposals are excluded from active sampling.

**Response Format:**

```typescript
{
  solutions: Statement[];      // Selected proposals
  hasMore: boolean;            // More proposals available
  count: number;               // Number returned
  stats: {
    totalCount: number;        // Total for question
    evaluatedCount: number;    // User's evaluated count
    stableCount: number;       // Converged proposals
    remainingCount: number;    // Still available
  };
  method: 'adaptive' | 'random';
}
```

**Benefits over Random Sampling:**

| Aspect | Random (randomSeed) | Adaptive (Thompson) |
|--------|---------------------|---------------------|
| Selection | Random with exclusion | Priority-based + exploration |
| Temporal fairness | None | Recency boost for new proposals |
| Efficiency | Wastes bandwidth on converged | Early stopping for stable |
| Uncertainty | Ignored | Prioritizes high-SEM proposals |
| Server handling | Client sends excludeIds | Server manages history |

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
