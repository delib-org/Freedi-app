# Multi-Question Mass Consensus - Schema & Design Overview

## Core Concept
A system where multiple related questions are processed sequentially, with each question able to reference and build upon previous questions' data, culminating in an aggregated consensus view.

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MASS CONSENSUS SESSION                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐                                          │
│  │ Introduction │ (Once - Shared)                          │
│  └──────┬───────┘                                          │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │Demographics  │ (Once - Optional)                       │
│  └──────┬───────┘                                          │
│         ▼                                                   │
│  ╔══════════════════════════════════════════════════════╗  │
│  ║ QUESTION 1: "What should be our main priority?"      ║  │
│  ║ ┌────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [Question, Random, Top, Voting]         │   ║  │
│  ║ │ Provides: priority_list, top_priorities        │   ║  │
│  ║ └────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════╝  │
│                     ▼                                       │
│  ╔══════════════════════════════════════════════════════╗  │
│  ║ QUESTION 2: "How to implement {Q1.top_priority}?"    ║  │
│  ║ ┌────────────────────────────────────────────────┐   ║  │
│  ║ │ Depends On: Question 1 results                 │   ║  │
│  ║ │ Inherits: top_priorities from Q1               │   ║  │
│  ║ │ Steps: [Question, Top, Voting] (no Random)     │   ║  │
│  ║ └────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════╝  │
│                     ▼                                       │
│  ╔══════════════════════════════════════════════════════╗  │
│  ║ QUESTION 3: "Who should lead {Q2.implementation}?"   ║  │
│  ║ ┌────────────────────────────────────────────────┐   ║  │
│  ║ │ Depends On: Question 2 results                 │   ║  │
│  ║ │ Steps: [Question, Voting] (simplified)         │   ║  │
│  ║ └────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════╝  │
│                     ▼                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         AGGREGATION & SUMMARY (New!)                 │  │
│  │  - Cross-question consensus analysis                 │  │
│  │  - Correlation between answers                       │  │
│  │  - Final recommendations                             │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 ▼                                           │
│  ┌──────────────┐                                          │
│  │   Feedback   │ (Once - Optional)                       │
│  └──────┬───────┘                                          │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │   Thank You  │ (Once - Shared)                         │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

## 2. Core Data Schemas

### 2.1 Session Schema
```typescript
interface MassConsensusSession {
  sessionId: string;
  title: string;
  description: string;
  creatorId: string;
  
  // Questions with dependencies
  questions: QuestionConfig[];
  
  // Dependency graph
  dependencyGraph: DependencyGraph;
  
  // Aggregation settings
  aggregation: AggregationConfig;
  
  // Shared steps configuration
  sharedSteps: {
    introduction: boolean;
    demographics: boolean;
    aggregationSummary: boolean;  // NEW
    feedback: boolean;
    thankYou: boolean;
  };
  
  metadata: {
    createdAt: number;
    updatedAt: number;
    status: 'draft' | 'active' | 'completed';
    participantCount: number;
  };
}
```

### 2.2 Question Configuration with Dependencies
```typescript
interface QuestionConfig {
  questionId: string;
  order: number;
  
  // Question content
  content: {
    question: string;
    description?: string;
    // Dynamic template with references
    template?: string; // "How to implement {{Q1.topChoice}}?"
  };
  
  // Flexible step configuration (per your requirement #4)
  steps: {
    question: boolean | QuestionStepConfig;
    randomSuggestions: boolean | { count: number; filter?: FilterConfig };
    topSuggestions: boolean | { count: number; source?: 'current' | 'inherited' };
    voting: boolean | VotingConfig;
  };
  
  // Dependencies (per your requirement #1)
  dependencies: QuestionDependency[];
  
  // Data this question provides to others
  provides: DataProvision[];
  
  // Whether this question is required
  required: boolean;
  
  // Conditional display
  displayCondition?: ConditionExpression;
}
```

