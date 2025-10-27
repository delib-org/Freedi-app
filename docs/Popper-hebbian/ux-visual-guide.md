# Popper-Hebbian UX Visual Guide

## 🎨 Visual Design Specifications

### Color Palette for Popper-Hebbian Features

```scss
// Popper-Hebbian Specific Colors
--ph-refinement: #7cacf8;      // Soft blue for refinement UI
--ph-evidence-support: #57c6b2; // Teal for supporting evidence
--ph-evidence-challenge: #fe6ba2; // Pink for challenging evidence
--ph-score-high: #4fab9a;      // Green for strong ideas
--ph-score-medium: #e7d080;    // Yellow for developing ideas
--ph-score-low: #f74a4d;       // Red for challenged ideas
--ph-evolution: #b893e7;       // Purple for evolution prompts
```

## 📐 Component Layout Specifications

### 1. IdeaRefineryModal Layout

```
┌─────────────────────────────────────────────────────┐
│                    Modal Header                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🔬 Idea Refinement Laboratory        [X]     │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           Progress Indicator                  │  │
│  │  [=====>                ] Step 2 of 5        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           Conversation Area                   │  │
│  │  ┌─────────────────────────────────────┐     │  │
│  │  │ AI: What problem does your idea      │     │  │
│  │  │     solve specifically?              │     │  │
│  │  └─────────────────────────────────────┘     │  │
│  │                                                │  │
│  │      ┌─────────────────────────────────────┐  │  │
│  │      │ User: It helps teams make better    │  │  │
│  │      │       decisions collaboratively      │  │  │
│  │      └─────────────────────────────────────┘  │  │
│  │                                                │  │
│  │  ┌─────────────────────────────────────┐     │  │
│  │  │ AI: Interesting! How does it differ  │     │  │
│  │  │     from existing solutions?          │     │  │
│  │  └─────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │              Input Area                      │  │
│  │  ┌────────────────────────────────────┐      │  │
│  │  │ Type your response...              │      │  │
│  │  └────────────────────────────────────┘      │  │
│  │  [Skip Question] [Previous] [Send →]         │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         Refined Idea Preview                  │  │
│  │  Current: "Collaborative decision platform"   │  │
│  │  Refined: "AI-enhanced collaborative         │  │
│  │           decision-making platform with       │  │
│  │           evidence-based voting"              │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [Cancel]                    [Publish Refined Idea] │
└─────────────────────────────────────────────────────┘
```

### 2. PopperHebbianDiscussion Component Layout

```
┌─────────────────────────────────────────────────────┐
│            PopperHebbianDiscussion                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           IdeaScoreboard                     │  │
│  │  ┌────────┐  ┌─────────────────────┐        │  │
│  │  │  +42   │  │ Status: Strong Idea  │        │  │
│  │  │ Score  │  │ 🟢 Well-supported     │        │  │
│  │  └────────┘  └─────────────────────┘        │  │
│  │                                               │  │
│  │  Progress Bar: [█████████░░░] 85% validated  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         Action Buttons                       │  │
│  │  [+ Add Evidence]  [View Analysis]  [Share]  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         Evidence Posts                       │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │ 👍 Supporting Evidence (+15)            │ │  │
│  │  │ "Research shows 73% improvement..."     │ │  │
│  │  │ By: @user123 • 2 hours ago             │ │  │
│  │  │ [👍 12] [💬 3] [Report]                 │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │ 👎 Challenging Evidence (-8)            │ │  │
│  │  │ "Similar approach failed at..."         │ │  │
│  │  │ By: @user456 • 5 hours ago             │ │  │
│  │  │ [👍 5] [💬 2] [Report]                  │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  │                                               │  │
│  │  [Load More Evidence...]                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │       EvolutionPrompt (if score < 0)        │  │
│  │  ⚠️ This idea needs improvement              │  │
│  │  Based on community feedback, consider:      │  │
│  │  • Address concern about scalability         │  │
│  │  • Clarify implementation details            │  │
│  │  [Create Improved Version]                   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 🎭 Interaction States

### Button States

#### Add Solution Button (Popper-Hebbian Enabled)

```scss
// Default State
.addSolutionButton {
  background: linear-gradient(135deg, #5f88e5, #7cacf8);
  color: white;
  padding: 0.5rem 1.5rem;
  border-radius: 25px;
  box-shadow: 0 4px 15px rgba(95, 136, 229, 0.3);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);

  // Icon animation
  .icon {
    transition: transform 0.3s ease;
  }
}

