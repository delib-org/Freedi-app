# UX Design: Add Solution with Similar Detection

**Created**: 2025-11-20
**Designer**: UX/UI Architect Agent
**Status**: Design Complete - Ready for Implementation

---

## Executive Summary

This design transforms a potentially frustrating 30-second AI check into an engaging, educational experience through:
- **Progressive 4-stage loader** with animated icons and educational tips
- **Mobile-first approach** with thumb-friendly interactions
- **Maximum 3 similar solutions** to prevent choice paralysis
- **Celebratory success states** that reinforce contribution
- **Friendly error handling** that guides recovery

---

## 1. User Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    USER FLOW OVERVIEW                        │
└──────────────────────────────────────────────────────────────┘

[1] INPUT STAGE
    ↓
    User sees question
    ↓
    Taps "Add Solution" / input area
    ↓
    Mobile keyboard appears (optimized)
    ↓
    Types solution (3-500 chars)
    ↓
    Character count updates live
    ↓
    Submit button activates when valid

[2] SUBMISSION & LOADING (Critical 30s experience)
    ↓
    User taps "Submit"
    ↓
    Immediate feedback: Button → "Checking..."
    ↓
    Full-screen loader appears (0.3s fade)
    ↓
    Progressive Status Updates:
    • Step 1 (0-8s): "Checking content..." 🔍
    • Step 2 (8-18s): "Finding similar solutions..." 👥
    • Step 3 (18-25s): "Comparing with community..." 📊
    • Step 4 (25-30s): "Almost ready..." ✨
    ↓
    [Branch A: Similar Found] → Go to [3A]
    [Branch B: No Similar] → Go to [3B]
    [Branch C: Error] → Go to [3C]

[3A] SIMILAR SOLUTIONS DISPLAY
     ↓
     Show user's solution at top (highlighted)
     ↓
     Display 1-3 similar solutions (max)
     ↓
     Clear selection UI
     ↓
     User chooses:
     - Their solution (new) → Go to [4A]
     - Existing solution → Go to [4B]

[3B] NO SIMILAR FOUND
     ↓
     Auto-save new solution
     ↓
     Quick success message
     ↓
     Go to [4A]

[3C] ERROR STATE
     ↓
     Show friendly error
     ↓
     Offer retry or cancel
     ↓
     Return to input [1]

[4A] SUCCESS - NEW SOLUTION
     ↓
     Celebratory animation
     ↓
     "Your solution added! 🎉"
     ↓
     Auto-return to feed (2s)

[4B] SUCCESS - EXISTING SOLUTION
     ↓
     Positive reinforcement
     ↓
     "Great minds think alike! ✓"
     ↓
     Show vote added to existing
     ↓
     Auto-return to feed (2s)
```

---

## 2. Component Specifications

### 2.1 INPUT FORM (AddSolutionForm)

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Add Your Solution                          │
│  ─────────────────────────────────────────  │
│  ┌───────────────────────────────────────┐  │
│  │ Type your solution here...            │  │
│  │                                       │  │
│  │ [User typing area - expandable]      │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  12/500 characters (minimum 3)              │
│                                             │
│              [ Submit Solution ]            │
└─────────────────────────────────────────────┘
```

**Specifications:**

**Title:**
- Typography: `var(--h4-font-size)` (1.3rem)
- Color: `var(--text-title)`
- Weight: 500
- Mobile-friendly: Clear, concise

**Textarea:**
- Background: `var(--card-default)`
- Border: 2px solid `transparent`
- Border-radius: 12px
- Padding: 1rem
- Font-size: 1rem (17px base - optimal for mobile)
- Line-height: 1.5
- Min-height: 120px (4 rows)
- Max-height: 240px (auto-expand)
- Touch-friendly: Large tap area

**Focus State:**
```scss
.textarea:focus {
  border-color: var(--btn-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(95, 136, 229, 0.1);
}
```

**Character Counter:**
- Position: Bottom left
- Typography: 0.85rem
- Default color: `var(--text-caption)`
- Valid state: `var(--agree)` (when 3-500)
- Invalid state: `var(--text-error)` (when <3 or >500)
- Animation: Smooth color transition

