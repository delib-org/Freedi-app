# Multi-Question Mass Consensus - System Design with Dependencies

## Overview
This document outlines the design for a multi-question Mass Consensus system that supports:
- Multiple questions with inter-question dependencies and data sharing
- Voting aggregation across questions
- Flexible step configuration per question  
- No time limits (process driven by completion)
- Results display framework

## 1. Core Architecture

### 1.1 Data Flow with Dependencies
```
┌─────────────────────────────────────────────────────────┐
│                    Session Start                         │
│              (Introduction, Demographics)                │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Question Pipeline                       │
│                                                          │
│  Q1: Primary Topic ──────┐                              │
│     Steps: [question,    │                              │
│            suggestions,   │ Feeds data to               │
│            voting]        │                              │
│                          ▼                              │
│  Q2: Drill-down ◄────────┘                              │
│     Steps: [question,     Uses Q1 top votes             │
│            evaluate]      as options                    │
│                          │                              │
│                          ▼                              │
│  Q3: Implementation ◄────┘                              │
│     Steps: [question,     Based on Q2 results           │
│            suggestions,                                 │
│            prioritize]                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Session Complete                       │
│              (Feedback, Thank You, Results)              │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Dependency Types

#### Direct Data Dependencies
```typescript
export enum DependencyType {
  // Data inheritance types
  USE_TOP_RESULTS = 'use_top_results',      // Use top N results from source
  USE_ALL_RESULTS = 'use_all_results',      // Use all results from source
  USE_SELECTED = 'use_selected',            // Use user's selections
  USE_AGGREGATED = 'use_aggregated',        // Use aggregated data
  
  // Conditional flow types  
  SHOW_IF_SELECTED = 'show_if_selected',    // Show only if certain option selected
  SKIP_IF_CONSENSUS = 'skip_if_consensus',  // Skip if consensus reached
  REQUIRED_COMPLETION = 'required_completion' // Must complete source first
}
```

#### Aggregation Types
```typescript
export enum AggregationType {
  SUM_SCORES = 'sum_scores',          // Sum voting scores
  WEIGHTED_AVERAGE = 'weighted_average', // Weighted by participation
  CONSENSUS_LEVEL = 'consensus_level',   // Measure agreement level
  PARTICIPATION_RATE = 'participation_rate', // Track engagement
  DISTRIBUTION = 'distribution'         // Vote distribution analysis
}
```

## 2. Enhanced Data Models

### 2.1 Session Model with Dependencies
```typescript
interface MCSessionWithDependencies {
  sessionId: string;
  statementId: string;
  title: string;
  description: string;
  createdAt: Date;
  createdBy: string;
  
  // Question configuration
  questions: MCQuestionWithDependencies[];
  
  // Session-wide settings
  settings: {
    randomizeQuestions: boolean;
    allowSkipping: boolean;
    showProgressBar: boolean;
    showIntermediateResults: boolean;
    enableVotingAggregation: boolean;
  };
  
  // Aggregation configuration
  aggregation: {
    enabled: boolean;
    types: AggregationType[];
    displayMode: 'realtime' | 'end_of_session' | 'custom';
  };
  
  // Results configuration (for later)
  resultsConfig: {
    displayMode: 'detailed' | 'summary' | 'custom';
    visibility: 'public' | 'participants' | 'admin';
    exportFormats: ('pdf' | 'csv' | 'json')[];
  };
  
  status: 'draft' | 'active' | 'completed' | 'archived';
}
```

### 2.2 Question Model with Dependencies
```typescript
interface MCQuestionWithDependencies {
  questionId: string;
  order: number;
  
  // Content
  content: {
    question: string;
    description?: string;
    context?: string; // Dynamic context from dependencies
  };
  
  // Flexible step configuration
  steps: MassConsensusStep[]; // Can be different per question
  
  // Dependencies on other questions
  dependencies: QuestionDependency[];
  
  // Data this question provides to others
  provides: {
    dataKey: string;
    dataType: 'suggestions' | 'votes' | 'consensus' | 'distribution';
  }[];
  
  // Validation rules
  validation: {
    required: boolean;
    minResponses?: number;
    consensusThreshold?: number; // For skip conditions
  };
  
  // Per-question aggregation settings
  aggregation?: {
    aggregateWith: string[]; // Other question IDs
    method: AggregationType;
    weight?: number;
  };
}
```

### 2.3 Dependency Model
```typescript
interface QuestionDependency {
  sourceQuestionId: string;
  dependencyType: DependencyType;
  
