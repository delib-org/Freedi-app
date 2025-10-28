# Popper-Hebbian Evidence Editing - UX Design Document

## Executive Summary
A comprehensive design for editing evidence posts in the Popper-Hebbian discussion system, focusing on intuitive interaction patterns, clear feedback mechanisms, and seamless AI re-evaluation visualization.

## Design Objectives
1. **Clarity**: Make the editing process immediately understandable
2. **Transparency**: Show AI re-evaluation process and score changes clearly
3. **Efficiency**: Minimize steps required to edit evidence
4. **Trust**: Build confidence through clear feedback and explanations
5. **Accessibility**: Ensure all users can edit their contributions

---

## User Journey Flow

### 1. INITIATING EDIT MODE

**Entry Points:**
- Three-dot menu (⋮) on user's own evidence posts
- Right-click context menu (desktop)
- Long-press menu (mobile)

**Visual Flow:**
```
[Evidence Card] → [Hover/Touch] → [⋮ Menu Appears] → [Click "Edit"] → [Edit Modal Opens]
```

**Permissions Check:**
- Only show edit option if `statement.creatorId === currentUser.uid`
- Disabled state with tooltip for non-editable posts

### 2. EDIT INTERFACE

**Modal Structure:**
```
┌─────────────────────────────────────────┐
│ ✎ Edit Your Evidence            [×]     │
├─────────────────────────────────────────┤
│                                         │
│ [Original Badge: Data | Supports]       │
│                                         │
│ Your Evidence:                         │
│ ┌─────────────────────────────────┐   │
│ │                                  │   │
│ │ [Editable text area with        │   │
│ │  original content pre-filled]    │   │
│ │                                  │   │
│ └─────────────────────────────────┘   │
│                                         │
│ How does this relate to the idea?      │
│                                         │
│ [Strongly Challenges ←─────→ Supports] │
│         Current: Supports Moderately    │
│                                         │
│ ⓘ AI will re-evaluate your changes     │
│                                         │
│ [Cancel]           [Save Changes]       │
└─────────────────────────────────────────┘
```

### 3. SAVING & AI RE-EVALUATION

**Immediate Save State:**
```
┌─────────────────────────────────────────┐
│         ⟳ Saving Changes...             │
└─────────────────────────────────────────┘
```

**AI Re-evaluation Loading State:**
```
┌─────────────────────────────────────────┐
│     🤖 AI is analyzing your evidence    │
│                                         │
│  [●●●] Processing...                    │
│                                         │
│  • Evaluating evidence type             │
│  • Calculating new weight               │
│  • Updating discussion score            │
│                                         │
└─────────────────────────────────────────┘
```

### 4. SCORE CHANGE NOTIFICATION

**Success State - Score Changed:**
```
┌─────────────────────────────────────────┐
│  ✓ Evidence Updated Successfully        │
│                                         │
│  📊 Score Impact:                       │
│  ├─ Evidence Type: Data → Testimony     │
│  ├─ Weight: 0.8 → 0.6 (-0.2)           │
│  └─ Overall Score: +0.73 → +0.68       │
│                                         │
│  💡 Why did this change?                │
│  The AI reclassified your evidence as   │
│  testimony based on personal experience │
│  rather than empirical data.            │
│                                         │
│               [Got it]                  │
└─────────────────────────────────────────┘
```

**Success State - No Change:**
```
┌─────────────────────────────────────────┐
│  ✓ Evidence Updated                     │
│                                         │
│  Your changes were saved. The evidence  │
│  classification and weight remain       │
│  unchanged.                             │
│                                         │
│               [OK]                      │
└─────────────────────────────────────────┘
```

---

## Component Design Specifications

### 1. Edit Button Integration in EvidencePost

**Location**: Top-right corner of evidence card
**Visual Design**:
```scss
.editMenu {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;

  .menuTrigger {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(124, 172, 248, 0.1);
    }

    &:active {
      transform: scale(0.95);
    }
  }

  .menuIcon {
    color: var(--lighter);
    font-size: 1.2rem;
  }
}

.menuDropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 0.5rem;
  min-width: 150px;
  z-index: 100;

  .menuItem {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover {
      background: var(--statementBackground);
    }

    .menuItemIcon {
      color: var(--accent);
    }

    .menuItemText {
      color: var(--text-primary);
      font-size: 0.9rem;
    }
  }
}
```

### 2. EditEvidenceModal Component

**Structure**:
```tsx
interface EditEvidenceModalProps {
  statement: Statement;
  onClose: () => void;
  onSuccess?: (updatedStatement: Statement) => void;
}

// Modal states
enum EditState {
  EDITING = 'editing',
  SAVING = 'saving',
  EVALUATING = 'evaluating',
  SUCCESS = 'success',
  ERROR = 'error'
}
```