**Submit Button:**
- Use atomic Button component
- Variant: `primary`
- Size: `large` (easier to tap on mobile)
- Full-width on mobile (<768px)
- States:
  - Disabled: When invalid (<3 or >500 chars)
  - Loading: "Checking..." with spinner
  - Active: "Submit Solution"

**Mobile Optimizations:**
```scss
@media (max-width: 768px) {
  .formContainer {
    padding: 1rem;
  }

  .textarea {
    font-size: 16px; // Prevents iOS zoom
    -webkit-appearance: none; // Better iOS styling
  }

  .submitButton {
    width: 100%;
    min-height: 48px; // iOS recommended
  }
}
```

**Microcopy:**
- Placeholder: "Share your solution... What would you suggest?"
- Character hint: Appears only when needed
  - Under 3 chars: "12/500 (minimum 3)"
  - Over 500: "512/500 (too long)"
  - Valid range: "45/500" (neutral)

---

### 2.2 LOADING EXPERIENCE (30-Second Engagement)

**Design Philosophy:**
1. **Transparency**: Show exactly what's happening
2. **Progress**: Clear visual progress indicators
3. **Education**: Explain the AI process
4. **Delight**: Playful animations keep attention
5. **Reassurance**: "This is normal and valuable"

**Component Structure:**

```typescript
interface EnhancedLoaderProps {
  stage: 'content-check' | 'similarity-search' | 'comparison' | 'finalizing';
  progress: number; // 0-100
  elapsedTime: number; // seconds
}
```

**Visual Design:**

```
┌─────────────────────────────────────────────┐
│                                             │
│               🔍 (animated)                 │
│                                             │
│          • • •  (pulsing dots)             │
│                                             │
│     [████████████░░░░░░░] 65%              │
│                                             │
│     Checking for inappropriate content      │
│                                             │
│     This may take up to 30 seconds         │
│                                             │
│     ⚡ Did you know?                        │
│     AI helps group similar ideas to        │
│     build stronger consensus!              │
│                                             │
│          🔍  👥  📊  ✨                     │
│          ●   ○   ○   ○                     │
└─────────────────────────────────────────────┘
```

**Stage Breakdown:**

**Stage 1: Content Check (0-8 seconds)**
```scss
Icon: 🔍 (magnifying glass, rotating gently)
Message: "Checking for inappropriate content..."
Sub-message: "Ensuring safe community standards"
Progress: 0% → 25%
Color: var(--btn-primary)
Tip: "AI scans for profanity and harmful content"
```

**Stage 2: Similarity Search (8-18 seconds)**
```scss
Icon: 👥 (people, scaling pulse)
Message: "Finding similar solutions..."
Sub-message: "Searching through community ideas"
Progress: 25% → 60%
Color: var(--question)
Tip: "Similar ideas are grouped to show consensus"
```

**Stage 3: Comparison (18-25 seconds)**
```scss
Icon: 📊 (chart, bar animation)
Message: "Comparing with existing solutions..."
Sub-message: "Analyzing similarity scores"
Progress: 60% → 85%
Color: var(--group)
Tip: "This helps prevent duplicate suggestions"
```

**Stage 4: Finalizing (25-30 seconds)**
```scss
Icon: ✨ (sparkles, twinkling)
Message: "Almost ready..."
Sub-message: "Preparing your results"
Progress: 85% → 100%
Color: var(--agree)
Tip: "Great solutions deserve careful review!"
```

**Animation Details:**

1. **Icon Animations:**
```scss
.stepIcon {
  font-size: 4rem; // Larger on mobile
  animation: iconBounce 2s ease-in-out infinite;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15));
}

@keyframes iconBounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-15px) scale(1.05); }
}
```

2. **Progress Bar with Glow:**
```scss
.progressBar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: linear-gradient(90deg,
    var(--btn-primary) 0%,
    var(--btn-primary-hover) 50%,
    var(--accent) 100%);
  border-radius: 3px;
  transition: width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation: progressGlow 2s ease-in-out infinite;
  box-shadow: 0 0 10px var(--btn-primary);
}
```