### 2.3 Dependency System
```typescript
interface QuestionDependency {
  fromQuestionId: string;
  type: 'data' | 'conditional' | 'reference';
  
  // For data dependencies
  dataMapping?: {
    sourceField: string;      // e.g., "topVotedOptions[0]"
    targetField: string;      // e.g., "inheritedPriority"
    transform?: TransformFunction;
  }[];
  
  // For conditional dependencies
  condition?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater' | 'less';
    value: any;
  };
  
  // What happens if dependency not met
  fallback?: 'skip' | 'default' | 'error';
}

interface DataProvision {
  key: string;           // e.g., "topPriority"
  source: string;        // e.g., "votes.top"
  type: 'single' | 'array' | 'aggregate';
  visibility: 'next' | 'all' | 'specific';
  targetQuestions?: string[];
}
```

### 2.4 Aggregation Configuration (per your requirement #2)
```typescript
interface AggregationConfig {
  enabled: boolean;
  
  // Type of aggregation
  type: 'consensus' | 'weighted' | 'hierarchical' | 'custom';
  
  // Calculations to perform
  calculations: {
    overallConsensus: boolean;
    crossQuestionCorrelation: boolean;
    conflictDetection: boolean;
    trendAnalysis: boolean;
  };
  
  // Visualizations to show
  visualizations: {
    summaryDashboard: boolean;
    correlationMatrix: boolean;
    consensusFlow: boolean;
    priorityRanking: boolean;
  };
  
  // Weights for different questions (optional)
  questionWeights?: {
    [questionId: string]: number;
  };
  
  // Export options
  export: {
    formats: ('pdf' | 'csv' | 'json')[];
    includeRawData: boolean;
  };
}
```

### 2.5 Progress & State Management
```typescript
interface UserSessionProgress {
  userId: string;
  sessionId: string;
  
  // Current position
  currentQuestionIndex: number;
  currentStepIndex: number;
  
  // Completed questions with their data
  questionProgress: {
    [questionId: string]: {
      status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
      startedAt?: number;
      completedAt?: number;
      
      // Data collected from this question
      collectedData: {
        suggestion?: string;
        evaluations?: Evaluation[];
        votes?: Vote[];
      };
      
      // Data inherited from dependencies
      inheritedData?: {
        [key: string]: any;
      };
    }
  };
  
  // Overall metrics
  overallProgress: number; // percentage
  lastUpdate: number;
}
```

## 3. Database Collections Structure

### 3.1 Primary Collections
```
firestore/
├── massConsensusSessions/
│   └── {sessionId}/
│       ├── config (Session configuration)
│       ├── questions/ (subcollection)
│       │   └── {questionId}/
│       │       ├── config
│       │       ├── dependencies
│       │       └── provides
│       └── aggregation/ (subcollection)
│           └── config
│
├── sessionProgress/
│   └── {userId}_{sessionId}/
│       ├── current state
│       ├── question progress
│       └── inherited data cache
│
├── sessionData/
│   └── {sessionId}/
│       ├── sharedData/
│       │   └── Cross-question shared data
│       ├── questionResults/
│       │   └── {questionId}/
│       │       ├── suggestions
│       │       ├── evaluations
│       │       └── votes
│       └── aggregatedResults/
│           ├── consensus metrics
│           ├── correlations
│           └── insights
│
└── statements/ (existing)
    └── {statementId}/
        └── (question content)
```

## 4. Data Flow Examples

### 4.1 Simple Data Reference
```typescript
// Question 1 provides
{
  provides: [{
    key: "topPriority",
    source: "votes.winner",
    type: "single",
    visibility: "all"
  }]
}

// Question 2 uses
{
  content: {
    template: "How should we implement {{Q1.topPriority}}?"
  },
  dependencies: [{
    fromQuestionId: "Q1",
    type: "data",
    dataMapping: [{
      sourceField: "topPriority",
      targetField: "focusArea"
    }]
  }]
}
```

