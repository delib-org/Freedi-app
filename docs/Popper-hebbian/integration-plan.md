# Popper-Hebbian Discussion System Integration Plan

## Executive Summary
This document outlines the complete integration strategy for incorporating the Popper-Hebbian discussion system into the Freedi app. The system enhances collaborative decision-making through evidence-based refinement of ideas using Socratic dialogue and community validation.

## 🎯 Integration Objectives

### Core Goals
1. **Seamless UX Flow**: Integrate without disrupting existing workflows
2. **Progressive Enhancement**: Only activate when enabled in statement settings
3. **Intuitive Interaction**: Follow Freedi's design system for consistency
4. **Evidence-Based Discussion**: Support structured argumentation with visual feedback

## 🏗️ Architecture Overview

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

## 🎨 UX Design Strategy

### Visual Hierarchy & Flow

#### 1. Entry Point - Add Solution Button
When Popper-Hebbian mode is enabled, the "Add Solution" button triggers the refinement flow:

```scss
// Visual Design
.addSolutionButton {
  // Elevated importance with glow effect
  background: linear-gradient(135deg, var(--btn-primary), var(--accent));
  box-shadow: 0 4px 15px rgba(95, 136, 229, 0.3);

  // Micro-interaction on hover
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(95, 136, 229, 0.4);
  }
}
```

#### 2. IdeaRefineryModal - Socratic Dialogue
The modal creates a focused conversation environment:

```scss
// Modal Design Principles
.ideaRefineryModal {
  // Full-screen overlay for focus
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);

  .modalContent {
    // Centered card with breathing room
    max-width: 800px;
    margin: 2rem auto;
    background: var(--card-default);
    border-radius: 16px;

    // Conversation area
    .conversationFlow {
      max-height: 60vh;
      overflow-y: auto;
      padding: var(--padding);

      // Message bubbles
      .aiMessage {
        background: var(--statementBackground);
        border-left: 3px solid var(--accent);
      }

      .userMessage {
        background: white;
        border-left: 3px solid var(--btn-primary);
        margin-left: auto;
      }
    }
  }
}
```

#### 3. PopperHebbianDiscussion - Evidence Collection
Integrated below option descriptions with clear visual separation:

```scss
// Component Layout
.popperHebbianDiscussion {
  // Visual separator from main content
  border-top: 1px solid var(--border-light);
  margin-top: 1.5rem;
  padding-top: 1rem;

  // Score display with status indicator
  .scoreBoard {
    display: flex;
    align-items: center;
    gap: 1rem;

    .score {
      font-size: 2rem;
      font-weight: 600;
      color: var(--text-title);
    }

    .status {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.875rem;

      &--strong { background: var(--agree); }
      &--promising { background: var(--accent); }
      &--challenged { background: var(--disagree); }
    }
  }
}
```

## 💻 Implementation Guide

### Phase 1: Modal Integration Point

#### File: `/src/view/pages/statement/components/nav/bottom/StatementBottomNav.tsx`

```typescript
// Add import for IdeaRefineryModal
import IdeaRefineryModal from '@/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal';

const StatementBottomNav: FC<Props> = () => {
  // ... existing code ...

  // Add state for Popper-Hebbian modal
  const [showRefineryModal, setShowRefineryModal] = useState(false);
  const [pendingIdea, setPendingIdea] = useState<string>('');

  // Check if Popper-Hebbian is enabled
  const isPopperHebbianEnabled = statement?.statementSettings?.popperianDiscussionEnabled ?? false;

  function handleAddOption() {
    if (isPopperHebbianEnabled && canAddOption) {
      // Open refinery modal instead of direct creation
      setShowRefineryModal(true);
    } else {
      // Existing flow
      handleCreateNewOption();
    }
    decreaseLearning({ addOption: true });
  }

  // Handle refined idea publication
  const handlePublishRefinedIdea = async (refinedIdea: string, sessionId: string) => {
    // Create the option with refined text
    const newStatement = await createStatementFromModal({
      title: refinedIdea,
      description: '', // Can be enhanced to include refined description
      parentStatement: statement,
      statementType: StatementType.option,
      // Store session ID in metadata for tracking
      metadata: { refinementSessionId: sessionId }
    });

    setShowRefineryModal(false);
  };

  return (
    <>
      {/* Existing UI */}
      <div className={navRootClass}>
        {/* ... existing buttons ... */}
      </div>

      {/* Add IdeaRefineryModal */}
      {showRefineryModal && statement && (
        <IdeaRefineryModal
          parentStatementId={statement.statementId}
          originalIdea={pendingIdea}
          onClose={() => setShowRefineryModal(false)}
          onPublish={handlePublishRefinedIdea}
        />
      )}
    </>
  );
};
```