3. **Dots Loader (subtle background):**
```scss
.dotsLoader {
  display: flex;
  gap: 0.75rem;
  margin: 1rem 0;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--btn-primary);
  animation: dotPulse 1.5s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
```

4. **Educational Tips Rotation:**
```scss
.tipContainer {
  margin-top: 2rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border-left: 3px solid var(--accent);
  animation: fadeInUp 0.5s ease-out;
}

.tipIcon {
  margin-right: 0.5rem;
  font-size: 1.2rem;
}

.tipText {
  font-size: 0.9rem;
  color: var(--white);
  line-height: 1.4;
  opacity: 0.9;
}
```

**Educational Tips (rotates every stage):**
- "AI helps group similar ideas to build stronger consensus"
- "Duplicate solutions are combined to show true support"
- "Similar solutions are linked, making voting easier"
- "Our AI respects your privacy - content is analyzed, not stored"

**Fallback for Extended Loading (>30s):**
```
If elapsed > 30s:
  Message: "Taking a bit longer than usual..."
  Sub-message: "Complex analysis in progress"
  Add: "Cancel" button (returns to form with data saved)
```

**Mobile Optimizations:**
```scss
@media (max-width: 768px) {
  .loaderContainer {
    width: 95vw;
    padding: 2rem 1.5rem;
  }

  .stepIcon {
    font-size: 3rem; // Slightly smaller
  }

  .mainMessage {
    font-size: 1.1rem;
  }

  .tipContainer {
    font-size: 0.85rem;
    padding: 0.75rem;
  }
}
```

---

### 2.3 SIMILAR SOLUTIONS DISPLAY

**Design Goal:** Make choosing between similar solutions effortless and delightful.

**Layout:**

```
┌─────────────────────────────────────────────┐
│  We found similar solutions! 👥             │
│  ─────────────────────────────────────────  │
│                                             │
│  YOUR SOLUTION (New)                        │
│  ┌───────────────────────────────────────┐  │
│  │ ✨ Your text appears here...          │  │
│  │                                       │  │
│  │              [ Choose This ]          │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  SIMILAR EXISTING SOLUTIONS                 │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 85% similar • 12 people support this  │  │
│  │                                       │  │
│  │ Existing solution text...             │  │
│  │                                       │  │
│  │           [ Choose This ]             │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 72% similar • 8 people support this   │  │
│  │                                       │  │
│  │ Another solution text...              │  │
│  │                                       │  │
│  │           [ Choose This ]             │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  💡 Choosing an existing solution adds     │
│     your support and strengthens it!       │
└─────────────────────────────────────────────┘
```

**Specifications:**

**Header:**
```scss
.similarHeader {
  text-align: center;
  padding: 1.5rem;
  background: linear-gradient(135deg,
    var(--question) 0%,
    var(--accent) 100%);
  color: var(--white);
  border-radius: 12px 12px 0 0;

  h2 {
    font-size: var(--h3-font-size);
    margin: 0 0 0.5rem 0;
  }

  p {
    font-size: 0.9rem;
    opacity: 0.9;
    margin: 0;
  }
}
```

**Your Solution Card (Special Highlighting):**
```scss
.yourSolutionCard {
  position: relative;
  background: linear-gradient(135deg,
    rgba(87, 198, 178, 0.1) 0%,
    rgba(124, 172, 248, 0.1) 100%);
  border: 2px solid var(--agree);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;

  // "New" badge
  &::before {
    content: "NEW";
    position: absolute;
    top: -10px;
    right: 20px;
    background: var(--agree);
    color: var(--white);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.5px;
  }
}

.solutionText {
  font-size: 1rem;
  color: var(--text-body);
  line-height: 1.6;
  margin-bottom: 1rem;
  max-height: 150px;
  overflow-y: auto;
}
```