### 4.2 Conditional Question Display
```typescript
// Question 3 only shows if Question 2 has high consensus
{
  displayCondition: {
    type: "expression",
    expression: "Q2.consensus > 0.75"
  },
  dependencies: [{
    fromQuestionId: "Q2",
    type: "conditional",
    condition: {
      field: "consensusScore",
      operator: "greater",
      value: 0.75
    },
    fallback: "skip"
  }]
}
```

### 4.3 Aggregated Data Usage
```typescript
// Final question uses aggregated data from all previous
{
  dependencies: [
    {
      fromQuestionId: "Q1",
      type: "data",
      dataMapping: [{ sourceField: "topChoices", targetField: "priorities" }]
    },
    {
      fromQuestionId: "Q2",
      type: "data",
      dataMapping: [{ sourceField: "implementation", targetField: "methods" }]
    }
  ],
  content: {
    template: "Given priorities {{priorities}} and methods {{methods}}, what resources do we need?"
  }
}
```

## 5. Key Features Implementation

### 5.1 Dynamic Question Generation
- Questions can use templates with placeholders
- Placeholders filled with data from previous questions
- Real-time preview of how question will appear

### 5.2 Dependency Resolution
- Topological sort ensures correct question order
- Circular dependency detection
- Graceful handling of missing dependencies

### 5.3 Data Inheritance
- Automatic data passing between questions
- Transform functions for data manipulation
- Caching for performance

### 5.4 Aggregation Engine
- Runs after all questions complete
- Calculates cross-question metrics
- Generates insights and recommendations
- Creates exportable reports

## 6. User Experience Flow

```
1. User enters session
   ↓
2. Introduction (if enabled)
   ↓
3. Demographics (if enabled)
   ↓
4. For each question in dependency order:
   a. Check display conditions
   b. Load inherited data
   c. Render question with dynamic content
   d. Process through configured steps
   e. Save results and provided data
   ↓
5. Aggregation Summary (if enabled)
   - Show cross-question consensus
   - Display correlations
   - Present final recommendations
   ↓
6. Feedback (if enabled)
   ↓
7. Thank You
```

## 7. API Structure

### 7.1 Session Management
```typescript
// Create session with dependencies
POST /api/sessions
Body: { questions, dependencies, aggregation }

// Get session with resolved dependencies
GET /api/sessions/{id}/resolved

// Get question with inherited data
GET /api/sessions/{id}/questions/{qId}/withData
```

### 7.2 Progress Management
```typescript
// Save progress with inherited data
POST /api/progress/save
Body: { questionId, data, inheritedData }

// Get next question based on dependencies
GET /api/sessions/{id}/next-question
```

### 7.3 Aggregation
```typescript
// Trigger aggregation calculation
POST /api/sessions/{id}/aggregate

// Get aggregation results
GET /api/sessions/{id}/aggregation

// Export aggregated data
GET /api/sessions/{id}/export?format=pdf
```

## 8. Validation Rules

1. **No circular dependencies** - Questions cannot depend on themselves
2. **Required data availability** - Dependencies must provide required fields
3. **Type compatibility** - Data types must match between provider and consumer
4. **Conditional consistency** - Conditions must be evaluable
5. **Step configuration validity** - At least one step must be enabled per question

## 9. Performance Considerations

1. **Lazy Loading** - Load question data only when needed
2. **Caching** - Cache inherited data to avoid recalculation
3. **Batch Operations** - Batch database operations where possible
4. **Progressive Enhancement** - Show questions as dependencies resolve
5. **Optimistic Updates** - Update UI before server confirmation

## 10. Security & Privacy

1. **Data Isolation** - Users only see aggregated data, not individual responses
2. **Permission Checking** - Validate access to inherited data
3. **Audit Trail** - Log all data inheritance and transformations
4. **Encryption** - Sensitive inherited data encrypted at rest
5. **Rate Limiting** - Prevent abuse of aggregation endpoints

This schema provides a flexible, powerful system for multi-question mass consensus with inter-question dependencies and comprehensive aggregation capabilities.