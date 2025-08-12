# Multi-Question Mass Consensus - Flexible Question Structures

## Core Concept: Question Types & Structures

Each question in a session can have a completely different structure, flow, and purpose. This allows for rich, varied democratic processes.

## 1. Question Type Architecture

```typescript
enum QuestionStructureType {
  // Standard mass consensus flow
  STANDARD_CONSENSUS = 'standard_consensus',
  
  // Simple voting without suggestions
  DIRECT_VOTING = 'direct_voting',
  
  // Only collect suggestions, no voting
  BRAINSTORMING = 'brainstorming',
  
  // Rank existing options
  RANKING = 'ranking',
  
  // Yes/No referendum
  BINARY_CHOICE = 'binary_choice',
  
  // Multiple choice selection
  MULTIPLE_CHOICE = 'multiple_choice',
  
  // Scale rating (1-10, agree/disagree)
  SCALE_RATING = 'scale_rating',
  
  // Resource allocation (distribute 100 points)
  ALLOCATION = 'allocation',
  
  // Prioritization matrix
  PRIORITY_MATRIX = 'priority_matrix',
  
  // Open text feedback
  OPEN_FEEDBACK = 'open_feedback',
  
  // Custom structure
  CUSTOM = 'custom'
}
```

## 2. Flexible Question Configuration

```typescript
interface FlexibleQuestionConfig {
  questionId: string;
  order: number;
  
  // Core question info
  content: {
    question: string;
    description?: string;
    template?: string; // Dynamic with {{references}}
  };
  
  // Question structure type
  structureType: QuestionStructureType;
  
  // Structure-specific configuration
  structure: QuestionStructure;
  
  // Dependencies on other questions
  dependencies?: QuestionDependency[];
  
  // Data this question provides
  provides?: DataProvision[];
  
  // Display conditions
  displayCondition?: ConditionExpression;
  
  required: boolean;
}

// Base structure interface
interface QuestionStructure {
  type: QuestionStructureType;
  steps: StepConfiguration[];
  validation?: ValidationRules;
  ui?: UIConfiguration;
}
```

## 3. Question Structure Examples

### 3.1 Standard Consensus Structure
```typescript
interface StandardConsensusStructure extends QuestionStructure {
  type: QuestionStructureType.STANDARD_CONSENSUS;
  steps: [
    {
      type: 'question',
      config: {
        allowMultipleSuggestions: boolean;
        minLength?: number;
        maxLength?: number;
      }
    },
    {
      type: 'similar_check',
      config: {
        threshold: number;
        aiEnabled: boolean;
      }
    },
    {
      type: 'random_suggestions',
      config: {
        count: number;
        evaluationType: 'scale' | 'thumbs' | 'stars';
      }
    },
    {
      type: 'top_suggestions',
      config: {
        count: number;
        showScores: boolean;
      }
    },
    {
      type: 'voting',
      config: {
        votingMethod: 'single' | 'ranked' | 'approval';
        showResults: 'after' | 'live' | 'never';
      }
    }
  ];
}
```

### 3.2 Direct Voting Structure
```typescript
interface DirectVotingStructure extends QuestionStructure {
  type: QuestionStructureType.DIRECT_VOTING;
  steps: [
    {
      type: 'options_display',
      config: {
        options: VotingOption[] | 'inherited'; // Can inherit from previous question
        layout: 'list' | 'grid' | 'cards';
        showDescriptions: boolean;
      }
    },
    {
      type: 'voting',
      config: {
        votingMethod: 'single' | 'multiple' | 'ranked';
        maxSelections?: number;
        requireRanking?: boolean;
      }
    },
    {
      type: 'results',
      config: {
        showImmediately: boolean;
        visualizationType: 'bar' | 'pie' | 'table';
      }
    }
  ];
}
```

### 3.3 Brainstorming Structure
```typescript
interface BrainstormingStructure extends QuestionStructure {
  type: QuestionStructureType.BRAINSTORMING;
  steps: [
    {
      type: 'idea_submission',
      config: {
        minIdeas: number;
        maxIdeas: number;
        allowAnonymous: boolean;
        categories?: string[];
      }
    },
    {
      type: 'idea_clustering',
      config: {
        method: 'manual' | 'ai' | 'votes';
        allowUserClustering: boolean;
      }
    },
    {
      type: 'idea_refinement',
      config: {
        allowEditing: boolean;
        allowMerging: boolean;
        requireModeration: boolean;
      }
    }
  ];
  // No voting step - just collection and organization
}
```