### Phase 2: Alternative Integration via CreateStatementModal

#### File: `/src/view/pages/statement/components/createStatementModal/CreateStatementModal.tsx`

```typescript
import IdeaRefineryModal from '@/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal';

const CreateStatementModal: FC<CreateStatementModalProps> = ({
  parentStatement,
  isOption,
  setShowModal,
  getSubStatements,
  isSendToStoreTemp,
  allowedTypes,
}) => {
  // ... existing state ...

  // Add state for refinement flow
  const [showRefineryModal, setShowRefineryModal] = useState(false);
  const [refinedData, setRefinedData] = useState<{title: string, sessionId: string} | null>(null);

  // Check if Popper-Hebbian is enabled for parent
  const isPopperHebbianEnabled = parentStatement !== 'top' &&
    parentStatement?.statementSettings?.popperianDiscussionEnabled &&
    isOptionSelected;

  const onFormSubmit = async () => {
    if (isPopperHebbianEnabled && !refinedData) {
      // Open refinery modal instead of direct submission
      setShowRefineryModal(true);
      return;
    }

    // Use refined data if available
    const finalTitle = refinedData?.title || title;

    setShowModal(false);
    await createStatementFromModal({
      creator,
      title: finalTitle,
      description,
      isOptionSelected,
      parentStatement,
      isSendToStoreTemp,
      statementType: isOptionSelected ? StatementType.option : StatementType.question,
      metadata: refinedData ? { refinementSessionId: refinedData.sessionId } : undefined
    });

    await getSubStatements?.();
  };

  const handleRefinementComplete = (refinedIdea: string, sessionId: string) => {
    setRefinedData({ title: refinedIdea, sessionId });
    setShowRefineryModal(false);
    // Auto-submit the form with refined data
    onFormSubmit();
  };

  return (
    <>
      <Modal className={styles.createStatementModal}>
        {/* Existing form UI */}
        <form className={styles.overlay} onSubmit={onFormSubmit}>
          {/* ... existing form fields ... */}

          {isPopperHebbianEnabled && (
            <div className={styles.refinementNotice}>
              <InfoIcon />
              <p>{t("Your idea will be refined through AI-assisted dialogue")}</p>
            </div>
          )}

          <CreateStatementButtons
            isOption={isOptionSelected}
            onCancel={() => setShowModal(false)}
            buttonText={isPopperHebbianEnabled ? t("Start Refinement") : undefined}
          />
        </form>
      </Modal>

      {showRefineryModal && parentStatement !== 'top' && (
        <IdeaRefineryModal
          parentStatementId={parentStatement.statementId}
          originalIdea={title}
          onClose={() => setShowRefineryModal(false)}
          onPublish={handleRefinementComplete}
        />
      )}
    </>
  );
};
```

### Phase 3: PopperHebbianDiscussion Integration

#### File: `/src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx`

