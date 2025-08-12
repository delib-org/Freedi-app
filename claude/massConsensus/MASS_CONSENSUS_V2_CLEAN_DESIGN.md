# Mass Consensus V2 - Clean Architecture Design

## Overview
A complete redesign of Mass Consensus system supporting multiple questions with flexible structures, inter-question dependencies, and aggregation - without legacy constraints.

## Core Principles
1. **No backward compatibility needed** - Fresh start
2. **Protect only**: Statement collections, User data, Evaluations, Votes (if they exist)
3. **Dismiss**: Old mass consensus process structure
4. **Build new**: Flexible, powerful multi-question system with varied question structures

## 1. New Database Structure (Clean Slate)

### 1.1 Collections to DELETE/IGNORE
```
❌ massConsensusProcesses/ (old structure - dismiss)
❌ massConsensusMembers/ (old structure - dismiss)
```

### 1.2 Collections to PROTECT (if they exist)
```
✅ statements/ (keep - core data)
✅ users/ (keep - user accounts)
✅ evaluations/ (keep if exists - can be reused)
✅ votes/ (keep if exists - can be reused)
```

### 1.3 NEW Collections Structure
```
firestore/
├── mcSessions/                    // NEW - replaces old system
│   └── {sessionId}/
│       ├── metadata
│       │   ├── title
│       │   ├── description
│       │   ├── createdBy
│       │   ├── createdAt
│       │   └── status
│       │
│       ├── questions/              // Subcollection
│       │   └── {questionId}/
│       │       ├── config
│       │       ├── structure
│       │       ├── dependencies
│       │       └── results
│       │
│       └── aggregation/            // Subcollection
│           └── settings
│
├── mcParticipants/                // NEW - replaces massConsensusMembers
│   └── {sessionId}_{userId}/
│       ├── progress
│       ├── responses
│       └── inheritedData
│
├── mcResponses/                   // NEW - all response data
│   └── {sessionId}/
│       └── {questionId}/
│           └── {userId}/
│               ├── suggestions
│               ├── evaluations
│               ├── votes
│               ├── rankings
│               ├── allocations
│               └── timestamp
│
└── mcResults/                     // NEW - aggregated results
    └── {sessionId}/
        ├── questionResults/
        │   └── {questionId}/
        └── aggregatedResults/
```

## 2. Flow Architecture - Flexible Question Structures

### 2.1 Visual Flow with Different Question Types
```
┌─────────────────────────────────────────────────────────────────┐
│                    MASS CONSENSUS SESSION                        │
│                  "Community Planning Session"                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │ Introduction │ (Shared - Once at start)                     │
│  └──────┬───────┘                                              │
│         ▼                                                       │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 1: BRAINSTORMING                                ║  │
│  ║ "What challenges does our community face?"               ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Idea Input] → [AI Clustering] → [Review]  │   ║  │
│  ║ │ Output: List of categorized challenges             │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 2: RANKING                                      ║  │
│  ║ "Prioritize these challenges" (uses Q1 output)          ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Display Items] → [Drag & Order]            │   ║  │
│  ║ │ Output: Ordered priority list                      │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 3: CONSENSUS BUILDING                           ║  │
│  ║ "How to solve {{Q2.top_priority}}?"                     ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Submit Solutions] → [Similar Check] →      │   ║  │
│  ║ │        [Evaluate Random] → [Evaluate Top] →        │   ║  │
│  ║ │        [Final Voting]                              │   ║  │
│  ║ │ Output: Top voted solutions with consensus score   │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 4: ALLOCATION                                   ║  │
│  ║ "Distribute $100k budget across top solutions"           ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Show Categories] → [Slider Allocation]     │   ║  │
│  ║ │ Output: Budget distribution                        │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 5: BINARY DECISION                              ║  │
│  ║ "Approve this plan for immediate implementation?"        ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Show Summary] → [Yes/No Vote]              │   ║  │
│  ║ │ Output: Approval decision                          │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 6: MULTIPLE CHOICE (Conditional on Q5=Yes)      ║  │
│  ║ "Select implementation timeline"                         ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Options Display] → [Single Selection]      │   ║  │
│  ║ │ Output: Selected timeline                          │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AGGREGATION SUMMARY                         │  │
│  │  • Cross-question consensus analysis                     │  │
│  │  • Budget vs Priority correlation                        │  │
│  │  • Final recommendations                                 │  │
│  │  • Export report                                         │  │
│  └──────────────┬───────────────────────────────────────────┘  │
│                 ▼                                               │
│  ┌──────────────┐                                              │
│  │   Thank You  │ (Shared - Once at end)                       │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Step Variations Per Question Type

```typescript
// Different questions have completely different step structures
const questionStructures = {
  // BRAINSTORMING: 3 steps
  question1: {
    type: 'BRAINSTORM',
    steps: ['idea_input', 'ai_clustering', 'review']
  },
  
  // RANKING: 2 steps
  question2: {
    type: 'RANK_ORDER',
    steps: ['display_items', 'drag_order']
  },
  
  // CONSENSUS: 5 steps (traditional mass consensus)
  question3: {
    type: 'CONSENSUS',
    steps: ['submit', 'similarity', 'eval_random', 'eval_top', 'vote']
  },
  
  // ALLOCATION: 2 steps
  question4: {
    type: 'DISTRIBUTE',
    steps: ['show_categories', 'slider_allocation']
  },
  
  // BINARY: 2 steps
  question5: {
    type: 'BINARY',
    steps: ['show_summary', 'yes_no_vote']
  },
  
  // MULTIPLE CHOICE: 2 steps
  question6: {
    type: 'SINGLE_CHOICE',
    steps: ['options_display', 'single_selection']
  }
};
```

## 3. Core Data Models (No Legacy)

### 2.1 Session Model
```typescript
// Completely new structure - no legacy fields
interface MCSession {
  sessionId: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: number;
  