  // Data transformation
  dataMapping?: {
    sourceField: string;
    targetField: string;
    transform?: 'top_n' | 'filter' | 'group' | 'sort';
    parameters?: Record<string, any>;
  };
  
  // Conditional logic
  condition?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'consensus_reached';
    value: any;
  };
  
  // How to handle missing dependencies
  fallback?: {
    action: 'skip' | 'use_default' | 'show_error';
    defaultData?: any;
  };
}
```

### 2.4 Step Configuration with Context
```typescript
interface MassConsensusStep {
  screen: MassConsensusPageUrls;
  statementId: string;
  text?: string;
  
  // Extended configuration for dependencies
  config?: {
    // Data injection from dependencies
    dataSource?: {
      questionId: string;
      dataKey: string;
    };
    
    // Custom parameters per step type
    parameters?: {
      maxSuggestions?: number;
      votingMethod?: 'single' | 'multiple' | 'ranked';
      evaluationScale?: 'binary' | 'scale' | 'points';
      displayFormat?: 'list' | 'grid' | 'carousel';
    };
    
    // Dynamic content templates
    templates?: {
      instruction?: string; // Can include {{variables}}
      optionFormat?: string;
    };
  };
}
```

## 3. Execution Engine

### 3.1 Dependency Resolution
```typescript
class DependencyResolver {
  private sessionData: Map<string, QuestionResults>;
  
  async resolveQuestionDependencies(
    question: MCQuestionWithDependencies,
    session: MCSessionWithDependencies
  ): Promise<ResolvedQuestion> {
    
    const resolvedData: Record<string, any> = {};
    
    for (const dep of question.dependencies) {
      const sourceData = await this.getQuestionData(dep.sourceQuestionId);
      
      if (!sourceData && dep.fallback) {
        resolvedData[dep.sourceQuestionId] = 
          await this.handleFallback(dep.fallback);
        continue;
      }
      
      if (dep.condition) {
        const conditionMet = await this.evaluateCondition(
          dep.condition, 
          sourceData
        );
        if (!conditionMet) continue;
      }
      
      if (dep.dataMapping) {
        resolvedData[dep.sourceQuestionId] = 
          await this.transformData(sourceData, dep.dataMapping);
      } else {
        resolvedData[dep.sourceQuestionId] = sourceData;
      }
    }
    
    return this.injectDataIntoQuestion(question, resolvedData);
  }
  
  private async transformData(
    data: any, 
    mapping: DataMapping
  ): Promise<any> {
    // Implementation of data transformation logic
    switch(mapping.transform) {
      case 'top_n':
        return this.getTopN(data, mapping.parameters?.n || 5);
      case 'filter':
        return this.filterData(data, mapping.parameters?.criteria);
      case 'group':
        return this.groupData(data, mapping.parameters?.groupBy);
      case 'sort':
        return this.sortData(data, mapping.parameters?.sortBy);
      default:
        return data;
    }
  }
}
```

### 3.2 Voting Aggregation System
```typescript
class VotingAggregator {
  private aggregationStrategies: Map<AggregationType, AggregationStrategy>;
  
  async aggregateVotes(
    questions: string[],
    aggregationType: AggregationType,
    weights?: Map<string, number>
  ): Promise<AggregatedResults> {
    
    const strategy = this.aggregationStrategies.get(aggregationType);
    if (!strategy) throw new Error(`Unknown aggregation type: ${aggregationType}`);
    
    const questionResults = await Promise.all(
      questions.map(qId => this.getQuestionVotes(qId))
    );
    
    return strategy.aggregate(questionResults, weights);
  }
  
  // Real-time aggregation for live updates
  subscribeToAggregation(
    questions: string[],
    callback: (results: AggregatedResults) => void
  ): Unsubscribe {
    const listeners = questions.map(qId => 
      this.onQuestionUpdate(qId, () => {
        this.aggregateVotes(questions, AggregationType.WEIGHTED_AVERAGE)
          .then(callback);
      })
    );
    
    return () => listeners.forEach(unsub => unsub());
  }
}

interface AggregationStrategy {
  aggregate(
    results: QuestionVotes[],
    weights?: Map<string, number>
  ): AggregatedResults;
}

