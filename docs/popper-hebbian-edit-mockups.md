# Popper-Hebbian Edit Evidence - Visual Mockups

## ASCII Art Mockups for Implementation Reference

### 1. Evidence Card with Edit Menu

```
┌─────────────────────────────────────────────────────┐
│ [Data Badge]  [Strongly Supports Badge]         [⋮] │ <- Edit menu trigger
│                                                      │
│ "Studies show that diverse teams produce 35%        │
│  more innovative solutions than homogeneous         │
│  teams (Harvard Business Review, 2023)."            │
│                                                      │
│ ├─────────────────────────────────────────────────┤ │
│ │ 👍 12  |  👎 2  |  Net Score: +10                │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Last edited 2 hours ago                             │ <- Only shows if edited
└─────────────────────────────────────────────────────┘
```

**Hover State of Edit Menu**:
```
                                            ┌──────────┐
                                            │    [⋮]   │ <- Highlighted
                                            └─────┬────┘
                                                  │
                                        ┌─────────▼──────────┐
                                        │ ✏️ Edit Evidence   │
                                        │ 📜 View History    │
                                        │ 🗑️ Delete         │
                                        └────────────────────┘
```

### 2. Edit Evidence Modal - Initial State

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Your Evidence                                       [×]   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                  │
│  Current Classification:  [Data] [Strongly Supports]            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Your Evidence                                            │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │ Studies show that diverse teams produce 35%             │  │
│  │ more innovative solutions than homogeneous              │  │
│  │ teams (Harvard Business Review, 2023).                  │  │
│  │                                                          │  │
│  │ [Cursor blinking here]                                  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Character count: 142 / 500                                     │
│                                                                  │
│  How does this relate to the idea?                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Strongly Challenges          Strongly Supports          │  │
│  │        [-1] ←────────[•]────────→ [+1]                  │  │
│  │                    Current: +0.8                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ℹ️ AI will automatically re-evaluate your evidence after       │
│     you save your changes                                       │
│                                                                  │
│  [Cancel]                                    [Save Changes →]   │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Saving State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                                                                  │
│                      [⟳]  Saving Changes...                     │
│                                                                  │
│                   ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░                      │
│                                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4. AI Evaluation Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                          🤖                                     │
│                     AI Analyzing                                │
│                                                                  │
│                      ● ● ●                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  ⟳ Evaluating evidence type...                          │  │
│  │  ⟳ Calculating evidence weight...                       │  │
│  │  ⟳ Updating discussion score...                         │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  This usually takes 5-10 seconds                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Score Change Notification - Significant Change

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Evidence Updated Successfully                               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                  │
│  📊 Score Impact Analysis                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  Evidence Type:    [Data] → [Testimony]                 │  │
│  │                           ↓ -25%                        │  │
│  │                                                          │  │
│  │  Evidence Weight:  0.80 → 0.60                          │  │
│  │                    ▓▓▓▓▓▓▓▓░░░░                        │  │
│  │                                                          │  │
│  │  Discussion Score: +0.73 → +0.68                        │  │
│  │                    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░                   │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💡 Why did this change?                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ The AI reclassified your evidence from "Data" to         │  │
│  │ "Testimony" because the citation was removed and the     │  │
│  │ statement now appears to be based on personal            │  │
│  │ observation rather than empirical research.              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│                          [Understood]                           │
└─────────────────────────────────────────────────────────────────┘
```

### 6. Score Change Notification - Minor/No Change

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Evidence Updated                                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                  │
│         Your changes have been saved successfully.              │
│                                                                  │
│     The evidence classification and weight remain the same.     │
│                                                                  │
│                 [Data] [Strongly Supports]                      │
│                     Weight: 0.80                                │
│                                                                  │
│                            [OK]                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7. Mobile View - Edit Menu (Bottom Sheet)

```
Phone Screen (375px width)
┌─────────────────────────┐
│                         │
│    [Evidence Card]      │
│                         │
│    [Long press detected]│
│                         │
├─────────────────────────┤
│░░░░░░░░░░░░░░░░░░░░░░░░░│ <- Overlay
│░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────┤
│     Evidence Actions    │ <- Bottom sheet slides up
│  ───────────────────    │
│                         │
│  ✏️ Edit Evidence       │
│  ─────────────────────  │
│  📜 View History        │
│  ─────────────────────  │
│  🗑️ Delete             │
│  ─────────────────────  │
│                         │
│      [Cancel]           │
└─────────────────────────┘
```

### 8. Mobile View - Edit Modal (Full Screen)

```
Phone Screen (375px width)
┌─────────────────────────┐
│ ← Back   Edit Evidence  │
├─────────────────────────┤
│                         │
│ Current: [Data][+0.8]   │
│                         │
│ ┌─────────────────────┐ │
│ │                     │ │
│ │ [Text area with     │ │
│ │  original content]  │ │
│ │                     │ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ Support Level:          │
│ [-1] ←───[•]───→ [+1]  │
│       +0.8              │
│                         │
│ ℹ️ AI will re-evaluate  │
│                         │
├─────────────────────────┤
│ [Cancel] [Save Changes] │ <- Fixed at bottom
└─────────────────────────┘
```

### 9. Error States

```
Network Error:
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Connection Issue                                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                  │
│  Unable to save your changes right now.                         │
│  Please check your connection and try again.                    │
│                                                                  │
│  Your edits have been saved locally and will                    │
│  sync when connection is restored.                             │
│                                                                  │
│  [Try Again]                                      [Close]       │
└─────────────────────────────────────────────────────────────────┘