**Similar Solution Cards:**
```scss
.similarCard {
  background: var(--card-default);
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;

  &:hover {
    border-color: var(--btn-primary);
    box-shadow: 0 4px 12px rgba(95, 136, 229, 0.15);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}

.similarMeta {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.similarityScore {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--agree);
  font-weight: 600;

  &::before {
    content: "●";
    font-size: 1.2rem;
  }
}

.supportCount {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--text-caption);

  svg { width: 16px; height: 16px; }
}
```

**Selection Buttons:**
```scss
.chooseButton {
  // Use atomic Button component
  // Variant: primary for user's, secondary for similar
  width: 100%;
  margin-top: 0.75rem;

  @media (max-width: 768px) {
    min-height: 48px;
    font-size: 1rem;
  }
}
```

**Educational Footer:**
```scss
.helpFooter {
  margin-top: 2rem;
  padding: 1rem;
  background: rgba(124, 172, 248, 0.05);
  border-left: 3px solid var(--accent);
  border-radius: 8px;

  .helpIcon {
    margin-right: 0.5rem;
    font-size: 1.2rem;
  }

  .helpText {
    font-size: 0.9rem;
    color: var(--text-body);
    line-height: 1.5;
  }
}
```

**Maximum Similar Solutions:**
- Show max 3 similar solutions
- Sort by: 1) Similarity score, 2) Support count
- If >3 similar: Show top 3 only
- Rationale: Prevent choice paralysis

**Edge Case: 1 Similar Solution**
```scss
// If only 1 similar (>80% match):
.singleSimilarLayout {
  // Side-by-side comparison on desktop
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}
```

**Edge Case: Exact Match (100%)**
```
Special message:
"This solution already exists! 🎉"
"Your support has been added automatically."
Auto-select existing → Success screen
```

---

### 2.4 SUCCESS STATES

**2.4A: New Solution Added**

```
┌─────────────────────────────────────────────┐
│                                             │
│               ✅ (scale animation)          │
│                                             │
│          Your solution added!               │
│                                             │
│      Thank you for contributing! 🎉         │
│                                             │
│     Your idea is now part of the           │
│     community discussion.                   │
│                                             │
│        [ View All Solutions ]               │
└─────────────────────────────────────────────┘
Auto-redirect in 3 seconds...
```

**Specifications:**
```scss
.successScreen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg,
    rgba(87, 198, 178, 0.95) 0%,
    rgba(75, 171, 154, 0.95) 100%);
  z-index: 10000;
  animation: fadeInScale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.successCard {
  background: var(--white);
  padding: 3rem 2rem;
  border-radius: 20px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  width: 90%;
}

.successIcon {
  font-size: 5rem;
  animation: successPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes successPop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.successTitle {
  font-size: var(--h3-font-size);
  color: var(--agree);
  margin: 1rem 0 0.5rem 0;
}

.successMessage {
  font-size: 1rem;
  color: var(--text-body);
  line-height: 1.6;
  margin-bottom: 1.5rem;
}
```

**2.4B: Existing Solution Supported**

```
┌─────────────────────────────────────────────┐
│                                             │
│               🤝 (animated handshake)       │
│                                             │
│        Great minds think alike!             │
│                                             │
│      Your vote has been added to an        │
│      existing solution. Together we're     │
│      stronger! ✨                           │
│                                             │
│      This solution now has 13 votes        │
│                                             │
│        [ View Solution ]                    │
└─────────────────────────────────────────────┘
Auto-redirect in 3 seconds...
```

**Specifications:**
```scss
.supportSuccessScreen {
  // Similar to .successScreen but:
  background: linear-gradient(135deg,
    rgba(71, 180, 239, 0.95) 0%,
    rgba(124, 172, 248, 0.95) 100%);
}

.voteCounter {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  margin: 1rem 0;

  .voteNumber {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--white);
  }

  .voteLabel {
    font-size: 0.9rem;
    color: var(--white);
  }
}
```

---

### 2.5 ERROR STATES

**2.5A: Inappropriate Content Detected**