class WeightedAverageStrategy implements AggregationStrategy {
  aggregate(results: QuestionVotes[], weights?: Map<string, number>) {
    // Implementation of weighted average calculation
    let totalWeight = 0;
    let weightedSum = 0;
    
    results.forEach(result => {
      const weight = weights?.get(result.questionId) || 1;
      totalWeight += weight * result.participantCount;
      
      result.votes.forEach(vote => {
        weightedSum += vote.score * weight * vote.count;
      });
    });
    
    return {
      type: 'weighted_average',
      value: weightedSum / totalWeight,
      confidence: this.calculateConfidence(results),
      participation: this.calculateParticipation(results)
    };
  }
}
```

## 4. Question Flow Examples

### 4.1 Example: Community Planning Session
```typescript
const communityPlanningSession: MCSessionWithDependencies = {
  sessionId: 'session_123',
  title: 'Community Park Planning',
  
  questions: [
    {
      questionId: 'q1_priorities',
      content: { question: 'What aspects of the park are most important?' },
      steps: [
        { screen: MassConsensusPageUrls.question },
        { screen: MassConsensusPageUrls.suggestions },
        { screen: MassConsensusPageUrls.voting }
      ],
      provides: [{
        dataKey: 'top_priorities',
        dataType: 'votes'
      }]
    },
    
    {
      questionId: 'q2_features',
      content: { 
        question: 'For {{priority}}, what features would you like?',
        context: 'Based on the top priority from previous question'
      },
      steps: [
        { screen: MassConsensusPageUrls.question },
        { screen: MassConsensusPageUrls.suggestions },
        { screen: MassConsensusPageUrls.randomSuggestions },
        { screen: MassConsensusPageUrls.voting }
      ],
      dependencies: [{
        sourceQuestionId: 'q1_priorities',
        dependencyType: DependencyType.USE_TOP_RESULTS,
        dataMapping: {
          sourceField: 'votes',
          targetField: 'priority',
          transform: 'top_n',
          parameters: { n: 1 }
        }
      }],
      provides: [{
        dataKey: 'selected_features',
        dataType: 'votes'
      }]
    },
    
    {
      questionId: 'q3_budget',
      content: { 
        question: 'How should we allocate budget across these features?'
      },
      steps: [
        { 
          screen: MassConsensusPageUrls.question,
          config: {
            dataSource: {
              questionId: 'q2_features',
              dataKey: 'selected_features'
            },
            parameters: {
              votingMethod: 'points',
              displayFormat: 'list'
            }
          }
        },
        { screen: MassConsensusPageUrls.voting }
      ],
      dependencies: [{
        sourceQuestionId: 'q2_features',
        dependencyType: DependencyType.USE_TOP_RESULTS,
        dataMapping: {
          transform: 'top_n',
          parameters: { n: 5 }
        }
      }],
      aggregation: {
        aggregateWith: ['q1_priorities', 'q2_features'],
        method: AggregationType.WEIGHTED_AVERAGE,
        weight: 0.5
      }
    }
  ],
  
  aggregation: {
    enabled: true,
    types: [
      AggregationType.WEIGHTED_AVERAGE,
      AggregationType.CONSENSUS_LEVEL
    ],
    displayMode: 'realtime'
  }
};
```

### 4.2 Example: Product Development Feedback
```typescript
const productFeedbackSession: MCSessionWithDependencies = {
  questions: [
    {
      questionId: 'q1_satisfaction',
      content: { question: 'Rate your satisfaction with current features' },
      steps: [
        { screen: MassConsensusPageUrls.question },
        { screen: MassConsensusPageUrls.topSuggestions },
        { screen: MassConsensusPageUrls.voting }
      ],
      provides: [{
        dataKey: 'low_satisfaction_areas',
        dataType: 'distribution'
      }]
    },
    
    {
      questionId: 'q2_improvements',
      content: { 
        question: 'How would you improve {{feature}}?',
        description: 'Focusing on areas with lowest satisfaction'
      },
      dependencies: [{
        sourceQuestionId: 'q1_satisfaction',
        dependencyType: DependencyType.USE_SELECTED,
        condition: {
          field: 'satisfaction_score',
          operator: 'less_than',
          value: 3
        }
      }],
      steps: [
        { screen: MassConsensusPageUrls.question },
        { screen: MassConsensusPageUrls.suggestions }
      ]
    },
    
    {
      questionId: 'q3_priority',
      content: { question: 'Which improvements should we prioritize?' },
      dependencies: [{
        sourceQuestionId: 'q2_improvements',
        dependencyType: DependencyType.USE_ALL_RESULTS
      }],
      steps: [
        { screen: MassConsensusPageUrls.voting }
      ],
      aggregation: {
        aggregateWith: ['q1_satisfaction'],
        method: AggregationType.WEIGHTED_AVERAGE
      }
    }
  ]
};
```

## 5. Database Schema

### 5.1 Firestore Collections
```typescript
// Session collection with dependencies
interface SessionDocument {
  sessionId: string;
  statementId: string;
  questions: QuestionDocument[];
  dependencies: DependencyDocument[];
  aggregationConfig: AggregationConfig;
  createdAt: Timestamp;
  status: string;
}