**Visual Specifications**:
- Modal width: 600px (max-width: 90vw on mobile)
- Padding: 1.5rem
- Border radius: 12px
- Background: white
- Overlay: rgba(0, 0, 0, 0.5)

### 3. AI Evaluation Loading Component

**Design Elements**:
```scss
.aiEvaluationLoader {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  text-align: center;

  .aiIcon {
    width: 64px;
    height: 64px;
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite;
  }

  .loadingDots {
    display: flex;
    gap: 0.25rem;
    margin: 1rem 0;

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      animation: dotPulse 1.5s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }

  .progressSteps {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-top: 1.5rem;
    width: 100%;

    .step {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      opacity: 0.5;
      transition: opacity 0.3s ease;

      &.active {
        opacity: 1;
      }

      .stepIcon {
        color: var(--accent);
        animation: spin 1s linear infinite;
      }

      .stepText {
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
    }
  }
}
```

### 4. Score Change Notification

**Visual Design**:
```scss
.scoreChangeNotification {
  background: linear-gradient(135deg, #f5f7ff 0%, #e8f0ff 100%);
  border-radius: 12px;
  padding: 1.5rem;

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;

    .successIcon {
      color: var(--approve);
      font-size: 1.5rem;
    }

    .title {
      font-size: var(--h5-font-size);
      color: var(--text-primary);
      font-weight: 500;
    }
  }

  .scoreImpact {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;

    .impactItem {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .label {
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .value {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .oldValue {
          color: var(--lighter);
          text-decoration: line-through;
        }

        .arrow {
          color: var(--accent);
        }

        .newValue {
          color: var(--text-primary);
          font-weight: 500;
        }

        .change {
          padding: 0.125rem 0.5rem;
          border-radius: 12px;
          font-size: 0.8rem;

          &.positive {
            background: rgba(87, 198, 178, 0.1);
            color: var(--approve);
          }

          &.negative {
            background: rgba(254, 107, 162, 0.1);
            color: var(--disagree);
          }
        }
      }
    }
  }

  .explanation {
    background: rgba(124, 172, 248, 0.05);
    border-left: 3px solid var(--accent);
    padding: 1rem;
    margin-top: 1rem;
    border-radius: 4px;

    .explanationIcon {
      color: var(--accent);
      margin-right: 0.5rem;
    }

    .explanationText {
      color: var(--text-secondary);
      line-height: 1.5;
      font-size: 0.95rem;
    }
  }
}
```

---

## Mobile-First Responsive Adaptations

### Mobile Specific Adjustments (< 768px)

1. **Edit Menu**:
   - Trigger via long-press (500ms hold)
   - Bottom sheet pattern instead of dropdown
   - Larger touch targets (48x48px minimum)

2. **Edit Modal**:
   - Full-screen takeover
   - Fixed action buttons at bottom
   - Virtual keyboard awareness

3. **Loading States**:
   - Simplified animations (reduced complexity)
   - Larger text for readability

4. **Score Notification**:
   - Vertical layout for impact items
   - Collapsible explanation section

---

## User Feedback Messaging

### Success Messages
- **Evidence Updated**: "Your evidence has been successfully updated and re-evaluated."
- **Score Improved**: "Great! Your edit strengthened the evidence (weight increased by {amount})."
- **Score Decreased**: "Your evidence weight changed from {old} to {new} based on the AI's re-evaluation."

### Error Messages
- **Update Failed**: "Unable to save your changes. Please try again."
- **AI Evaluation Failed**: "Your changes were saved, but AI evaluation is temporarily unavailable."
- **Network Error**: "Connection lost. Your changes will be saved when reconnected."

### Informational Messages
- **Edit Hint**: "Tip: Adding specific data or citations can increase your evidence weight."
- **History Note**: "Last edited {timeAgo} • View edit history"

---

## Accessibility Considerations

### WCAG AA Compliance
1. **Color Contrast**:
   - All text maintains 4.5:1 contrast ratio
   - Interactive elements: 3:1 minimum
   - Never rely solely on color for information

2. **Keyboard Navigation**:
   - Tab order: Menu → Edit button → Modal fields → Action buttons
   - Escape key closes modal
   - Enter key submits when focused on Save button

3. **Screen Reader Support**:
   ```html
   <button aria-label="Edit evidence" aria-expanded="false">
   <div role="dialog" aria-labelledby="edit-modal-title" aria-describedby="edit-modal-desc">
   <div role="alert" aria-live="polite"> <!-- For status updates -->
   ```