```
┌─────────────────────────────────────────────┐
│               ⚠️ (gentle pulse)             │
│                                             │
│       Content Policy Notice                 │
│                                             │
│   We detected content that doesn't meet    │
│   our community guidelines.                 │
│                                             │
│   Please review and rephrase your          │
│   suggestion to ensure it's:               │
│                                             │
│   ✓ Respectful to all participants         │
│   ✓ Free from offensive language           │
│   ✓ Constructive and helpful               │
│                                             │
│        [ Edit Solution ]                    │
│        [ Cancel ]                           │
└─────────────────────────────────────────────┘
```

**Specifications:**
```scss
.errorScreen {
  background: linear-gradient(135deg,
    rgba(239, 117, 80, 0.9) 0%,
    rgba(254, 107, 162, 0.9) 100%);
}

.errorCard {
  background: var(--white);
  padding: 2.5rem 2rem;
  border-radius: 20px;
  text-align: center;
  max-width: 450px;
  width: 90%;
}

.errorIcon {
  font-size: 4rem;
  animation: gentlePulse 2s ease-in-out infinite;
}

@keyframes gentlePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.errorTitle {
  font-size: var(--h4-font-size);
  color: var(--text-error);
  margin: 1rem 0;
}

.errorMessage {
  font-size: 0.95rem;
  color: var(--text-body);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.errorGuidelines {
  text-align: left;
  margin: 1.5rem 0;
  padding: 1rem;
  background: var(--statementBackground);
  border-radius: 8px;

  li {
    font-size: 0.9rem;
    color: var(--text-body);
    margin: 0.5rem 0;

    &::marker {
      color: var(--agree);
    }
  }
}
```

**Microcopy Guidelines:**
- Tone: Firm but friendly
- Focus: Educational, not punitive
- Action: Clear path to resolution

**2.5B: Rate Limit Reached**

```
┌─────────────────────────────────────────────┐
│               🕐 (clock icon)               │
│                                             │
│         Slow down, champion! 😊            │
│                                             │
│   You've submitted several solutions       │
│   recently. To ensure quality, please      │
│   wait 5 minutes before submitting more.   │
│                                             │
│   Time remaining: 3:42                      │
│                                             │
│   💡 Why limits?                            │
│   This helps maintain thoughtful           │
│   contributions and prevents spam.          │
│                                             │
│        [ Got it ]                           │
└─────────────────────────────────────────────┘
```

**Specifications:**
```scss
.rateLimitScreen {
  background: linear-gradient(135deg,
    rgba(239, 215, 128, 0.9) 0%,
    rgba(247, 202, 24, 0.9) 100%);
}

.countdown {
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-title);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  margin: 1rem 0;
}
```

**2.5C: Network Error**

```
┌─────────────────────────────────────────────┐
│               📡 (signal icon)              │
│                                             │
│        Connection Issue                     │
│                                             │
│   We couldn't reach our servers.           │
│   Please check your internet connection.   │
│                                             │
│   Your solution text has been saved -      │
│   try again when you're back online!       │
│                                             │
│        [ Retry ]    [ Cancel ]              │
└─────────────────────────────────────────────┘
```

**Reassurance:**
- Auto-save user's text to localStorage
- Clear recovery path
- Preserve user effort

---

## 3. Design Patterns Summary

### Color Usage (Aligned with Design Guide)

```scss
// Primary actions & brand
--btn-primary: #5f88e5
--btn-primary-hover: #7ca0f0
--accent: #7cacf8

// Success & positive
--agree: #57c6b2
--approve: #4fab9a

// Warning & caution
--text-warning: #ef7550
--option: #e7d080 (yellow for attention)

// Error & negative
--text-error: #f74a4d
--disagree: #fe6ba2

// Questions & info
--question: #47b4ef

// Backgrounds
--statementBackground: #f2f6ff
--card-default: #ffffff

// Text
--text-title: #3d4d71
--text-body: #5a6b8c
--text-caption: #93b6da
```

### Typography Hierarchy

```scss
// Headers
h2 (Page sections): var(--h2-font-size) - 1.7rem
h3 (Card titles): var(--h3-font-size) - 1.5rem
h4 (Component titles): var(--h4-font-size) - 1.3rem

// Body
p (Standard text): var(--p-font-size) - 1rem (17px)
.small-text: 0.9rem
.caption: 0.85rem

// Line heights
Body: 1.5-1.6
Headers: 1.2-1.4
```