### 3.4 Ranking Structure
```typescript
interface RankingStructure extends QuestionStructure {
  type: QuestionStructureType.RANKING;
  steps: [
    {
      type: 'items_display',
      config: {
        items: RankableItem[] | 'inherited';
        initialOrder: 'random' | 'alphabetical' | 'predefined';
      }
    },
    {
      type: 'ranking_interface',
      config: {
        method: 'drag_drop' | 'number_input' | 'pairwise';
        allowTies: boolean;
        requireAllRanked: boolean;
      }
    },
    {
      type: 'ranking_aggregation',
      config: {
        algorithm: 'borda' | 'schulze' | 'average';
        showIndividualRankings: boolean;
      }
    }
  ];
}
```

### 3.5 Binary Choice Structure
```typescript
interface BinaryChoiceStructure extends QuestionStructure {
  type: QuestionStructureType.BINARY_CHOICE;
  steps: [
    {
      type: 'binary_display',
      config: {
        optionA: { label: string; description?: string; };
        optionB: { label: string; description?: string; };
        layout: 'side_by_side' | 'vertical' | 'cards';
      }
    },
    {
      type: 'binary_vote',
      config: {
        allowAbstain: boolean;
        requireReason: boolean;
        showCurrentResults: boolean;
      }
    }
  ];
}
```

### 3.6 Scale Rating Structure
```typescript
interface ScaleRatingStructure extends QuestionStructure {
  type: QuestionStructureType.SCALE_RATING;
  steps: [
    {
      type: 'scale_display',
      config: {
        items: RatableItem[] | 'inherited';
        scale: {
          min: number;
          max: number;
          labels?: { [value: number]: string };
          type: 'numeric' | 'emoji' | 'likert';
        };
      }
    },
    {
      type: 'rating_interface',
      config: {
        layout: 'slider' | 'buttons' | 'matrix';
        requireAll: boolean;
        showAverage: boolean;
      }
    }
  ];
}
```

### 3.7 Allocation Structure
```typescript
interface AllocationStructure extends QuestionStructure {
  type: QuestionStructureType.ALLOCATION;
  steps: [
    {
      type: 'allocation_setup',
      config: {
        totalPoints: number;
        categories: AllocationCategory[] | 'inherited';
        constraints?: {
          min?: number;
          max?: number;
          mustUseAll: boolean;
        };
      }
    },
    {
      type: 'allocation_interface',
      config: {
        inputType: 'slider' | 'number' | 'chips';
        showRunningTotal: boolean;
        showOthersAverage: boolean;
      }
    },
    {
      type: 'allocation_results',
      config: {
        visualization: 'pie' | 'bar' | 'treemap';
        showDistribution: boolean;
      }
    }
  ];
}
```

### 3.8 Priority Matrix Structure
```typescript
interface PriorityMatrixStructure extends QuestionStructure {
  type: QuestionStructureType.PRIORITY_MATRIX;
  steps: [
    {
      type: 'matrix_setup',
      config: {
        items: MatrixItem[] | 'inherited';
        axes: {
          x: { label: string; lowLabel: string; highLabel: string; };
          y: { label: string; lowLabel: string; highLabel: string; };
        };
      }
    },
    {
      type: 'matrix_placement',
      config: {
        method: 'drag' | 'click' | 'slider';
        showQuadrants: boolean;
        showOthersPlacement: boolean;
      }
    },
    {
      type: 'matrix_analysis',
      config: {
        clustering: boolean;
        heatmap: boolean;
        consensus: boolean;
      }
    }
  ];
}
```

### 3.9 Custom Structure
```typescript
interface CustomStructure extends QuestionStructure {
  type: QuestionStructureType.CUSTOM;
  steps: CustomStep[];
  customComponent?: string; // Reference to custom React component
  customLogic?: {
    validator?: string; // Custom validation function
    processor?: string; // Custom data processor
    aggregator?: string; // Custom aggregation logic
  };
}
```

## 4. Real-World Session Example