  // Configuration
  config: {
    allowAnonymous: boolean;
    requireAuth: boolean;
    isPublic: boolean;
    maxParticipants?: number;
  };
  
  // Status
  status: 'draft' | 'active' | 'closed' | 'archived';
  
  // Questions order and dependencies
  questionFlow: {
    questions: string[]; // Question IDs in order
    dependencies: DependencyGraph;
    aggregation: AggregationSettings;
  };
  
  // Shared components
  sharedComponents: {
    hasIntro: boolean;
    hasDemographics: boolean;
    hasAggregationSummary: boolean;
    hasFeedback: boolean;
  };
  
  // Metrics
  metrics: {
    totalParticipants: number;
    completionRate: number;
    averageTimeMinutes: number;
  };
}
```

### 3.2 Question Model with Flexible Steps
```typescript
// Clean question structure with flexible step configuration
interface MCQuestion {
  questionId: string;
  sessionId: string;
  
  // Content
  content: {
    text: string;                    // The question text
    description?: string;            // Additional context
    dynamicTemplate?: string;        // Template with {{references}}
  };
  
  // Flexible structure - each question type has different steps
  structure: {
    type: QuestionType;
    
    // Steps vary completely by question type
    steps: QuestionStep[];           // Dynamic steps based on type
    
    // Optional components for custom layouts
    components?: ComponentConfig[];
    
    // Step flow control
    flow: {
      sequential: boolean;           // Steps in order?
      allowSkip: boolean;           // Can skip steps?
      allowBack: boolean;           // Can go back?
      conditional?: StepCondition[]; // Conditional step display
    };
    
    // Validation per step
    validation: {
      perStep: { [stepId: string]: ValidationRule };
      onComplete: ValidationRule;
    };
  };
  
  // Dependencies on other questions
  dependencies?: {
    requires: QuestionDependency[];  // What this needs from others
    provides: DataProvision[];       // What this gives to others
  };
  
  // Display rules
  display: {
    condition?: ConditionExpression; // When to show this question
    required: boolean;               // Can be skipped?
    order: number;                   // Display order
  };
}

// Flexible step configuration
interface QuestionStep {
  stepId: string;
  type: StepType;                   // Step type from registry
  
  // Step-specific configuration
  config: {
    // Common fields
    title?: string;
    description?: string;
    
    // Type-specific fields (varies by step type)
    [key: string]: any;
  };
  
  // Step behavior
  behavior: {
    required: boolean;
    timeEstimate?: number;           // Estimated seconds
    minInteraction?: number;         // Minimum interaction time
  };
  
  // Data this step produces
  output?: {
    field: string;                  // Field name in response
    type: 'single' | 'array' | 'object';
  };
}
```

### 2.3 Question Types (Fresh Design)
```typescript
enum QuestionType {
  // Deliberation types
  CONSENSUS = 'consensus',           // Full suggestion → evaluation → voting
  BRAINSTORM = 'brainstorm',         // Idea generation only
  EVALUATE = 'evaluate',             // Rate existing options
  
  // Voting types  
  SINGLE_CHOICE = 'single_choice',   // Pick one
  MULTI_CHOICE = 'multi_choice',     // Pick multiple
  BINARY = 'binary',                 // Yes/No
  