### Spacing (8-Point Grid)

```scss
// Base unit: 0.5rem (8px)
--spacing-xs: 0.25rem (4px)
--spacing-sm: 0.5rem (8px)
--spacing-md: 1rem (16px)
--spacing-lg: 1.5rem (24px)
--spacing-xl: 2rem (32px)
--spacing-xxl: 3rem (48px)
```

### Animations & Transitions

```scss
// Timing functions
--ease-standard: cubic-bezier(0.25, 0.46, 0.45, 0.94)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)

// Durations
--duration-fast: 150ms
--duration-normal: 300ms
--duration-slow: 500ms

// Micro-interactions
button:active {
  transform: scale(0.95);
  transition: transform var(--duration-fast) var(--ease-standard);
}

// Page transitions
.fade-in {
  animation: fadeIn 500ms var(--ease-standard);
}

// Respect user preferences
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 4. Mobile-First Principles

### Thumb-Friendly Zone Design

```
┌─────────────────────────────────────────────┐
│                                             │
│  [Difficult Zone - Top 10%]                │
│  • Header (display only)                    │
│                                             │
│  [Comfortable Zone - Middle 30%]           │
│  • Card content                             │
│  • Secondary information                    │
│                                             │
│  [Reachable Zone - Bottom 60%]             │
│  ┌─────────────────────────────────────┐   │
│  │  • Submit button                     │   │
│  │  • Choice buttons                    │   │
│  │  • Primary CTAs                      │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Mobile Layout Adjustments

```scss
@media (max-width: 768px) {
  // Full-width buttons for easy tapping
  .button {
    width: 100%;
    min-height: 48px;
    font-size: 1rem;
  }

  // Larger touch targets
  .card {
    padding: 1.5rem;
    margin: 1rem 0;
  }

  // Prevent iOS zoom
  input, textarea {
    font-size: 16px !important;
  }

  // Stack layouts vertically
  .similarLayout {
    grid-template-columns: 1fr;
  }
}
```

---

## 5. Accessibility (WCAG AA)

### Keyboard Navigation
1. Textarea (focus trap when typing)
2. Submit button
3. Similar solution cards → Buttons
4. Success/Error CTAs

### Screen Reader Announcements
```html
<div role="status" aria-live="polite" aria-atomic="true">
  <p>{currentMessage}</p>
  <div aria-label={`Progress: ${progress}%`} />
</div>
```

### Focus Indicators
```scss
:focus-visible {
  outline: 3px solid var(--btn-primary);
  outline-offset: 2px;
}
```

---

## 6. Success Metrics

### User Experience
- Time to submit: <45 seconds
- Abandonment during loading: <10%
- Selection clarity: >90%
- Mobile completion: >90%

### Technical
- Loading updates every 2-3s
- 60fps animations
- CLS < 0.1
- First paint <200ms

### Business
- Duplicate reduction: >60%
- User satisfaction: >4.5/5
- Choose existing when similar: >70%

---

## Implementation Priority

1. **Phase 1 (Critical)**: Input form + basic validation
2. **Phase 2 (Critical)**: 4-stage animated loader
3. **Phase 3 (High)**: Similar solutions display
4. **Phase 4 (High)**: Success states
5. **Phase 5 (High)**: Error states
6. **Phase 6 (Medium)**: Polish & accessibility

---

## Conclusion

This design creates a delightful, engaging experience that transforms a potentially frustrating 30-second wait into an educational moment. The mobile-first approach ensures the primary use case is optimized, while accessibility features ensure everyone can participate in the democratic process.

**Key Innovations:**
1. Progressive 4-stage loader keeps users engaged
2. Maximum 3 similar solutions prevents choice paralysis
3. Educational tips during loading explain the "why"
4. Celebratory success states reinforce contribution
5. Friendly error handling guides recovery
6. Full accessibility ensures inclusivity