```typescript
import PopperHebbianDiscussion from '@/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion';

const SuggestionCard: FC<Props> = ({
  parentStatement,
  statement,
  positionAbsolute = true,
}) => {
  // ... existing code ...

  // Check if Popper-Hebbian is enabled for parent
  const isPopperHebbianEnabled = parentStatement?.statementSettings?.popperianDiscussionEnabled ?? false;
  const isOptionStatement = statement?.statementType === StatementType.option;

  // Handler for creating improved version
  const handleCreateImprovedVersion = () => {
    // This could trigger a new refinement session based on collected evidence
    console.info('Creating improved version based on evidence');
    // Implementation would depend on your evolution strategy
  };

  return (
    <div
      className={styles['statement-evaluation-card']}
      // ... existing props ...
    >
      {/* Existing card content */}
      <div className={styles.main}>
        <div className={styles.info}>
          <div className={styles.text}>
            {/* Existing text content */}
            <div className={styles.textContent} ref={textContainerRef}>
              <EditableStatement
                statement={statement}
                // ... existing props ...
              />
            </div>

            {/* Add PopperHebbianDiscussion after description */}
            {isPopperHebbianEnabled && isOptionStatement && (
              <div className={styles.popperHebbianSection}>
                <PopperHebbianDiscussion
                  statement={statement}
                  onCreateImprovedVersion={handleCreateImprovedVersion}
                />
              </div>
            )}

            {/* Existing buttons and links */}
            <Link to={`/statement/${statement.statementId}`} className={styles.showMore}>
              {t('Show more')}
            </Link>
          </div>
        </div>

        {/* Existing actions section */}
        <div className={styles.actions}>
          {/* ... existing action buttons ... */}
        </div>
      </div>
    </div>
  );
};
```

#### Updated SCSS Module: `/src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.module.scss`

```scss
.statement-evaluation-card {
  // ... existing styles ...

  .popperHebbianSection {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);

    // Ensure proper spacing in card layout
    @media (max-width: 768px) {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
    }
  }
}
```

## 🔄 State Management

### Redux Integration

#### New Slice: `/src/redux/popperHebbian/popperHebbianSlice.ts`

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RefinementSession } from '@/models/popperHebbian/RefineryModels';

interface PopperHebbianState {
  activeRefinementSessions: Record<string, RefinementSession>;
  evidenceCache: Record<string, Statement[]>;
  isRefineryModalOpen: boolean;
  currentSessionId: string | null;
}

const initialState: PopperHebbianState = {
  activeRefinementSessions: {},
  evidenceCache: {},
  isRefineryModalOpen: false,
  currentSessionId: null,
};

const popperHebbianSlice = createSlice({
  name: 'popperHebbian',
  initialState,
  reducers: {
    setRefinementSession: (state, action: PayloadAction<RefinementSession>) => {
      state.activeRefinementSessions[action.payload.sessionId] = action.payload;
    },
    setRefineryModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isRefineryModalOpen = action.payload;
    },
    setCurrentSessionId: (state, action: PayloadAction<string | null>) => {
      state.currentSessionId = action.payload;
    },
    cacheEvidence: (state, action: PayloadAction<{statementId: string, evidence: Statement[]}>) => {
      state.evidenceCache[action.payload.statementId] = action.payload.evidence;
    },
  },
});

export const {
  setRefinementSession,
  setRefineryModalOpen,
  setCurrentSessionId,
  cacheEvidence,
} = popperHebbianSlice.actions;

export default popperHebbianSlice.reducer;
```

## 🧪 Testing Strategy

### User Flow Testing

1. **Refinement Flow**
   - User clicks "Add Solution" with Popper-Hebbian enabled
   - IdeaRefineryModal opens with initial AI question
   - User engages in dialogue
   - Refined idea is published as option

2. **Evidence Collection**
   - PopperHebbianDiscussion displays under option
   - Users add evidence (supporting/challenging)
   - Score updates in real-time
   - Evolution prompt appears when threshold met

3. **Edge Cases**
   - Modal closure mid-refinement
   - Network interruptions during AI calls
   - Rapid evidence submission
   - Score calculation with conflicting evidence

## 📊 Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
```typescript
// Lazy load Popper-Hebbian components
const IdeaRefineryModal = lazy(() =>
  import('@/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal')
);

