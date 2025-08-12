# Mass Consensus System Architecture

## Overview

The Mass Consensus system is a structured democratic participation platform that guides users through a multi-step process to collect suggestions, evaluate options, and reach collective decisions. It supports both anonymous and authenticated users with customizable workflows.

## Core Concepts

### 1. Purpose and Goals
- **Democratic Participation**: Enable large-scale collective decision-making
- **Structured Process**: Guide participants through defined stages
- **Quality Filtering**: Use evaluations to surface best suggestions
- **Inclusive Design**: Support both anonymous and authenticated users
- **Scalable Architecture**: Handle multiple concurrent questions/processes

### 2. Key Entities

#### Statement (Question)
- Primary entity representing a Mass Consensus question
- Type: `StatementType.question`
- Contains: question text, description, metadata
- Tracks: participant count, suggestion count

#### Options (Suggestions)
- Child statements of type `StatementType.option`
- User-submitted solutions/answers to the question
- Subject to evaluation and voting
- Can be grouped by similarity

#### Process Configuration
- Defines the step sequence for each question
- Customizable per login type (anonymous/google/default)
- New format: Array of `MassConsensusStep` objects
- Each step contains: `screen`, `text`, `statementId`

#### Participants
- Tracked as `MassConsensusMember` entities
- Includes: user info, participation timestamp, email
- Separate tracking per question

## System Architecture

### 3. Data Flow

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   User UI    │────▶│Redux Store  │────▶│  Firebase    │
│  Components  │◀────│   (State)   │◀────│  Firestore   │
└──────────────┘     └─────────────┘     └──────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ View Models  │     │ Controllers │     │   Firebase   │
│   (Hooks)    │     │(DB Operations)│    │  Functions   │
└──────────────┘     └─────────────┘     └──────────────┘
```

### 4. Process Flow Stages

#### Default Process Sequence:
1. **Introduction** → Welcome and context
2. **User Demographics** → Optional data collection
3. **Question** → Initial suggestion submission
4. **Random Suggestions** → Evaluate 6 random options
5. **Top Suggestions** → Review highest-rated options
6. **Voting** → Formal democratic voting
7. **Leave Feedback** → Optional process feedback
8. **Thank You** → Completion confirmation

### 5. Database Schema

#### Collections Structure:

```typescript
// Primary Question
statements/{statementId}
  - statement: string
  - description: string
  - statementType: "question"
  - suggestions: number
  - massMembers: number

// Process Configuration
massConsensusProcesses/{statementId}
  - statementId: string
  - loginTypes: {
      default: {
        steps: MassConsensusStep[]
        processName: string
      },
      anonymous?: {...},
      google?: {...}
    }

// Participants
massConsensusMembers/{memberId}
  - statementId: string
  - creator: Creator
  - lastUpdate: timestamp
  - email?: string

// Suggestions (Options)
statements/{optionId}
  - parentId: statementId
  - statementType: "option"
  - statement: string
  - creator: Creator

// Evaluations
evaluations/{evaluationId}
  - statementId: string
  - evaluator: string
  - evaluation: number

// Votes
votes/{voteId}
  - statementId: string
  - voter: Creator
  - vote: number
```

## Feature Architecture

### 6. Multi-Question Support

#### Current Capabilities:
- **Isolated Contexts**: Each question operates independently
- **Separate Processes**: Custom step configuration per question
- **Independent Tracking**: Separate participant pools
- **Concurrent Operations**: Multiple questions can run simultaneously

#### Architecture for Multiple Questions:
```
User Session
├── Question A
│   ├── Process Config A
│   ├── Participants A
│   └── Options/Votes A
├── Question B
│   ├── Process Config B
│   ├── Participants B
│   └── Options/Votes B
└── Question C
    └── ...
```

### 7. User Role Management

#### Role Types:
- **Admin**: Full control over question and process
- **Participant**: Can submit, evaluate, and vote
- **Anonymous**: Limited features, temporary session

#### Permission Matrix:
| Action | Admin | Participant | Anonymous |
|--------|-------|------------|-----------|
| Edit Question | ✅ | ❌ | ❌ |
| Configure Process | ✅ | ❌ | ❌ |
| Submit Suggestions | ✅ | ✅ | ✅ |
| Evaluate Options | ✅ | ✅ | ✅ |
| Vote | ✅ | ✅ | Limited |
| View Results | ✅ | ✅ | ✅ |

### 8. Evaluation & Voting System

#### Two-Phase Democracy:

**Phase 1: Continuous Evaluation**
- Throughout suggestion viewing stages
- Numeric scale rating (typically -100 to +100)
- Used for quality filtering and ranking
- Helps surface best suggestions

**Phase 2: Formal Voting**
- Final democratic decision stage
- Binary or scaled voting options
- Recorded separately from evaluations
- Determines final consensus

### 9. Similar Suggestion Detection

#### AI-Powered Deduplication:
```
New Suggestion Submitted
         │
         ▼