4. **Focus Management**:
   - Focus trapped within modal
   - Focus returns to trigger element on close
   - Clear focus indicators (2px outline)

---

## Edge Cases & Error Handling

### Scenario 1: AI Evaluation Timeout
**Problem**: AI takes too long to respond
**Solution**:
- Show timeout after 10 seconds
- Offer to "Continue without AI evaluation"
- Save changes with flag for later re-evaluation

### Scenario 2: Concurrent Edits
**Problem**: Evidence was deleted while editing
**Solution**:
- Check evidence exists before save
- Show appropriate message: "This evidence was deleted"
- Offer to create new evidence with same content

### Scenario 3: Score Calculation Error
**Problem**: AI returns invalid classification
**Solution**:
- Fallback to previous classification
- Show message: "Using previous classification"
- Log error for debugging

### Scenario 4: Network Interruption
**Problem**: Connection lost during save
**Solution**:
- Implement optimistic updates
- Queue changes for retry
- Show status indicator: "Syncing..."

---

## Implementation Notes

### Component Structure
```
components/
├── EvidencePost/
│   ├── EvidencePost.tsx (modified)
│   ├── EvidencePost.module.scss
│   └── EditMenu/
│       ├── EditMenu.tsx
│       └── EditMenu.module.scss
├── EditEvidenceModal/
│   ├── EditEvidenceModal.tsx
│   ├── EditEvidenceModal.module.scss
│   └── components/
│       ├── AIEvaluationLoader.tsx
│       ├── ScoreChangeNotification.tsx
│       └── EditHistoryView.tsx
```

### State Management
```typescript
interface EditEvidenceState {
  isEditing: boolean;
  editState: EditState;
  originalEvidence: Evidence;
  editedText: string;
  editedSupport: number;
  evaluationResult?: EvaluationResult;
  error?: string;
}

interface EvaluationResult {
  previousType: EvidenceType;
  newType: EvidenceType;
  previousWeight: number;
  newWeight: number;
  previousScore: number;
  newScore: number;
  explanation: string;
}
```

### API Integration
```typescript
// Update evidence and get re-evaluation
async function updateEvidence(
  statementId: string,
  text: string,
  support: number
): Promise<EvaluationResult> {
  // 1. Save to database
  // 2. Trigger AI evaluation
  // 3. Update evidence classification
  // 4. Recalculate discussion score
  // 5. Return evaluation result
}
```

---

## Design Rationale

### Why Modal Instead of Inline Editing?
- **Focus**: Isolates the editing task from distractions
- **Space**: Provides room for instructions and feedback
- **Context**: Can show before/after comparisons
- **Mobile**: Better keyboard handling on small screens

### Why Show AI Processing Steps?
- **Trust**: Users understand what's happening
- **Education**: Teaches about evidence evaluation
- **Patience**: Makes wait time feel purposeful
- **Debugging**: Helps identify where issues occur

### Why Detailed Score Explanation?
- **Transparency**: Builds trust in AI evaluation
- **Learning**: Helps users write better evidence
- **Motivation**: Shows impact of contributions
- **Fairness**: Users understand why scores change

---

## Success Metrics

1. **Usability Metrics**:
   - Time to complete edit: < 30 seconds
   - Error rate: < 5%
   - Successful re-evaluations: > 95%

2. **Engagement Metrics**:
   - Edit rate: Increase by 20%
   - Evidence quality: Improvement in average weight
   - User retention: Higher for editors

3. **Satisfaction Metrics**:
   - Clarity of feedback: > 4.5/5 rating
   - Trust in AI evaluation: > 4/5 rating
   - Overall editing experience: > 4.5/5 rating

---

## Future Enhancements

1. **Version History**:
   - Show all previous edits
   - Ability to revert changes
   - Diff view between versions

2. **Collaborative Editing**:
   - Suggest edits to others' evidence
   - Track edit contributions
   - Peer review system

3. **AI Assistance**:
   - Suggestions for improving evidence
   - Real-time classification preview
   - Citation finder/validator

4. **Batch Operations**:
   - Edit multiple evidence posts
   - Bulk re-evaluation
   - Category management

---

## Conclusion

This design creates an intuitive, transparent, and engaging editing experience for Popper-Hebbian evidence posts. By focusing on clear feedback, progressive disclosure, and mobile-first design, users will feel confident editing their contributions while understanding how changes impact the discussion.

The AI re-evaluation visualization builds trust through transparency, while the score change explanations provide educational value. The overall flow minimizes friction while maximizing understanding, creating a positive feedback loop that encourages higher quality evidence contributions.