```typescript
const climateActionSession: MassConsensusSession = {
  sessionId: "climate-2024",
  title: "Community Climate Action Plan",
  questions: [
    {
      // Question 1: Brainstorming
      questionId: "q1",
      structureType: QuestionStructureType.BRAINSTORMING,
      content: {
        question: "What climate actions should our community prioritize?"
      },
      structure: {
        type: QuestionStructureType.BRAINSTORMING,
        steps: [
          { type: 'idea_submission', config: { minIdeas: 1, maxIdeas: 5 } },
          { type: 'idea_clustering', config: { method: 'ai' } }
        ]
      },
      provides: [
        { key: 'allIdeas', source: 'submissions', visibility: 'next' }
      ]
    },
    {
      // Question 2: Ranking the brainstormed ideas
      questionId: "q2",
      structureType: QuestionStructureType.RANKING,
      content: {
        question: "Rank these climate actions by priority"
      },
      structure: {
        type: QuestionStructureType.RANKING,
        steps: [
          { type: 'items_display', config: { items: 'inherited' } },
          { type: 'ranking_interface', config: { method: 'drag_drop' } }
        ]
      },
      dependencies: [
        { fromQuestionId: 'q1', type: 'data', dataMapping: [
          { sourceField: 'allIdeas', targetField: 'itemsToRank' }
        ]}
      ],
      provides: [
        { key: 'topPriorities', source: 'ranking.top5', visibility: 'all' }
      ]
    },
    {
      // Question 3: Budget allocation
      questionId: "q3",
      structureType: QuestionStructureType.ALLOCATION,
      content: {
        question: "How should we allocate our $1M climate budget?",
        template: "Allocate funding across these priorities: {{q2.topPriorities}}"
      },
      structure: {
        type: QuestionStructureType.ALLOCATION,
        steps: [
          { type: 'allocation_setup', config: { 
            totalPoints: 100,
            categories: 'inherited'
          }},
          { type: 'allocation_interface', config: { inputType: 'slider' } }
        ]
      },
      dependencies: [
        { fromQuestionId: 'q2', type: 'data', dataMapping: [
          { sourceField: 'topPriorities', targetField: 'categories' }
        ]}
      ]
    },
    {
      // Question 4: Yes/No on immediate action
      questionId: "q4",
      structureType: QuestionStructureType.BINARY_CHOICE,
      content: {
        question: "Should we begin implementation immediately?",
        template: "Based on the top priority '{{q2.topPriorities[0]}}' with {{q3.allocations[0].percentage}}% budget allocation"
      },
      structure: {
        type: QuestionStructureType.BINARY_CHOICE,
        steps: [
          { type: 'binary_display', config: { 
            optionA: { label: "Yes, start now" },
            optionB: { label: "No, need more planning" }
          }},
          { type: 'binary_vote', config: { allowAbstain: true } }
        ]
      }
    },
    {
      // Question 5: Timeline selection
      questionId: "q5",
      structureType: QuestionStructureType.MULTIPLE_CHOICE,
      content: {
        question: "Select implementation timeline"
      },
      structure: {
        type: QuestionStructureType.MULTIPLE_CHOICE,
        steps: [
          { type: 'options_display', config: {
            options: [
              { id: '3m', label: '3 months' },
              { id: '6m', label: '6 months' },
              { id: '1y', label: '1 year' }
            ]
          }},
          { type: 'choice_selection', config: { maxSelections: 1 } }
        ]
      },
      displayCondition: {
        expression: "q4.result === 'yes'"
      }
    },
    {
      // Question 6: Feedback
      questionId: "q6",
      structureType: QuestionStructureType.OPEN_FEEDBACK,
      content: {
        question: "Any additional thoughts on the climate action plan?"
      },
      structure: {
        type: QuestionStructureType.OPEN_FEEDBACK,
        steps: [
          { type: 'text_input', config: { 
            maxLength: 500,
            optional: true 
          }}
        ]
      }
    }
  ]
};
```

## 5. Step Type Registry

```typescript
enum StepType {
  // Input Steps
  QUESTION = 'question',
  IDEA_SUBMISSION = 'idea_submission',
  TEXT_INPUT = 'text_input',
  
  // Display Steps
  OPTIONS_DISPLAY = 'options_display',
  ITEMS_DISPLAY = 'items_display',
  BINARY_DISPLAY = 'binary_display',
  SCALE_DISPLAY = 'scale_display',
  MATRIX_SETUP = 'matrix_setup',
  ALLOCATION_SETUP = 'allocation_setup',
  
  // Interaction Steps
  VOTING = 'voting',
  RANKING_INTERFACE = 'ranking_interface',
  RATING_INTERFACE = 'rating_interface',
  CHOICE_SELECTION = 'choice_selection',
  BINARY_VOTE = 'binary_vote',
  ALLOCATION_INTERFACE = 'allocation_interface',
  MATRIX_PLACEMENT = 'matrix_placement',
  
  // Processing Steps
  SIMILAR_CHECK = 'similar_check',
  IDEA_CLUSTERING = 'idea_clustering',
  IDEA_REFINEMENT = 'idea_refinement',
  
  // Evaluation Steps
  RANDOM_SUGGESTIONS = 'random_suggestions',
  TOP_SUGGESTIONS = 'top_suggestions',
  
  // Results Steps
  RESULTS = 'results',
  RANKING_AGGREGATION = 'ranking_aggregation',
  ALLOCATION_RESULTS = 'allocation_results',
  MATRIX_ANALYSIS = 'matrix_analysis',
  
  // Custom
  CUSTOM = 'custom'
}
```

## 6. Dynamic Component Loading