// Hover State
.addSolutionButton:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(95, 136, 229, 0.4);
  background: linear-gradient(135deg, #6b91e7, #85b4fa);

  .icon {
    transform: rotate(90deg);
  }
}

// Active State
.addSolutionButton:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px rgba(95, 136, 229, 0.3);
}

// Loading State
.addSolutionButton.loading {
  cursor: not-allowed;
  opacity: 0.7;

  &::after {
    content: '';
    animation: spin 1s linear infinite;
  }
}
```

### Evidence Card Interactions

```scss
// Evidence Post Card
.evidencePost {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  transition: all 0.2s ease;

  // Support Type Indicators
  &.supporting {
    border-left: 4px solid var(--ph-evidence-support);

    &:hover {
      box-shadow: 0 4px 12px rgba(87, 198, 178, 0.15);
      transform: translateX(2px);
    }
  }

  &.challenging {
    border-left: 4px solid var(--ph-evidence-challenge);

    &:hover {
      box-shadow: 0 4px 12px rgba(254, 107, 162, 0.15);
      transform: translateX(2px);
    }
  }

  // Vote buttons
  .voteButton {
    transition: all 0.15s ease;

    &:hover {
      transform: scale(1.1);
    }

    &:active {
      transform: scale(0.95);
    }

    &.voted {
      background: var(--accent);
      color: white;
    }
  }
}
```

## 📱 Responsive Breakpoints

### Mobile (< 768px)

```scss
@media (max-width: 768px) {
  .ideaRefineryModal {
    .modalContent {
      margin: 0;
      height: 100vh;
      border-radius: 0;

      .conversationFlow {
        max-height: calc(100vh - 200px);
      }
    }
  }

  .popperHebbianDiscussion {
    .scoreBoard {
      flex-direction: column;
      text-align: center;

      .score {
        font-size: 1.5rem;
      }
    }

    .evidencePost {
      padding: 0.75rem;

      .metadata {
        font-size: 0.75rem;
      }
    }
  }
}
```

### Tablet (768px - 1024px)

```scss
@media (min-width: 768px) and (max-width: 1024px) {
  .ideaRefineryModal {
    .modalContent {
      max-width: 90%;
      margin: 1rem auto;
    }
  }

  .popperHebbianDiscussion {
    .evidenceGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
  }
}
```

### Desktop (> 1024px)

```scss
@media (min-width: 1024px) {
  .ideaRefineryModal {
    .modalContent {
      max-width: 900px;

      // Side-by-side layout for refined preview
      .refinedPreview {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
      }
    }
  }

  .popperHebbianDiscussion {
    // Three-column layout for evidence
    .evidenceGrid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
  }
}
```

## 🎬 Animation Sequences

### IdeaRefineryModal Entry

```scss
@keyframes modalEntry {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  50% {
    transform: scale(1.02) translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ideaRefineryModal {
  animation: modalEntry 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

### Conversation Message Appearance

```scss
@keyframes messageSlideIn {
  0% {
    opacity: 0;
    transform: translateX(-20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.conversationMessage {
  animation: messageSlideIn 0.3s ease-out;

  &.user {
    animation-name: messageSlideInRight;
  }
}

@keyframes messageSlideInRight {
  0% {
    opacity: 0;
    transform: translateX(20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
```

### Score Update Animation

```scss
@keyframes scoreUpdate {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
    color: var(--accent);
  }
  100% {
    transform: scale(1);
  }
}

.score.updating {
  animation: scoreUpdate 0.6s ease-out;
}
```

## 🔄 User Flow Diagrams

### Flow 1: Creating Option with Refinement

```
User Intent: Add Solution
         ↓
[Check: Popper-Hebbian Enabled?]
         ↓
      ┌──┴──┐
   No │     │ Yes
      ↓     ↓
[Standard]  [Open IdeaRefineryModal]
[Creation]         ↓
      │     [AI Socratic Dialogue]
      │            ↓
      │     [5-7 Q&A Exchanges]
      │            ↓
      │     [Generate Refined Idea]
      │            ↓
      │     [User Reviews & Confirms]
      │            ↓
      └─────→ [Create Statement]
                   ↓
            [Option Published]
                   ↓
         [PopperHebbianDiscussion Active]
```

### Flow 2: Evidence Collection & Evolution

```
Published Option
       ↓
[PopperHebbianDiscussion Component]
       ↓
[Display Score & Status]
       ↓
[User: Add Evidence]
       ↓
[Select: Support/Challenge]
       ↓
[Write Evidence Post]
       ↓
[Community Votes on Evidence]
       ↓
[Score Recalculated]
       ↓
[Check: Score < Threshold?]
       ↓
    ┌──┴──┐
 No │     │ Yes
    ↓     ↓
[Continue] [Show EvolutionPrompt]
           ↓
    [Create Improved Version?]
           ↓
        ┌──┴──┐
     No │     │ Yes
        ↓     ↓
   [Dismiss] [Start New Refinement]
```

## 🎯 Micro-interactions

### 1. Progress Indicator

```scss
.progressIndicator {
  height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  overflow: hidden;

  .progress {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--ph-refinement));
    transition: width 0.5s ease-out;
    position: relative;

    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.3),
        transparent
      );
      animation: shimmer 2s infinite;
    }
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

### 2. Typing Indicator

```scss
.typingIndicator {
  display: flex;
  gap: 4px;
  padding: 0.5rem;

  .dot {
    width: 8px;
    height: 8px;
    background: var(--accent);
    border-radius: 50%;
    animation: bounce 1.4s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes bounce {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}
```

## 🎨 Visual Feedback States

### Success States

```scss
.successFeedback {
  background: linear-gradient(135deg, #4fab9a, #57c6b2);
  color: white;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  animation: slideDown 0.3s ease-out;

  .icon {
    animation: checkmark 0.5s ease-out;
  }
}

@keyframes checkmark {
  0% {
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.2) rotate(-45deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
```

### Error States

```scss
.errorFeedback {
  background: rgba(247, 74, 77, 0.1);
  border: 1px solid var(--reject);
  color: var(--reject);
  padding: 1rem;
  border-radius: 8px;
  animation: shake 0.5s ease-out;
}

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  10%, 30%, 50%, 70%, 90% {
    transform: translateX(-4px);
  }
  20%, 40%, 60%, 80% {
    transform: translateX(4px);
  }
}
```

## 🌈 Theme Variations

### Light Mode (Default)

```scss
.popperHebbianTheme {
  --ph-bg: #ffffff;
  --ph-text: #2c3e50;
  --ph-border: #e0e6ed;
  --ph-shadow: rgba(0, 0, 0, 0.1);
}
```

### Dark Mode Support

```scss
@media (prefers-color-scheme: dark) {
  .popperHebbianTheme {
    --ph-bg: #1a1a2e;
    --ph-text: #eee;
    --ph-border: #404258;
    --ph-shadow: rgba(0, 0, 0, 0.3);

    // Adjust component colors
    .ideaRefineryModal {
      background: var(--ph-bg);
      color: var(--ph-text);
    }

    .evidencePost {
      background: #2d2d44;
      border-color: var(--ph-border);
    }
  }
}
```

## 📊 Visual Hierarchy Guidelines

### Typography Scale

```scss
// Popper-Hebbian Typography
.ph-title {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-title);
}

.ph-score {
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), var(--ph-refinement));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ph-label {
  font-size: 0.875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-caption);
}

.ph-body {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text-body);
}

.ph-metadata {
  font-size: 0.75rem;
  color: var(--text-caption);
}
```

## 🎯 Focus States (Accessibility)

```scss
// Keyboard navigation focus
.focusable {
  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

// Skip links for screen readers
.skipLink {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--btn-primary);
  color: white;
  padding: 0.5rem 1rem;
  text-decoration: none;
  z-index: 100;

  &:focus {
    top: 0;
  }
}
```

## 🔧 Implementation Checklist

### Design System Compliance
- [ ] All colors use CSS variables from design system
- [ ] Typography follows established scale
- [ ] Spacing uses 8-point grid (0.5rem base)
- [ ] Border radius consistent (8px cards, 20px buttons)
- [ ] Shadows match layered system

### Responsive Design
- [ ] Mobile-first CSS structure
- [ ] Touch targets minimum 44x44px
- [ ] Text readable at all breakpoints
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] WCAG AA color contrast met
- [ ] Keyboard navigation complete
- [ ] ARIA labels present
- [ ] Focus indicators visible
- [ ] Screen reader tested

### Performance
- [ ] Animations use CSS transforms
- [ ] Images lazy-loaded
- [ ] Reduced motion respected
- [ ] Smooth 60fps scrolling

### User Experience
- [ ] Loading states present
- [ ] Error states handled
- [ ] Success feedback clear
- [ ] Empty states designed
- [ ] Transitions smooth

## Conclusion

This visual guide ensures the Popper-Hebbian discussion system integrates seamlessly with Freedi's design language while introducing distinctive elements that enhance the evidence-based discussion experience. The design prioritizes clarity, engagement, and accessibility to create an intuitive collaborative environment.