const PopperHebbianDiscussion = lazy(() =>
  import('@/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion')
);
```

2. **Evidence Caching**
```typescript
// Cache evidence posts in Redux to avoid repeated fetches
useEffect(() => {
  const cached = evidenceCache[statement.statementId];
  if (cached && Date.now() - cached.timestamp < 60000) {
    setEvidencePosts(cached.posts);
    return;
  }
  // Fetch fresh data
}, [statement.statementId]);
```

3. **Debounced Score Calculation**
```typescript
// Debounce score recalculation
const debouncedCalculateScore = useMemo(
  () => debounce(calculatePopperHebbianScore, 500),
  []
);
```

## 🚀 Deployment Steps

### Phase 1: Feature Flag Implementation
1. Add `popperianDiscussionEnabled` to statement settings UI
2. Default to `false` for backward compatibility
3. Enable for testing groups

### Phase 2: Gradual Rollout
1. Enable for admin users first
2. Monitor performance and user feedback
3. Expand to power users
4. Full release with documentation

### Phase 3: Enhancement
1. Add analytics tracking
2. Implement A/B testing
3. Gather user feedback
4. Iterate on UX based on data

## 📝 Migration Guide

### For Existing Statements
```typescript
// Migration script to add Popper-Hebbian settings
async function migrateStatements() {
  const statements = await getAllStatements();

  for (const statement of statements) {
    if (!statement.statementSettings.hasOwnProperty('popperianDiscussionEnabled')) {
      await updateStatement(statement.statementId, {
        statementSettings: {
          ...statement.statementSettings,
          popperianDiscussionEnabled: false, // Default off
        }
      });
    }
  }
}
```

## 🎯 Success Metrics

### KPIs to Track
1. **Engagement Metrics**
   - Refinement session completion rate
   - Average dialogue length
   - Evidence posts per option

2. **Quality Metrics**
   - Option score distribution
   - Evolution frequency
   - User satisfaction ratings

3. **Performance Metrics**
   - Modal load time
   - AI response latency
   - Real-time update performance

## 🔍 Accessibility Considerations

### WCAG Compliance
1. **Keyboard Navigation**
   - Full keyboard support in modal
   - Tab order follows conversation flow
   - Escape key closes modal

2. **Screen Reader Support**
   - ARIA labels for all interactive elements
   - Live regions for score updates
   - Descriptive button texts

3. **Visual Accessibility**
   - High contrast mode support
   - Focus indicators
   - Readable font sizes

## 📚 Documentation Requirements

### User Documentation
1. Feature overview and benefits
2. Step-by-step usage guide
3. Best practices for evidence submission
4. FAQ section

### Developer Documentation
1. API reference for Popper-Hebbian functions
2. Component prop documentation
3. State management guide
4. Extension points for customization

## 🐛 Error Handling

### Graceful Degradation
```typescript
// Fallback to standard creation if refinement fails
const handleRefinementError = (error: Error) => {
  console.error('Refinement failed:', error);

  // Show user-friendly message
  toast.error(t('Refinement unavailable. Creating option directly.'));

  // Fall back to standard flow
  setShowRefineryModal(false);
  handleCreateNewOption();
};
```

## 🔄 Future Enhancements

### Roadmap
1. **V1.1**: Multi-language AI refinement
2. **V1.2**: Evidence quality scoring
3. **V1.3**: Automated evidence summarization
4. **V2.0**: Machine learning-based idea evolution

## Conclusion

This integration plan provides a comprehensive approach to incorporating the Popper-Hebbian discussion system into Freedi. The design prioritizes user experience, maintains consistency with existing patterns, and ensures graceful enhancement of the collaborative decision-making process.

The modular approach allows for incremental implementation and testing, reducing risk while enabling rapid iteration based on user feedback.