// Question results with linkage data
interface QuestionResultDocument {
  questionId: string;
  sessionId: string;
  participantId: string;
  
  // Response data
  responses: {
    suggestions?: string[];
    votes?: VoteData[];
    evaluations?: EvaluationData[];
  };
  
  // Dependency context
  dependencyContext: {
    sourceData: Record<string, any>;
    resolvedAt: Timestamp;
  };
  
  // For aggregation
  aggregationMetadata: {
    weight: number;
    groupId?: string;
  };
  
  completedAt: Timestamp;
}

// Aggregated results collection
interface AggregatedResultDocument {
  sessionId: string;
  aggregationType: AggregationType;
  questionIds: string[];
  
  results: {
    value: number | Record<string, any>;
    confidence: number;
    participantCount: number;
    distribution?: Record<string, number>;
  };
  
  metadata: {
    weights: Record<string, number>;
    calculatedAt: Timestamp;
    version: number;
  };
}

// Cross-question linkage collection
interface QuestionLinkageDocument {
  sessionId: string;
  sourceQuestionId: string;
  targetQuestionId: string;
  linkType: DependencyType;
  
  dataSnapshot: {
    data: any;
    capturedAt: Timestamp;
    transformApplied?: string;
  };
  
  usage: {
    accessCount: number;
    lastAccessed: Timestamp;
  };
}
```

## 6. Implementation Phases

### Phase 1: Core Dependencies (Week 1-2)
- Basic dependency resolution
- Simple data inheritance (USE_TOP_RESULTS)
- Sequential question flow

### Phase 2: Advanced Dependencies (Week 3-4)
- Conditional flows
- Data transformation
- Fallback handling

### Phase 3: Voting Aggregation (Week 5-6)
- Basic aggregation strategies
- Real-time updates
- Weighted calculations

### Phase 4: Flexible Steps (Week 7-8)
- Per-question step configuration
- Dynamic step parameters
- Context injection

### Phase 5: Results Framework (Later)
- Results visualization
- Export functionality
- Analytics dashboard

## 7. API Endpoints

### 7.1 Session Management
```typescript
// Create session with dependencies
POST /api/mc-sessions
{
  title: string,
  questions: MCQuestionWithDependencies[],
  aggregation: AggregationConfig
}

// Resolve next question
GET /api/mc-sessions/:sessionId/next-question
Response: {
  question: ResolvedQuestion,
  context: DependencyContext,
  progress: SessionProgress
}

// Submit question response
POST /api/mc-sessions/:sessionId/questions/:questionId/respond
{
  responses: QuestionResponses,
  metadata: ResponseMetadata
}
```

### 7.2 Aggregation Endpoints
```typescript
// Get aggregated results
GET /api/mc-sessions/:sessionId/aggregation
Query: {
  type: AggregationType,
  questionIds: string[],
  realtime: boolean
}

// Subscribe to live aggregation
WS /api/mc-sessions/:sessionId/aggregation/subscribe
{
  questions: string[],
  aggregationType: AggregationType
}
```

## 8. State Management

### 8.1 Redux State
```typescript
interface MCDependenciesState {
  sessions: {
    current: MCSessionWithDependencies | null;
    resolvedQuestions: Map<string, ResolvedQuestion>;
    dependencyGraph: DependencyGraph;
  };
  
  responses: {
    byQuestion: Map<string, QuestionResponses>;
    aggregated: Map<string, AggregatedResults>;
  };
  
  execution: {
    currentQuestionId: string | null;
    completedQuestions: Set<string>;
    skippedQuestions: Set<string>;
    dependencyContext: Map<string, any>;
  };
  
  aggregation: {
    liveResults: Map<string, AggregatedResults>;
    subscriptions: Set<string>;
  };
}
```

## 9. Testing Strategy

### 9.1 Unit Tests
- Dependency resolution logic
- Data transformation functions
- Aggregation calculations
- Condition evaluation

### 9.2 Integration Tests
- Full question flow with dependencies
- Real-time aggregation updates
- Fallback scenarios
- Complex dependency chains

### 9.3 E2E Tests
- Complete session workflows
- Multi-user aggregation
- Error recovery
- Performance under load

## Conclusion

This design provides a comprehensive framework for multi-question Mass Consensus with:
- Full inter-question dependency support
- Flexible voting aggregation
- No time limits (completion-driven)
- Per-question step configuration
- Extensible results framework

The system maintains backward compatibility while enabling sophisticated multi-question workflows with data sharing and aggregation capabilities.