AI Evaluation Timeout:
┌─────────────────────────────────────────────────────────────────┐
│  ⏱️ AI Evaluation Taking Longer Than Expected                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                  │
│  Your changes have been saved, but the AI evaluation            │
│  is taking longer than usual.                                   │
│                                                                  │
│  The evidence will be re-evaluated in the background            │
│  and you'll be notified when complete.                         │
│                                                                  │
│  [Continue Without Evaluation]              [Wait 10 More Sec]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Color Coding Guide

Based on the design system, use these colors for the edit flow:

### Evidence Type Colors
- **Data**: `--accent` (#7cacf8) - Light blue
- **Testimony**: `--option` (#e7d080) - Warm yellow
- **Argument**: `--group` (#b893e7) - Purple
- **Anecdote**: `--statementBackground` (#f2f6ff) - Soft sky
- **Fallacy**: `--disagree` (#fe6ba2) - Soft pink

### Support Level Colors
- **Strongly Supports**: `--approve` (#57c6b2) - Teal
- **Supports**: Lighter teal (rgba(87, 198, 178, 0.7))
- **Neutral**: `--lighter` (#898ca7) - Gray
- **Challenges**: Lighter pink (rgba(254, 107, 162, 0.7))
- **Strongly Challenges**: `--disagree` (#fe6ba2) - Pink

### Status Colors
- **Success**: `--approve` (#57c6b2)
- **Error**: `--mainBackgroundError` (#ff0000)
- **Warning**: `--range-conflict-60` (#ef7550)
- **Info**: `--accent` (#7cacf8)
- **Loading**: `--btn-primary` (#5f88e5)

### Interactive Elements
- **Primary Button**: `--btn-primary` (#5f88e5)
- **Primary Hover**: `--btn-primary-hover` (#80a0ea)
- **Secondary Button**: White with `--btn-secondary` border
- **Disabled**: `--inactive` (#cfcfcf)
- **Focus Ring**: `--accent` with 2px width

---

## Animation Timings

Following the design system standards:

```css
/* Micro-interactions */
.button-press: scale(0.95) - 150ms
.hover-fade: opacity change - 200ms
.menu-slide: translateY - 200ms

/* Modal animations */
.modal-enter: scale(0.9 to 1) + opacity - 400ms
.modal-exit: scale(1 to 0.9) + opacity - 300ms

/* Loading animations */
.dot-pulse: scale(1 to 1.4) - 1.5s infinite
.spinner-rotate: rotate(360deg) - 1s linear infinite

/* Score change animations */
.number-change: slide + fade - 500ms
.bar-fill: width transition - 800ms ease-out

/* Mobile bottom sheet */
.sheet-slide-up: translateY(100% to 0) - 300ms ease-out
.sheet-slide-down: translateY(0 to 100%) - 250ms ease-in
```

---

## Responsive Breakpoints

```scss
// Mobile First Approach
@media (min-width: 0px) {
  // Base mobile styles
  .modal { width: 100vw; height: 100vh; }
  .button { width: 100%; }
}

@media (min-width: 600px) {
  // Large phones / small tablets
  .modal { width: 90vw; max-width: 600px; }
  .button { width: auto; min-width: 120px; }
}

@media (min-width: 768px) {
  // Tablets
  .modal { width: 600px; height: auto; }
  .edit-menu { position: absolute; } // Switch from bottom sheet
}

@media (min-width: 1024px) {
  // Desktop
  .modal { width: 650px; }
  // Add hover states
  // Enable keyboard shortcuts
}
```

---

## Component File Structure

```
src/view/pages/statement/components/popperHebbian/
├── components/
│   ├── EvidencePost/
│   │   ├── EvidencePost.tsx (modified)
│   │   ├── EvidencePost.module.scss
│   │   └── components/
│   │       └── EditMenu/
│   │           ├── EditMenu.tsx
│   │           └── EditMenu.module.scss
│   │
│   ├── EditEvidenceModal/
│   │   ├── EditEvidenceModal.tsx
│   │   ├── EditEvidenceModal.module.scss
│   │   └── components/
│   │       ├── AIEvaluationLoader/
│   │       │   ├── AIEvaluationLoader.tsx
│   │       │   └── AIEvaluationLoader.module.scss
│   │       ├── ScoreChangeNotification/
│   │       │   ├── ScoreChangeNotification.tsx
│   │       │   └── ScoreChangeNotification.module.scss
│   │       └── EditHistory/
│   │           ├── EditHistory.tsx
│   │           └── EditHistory.module.scss
│   │
│   └── AddEvidenceModal/ (existing, can reuse parts)
│       ├── AddEvidenceModal.tsx
│       └── AddEvidenceModal.module.scss
```

---

## Implementation Priority

### Phase 1: Core Editing (MVP)
1. Edit menu button in EvidencePost
2. Basic EditEvidenceModal (text + slider)
3. Save functionality without AI re-evaluation
4. Success/error states

### Phase 2: AI Integration
1. AI evaluation loading state
2. Score change calculation
3. Score change notification
4. Explanation generation

### Phase 3: Polish & Enhancement
1. Edit history tracking
2. Animated transitions
3. Mobile optimizations
4. Keyboard shortcuts
5. Offline support

### Phase 4: Advanced Features
1. Batch editing
2. Suggested improvements
3. Version comparison
4. Collaborative editing

---

## Accessibility Checklist

- [ ] All interactive elements have ARIA labels
- [ ] Modal has proper role="dialog" and aria-describedby
- [ ] Focus trap implemented in modal
- [ ] Escape key closes modal
- [ ] Loading states announced to screen readers
- [ ] Score changes announced with aria-live regions
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Touch targets minimum 44x44px
- [ ] Keyboard navigation fully functional
- [ ] Reduced motion respected

---