  // Ranking types
  RANK_ORDER = 'rank_order',         // Order items
  PRIORITY_MATRIX = 'priority_matrix', // 2D positioning
  
  // Allocation types
  DISTRIBUTE = 'distribute',         // Allocate resources
  SCALE_RATE = 'scale_rate',        // Rate on scale
  
  // Input types
  TEXT_INPUT = 'text_input',         // Open text
  CUSTOM = 'custom'                  // Custom component
}
```

### 2.4 Component System (Modular)
```typescript
// Each question is built from components
interface ComponentConfig {
  type: ComponentType;
  config: any; // Component-specific config
  order: number;
}

enum ComponentType {
  // Input components
  TEXT_FIELD = 'text_field',
  SUGGESTION_BOX = 'suggestion_box',
  
  // Display components
  OPTION_LIST = 'option_list',
  CARD_GRID = 'card_grid',
  
  // Interaction components
  VOTE_BUTTONS = 'vote_buttons',
  DRAG_RANK = 'drag_rank',
  SLIDER = 'slider',
  ALLOCATION_BARS = 'allocation_bars',
  
  // Process components
  AI_SIMILARITY = 'ai_similarity',
  RANDOM_SELECTOR = 'random_selector',
  TOP_FILTER = 'top_filter',
  
  // Result components
  CHART = 'chart',
  CONSENSUS_METER = 'consensus_meter',
  RESULT_TABLE = 'result_table'
}
```

## 3. Response & Result Models

### 3.1 Participant Response
```typescript
// Clean response structure
interface MCResponse {
  sessionId: string;
  questionId: string;
  userId: string;
  
  // Response data (varies by question type)
  data: {
    // For consensus questions
    suggestions?: string[];
    evaluations?: { targetId: string; score: number }[];
    votes?: { targetId: string; weight: number }[];
    
    // For ranking questions
    rankings?: { itemId: string; rank: number }[];
    
    // For allocation questions
    allocations?: { categoryId: string; amount: number }[];
    
    // For choice questions
    choices?: string[];
    
    // For text questions
    text?: string;
    
    // Custom data
    custom?: any;
  };
  
  // Metadata
  timestamp: number;
  timeSpent: number; // seconds
  device: 'mobile' | 'desktop';
}
```

### 3.2 Question Results
```typescript
interface MCQuestionResult {
  questionId: string;
  sessionId: string;
  
  // Participation
  participation: {
    total: number;
    completed: number;
    skipped: number;
  };
  
  // Results (varies by type)
  results: {
    // For consensus
    topSuggestions?: RankedItem[];
    consensus?: number;
    
    // For voting
    voteDistribution?: VoteCount[];
    winner?: string;
    
    // For ranking
    aggregateRanking?: RankedItem[];
    
    // For allocation
    averageAllocation?: AllocationResult[];
    
    // Statistical
    statistics?: Statistics;
  };
  
  // Insights
  insights: {
    consensusLevel: 'high' | 'medium' | 'low';
    participation: 'high' | 'medium' | 'low';
    keyFindings: string[];
  };
}
```

## 4. Migration Strategy (From Nothing)

Since we're starting fresh:

```typescript
// No migration needed - just create new
async function initializeMassConsensusV2() {
  // 1. Create new collections
  await createCollections([
    'mcSessions',
    'mcParticipants', 
    'mcResponses',
    'mcResults'
  ]);
  
  // 2. Set up indexes
  await createIndexes();
  
  // 3. Initialize with sample session (optional)
  await createSampleSession();
  
  // 4. Old collections can be archived or deleted
  // No data migration needed
}
```

## 5. API Design (Clean)

### 5.1 Session Management
```typescript
// All new endpoints - no legacy support
class MCSessionAPI {
  // Session CRUD
  POST   /api/mc/sessions                    // Create session
  GET    /api/mc/sessions/:id                // Get session
  PUT    /api/mc/sessions/:id                // Update session
  DELETE /api/mc/sessions/:id                // Delete session
  
  // Question management
  POST   /api/mc/sessions/:id/questions      // Add question
  PUT    /api/mc/sessions/:id/questions/:qid // Update question
  DELETE /api/mc/sessions/:id/questions/:qid // Remove question
  
  // Participation
  POST   /api/mc/sessions/:id/join          // Join session
  POST   /api/mc/sessions/:id/leave         // Leave session
  
  // Responses
  POST   /api/mc/responses                  // Submit response
  GET    /api/mc/responses/:sid/:qid        // Get responses
  
