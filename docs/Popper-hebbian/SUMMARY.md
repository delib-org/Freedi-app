# Popper-Hebbian System - Quick Summary

## What It Is
A collaborative thinking system that transforms question discussions into evidence-based idea evaluation using:
- **AI Refinery**: Gemini helps clarify vague ideas before posting
- **Support/Challenge Evidence**: Users post evidence for/against ideas
- **Community Voting**: Positive and negative votes (👍 Helpful / 👎 Not Helpful)
- **Weighted Scoring**: Evidence quality determines impact on overall score
- **Idea Evolution**: Prompts users to improve ideas when challenged

## Key Concepts

### Data Structure
```
Question (statementType: StatementType.question, popperianDiscussionEnabled: true)
└── Options (statementType: StatementType.option - Ideas to discuss)
    └── Evidence Posts (statementType: StatementType.statement with evidence field)
        └── Votes (Helpful or Not Helpful)

Note: Evidence posts are regular statements (StatementType.statement) with the evidence field
populated with support level, evidence types, and vote counts.
```

### How It Works
1. **Admin enables Popper-Hebbian mode** on a question
2. **Users create options** (ideas) - AI refinery modal helps refine them
3. **Evidence appears under option** statement description
4. **Users add evidence** via modal - set support level, AI classifies type
5. **Community votes** on evidence quality (helpful/not-helpful)
6. **System calculates** weighted scores based on evidence type and votes
7. **Status indicator** shows: Looking Good / Under Discussion / Needs Fixing
8. **Evolution prompts** appear when ideas need improvement

## Technical Highlights

### MVP Simplicity
- ✅ **Gemini 2.5 Flash**: Free tier, simple setup, no complexity
- ✅ **Basic weighted scoring**: Type-based + net votes
- ✅ **AI evidence classification**: Gemini automatically classifies evidence type
- ✅ **Positive & negative feedback**: Both helpful and not-helpful votes

### Data Models
- **Evidence Posts**: Regular `Statement` objects (StatementType.statement) with `evidence` field populated
- `evidence` field contains:
  - `evidenceType`: single type (data, testimony, argument, anecdote, fallacy)
  - `support`: -1 to 1 scale (degree of support/challenge)
  - `helpfulCount`, `notHelpfulCount`, `netScore`: voting metrics
  - `evidenceWeight`: calculated weight based on type and quality
- `RefinementSession`: AI dialogue history
- `PopperHebbianScore`: Weighted total score and status

### Evidence Types & Weights
- **Data/Research**: 3.0x base weight
- **Testimony**: 2.0x base weight
- **Logical Argument**: 1.0x base weight
- **Anecdote**: 0.5x base weight
- **Fallacy**: 0.1x base weight

### Weight Calculation
```typescript
finalWeight = baseWeight * (1 + netScore * 0.1)
// Minimum weight: 0.1
```

## Implementation Order (6 Sprints)

1. **Foundation & Data Models**: Types, schemas, collections, AI setup
2. **Stage 1 - AI Refinery**: Modal, Gemini functions, falsifiability analysis
3. **Stage 2 - Discussion/Gauntlet**: Evidence posts, voting, Support/Challenge UI
4. **Stage 3 - Synthesis**: Scoreboard, status indicators, evolution prompts
5. **Integration & Testing**: E2E flows, AI prompt tuning, error handling
6. **Polish & Launch**: Design system, accessibility, performance, docs

## Files to Create

### Frontend
```
src/models/popperHebbian/
  └── RefineryModels.ts  (Score interfaces only - evidence uses delib-npm)

src/view/pages/statement/components/popperHebbian/
  ├── PopperHebbianDiscussion.tsx  (displays under option description)
  └── components/
      ├── AddEvidenceModal/  (modal for adding evidence)
      ├── IdeaRefineryModal/  (modal for refining new options)
      ├── IdeaScoreboard/
      ├── EvidencePost/
      └── EvolutionPrompt/

src/controllers/db/popperHebbian/
  ├── refineryController.ts
  ├── setEvidencePost.ts
  ├── setVote.ts
  └── getEvidencePosts.ts
```

### Backend
```
functions/src/
  ├── fn_popperHebbian_analyzeFalsifiability.ts
  ├── fn_popperHebbian_refineIdea.ts
  ├── fn_popperHebbian_onVote.ts
  └── config/gemini.ts
```

## Quick Setup (30 minutes)

1. **Get Gemini API Key** (2 min)
   - Visit https://aistudio.google.com/app/apikey
   - Sign in and create key

2. **Install Package** (1 min)
   ```bash
   cd functions
   npm install @google/generative-ai
   ```

3. **Configure Firebase** (5 min)
   ```bash
   firebase functions:config:set gemini.key="YOUR_KEY"
   ```

4. **Update delib-npm** (5 min)
   - Add `popperHebbian` to StatementSettings schema
   - Add new collections enum values

5. **Start Building** (ready to code!)

## Key Features

### User Experience
- **Simple language**: No jargon, encouraging tone
- **User-friendly labels**: Negative support values displayed as "Challenges" or "Strongly Challenges" instead of raw numbers
- **Visual feedback**: Color-coded status, progress bars
- **Mobile-friendly**: Stack columns, touch-friendly buttons
- **Real-time updates**: Scores update live as votes come in

### Safety & Quality
- **No race conditions**: Vote tracking with proper increments
- **Security rules**: Users only vote once, own their votes
- **Rate limiting**: Prevent AI API abuse
- **Validation**: All inputs validated on client and server

### Extensibility
- Easy to add evidence types
- Can switch AI providers (Gemini → Claude/GPT)
- Can add reputation scoring later
- Can add cross-statement evidence tracking

## Cost Estimate

**Gemini Free Tier**:
- 1500 requests/day = FREE
- Perfect for MVP testing
- ~100 refinement sessions per day

**Paid Tier** (if needed):
- $0.075 per 1M input tokens
- $0.30 per 1M output tokens
- ~$0.01 per refinement session

**Firestore**: Negligible (similar to existing evaluations)

## Success Metrics

1. **Idea Evolution Rate**: Avg number of improved versions per idea
2. **Evidence Quality Ratio**: Data/Research vs Anecdotes posted
3. **Community Engagement**: Voting participation rate
4. **AI Refinement Success**: % of ideas passing falsifiability test
5. **Status Progression**: % of ideas reaching "Looking Good" status

## Next Steps

See `implementation-plan.md` for complete technical details including:
- Full code examples for all components
- Detailed Firebase Functions implementation
- Security rules
- Testing strategy
- UI/UX specifications
- Design system guidelines