AI Similarity Check
         │
    ┌────┴────┐
    │         │
Similar    Not Similar
Found      │
    │         │
    ▼         ▼
User Choice  Create New
- Use Existing
- Create New
```

## Component Architecture

### 10. Key Components

#### Container Components:
- **MassConsensus.tsx**: Main route container
- **HeaderMassConsensus.tsx**: Navigation header
- **FooterMassConsensus.tsx**: Step navigation controls

#### Screen Components:
- **Introduction.tsx**: Entry point with description
- **UserDemographicMC.tsx**: Demographics collection
- **MassConsensusQuestion.tsx**: Suggestion submission
- **RandomSuggestions.tsx**: Random evaluation phase
- **TopSuggestions.tsx**: Top-rated evaluation
- **VotingSuggestions.tsx**: Formal voting interface
- **LeaveFeedback.tsx**: Feedback collection
- **ThankYou.tsx**: Completion screen

#### Business Logic:
- **MassConsensusVM.ts**: Core view model and navigation
- **massConsensusSlice.ts**: Redux state management
- **setMassConsensus.ts**: Database operations
- **getMassConsensus.ts**: Data retrieval

### 11. State Management

#### Redux Slices:
```typescript
massConsensus: {
  similarStatements: Statement[]
  massConsensusProcess: MassConsensusProcess[]
}

statements: {
  statements: Statement[]
  statementSubscriptions: Subscription[]
}

evaluations: {
  evaluations: Evaluation[]
}

votes: {
  votes: Vote[]
}
```

## Technical Considerations

### 12. Performance Optimizations

- **Lazy Loading**: Components loaded on demand
- **Memoization**: Expensive computations cached
- **Pagination**: Large datasets paginated
- **Real-time Updates**: Firestore listeners for live data

### 13. Security & Validation

- **Server-side Validation**: Firebase Functions validate data
- **Role-based Access**: Firestore security rules
- **Anonymous Limits**: Rate limiting for anonymous users
- **Data Sanitization**: Input validation and sanitization

### 14. Internationalization

- **Multi-language**: Full i18n support via `useUserConfig`
- **RTL Support**: Bidirectional text handling
- **Locale-specific**: Date/number formatting
- **Dynamic Loading**: Language packs loaded on demand

## Future Enhancements

### 15. Proposed Multi-Question Features

#### Sequential Questions:
```
Question 1 → Question 2 → Question 3 → Final Consensus
     ↓           ↓           ↓
  Options    Options    Options
     ↓           ↓           ↓
   Votes      Votes      Votes
```

#### Hierarchical Questions:
```
Main Question
├── Sub-Question A
│   ├── Option A1
│   └── Option A2
└── Sub-Question B
    ├── Option B1
    └── Option B2
```

#### Conditional Branching:
```
Question 1
    │
    ├─[Answer A]→ Question 2A
    │
    └─[Answer B]→ Question 2B
```

### 16. Enhanced Analytics

- **Participation Metrics**: Track engagement at each step
- **Drop-off Analysis**: Identify where users leave
- **Consensus Quality**: Measure agreement levels
- **Time Analytics**: Duration per step analysis

### 17. Advanced Features

- **Weighted Voting**: Different vote weights based on expertise
- **Delegation**: Allow vote delegation to trusted members
- **Time-boxed Stages**: Automatic progression with deadlines
- **Result Visualization**: Advanced charts and insights

## Migration Considerations

### 18. Schema Evolution

The system recently migrated from:
- **Old**: `steps: string[]` (array of enum values)
- **New**: `steps: MassConsensusStep[]` (array of objects)

This migration demonstrates the system's ability to evolve while maintaining backward compatibility.

### 19. Scalability Planning

- **Horizontal Scaling**: Multiple Firebase instances
- **Caching Strategy**: CDN for static assets
- **Database Sharding**: Partition by question/time
- **Queue Management**: Background job processing

## Conclusion

The Mass Consensus system provides a robust foundation for democratic decision-making with strong technical architecture supporting scalability, customization, and evolution. The modular design allows for easy extension to support multiple questions and advanced democratic features.