  // Results
  GET    /api/mc/results/:sid               // Get all results
  GET    /api/mc/results/:sid/:qid          // Get question results
  GET    /api/mc/results/:sid/aggregate     // Get aggregated results
}
```

### 5.2 No Legacy Endpoints
```typescript
// These OLD endpoints are REMOVED:
❌ /api/mass-consensus/*  (old system)
❌ /api/statements/*/massConsensus/* (old system)

// Everything is under new /api/mc/* namespace
✅ /api/mc/* (new system)
```

## 6. Frontend Routes (Clean)

### 6.1 Old Routes (Remove)
```
❌ /mass-consensus/:statementId/:step  (old format)
```

### 6.2 New Routes
```
✅ /mc/:sessionId                      // Session home
✅ /mc/:sessionId/intro                // Introduction
✅ /mc/:sessionId/q/:questionIndex     // Question
✅ /mc/:sessionId/summary              // Aggregation summary
✅ /mc/:sessionId/complete             // Completion

// Admin routes
✅ /mc/create                          // Create new session
✅ /mc/:sessionId/edit                 // Edit session
✅ /mc/:sessionId/results              // View results
```

## 7. Component Architecture (New)

### 7.1 Remove Old Components
```typescript
// DELETE these files:
❌ MassConsensus.tsx (old container)
❌ MassConsensusVM.ts (old view model)
❌ massConsensusSlice.ts (old Redux)
❌ All old step components
```

### 7.2 New Component Structure
```
src/view/pages/mc/  (NEW - Mass Consensus V2)
├── MCSession/
│   ├── MCSession.tsx           // Main container
│   ├── MCSessionProvider.tsx   // Context provider
│   └── MCSessionRouter.tsx     // Route handler
│
├── questions/
│   ├── MCQuestion.tsx          // Question renderer
│   ├── MCQuestionFactory.tsx   // Creates question by type
│   └── types/
│       ├── ConsensusQuestion.tsx
│       ├── RankingQuestion.tsx
│       ├── VotingQuestion.tsx
│       └── ... (other types)
│
├── components/
│   ├── MCProgress.tsx          // Progress indicator
│   ├── MCNavigation.tsx        // Navigation
│   ├── MCAggregation.tsx       // Summary view
│   └── shared/
│       ├── VoteInterface.tsx
│       ├── RankInterface.tsx
│       └── ... (reusable)
│
└── hooks/
    ├── useMCSession.ts
    ├── useMCQuestion.ts
    └── useMCResponse.ts
```

## 8. State Management (Clean)

### 8.1 New Redux Structure
```typescript
// New clean state
interface MCState {
  // Current session
  session: {
    current: MCSession | null;
    loading: boolean;
    error: string | null;
  };
  
  // Questions
  questions: {
    items: MCQuestion[];
    currentIndex: number;
    responses: { [questionId: string]: MCResponse };
  };
  
  // Results
  results: {
    questionResults: { [questionId: string]: MCQuestionResult };
    aggregated: AggregatedResult | null;
  };
  
  // UI State
  ui: {
    progress: number;
    currentComponent: string;
    navigationEnabled: boolean;
  };
}
```

## 9. Benefits of Clean Design

1. **No Legacy Debt**: Start fresh without old constraints
2. **Optimized Structure**: Designed for multi-question from the start
3. **Clear Separation**: Old system completely separate from new
4. **Modern Patterns**: Use latest React/Firebase patterns
5. **Type Safety**: Full TypeScript with no legacy compromises
6. **Performance**: Optimized data structure for queries
7. **Flexibility**: Easy to extend without breaking changes

## 10. Concrete Examples - Different Step Structures

### 10.1 Example Session with Varied Questions
```typescript
const urbanPlanningSession: MCSession = {
  sessionId: "urban-2024",
  title: "Urban Development Planning",
  questions: [
    {
      // Question 1: Brainstorming (3 steps)
      questionId: "q1",
      content: { text: "What improvements does our city need?" },
      structure: {
        type: QuestionType.BRAINSTORM,
        steps: [
          {
            stepId: "input",
            type: StepType.IDEA_SUBMISSION,
            config: { 
              minIdeas: 1, 
              maxIdeas: 5,
              placeholder: "Enter your idea..."
            }
          },
          {
            stepId: "cluster",
            type: StepType.AI_CLUSTERING,
            config: { 
              method: "semantic",
              minClusters: 3,
              maxClusters: 10
            }
          },
          {
            stepId: "review",
            type: StepType.CLUSTER_REVIEW,
            config: { 
              allowRename: true,
              allowMerge: true
            }
          }
        ]
      }
    },
    
    {
      // Question 2: Priority Matrix (2 steps)
      questionId: "q2",
      content: { 
        text: "Plot improvements by Impact vs Cost",
        dynamicTemplate: "Using ideas from: {{q1.topClusters}}"
      },
      structure: {
        type: QuestionType.PRIORITY_MATRIX,
        steps: [
          {
            stepId: "setup",
            type: StepType.MATRIX_SETUP,
            config: {
              xAxis: { label: "Cost", low: "Low", high: "High" },
              yAxis: { label: "Impact", low: "Low", high: "High" },
              items: "inherited:q1.clusters"
            }
          },
          {
            stepId: "placement",
            type: StepType.MATRIX_PLACEMENT,
            config: {
              method: "drag",
              showQuadrants: true,
              quadrantLabels: {
                topLeft: "Quick Wins",
                topRight: "Major Projects",
                bottomLeft: "Fill Ins",
                bottomRight: "Money Pits"
              }
            }
          }
        ]
      }
    },
    
    {
      // Question 3: Full Consensus (5 steps)
      questionId: "q3",
      content: { 
        text: "How to implement {{q2.quickWins[0]}}?"
      },
      structure: {
        type: QuestionType.CONSENSUS,
        steps: [
          {
            stepId: "submit",
            type: StepType.SUGGESTION_INPUT,
            config: { maxLength: 500 }
          },
          {
            stepId: "similar",
            type: StepType.SIMILARITY_CHECK,
            config: { threshold: 0.8 }
          },
          {
            stepId: "evalRandom",
            type: StepType.EVALUATE_RANDOM,
            config: { count: 6, method: "thumbs" }
          },
          {
            stepId: "evalTop",
            type: StepType.EVALUATE_TOP,
            config: { count: 3, method: "scale" }
          },
          {
            stepId: "vote",
            type: StepType.FINAL_VOTE,
            config: { method: "ranked", maxChoices: 3 }
          }
        ]
      }
    },
    
    {
      // Question 4: Simple Binary (1 step!)
      questionId: "q4",
      content: { text: "Start with pilot program?" },
      structure: {
        type: QuestionType.BINARY,
        steps: [
          {
            stepId: "decide",
            type: StepType.BINARY_CHOICE,
            config: {
              optionA: "Yes - Start with pilot",
              optionB: "No - Full implementation",
              showResults: true
            }
          }
        ]
      }
    },
    
    {
      // Question 5: Scale Rating (2 steps)
      questionId: "q5",
      content: { text: "Rate implementation risks" },
      structure: {
        type: QuestionType.SCALE_RATE,
        steps: [
          {
            stepId: "display",
            type: StepType.RISK_DISPLAY,
            config: {
              risks: ["Budget overrun", "Timeline delay", "Public opposition"],
              inherited: "q3.identifiedRisks"
            }
          },
          {
            stepId: "rate",
            type: StepType.SCALE_RATING,
            config: {
              scale: { min: 1, max: 5 },
              labels: {
                1: "Very Low",
                3: "Medium", 
                5: "Very High"
              }
            }
          }
        ]
      }
    }
  ]
};
```

### 10.2 Step Count Comparison
```typescript
// Dramatically different step counts per question type
const stepCounts = {
  BRAINSTORM: 3,      // Input → Cluster → Review
  PRIORITY_MATRIX: 2, // Setup → Placement
  CONSENSUS: 5,       // Submit → Similar → Random → Top → Vote
  BINARY: 1,          // Single decision step
  SCALE_RATE: 2,      // Display → Rate
  ALLOCATION: 2,      // Setup → Distribute
  RANKING: 2,         // Display → Order
  TEXT_INPUT: 1,      // Single input step
};
```

## 11. Implementation Plan

### Phase 1: Foundation (Week 1)
- Create new collections
- Build core data models
- Set up new API endpoints

### Phase 2: Core Features (Week 2-3)
- Question type system
- Response handling
- Results aggregation

### Phase 3: UI Components (Week 3-4)
- New component library
- Question renderers
- Navigation system

### Phase 4: Testing & Launch (Week 5)
- Integration tests
- Performance tests
- Gradual rollout

## 11. Coexistence Strategy

During transition:
```typescript
// Both systems can run in parallel
/mass-consensus/*  → Old system (if needed)
/mc/*             → New system

// Feature flag
if (features.useMassConsensusV2) {
  return <MCSession />;
} else {
  return <MassConsensus />; // Old system
}

// Once stable, remove old system entirely
```

## Conclusion

This clean design provides a modern, flexible Mass Consensus system without any legacy constraints. The old data structure is completely dismissed, protecting only essential collections (statements, users) that aren't specific to mass consensus.