```typescript
interface StepComponent {
  stepType: StepType;
  component: React.ComponentType<StepProps>;
  validator?: (data: any) => ValidationResult;
  processor?: (data: any) => ProcessedData;
}

// Registry for step components
const stepComponentRegistry: Map<StepType, StepComponent> = new Map([
  [StepType.QUESTION, { 
    component: QuestionInput,
    validator: questionValidator 
  }],
  [StepType.VOTING, { 
    component: VotingInterface,
    processor: votingProcessor 
  }],
  [StepType.RANKING_INTERFACE, { 
    component: RankingDragDrop,
    validator: rankingValidator 
  }],
  // ... etc
]);

// Dynamic step renderer
function StepRenderer({ question, stepIndex }: StepRendererProps) {
  const step = question.structure.steps[stepIndex];
  const StepComponent = stepComponentRegistry.get(step.type)?.component;
  
  if (!StepComponent) {
    return <CustomStepLoader step={step} />;
  }
  
  return <StepComponent 
    config={step.config}
    questionId={question.questionId}
    inheritedData={question.inheritedData}
    onComplete={handleStepComplete}
  />;
}
```

## 7. Data Flow Between Different Structures

```typescript
// Example: Brainstorming → Ranking → Allocation
interface CrossStructureDataFlow {
  // Brainstorming produces ideas
  brainstorming: {
    output: {
      ideas: Idea[];
      clusters: IdeaCluster[];
    }
  },
  
  // Ranking uses ideas, produces priorities
  ranking: {
    input: {
      items: Idea[]; // from brainstorming
    },
    output: {
      rankedList: RankedItem[];
      topN: RankedItem[];
    }
  },
  
  // Allocation uses priorities
  allocation: {
    input: {
      categories: RankedItem[]; // from ranking.topN
    },
    output: {
      allocations: Allocation[];
      totalAllocated: number;
    }
  }
}
```

## 8. Validation & Constraints

```typescript
interface StructureValidation {
  // Validate that question structures are compatible
  validateDependencies(question: FlexibleQuestionConfig): ValidationResult;
  
  // Validate data type compatibility
  validateDataMapping(
    source: QuestionStructure, 
    target: QuestionStructure,
    mapping: DataMapping
  ): ValidationResult;
  
  // Validate step sequence
  validateStepSequence(steps: StepConfiguration[]): ValidationResult;
}

// Example validation rules
const validationRules = {
  // Ranking can only use array data
  [QuestionStructureType.RANKING]: {
    requiredInputType: 'array',
    requiredInputShape: { items: 'RankableItem[]' }
  },
  
  // Allocation needs numeric total
  [QuestionStructureType.ALLOCATION]: {
    requiredConfig: ['totalPoints'],
    requiredInputType: 'array',
    requiredInputShape: { categories: 'Category[]' }
  }
};
```

## 9. UI/UX Adaptations

```typescript
interface StructureUIConfig {
  // Layout adjustments per structure
  layout: 'standard' | 'wide' | 'compact' | 'fullscreen';
  
  // Navigation behavior
  navigation: {
    allowBack: boolean;
    allowSkip: boolean;
    showProgress: boolean;
    progressDisplay: 'steps' | 'percentage' | 'both';
  };
  
  // Visual theme per structure type
  theme?: {
    primaryColor?: string;
    icon?: string;
    animation?: 'none' | 'subtle' | 'engaging';
  };
  
  // Mobile responsiveness
  mobile: {
    layout: 'stack' | 'carousel' | 'accordion';
    gestures: boolean;
  };
}
```

## 10. Benefits of Flexible Structures

1. **Diverse Engagement**: Different question types keep users engaged
2. **Appropriate Tools**: Use the right structure for each decision type
3. **Data Richness**: Collect different types of data (rankings, allocations, text)
4. **Progressive Complexity**: Start simple, build to complex decisions
5. **Adaptive Flow**: Questions adapt based on previous structure outputs
6. **Reusability**: Save and reuse successful question structures
7. **Custom Workflows**: Build domain-specific decision processes

## 11. Example Use Cases

### Environmental Planning Session
1. **Brainstorming** → Collect all concerns
2. **Priority Matrix** → Impact vs Feasibility
3. **Allocation** → Budget distribution
4. **Binary Choice** → Immediate action?
5. **Multiple Choice** → Implementation partner

### Product Development Session
1. **Open Feedback** → User pain points
2. **Ranking** → Feature priorities
3. **Scale Rating** → Complexity assessment
4. **Allocation** → Resource distribution
5. **Direct Voting** → Release timeline

### Policy Development Session
1. **Standard Consensus** → Identify issues
2. **Binary Choice** → Policy direction
3. **Multiple Choice** → Implementation approach
4. **Scale Rating** → Impact assessment
5. **Open Feedback** → Concerns and suggestions

This flexible structure system allows each question to be perfectly suited to its purpose while maintaining data flow and dependencies between questions.