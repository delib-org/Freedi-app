# Mass Consensus - Tinder-Style Redesign (CLAUDE.md Compliant)

## 📋 Plan Updates Summary

**Key improvements in this version:**

1. **Performance Budget**: Defined concrete targets (200KB bundle, 60fps, <2s load)
2. **Phase 0.5 Added**: Prototype core interaction before full refactor (validate UX on real devices)
3. **Simplified Email System**: Use Firebase Extension or Resend/Loops instead of building from scratch
4. **Enhanced Accessibility**: Comprehensive WCAG AA requirements with keyboard navigation and screen reader support
5. **Offline Support**: Optimistic updates and sync queue in Redux
6. **RTL Strategy**: Explicit guidance for Hebrew support
7. **Analytics & Monitoring**: Track key metrics, A/B test ideas
8. **Error Recovery**: Graceful failure handling with error boundaries
9. **Real-time Updates**: Throttled Firestore listeners to prevent UI thrashing
10. **Fixed Code Issues**: Touch/mouse event handling, design token usage, RAF for animations

**Critical Path**: Phase 0 → Phase 0.5 (prototype) → Phase 1 (refactor) → Phase 2 → ...

---

## Project Overview

Transform the Mass Consensus app into a "Smart Tinder for Ideas" - a swipe-based interface for gathering broad consensus on proposals and ideas. The goal is to make civic participation feel like a game, not a chore.

**Project Location:** `/Users/talyaron/Documents/Freedi-app/apps/mass-consensus`

**IMPORTANT**: This implementation MUST follow all CLAUDE.md guidelines including:
- ✅ Atomic Design System (SCSS-first approach)
- ✅ No `any` types (import from `@freedi/shared-types`)
- ✅ Structured error handling with `logError()`
- ✅ Firebase utilities (no manual refs)
- ✅ Named constants (no magic numbers)
- ✅ Comprehensive testing (80%+ coverage)
- ✅ i18n with `useTranslation()`
- ✅ Redux Toolkit for state management
- ✅ Performance budget (200KB bundle, 60fps animations, <2s load)
- ✅ Offline support with optimistic updates
- ✅ Comprehensive accessibility (WCAG AA, RTL support)

---

## Design Philosophy

### Core Concept
Instead of filling out surveys, users "play" with ideas - swiping through proposals, rating them, suggesting improvements, and seeing their impact in real-time. The experience should be:
- **Intuitive** - Anyone can use it immediately
- **Engaging** - Feels like a game, not work
- **Social** - Shows community activity and connection
- **Rewarding** - Users see their impact

### Design System Integration

**CRITICAL**: All styling must align with `/docs/design-guide.md`

#### Proposed Color Palette Extension
Add these pastel colors to the existing design system tokens:

```scss
// ADD TO: src/view/style/_variables.scss
// Pastel Rating Colors (5-point scale)
--rating-love: #ffe4e6;        /* Pink - ❤️ Love it */
--rating-like: #d1fae5;        /* Green - 👍 Like */
--rating-neutral: #f1f5f9;     /* Gray - 😐 Neutral */
--rating-dislike: #fef3c7;     /* Yellow - 👎 Dislike */
--rating-hate: #fee2e2;        /* Red - ❌ Strongly dislike */

// Pastel Accents (extend existing palette)
--color-pastel-blue: #B8D4E3;   /* Light blue */
--color-pastel-purple: #D9D4E7; /* Soft purple */
--color-pastel-peach: #F5DDD6;  /* Warm peach */
--color-pastel-mint: #C9E4DE;   /* Fresh mint green */

// Shadow tokens (if not already in design system)
--shadow-card: 0 4px 12px rgba(0, 0, 0, 0.1);
--shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-active: inset 0 2px 4px rgba(0, 0, 0, 0.2);
```

**Before implementation**:
1. Verify these colors don't conflict with existing tokens in `design-guide.md`
2. Check if shadow tokens already exist - if so, use existing names

#### Typography & Spacing
Follow existing design system:
- Use type scale from design guide (h1-h6, p)
- Use 8px grid system: `var(--padding)`, `var(--margin)`
- Touch targets: minimum 44px (accessibility requirement)
- BEM naming convention for all CSS classes

---

## Performance & Optimization

### Performance Budget

**Bundle Size Targets:**
- Main swipe page: <200KB (gzipped)
- Initial load (FCP): <1.5s on 4G
- Time to Interactive: <2.5s on 4G
- Lighthouse score: >90 on mobile

**Animation Performance:**
- Target: 60fps on mid-tier devices (iPhone 11, Pixel 5)
- Use `transform` and `opacity` only (GPU-accelerated)
- Avoid layout thrashing with `requestAnimationFrame`
- Test on real devices, not just simulators

### Card Preloading Strategy

```typescript
// Preload next 3 cards while user evaluates current card
const PRELOAD_AHEAD = 3;

// Lazy load images with intersection observer
// Prefetch card data in batches of 10
// Cache evaluations locally for offline support
```

### Optimization Checklist

- [ ] Code splitting: Lazy load email modal, proposal flow
- [ ] Image optimization: WebP with fallback, responsive sizes
- [ ] Redux: Use selector memoization (already in factories)
- [ ] Firestore: Use query limits, index optimization
- [ ] Analytics: Batch events, send on idle
- [ ] Service Worker: Cache static assets, offline fallback

### RTL (Right-to-Left) Support

**Critical for Hebrew UI:**

```scss
// Automatic direction handling
[dir="rtl"] .swipe-card {
  // "Like" should still be right swipe
  // Visual feedback mirrors, not logic
}

// Use logical properties
.swipe-card {
  margin-inline-start: 16px; // Not margin-left
  padding-inline: var(--padding);
}
```

**Swipe direction semantics:**
- **Right swipe = Positive** (universal, regardless of text direction)
- **Left swipe = Negative**
- Don't mirror swipe logic for RTL, only visual elements

---

## Technical Requirements (CLAUDE.md Compliance)

### 1. TypeScript Type Safety ✅

**ALWAYS check `@freedi/shared-types` first for types:**

This project uses an internal shared types package (`packages/shared-types`) published as `@freedi/shared-types`. This package contains all shared types used across apps and Firebase functions, replacing the legacy `delib-npm` package.

**Key types available:**
- `Statement`, `StatementType`, `SimpleStatement`
- `User`, `Creator`, `Role`
- `Evaluation`, `StatementEvaluation`
- `Collections` (Firestore collection names)
- `Survey`, `SurveySettings`, `SurveyProgress`
- `Vote`, `Agreement`, `Approval`
- Many more - see `packages/shared-types/dist/cjs/index.d.ts`

```typescript
// ✅ CORRECT - Import from @freedi/shared-types
import { Statement, User, Role, StatementType, Evaluation } from '@freedi/shared-types';

// Check @freedi/shared-types for:
// - Statement (statementId, statement, createdBy, etc.)
// - Evaluation (evaluationId, statementId, userId, value)
// - User (uid, displayName, photoURL, etc.)

// Only create custom types if they don't exist in @freedi/shared-types
// If a type is needed across apps/functions, add it to packages/shared-types
// and rebuild the package

// Local app-specific types (not shared)
interface SwipeDirection {
  direction: 'left' | 'right' | 'neutral';
  strength: number; // 0-1
}

// If needed across apps, add to packages/shared-types/src/types/emailSubscription.ts
interface EmailSubscription {
  id: string;
  userId: string;
  email: string;
  // ...
}

// ❌ NEVER use any type
// const data: any = ...
```

### 2. Error Handling ✅

**REQUIRED for ALL async operations:**

```typescript
import { logError, DatabaseError, ValidationError, withErrorHandling, withRetry } from '@/utils/errorHandling';
import { RETRY } from '@/constants/common';

// Pattern 1: Try-catch with logError
export async function submitRating(statementId: string, rating: number) {
  try {
    if (rating < -2 || rating > 2) {
      throw new ValidationError('Invalid rating value', {
        rating,
        allowed: [-2, -1, 0, 1, 2]
      });
    }

    const evalRef = createEvaluationRef();
    await setDoc(evalRef, { statementId, rating, ...createTimestamps() });

  } catch (error) {
    logError(error, {
      operation: 'swipe.submitRating',
      statementId,
      rating,
      userId: user?.uid
    });
    throw error; // Re-throw for UI handling
  }
}

// Pattern 2: Higher-order function (PREFERRED for reusable functions)
export const submitRatingWithRetry = withRetry(
  withErrorHandling(
    async (statementId: string, rating: number) => {
      // Your logic here
    },
    { operation: 'swipe.submitRating' }
  ),
  {
    maxRetries: RETRY.MAX_ATTEMPTS,
    delayMs: RETRY.INITIAL_DELAY_MS,
    exponentialBackoff: true
  }
);
```

### 3. Firebase Utilities ✅

**NEVER create manual Firebase refs:**

```typescript
import {
  createStatementRef,
  createEvaluationRef,
  createDocRef,
  createCollectionRef,
  createTimestamps,
  updateTimestamp,
  executeBatchUpdates
} from '@/utils/firebaseUtils';
import { Collections } from '@freedi/shared-types';

// ✅ CORRECT
const statementRef = createStatementRef(statementId);
const evalRef = createEvaluationRef(evaluationId);
const { createdAt, lastUpdate } = createTimestamps();

// For new collections
const emailSubRef = createDocRef('emailSubscriptions', subId);

// Batch operations (auto-handles 500-item limit)
const updates = statements.map(stmt => ({
  ref: createStatementRef(stmt.statementId),
  data: { lastUpdate: updateTimestamp().lastUpdate }
}));
await executeBatchUpdates(updates);

// ❌ WRONG - Don't do this
const ref = doc(FireStore, Collections.statements, statementId);
```

### 4. Constants Usage ✅

**Add to `/src/constants/common.ts`:**

```typescript
// ADD THESE CONSTANTS:

export const SWIPE = {
  // Thresholds
  LIKE_THRESHOLD: 100,        // px - threshold for "like" swipe
  LOVE_THRESHOLD: 200,        // px - threshold for "love" swipe
  DISLIKE_THRESHOLD: -100,    // px
  HATE_THRESHOLD: -200,       // px
  ROTATION_FACTOR: 20,        // degrees per 100px

  // Animation
  SWIPE_DURATION: 300,        // ms
  CARD_ENTER_DURATION: 400,   // ms
  CARD_STACK_OFFSET: 10,      // px between stacked cards

  // UX Flow
  PROPOSAL_PROMPT_INTERVAL: 7,  // Show "propose idea" after N cards
  BATCH_SIZE: 10,                // Load N cards at a time
} as const;

export const RATING = {
  HATE: -2,
  DISLIKE: -1,
  NEUTRAL: 0,
  LIKE: 1,
  LOVE: 2,
} as const;

export const EMAIL_NOTIFICATIONS = {
  TOKEN_LENGTH: 64,
  CONFIRMATION_EXPIRY: TIME.DAY * 7,
  DIGEST_SEND_HOUR: 9,  // 9 AM
  MIN_ACTIVITY_FOR_DIGEST: 1,
  RATE_LIMIT_PER_HOUR: 5,
} as const;

// ✅ Usage
import { SWIPE, RATING } from '@/constants/common';

if (dragX > SWIPE.LIKE_THRESHOLD) {
  handleRating(RATING.LIKE);
}
```

### 5. Redux Integration ✅

**Use Redux Toolkit for ALL state:**

```typescript
// src/redux/swipe/swipeSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Statement } from '@freedi/shared-types';

interface SwipeState {
  currentCard: Statement | null;
  cardStack: Statement[];
  evaluatedCards: string[]; // statementIds
  userProposalCount: number;
  showProposalPrompt: boolean;
  // Offline support
  pendingEvaluations: Array<{
    statementId: string;
    rating: number;
    timestamp: number;
  }>;
  isOnline: boolean;
  syncError: string | null;
}

const swipeSlice = createSlice({
  name: 'swipe',
  initialState: {
    currentCard: null,
    cardStack: [],
    evaluatedCards: [],
    userProposalCount: 0,
    showProposalPrompt: false,
  } as SwipeState,
  reducers: {
    setCardStack: (state, action: PayloadAction<Statement[]>) => {
      state.cardStack = action.payload;
      state.currentCard = action.payload[0] || null;
    },
    cardEvaluated: (state, action: PayloadAction<string>) => {
      state.evaluatedCards.push(action.payload);
      state.cardStack = state.cardStack.filter(
        card => card.statementId !== action.payload
      );
      state.currentCard = state.cardStack[0] || null;

      // Check for proposal prompt
      if (state.evaluatedCards.length % SWIPE.PROPOSAL_PROMPT_INTERVAL === 0) {
        state.showProposalPrompt = true;
      }
    },
    proposalSubmitted: (state) => {
      state.userProposalCount += 1;
      state.showProposalPrompt = false;
    },
    // Offline support reducers
    evaluationSubmitted: (state, action: PayloadAction<{ statementId: string; rating: number }>) => {
      // Optimistic update
      state.evaluatedCards.push(action.payload.statementId);

      if (!state.isOnline) {
        // Queue for later sync
        state.pendingEvaluations.push({
          ...action.payload,
          timestamp: Date.now(),
        });
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    syncPendingEvaluations: (state) => {
      // Called when coming back online
      state.syncError = null;
    },
    syncFailed: (state, action: PayloadAction<string>) => {
      state.syncError = action.payload;
    },
    evaluationSynced: (state, action: PayloadAction<string>) => {
      state.pendingEvaluations = state.pendingEvaluations.filter(
        e => e.statementId !== action.payload
      );
    },
  },
});

// Use selector factories
import { createFilteredStatementsSelector } from '@/redux/utils/selectorFactories';

export const selectUnevaluatedCards = createFilteredStatementsSelector(
  (state: RootState) => state.swipe.cardStack
)(
  (card, state) => !state.swipe.evaluatedCards.includes(card.statementId)
);
```

### 6. Accessibility ✅

**WCAG AA Compliance Required:**

```typescript
// Keyboard navigation
const SwipeCard: React.FC<SwipeCardProps> = ({ statement, onSwipe }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        onSwipe(RATING.LIKE);
        break;
      case 'ArrowLeft':
        onSwipe(RATING.DISLIKE);
        break;
      case '1':
        onSwipe(RATING.HATE);
        break;
      case '2':
        onSwipe(RATING.DISLIKE);
        break;
      case '3':
        onSwipe(RATING.NEUTRAL);
        break;
      case '4':
        onSwipe(RATING.LIKE);
        break;
      case '5':
        onSwipe(RATING.LOVE);
        break;
    }
  };

  return (
    <div
      role="article"
      aria-label={`Proposal: ${statement.statement}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {currentCard ? `Proposal ${currentIndex + 1} of ${totalCards}` : 'No more proposals'}
      </div>
      {/* Card content */}
    </div>
  );
};
```

**Accessibility Checklist:**
- [ ] All interactive elements: min 44x44px touch target
- [ ] Keyboard navigation: Arrow keys, number keys, Tab/Enter
- [ ] Screen reader: ARIA labels, live regions for card changes
- [ ] Focus management: Trap focus in modals, restore on close
- [ ] Color contrast: 4.5:1 for text, 3:1 for UI components
- [ ] Reduced motion: Alternative feedback (color pulse instead of slide)
- [ ] Skip links: "Skip to next card" for power users

**Reduced Motion Strategy:**

```scss
@media (prefers-reduced-motion: reduce) {
  .swipe-card {
    // Don't remove animations entirely - provide alternatives
    &--throwing-right,
    &--throwing-left {
      animation: none;
      // Fade out instead of slide
      opacity: 0;
      transition: opacity 0.2s;
    }

    // Instant state changes
    &--like-overlay {
      .swipe-card__overlay {
        transition: none;
      }
    }
  }

  // Provide visual feedback without motion
  .rating-button:active {
    transform: none;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }
}
```

### 7. Internationalization ✅

**ALL text must use i18n:**

```typescript
// src/locales/en/swipe.json
{
  "swipe": {
    "intro": {
      "title": "Your Voice Matters",
      "description": "Swipe through ideas and help shape our community",
      "timeEstimate": "Takes about 2-3 minutes",
      "reassurance": "You can stop anytime",
      "startButton": "Let's Go"
    },
    "ratings": {
      "love": "Love it",
      "like": "Like",
      "neutral": "Neutral",
      "dislike": "Dislike",
      "hate": "Strongly dislike"
    },
    "social": {
      "voted": "voted",
      "suggested": "suggested improvement",
      "proposed": "proposed new idea"
    }
  }
}

// src/locales/he/swipe.json
{
  "swipe": {
    "intro": {
      "title": "הקול שלך חשוב",
      "description": "החלק בין רעיונות ועזור לעצב את הקהילה שלנו",
      "timeEstimate": "לוקח כ-2-3 דקות",
      "reassurance": "אפשר לעצור בכל רגע",
      "startButton": "בואו נתחיל"
    },
    "ratings": {
      "love": "אוהב",
      "like": "מוצא חן",
      "neutral": "ניטרלי",
      "dislike": "לא מוצא חן",
      "hate": "ממש לא מוצא חן"
    }
  }
}

// Component usage
import { useTranslation } from 'react-i18next';

const QuestionIntro: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="question-intro">
      <h1>{t('swipe.intro.title')}</h1>
      <p>{t('swipe.intro.description')}</p>
      <Button text={t('swipe.intro.startButton')} variant="primary" />
    </div>
  );
};
```

### 8. Testing Requirements ✅

**REQUIRED for ALL new code:**

```typescript
// src/controllers/__tests__/swipeController.test.ts
import { submitRating, loadCardBatch } from '../swipeController';
import { createStatementRef } from '@/utils/firebaseUtils';
import { RATING } from '@/constants/common';

jest.mock('@/utils/firebaseUtils');

describe('swipeController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitRating', () => {
    it('should submit valid rating', async () => {
      const statementId = 'test-123';
      await submitRating(statementId, RATING.LIKE);

      expect(createStatementRef).toHaveBeenCalledWith(statementId);
      // Assert Firestore write
    });

    it('should throw ValidationError for invalid rating', async () => {
      await expect(
        submitRating('test-123', 5 as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should log error on failure', async () => {
      // Mock Firestore failure
      await expect(submitRating('test-123', RATING.LIKE)).rejects.toThrow();
      // Assert logError was called
    });
  });
});

// Component tests
// src/view/components/atomic/molecules/SwipeCard/__tests__/SwipeCard.test.tsx
import { render, fireEvent } from '@testing-library/react';
import SwipeCard from '../SwipeCard';

describe('SwipeCard', () => {
  it('should render statement text', () => {
    const { getByText } = render(
      <SwipeCard statement={mockStatement} onSwipe={jest.fn()} />
    );
    expect(getByText(mockStatement.statement)).toBeInTheDocument();
  });

  it('should call onSwipe with correct rating on right swipe', () => {
    const onSwipe = jest.fn();
    const { container } = render(
      <SwipeCard statement={mockStatement} onSwipe={onSwipe} />
    );

    // Simulate swipe gesture
    fireEvent.touchStart(container.firstChild, { touches: [{ clientX: 0 }] });
    fireEvent.touchMove(container.firstChild, { touches: [{ clientX: 150 }] });
    fireEvent.touchEnd(container.firstChild);

    expect(onSwipe).toHaveBeenCalledWith(RATING.LIKE);
  });
});
```

**Coverage Requirements:**
- Utilities: 80%+ coverage
- Controllers: Test happy paths + error cases
- Components: Test user interactions + edge cases
- Redux: Test all reducers and selectors

---

## Atomic Design System Implementation

### SCSS-First Approach (REQUIRED)

**ALL styling goes in SCSS files using BEM naming:**

#### 1. Create SCSS Files First

```scss
// src/view/style/molecules/_swipe-card.scss
@import '../mixins';

.swipe-card {
  // Base styles using design tokens
  background: var(--card-default);
  border-radius: 16px;
  padding: var(--padding);
  box-shadow: var(--shadow-card); // Use design token

  // Touch interactions
  touch-action: none;
  user-select: none;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  // Elements
  &__content {
    font-size: 1.125rem;
    line-height: 1.6;
    color: var(--text-body);
  }

  &__author {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  &__overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 4rem;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  // Modifiers (states)
  &--dragging {
    cursor: grabbing;
    transition: none;
  }

  &--like-overlay {
    .swipe-card__overlay {
      opacity: 1;
      color: var(--rating-like);
    }
  }

  &--dislike-overlay {
    .swipe-card__overlay {
      opacity: 1;
      color: var(--rating-dislike);
    }
  }

  // Animations
  &--throwing-right {
    animation: throw-right 0.3s ease-out forwards;
  }

  &--throwing-left {
    animation: throw-left 0.3s ease-out forwards;
  }

  &--entering {
    animation: card-enter 0.4s ease-out;
  }

  // Responsive
  @include mobile {
    font-size: 1rem;
    padding: calc(var(--padding) * 0.75);
  }

  // Accessibility
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
}

// Keyframes (if not in globals.css)
@keyframes throw-right {
  to {
    transform: translateX(150%) rotate(30deg);
    opacity: 0;
  }
}

@keyframes throw-left {
  to {
    transform: translateX(-150%) rotate(-30deg);
    opacity: 0;
  }
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

```scss
// src/view/style/atoms/_rating-button.scss
@import '../mixins';

.rating-button {
  // Base button styles
  padding: 12px 24px;
  border: none;
  border-radius: 24px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px; // Accessibility

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover); // Use design token
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  // Rating variants
  &--love {
    background: var(--rating-love);
    color: #c026d3;
  }

  &--like {
    background: var(--rating-like);
    color: #059669;
  }

  &--neutral {
    background: var(--rating-neutral);
    color: var(--text-body);
  }

  &--dislike {
    background: var(--rating-dislike);
    color: #d97706;
  }

  &--hate {
    background: var(--rating-hate);
    color: #dc2626;
  }

  // Size modifiers
  &--small {
    padding: 8px 16px;
    font-size: 0.875rem;
  }

  &--large {
    padding: 16px 32px;
    font-size: 1.125rem;
  }

  &__emoji {
    font-size: 1.5em;
  }

  @include mobile {
    font-size: 0.875rem;
    padding: 10px 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
}
```

#### 2. Add to Index Files

```scss
// src/view/style/atoms/_index.scss
@import 'button';
@import 'rating-button';  // ADD
// ... other atoms

// src/view/style/molecules/_index.scss
@import 'card';
@import 'swipe-card';  // ADD
// ... other molecules
```

#### 3. React Components (TypeScript Wrappers Only)

```typescript
// src/view/components/atomic/atoms/RatingButton/RatingButton.tsx
import React from 'react';
import clsx from 'clsx';
import { RATING } from '@/constants/common';

export type RatingValue = typeof RATING[keyof typeof RATING];

export interface RatingButtonProps {
  rating: RatingValue;
  onClick: (rating: RatingValue) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const RATING_CONFIG = {
  [RATING.LOVE]: { emoji: '❤️', label: 'swipe.ratings.love', variant: 'love' },
  [RATING.LIKE]: { emoji: '👍', label: 'swipe.ratings.like', variant: 'like' },
  [RATING.NEUTRAL]: { emoji: '😐', label: 'swipe.ratings.neutral', variant: 'neutral' },
  [RATING.DISLIKE]: { emoji: '👎', label: 'swipe.ratings.dislike', variant: 'dislike' },
  [RATING.HATE]: { emoji: '❌', label: 'swipe.ratings.hate', variant: 'hate' },
} as const;

const RatingButton: React.FC<RatingButtonProps> = ({
  rating,
  onClick,
  disabled = false,
  size = 'medium',
  className,
}) => {
  const { t } = useTranslation();
  const config = RATING_CONFIG[rating];

  const classes = clsx(
    'rating-button',
    `rating-button--${config.variant}`,
    size !== 'medium' && `rating-button--${size}`,
    className
  );

  return (
    <button
      type="button"
      className={classes}
      onClick={() => onClick(rating)}
      disabled={disabled}
      aria-label={t(config.label)}
    >
      <span className="rating-button__emoji">{config.emoji}</span>
      <span>{t(config.label)}</span>
    </button>
  );
};

export default RatingButton;
```

```typescript
// src/view/components/atomic/molecules/SwipeCard/SwipeCard.tsx
import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import { SWIPE, RATING } from '@/constants/common';
import type { RatingValue } from '@/view/components/atomic/atoms/RatingButton/RatingButton';

export interface SwipeCardProps {
  statement: Statement;
  onSwipe: (rating: RatingValue) => void;
  className?: string;
}

const SwipeCard: React.FC<SwipeCardProps> = ({
  statement,
  onSwipe,
  className,
}) => {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isThrowingRight, setIsThrowingRight] = useState(false);
  const [isThrowingLeft, setIsThrowingLeft] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleDragStart = (clientX: number, isTouch: boolean) => {
    setIsTouchDevice(isTouch);
    setDragStart(clientX);
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (dragStart === null) return;

    // Use RAF for smooth animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const delta = clientX - dragStart;
      setDragX(delta);
    });
  };

  const handleDragEnd = () => {
    if (dragStart === null) return;

    // Clean up RAF
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Determine rating based on drag distance
    let rating: RatingValue;

    if (dragX >= SWIPE.LOVE_THRESHOLD) {
      rating = RATING.LOVE;
      setIsThrowingRight(true);
    } else if (dragX >= SWIPE.LIKE_THRESHOLD) {
      rating = RATING.LIKE;
      setIsThrowingRight(true);
    } else if (dragX <= SWIPE.HATE_THRESHOLD) {
      rating = RATING.HATE;
      setIsThrowingLeft(true);
    } else if (dragX <= SWIPE.DISLIKE_THRESHOLD) {
      rating = RATING.DISLIKE;
      setIsThrowingLeft(true);
    } else {
      // Reset if not enough drag
      setDragX(0);
      setDragStart(null);
      setIsDragging(false);
      return;
    }

    // Trigger swipe callback after animation
    setTimeout(() => {
      onSwipe(rating);
    }, SWIPE.SWIPE_DURATION);
  };

  // Calculate rotation based on drag (clamped for realism)
  const rotation = Math.max(-30, Math.min(30, (dragX / 100) * SWIPE.ROTATION_FACTOR));

  const classes = clsx(
    'swipe-card',
    isDragging && 'swipe-card--dragging',
    isThrowingRight && 'swipe-card--throwing-right',
    isThrowingLeft && 'swipe-card--throwing-left',
    dragX > SWIPE.LIKE_THRESHOLD && 'swipe-card--like-overlay',
    dragX < SWIPE.DISLIKE_THRESHOLD && 'swipe-card--dislike-overlay',
    className
  );

  return (
    <div
      ref={cardRef}
      className={classes}
      style={{
        transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
        // Use will-change for performance hint
        willChange: isDragging ? 'transform' : 'auto',
      }}
      // Touch events (mobile)
      onTouchStart={(e) => {
        e.preventDefault(); // Prevent mouse events from firing
        handleDragStart(e.touches[0].clientX, true);
      }}
      onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
      onTouchEnd={handleDragEnd}
      // Mouse events (desktop) - only if not touch device
      onMouseDown={(e) => {
        if (!isTouchDevice) {
          handleDragStart(e.clientX, false);
        }
      }}
      onMouseMove={(e) => {
        if (!isTouchDevice && isDragging) {
          handleDragMove(e.clientX);
        }
      }}
      onMouseUp={() => {
        if (!isTouchDevice) {
          handleDragEnd();
        }
      }}
      onMouseLeave={() => {
        if (!isTouchDevice) {
          handleDragEnd();
        }
      }}
    >
      <div className="swipe-card__overlay">
        {dragX > 0 ? '👍' : '👎'}
      </div>

      <div className="swipe-card__content">
        {statement.statement}
      </div>

      <div className="swipe-card__author">
        <img src={statement.creator?.photoURL} alt="" />
        <span>{statement.creator?.displayName}</span>
      </div>
    </div>
  );
};

export default SwipeCard;
```

### Component File Structure

```
src/view/
├── style/
│   ├── atoms/
│   │   ├── _index.scss
│   │   ├── _button.scss
│   │   └── _rating-button.scss        # NEW
│   ├── molecules/
│   │   ├── _index.scss
│   │   ├── _card.scss
│   │   ├── _swipe-card.scss           # NEW
│   │   ├── _social-feed.scss          # NEW
│   │   └── _question-intro.scss       # NEW
│   └── organisms/
│       ├── _index.scss
│       └── _swipe-interface.scss      # NEW
│
└── components/atomic/
    ├── atoms/
    │   ├── Button/
    │   └── RatingButton/              # NEW
    │       ├── RatingButton.tsx
    │       ├── RatingButton.test.tsx
    │       └── index.ts
    ├── molecules/
    │   ├── Card/
    │   ├── SwipeCard/                 # NEW
    │   │   ├── SwipeCard.tsx
    │   │   ├── SwipeCard.test.tsx
    │   │   └── index.ts
    │   ├── SocialFeed/                # NEW
    │   └── QuestionIntro/             # NEW
    └── organisms/
        └── SwipeInterface/            # NEW
            ├── SwipeInterface.tsx     # Manages card stack + ratings
            ├── SwipeInterface.test.tsx
            └── index.ts
```

---

## Features Implementation (Refactored)

### Phase 1: Core Swipe Experience ✅ (Needs Refactoring)

**Current Status**: Components created but need refactoring for CLAUDE.md compliance

**Refactoring Tasks:**
- [ ] Move SwipeCard to atomic design system
- [ ] Add proper error handling with `logError()`
- [ ] Replace hardcoded text with i18n
- [ ] Add comprehensive tests
- [ ] Use constants instead of magic numbers
- [ ] Integrate with Redux (remove custom events)
- [ ] Import types from `@freedi/shared-types`

### Phase 2: Welcome & Transitions

#### 2.1 Question Intro Screen

**SCSS:**
```scss
// src/view/style/molecules/_question-intro.scss
.question-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--padding);
  text-align: center;

  &__title {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 16px;
    color: var(--text-heading);
  }

  &__description {
    font-size: 1.125rem;
    line-height: 1.6;
    margin-bottom: 24px;
    color: var(--text-body);
    max-width: 500px;
  }

  &__meta {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 32px;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  &__button {
    margin-top: 16px;
  }

  @include mobile {
    &__title {
      font-size: 1.5rem;
    }

    &__description {
      font-size: 1rem;
    }
  }
}
```

**Component:**
```typescript
// src/view/components/atomic/molecules/QuestionIntro/QuestionIntro.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Statement } from '@freedi/shared-types';
import { Button } from '@/view/components/atomic/atoms/Button';
import clsx from 'clsx';

export interface QuestionIntroProps {
  question: Statement;
  onStart: () => void;
  className?: string;
}

const QuestionIntro: React.FC<QuestionIntroProps> = ({
  question,
  onStart,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div className={clsx('question-intro', className)}>
      <h1 className="question-intro__title">{question.statement}</h1>

      {question.description && (
        <p className="question-intro__description">{question.description}</p>
      )}

      <div className="question-intro__meta">
        <span>⏱️ {t('swipe.intro.timeEstimate')}</span>
        <span>✨ {t('swipe.intro.reassurance')}</span>
      </div>

      <Button
        text={t('swipe.intro.startButton')}
        variant="primary"
        size="large"
        onClick={onStart}
        className="question-intro__button"
      />
    </div>
  );
};

export default QuestionIntro;
```

**Tests:**
```typescript
// src/view/components/atomic/molecules/QuestionIntro/__tests__/QuestionIntro.test.tsx
import { render, fireEvent } from '@testing-library/react';
import QuestionIntro from '../QuestionIntro';

describe('QuestionIntro', () => {
  const mockQuestion = {
    statementId: 'q1',
    statement: 'How can we improve our city?',
    description: 'Share your ideas',
  };

  it('should render question text', () => {
    const { getByText } = render(
      <QuestionIntro question={mockQuestion} onStart={jest.fn()} />
    );
    expect(getByText(mockQuestion.statement)).toBeInTheDocument();
  });

  it('should call onStart when button clicked', () => {
    const onStart = jest.fn();
    const { getByRole } = render(
      <QuestionIntro question={mockQuestion} onStart={onStart} />
    );

    fireEvent.click(getByRole('button'));
    expect(onStart).toHaveBeenCalled();
  });
});
```

### Phase 3: Simplified Email Subscription System

**IMPORTANT**: Use existing, battle-tested solutions instead of building from scratch.

**Recommended Approach: Firebase Extensions**

The "Trigger Email" Firebase Extension provides production-ready email functionality:
- Pre-configured SendGrid/AWS SES integration
- Transactional email templates
- Email delivery status tracking
- Automatic retry on failure
- No custom backend code needed

**Alternative: Third-Party Service (Resend/Loops.so)**

For advanced features (digest emails, segmentation), consider:
- **Resend.com**: Developer-friendly API, built-in templates
- **Loops.so**: Purpose-built for product emails, no-code editor
- **SendGrid**: Enterprise-grade, more complex setup

**Implementation Strategy:**

1. **Phase 3.1**: Basic email (confirmation + unsubscribe) using Firebase Extension
2. **Phase 3.2**: Daily digest using Cloud Scheduler + Extension
3. **Phase 3.3**: Advanced features (instant notifications, segmentation) only if needed

**Firestore Schema (Simplified):**

#### Firestore Collections

```typescript
// Add to @freedi/shared-types or src/types/emailSubscription.ts
export interface EmailSubscription {
  id: string;
  userId: string;
  email: string;
  questionId?: string;
  surveyId?: string;

  // Confirmation
  confirmed: boolean;
  confirmationToken: string;
  confirmedAt?: number; // timestamp in milliseconds

  // Preferences
  dailyDigest: boolean;
  instantImprovements: boolean;
  milestoneAlerts: boolean;

  // Unsubscribe
  unsubscribed: boolean;
  unsubscribeToken: string;
  unsubscribedAt?: number;

  createdAt: number;
  lastUpdate: number;
}

export interface EmailLog {
  id: string;
  subscriptionId: string;
  emailType: 'confirmation' | 'daily_digest' | 'improvement' | 'milestone';
  sentAt: number;
  openedAt?: number;
  clickedAt?: number;
}
```

```typescript
// Add to packages/shared-types/src/models/collections/collectionsModel.ts
// OR use string literals until added to Collections enum

// OPTION 1: Add to Collections enum (preferred)
export enum Collections {
  // ... existing collections
  emailSubscriptions = 'emailSubscriptions',
  emailLogs = 'emailLogs',
}

// OPTION 2: Temporary string literals (until added to Collections)
const EMAIL_COLLECTIONS = {
  SUBSCRIPTIONS: 'emailSubscriptions' as const,
  LOGS: 'emailLogs' as const,
} as const;
```

#### Controller

```typescript
// src/controllers/emailSubscriptionController.ts
import { setDoc, getDoc, updateDoc } from 'firebase/firestore';
import {
  createDocRef,
  createTimestamps,
  updateTimestamp
} from '@/utils/firebaseUtils';
import { logError, ValidationError, withErrorHandling } from '@/utils/errorHandling';
import { EMAIL_COLLECTIONS } from '@/types/emailSubscription';
import { EMAIL_NOTIFICATIONS } from '@/constants/common';
import crypto from 'crypto';

function generateToken(): string {
  return crypto.randomBytes(EMAIL_NOTIFICATIONS.TOKEN_LENGTH).toString('hex');
}

export const subscribeToNotifications = withErrorHandling(
  async (
    userId: string,
    email: string,
    preferences: {
      dailyDigest?: boolean;
      instantImprovements?: boolean;
      questionId?: string;
    }
  ): Promise<{ subscriptionId: string }> => {
    // Validate email (use proper validation library)
    // Basic regex is insufficient - use validator.js or zod
    import { isEmail } from 'validator'; // npm install validator
    if (!isEmail(email)) {
      throw new ValidationError('Invalid email format', { email });
    }

    const subscriptionId = `sub_${userId}_${Date.now()}`;
    const subRef = createDocRef(EMAIL_COLLECTIONS.SUBSCRIPTIONS, subscriptionId);
    const { createdAt, lastUpdate } = createTimestamps();

    const subscription: EmailSubscription = {
      id: subscriptionId,
      userId,
      email,
      questionId: preferences.questionId,
      confirmed: false,
      confirmationToken: generateToken(),
      dailyDigest: preferences.dailyDigest ?? true,
      instantImprovements: preferences.instantImprovements ?? false,
      milestoneAlerts: true,
      unsubscribed: false,
      unsubscribeToken: generateToken(),
      createdAt,
      lastUpdate,
    };

    await setDoc(subRef, subscription);

    // Send confirmation email (implement separately)
    await sendConfirmationEmail(subscription);

    return { subscriptionId };
  },
  { operation: 'email.subscribe' }
);

export const confirmSubscription = withErrorHandling(
  async (token: string): Promise<{ success: boolean }> => {
    // Query Firestore for subscription with this token
    // Update confirmed: true, confirmedAt: now
    // Return success
  },
  { operation: 'email.confirm' }
);

export const unsubscribe = withErrorHandling(
  async (token: string): Promise<{ success: boolean }> => {
    // Find subscription by unsubscribeToken
    // Update unsubscribed: true, unsubscribedAt: now
    // Return success
  },
  { operation: 'email.unsubscribe' }
);
```

#### API Routes (Next.js)

```typescript
// apps/mass-consensus/src/app/api/email/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { subscribeToNotifications } from '@/controllers/emailSubscriptionController';
import { logError } from '@/utils/errorHandling';

export async function POST(req: NextRequest) {
  try {
    const { userId, email, preferences } = await req.json();

    const result = await subscribeToNotifications(userId, email, preferences);

    return NextResponse.json({
      success: true,
      message: 'Confirmation email sent',
      subscriptionId: result.subscriptionId,
    });

  } catch (error) {
    logError(error, {
      operation: 'api.email.subscribe',
      endpoint: '/api/email/subscribe',
    });

    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
```

```typescript
// apps/mass-consensus/src/app/api/email/confirm/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { confirmSubscription } from '@/controllers/emailSubscriptionController';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const result = await confirmSubscription(params.token);

    if (result.success) {
      return NextResponse.redirect('/email/confirmed');
    } else {
      return NextResponse.redirect('/email/invalid-token');
    }
  } catch (error) {
    logError(error, { operation: 'api.email.confirm', token: params.token });
    return NextResponse.redirect('/email/error');
  }
}
```

#### Email Component

```typescript
// src/view/components/atomic/molecules/EmailSubscribeModal/EmailSubscribeModal.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/view/components/atomic/atoms/Button';
import { logError } from '@/utils/errorHandling';

export interface EmailSubscribeModalProps {
  questionId?: string;
  onClose: () => void;
}

const EmailSubscribeModal: React.FC<EmailSubscribeModalProps> = ({
  questionId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [dailyDigest, setDailyDigest] = useState(true);
  const [instantImprovements, setInstantImprovements] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current-user-id', // Get from auth
          email,
          preferences: {
            dailyDigest,
            instantImprovements,
            questionId,
          },
        }),
      });

      if (response.ok) {
        setIsSuccess(true);
      } else {
        throw new Error('Subscription failed');
      }

    } catch (error) {
      logError(error, {
        operation: 'emailModal.submit',
        email,
        questionId,
      });
      alert(t('email.subscribe.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="email-modal">
        <h2>{t('email.subscribe.success.title')}</h2>
        <p>{t('email.subscribe.success.message')}</p>
        <Button text={t('common.close')} onClick={onClose} />
      </div>
    );
  }

  return (
    <form className="email-modal" onSubmit={handleSubmit}>
      <h2>{t('email.subscribe.title')}</h2>
      <p>{t('email.subscribe.description')}</p>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('email.subscribe.placeholder')}
        required
        className="email-modal__input"
      />

      <label className="email-modal__checkbox">
        <input
          type="checkbox"
          checked={dailyDigest}
          onChange={(e) => setDailyDigest(e.target.checked)}
        />
        {t('email.subscribe.dailyDigest')}
      </label>

      <label className="email-modal__checkbox">
        <input
          type="checkbox"
          checked={instantImprovements}
          onChange={(e) => setInstantImprovements(e.target.checked)}
        />
        {t('email.subscribe.instantImprovements')}
      </label>

      <Button
        text={t('email.subscribe.submit')}
        variant="primary"
        type="submit"
        loading={isSubmitting}
      />

      <p className="email-modal__privacy">
        {t('email.subscribe.privacy')}
      </p>
    </form>
  );
};

export default EmailSubscribeModal;
```

---

## Implementation Priority (Refactored)

### Phase 0: Foundation & Setup 🔄 (Do This First)

**Critical preparatory work:**

- [ ] **Update design tokens** - Add pastel colors to `_variables.scss`
- [ ] **Verify design guide compatibility** - Read `docs/design-guide.md`
- [ ] **Add constants** - Add `SWIPE`, `RATING`, `EMAIL_NOTIFICATIONS` to `/constants/common.ts`
- [ ] **Create types** - Check `@freedi/shared-types`, add custom types if needed
- [ ] **Add i18n keys** - Create `swipe.json`, `email.json` in locales
- [ ] **Refactor Phase 1 code**:
  - Move to atomic design (SCSS first)
  - Add error handling
  - Add tests
  - Replace custom events with Redux
  - Use i18n for all text

### Phase 0.5: Prototype & Validate Core Interaction 🎯 (Critical)

**Before refactoring all of Phase 1, validate UX assumptions:**

**Goal**: Prove the swipe interaction works well on real devices

**Scope**: Minimal prototype (no Firebase, no Redux, just core interaction)

```typescript
// Prototype components (throwaway code, don't over-engineer):
// 1. SwipeCard - Basic drag/swipe with hardcoded data
// 2. RatingButtons - Tap alternative to swiping
// 3. Test on 3+ real devices (iOS, Android, desktop)
```

**Success Criteria:**
- [ ] Swipe feels natural on mobile (no lag, accurate tracking)
- [ ] Desktop mouse interaction works smoothly
- [ ] Users understand swipe directions without instructions
- [ ] Rating buttons work as fallback
- [ ] Animations run at 60fps on mid-tier phones
- [ ] Touch target sizes feel comfortable

**Validation Questions:**
- Does swipe distance feel right? (100px vs 150px threshold?)
- Should rotation be more/less pronounced?
- Do users prefer tap buttons or swipe?
- Is the 5-point scale intuitive, or should it be 3-point?

**Deliverable**: Demo video showing smooth interactions on real devices

**Time Budget**: 1-2 days max (this is rapid prototyping, not production code)

**Next Step**: If prototype validates UX, proceed to Phase 1 refactoring. If issues found, iterate on prototype first.

### Phase 1: Core Swipe Experience ✅ (Needs Refactoring)

**After Phase 0.5 prototype validates UX, refactor with proper architecture:**

See Phase 0 tasks above for refactoring requirements.

### Phase 2: Welcome & Transitions

- [ ] `QuestionIntro` molecule (SCSS + React + tests)
- [ ] Survey progress indicator
- [ ] Question transition animations
- [ ] Survey intro screen
- [ ] Update Redux for question flow state
- [ ] Social feed component (see real-time strategy below)

**Real-time Social Feed Strategy:**

```typescript
// Use Firestore snapshot listeners with throttling
// to prevent UI thrashing on high-traffic questions

import { query, collection, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { throttle } from 'lodash-es'; // or custom throttle

const SOCIAL_FEED_CONFIG = {
  MAX_ITEMS: 20,
  UPDATE_THROTTLE_MS: 2000, // Max 1 update per 2 seconds
  STALE_AFTER_MS: 60000, // Re-fetch if older than 1 minute
};

// Throttled update function
const updateFeed = throttle(
  (activities: Activity[]) => {
    dispatch(setSocialFeedActivities(activities));
  },
  SOCIAL_FEED_CONFIG.UPDATE_THROTTLE_MS,
  { leading: true, trailing: true }
);

// Firestore listener
const activitiesQuery = query(
  collection(FireStore, 'activities'),
  orderBy('createdAt', 'desc'),
  limit(SOCIAL_FEED_CONFIG.MAX_ITEMS)
);

const unsubscribe = onSnapshot(activitiesQuery, (snapshot) => {
  const activities = snapshot.docs.map(doc => doc.data() as Activity);
  updateFeed(activities);
});

// Cleanup
return () => unsubscribe();
```

**Rate Limiting for High-Traffic Questions:**
- Use throttled updates (max 1 update per 2 seconds)
- Show "X new activities" banner instead of auto-scrolling
- Limit to 20 most recent items (pagination if needed)
- Consider polling (30s interval) for very high traffic instead of listeners

### Phase 3: Improvements & Proposals

- [ ] Improvement suggestion flow
- [ ] Periodic "propose idea" prompt (use Redux counter)
- [ ] Simplified proposal modal
- [ ] Track improvement submissions in Firestore

### Phase 4: Email Notification System (Simplified)

**Use Firebase Extension or third-party service (see Phase 3 notes)**

- [ ] Install Firebase "Trigger Email" extension OR integrate Resend/Loops
- [ ] Firestore schema setup (Collections, security rules)
- [ ] Email subscription controller with error handling
- [ ] API routes (subscribe, confirm, unsubscribe)
- [ ] Email templates (confirmation email only for MVP)
- [ ] EmailSubscribeModal component (SCSS + React + tests)
- [ ] Confirmation/unsubscribe success pages
- [ ] Rate limiting and security (Firebase App Check)
- [ ] **Phase 4.1** (Later): Daily digest with Cloud Scheduler
- [ ] **Phase 4.2** (Later): Instant improvement alerts

### Phase 5: Demographics & Question Types

- [ ] Range slider question component
- [ ] Radio button question component
- [ ] Checkbox question component
- [ ] Text input question component
- [ ] Question renderer with type switching

### Phase 6: Personal Impact & Profile

- [ ] Enhanced completion screen
- [ ] User contributions view
- [ ] Impact statistics dashboard
- [ ] Saved items functionality

### Phase 7: Analytics & Monitoring

**Track user behavior to improve UX:**

```typescript
// src/services/analyticsService.ts
import { logEvent } from '@/services/analytics'; // Your existing analytics service

export const trackSwipeEvent = (
  statementId: string,
  rating: number,
  swipeSpeed: number, // ms from drag start to end
  dragDistance: number // px
) => {
  logEvent('swipe_rating', {
    statement_id: statementId,
    rating,
    swipe_speed: swipeSpeed,
    drag_distance: dragDistance,
    interaction_type: dragDistance > 0 ? 'swipe' : 'button',
  });
};

// Batch events to reduce overhead
const eventQueue: AnalyticsEvent[] = [];
const flushInterval = 5000; // 5 seconds

setInterval(() => {
  if (eventQueue.length > 0) {
    batchLogEvents(eventQueue);
    eventQueue.length = 0;
  }
}, flushInterval);
```

**Key Metrics to Track:**
- [ ] Swipe completion rate (started vs finished)
- [ ] Swipe speed distribution (fast swipers vs deliberate)
- [ ] Button vs swipe usage ratio
- [ ] Drop-off points (which card number?)
- [ ] Proposal submission rate
- [ ] Email subscription conversion rate
- [ ] Offline usage patterns
- [ ] Error rates by type

**A/B Test Ideas:**
- 5-point vs 3-point rating scale
- Swipe threshold distances
- Proposal prompt frequency (every 5 vs 7 vs 10 cards)
- Email signup placement (after survey vs during)

### Phase 8: Security & Abuse Prevention

**Firebase App Check (Recommended):**

```typescript
// Enable App Check to prevent abuse
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// In app initialization
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'),
  isTokenAutoRefreshEnabled: true,
});

// Firestore security rules leverage App Check
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /evaluations/{evalId} {
//       allow create: if request.auth != null
//                     && request.app.check != null; // App Check token required
//     }
//   }
// }
```

**Rate Limiting:**

```typescript
// Client-side rate limiting (user-friendly)
const RATE_LIMITS = {
  SWIPE_PER_MINUTE: 30,
  PROPOSALS_PER_HOUR: 5,
  EMAIL_REQUESTS_PER_HOUR: 3,
};

// Track in Redux or localStorage
const canSubmitSwipe = () => {
  const recentSwipes = getRecentSwipes(60000); // Last minute
  return recentSwipes.length < RATE_LIMITS.SWIPE_PER_MINUTE;
};

// Server-side rate limiting (Firebase Functions)
// Use Redis or Firestore to track per-user limits
```

**Spam Detection:**

```typescript
// Proposal submission validation
export const validateProposal = (text: string): boolean => {
  const MIN_LENGTH = 10;
  const MAX_LENGTH = 500;
  const PROFANITY_FILTER = /badword1|badword2/i; // Use library like 'bad-words'

  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    return false;
  }

  if (PROFANITY_FILTER.test(text)) {
    return false;
  }

  // Check for spam patterns (repeated chars, all caps, etc.)
  const repeatedChars = /(.)\1{5,}/;
  if (repeatedChars.test(text)) {
    return false;
  }

  return true;
};
```

### Phase 9: Error Recovery & Resilience

**Graceful failure handling:**

```typescript
// Error boundaries for components
class SwipeErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError(error, {
      operation: 'swipeInterface.render',
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>{t('errors.swipe.title')}</h2>
          <p>{t('errors.swipe.description')}</p>
          <Button
            text={t('common.retry')}
            onClick={() => window.location.reload()}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Failure Scenarios & Recovery:**

1. **Card loading fails**:
   - Show "Unable to load proposals" message
   - Retry button with exponential backoff
   - Fallback to cached cards if available

2. **Rating submission fails**:
   - Queue in Redux pendingEvaluations
   - Show subtle "Syncing..." indicator
   - Auto-retry when connection restored
   - Success toast when synced

3. **Network offline**:
   - Detect with `navigator.onLine` + Firestore listeners
   - Show offline banner (non-intrusive)
   - Continue allowing swipes (queue locally)
   - Sync when back online

4. **Email confirmation fails**:
   - Retry logic (3 attempts)
   - Fallback message with support email
   - Log for manual follow-up

**Retry Strategy (using utilities):**

```typescript
import { withRetry } from '@/utils/errorHandling';
import { RETRY } from '@/constants/common';

export const loadCardBatch = withRetry(
  async (questionId: string, limit: number) => {
    // Firestore query logic
  },
  {
    maxRetries: RETRY.MAX_ATTEMPTS,
    delayMs: RETRY.INITIAL_DELAY_MS,
    exponentialBackoff: true,
  },
  { operation: 'swipe.loadCardBatch' }
);
```

---

## Testing Strategy

### Unit Tests (Required)

```typescript
// Controllers
src/controllers/__tests__/
├── swipeController.test.ts         // 80%+ coverage
├── emailSubscriptionController.test.ts
└── proposalController.test.ts

// Redux
src/redux/swipe/__tests__/
├── swipeSlice.test.ts             // Test all reducers
└── swipeSelectors.test.ts         // Test all selectors

// Utilities (if creating new ones)
src/utils/__tests__/
└── swipeHelpers.test.ts           // 80%+ coverage
```

### Component Tests

```typescript
// Atoms
src/view/components/atomic/atoms/RatingButton/__tests__/
└── RatingButton.test.tsx

// Molecules
src/view/components/atomic/molecules/SwipeCard/__tests__/
└── SwipeCard.test.tsx

// Test user interactions, accessibility, edge cases
```

### Integration Tests

```typescript
// Test full swipe flow
describe('Swipe Flow Integration', () => {
  it('should load cards, handle swipe, update Redux, save to Firestore', async () => {
    // Mock Firestore
    // Render SwipeInterface
    // Simulate swipe
    // Assert Redux state updated
    // Assert Firestore write called
  });
});
```

---

## Code Review Checklist

Before submitting any code, verify:

**Type Safety & Code Quality:**
- ✅ No `any` types (ESLint enforced)
- ✅ Types imported from `@freedi/shared-types` when available
- ✅ All errors use `logError()` with context
- ✅ Firebase operations use utilities (`createStatementRef`, etc.)
- ✅ No magic numbers (use constants from `/constants/common.ts`)
- ✅ Selectors use factories from `/redux/utils/selectorFactories.ts`
- ✅ All text uses i18n (`useTranslation()`)
- ✅ SCSS-first approach (no inline styles, no styled-components)
- ✅ BEM naming convention for CSS classes
- ✅ Design tokens used (no hardcoded colors, shadows)

**Testing:**
- ✅ Tests included (80%+ coverage for utilities)
- ✅ All tests pass (`npm run test`)
- ✅ Component tests cover user interactions
- ✅ Error cases tested
- ✅ TypeScript validates (`npm run typecheck`)
- ✅ ESLint passes (`npm run lint`)
- ✅ Build succeeds (`npm run build`)

**Accessibility (WCAG AA):**
- ✅ Min 44x44px touch targets
- ✅ Keyboard navigation works (Tab, Enter, Arrow keys)
- ✅ ARIA labels and roles present
- ✅ Screen reader tested (at least VoiceOver/NVDA)
- ✅ Focus management in modals
- ✅ Color contrast ratios met (4.5:1 text, 3:1 UI)
- ✅ Reduced motion alternatives provided

**Performance:**
- ✅ Bundle size checked (use `npm run build -- --analyze`)
- ✅ Animations use `transform` and `opacity` only
- ✅ `requestAnimationFrame` for smooth interactions
- ✅ Images optimized (WebP with fallback)
- ✅ Code splitting for heavy features
- ✅ Tested on real mid-tier device (not just simulator)
- ✅ Lighthouse score >90 mobile

**Offline & Resilience:**
- ✅ Optimistic updates for user actions
- ✅ Pending operations queued in Redux
- ✅ Error boundaries around components
- ✅ Retry logic for critical operations
- ✅ Graceful degradation on failure

**Responsive & RTL:**
- ✅ Mobile-first approach
- ✅ Tested on small screens (320px width)
- ✅ RTL layout works (Hebrew)
- ✅ Logical properties used (`margin-inline-start`)

**Analytics & Monitoring:**
- ✅ Key user actions tracked
- ✅ Events batched to reduce overhead
- ✅ Error tracking integrated
- ✅ Performance metrics captured

---

## Migration Guide from Phase 1

If Phase 1 code already exists and needs refactoring:

### Step 1: Identify Issues

```bash
# Check for any types
npm run lint -- --rule '@typescript-eslint/no-explicit-any: error'

# Check for missing error handling
grep -r "catch (error)" src/ | grep -v "logError"

# Check for hardcoded text
grep -r "\".*\"" src/components/ | grep -v "className\|import\|export"
```

### Step 2: Refactor Systematically

```typescript
// BEFORE (Phase 1)
import './SwipeCard.module.css';

const SwipeCard = ({ statement, onSwipe }: any) => {
  try {
    // Logic
  } catch (error) {
    console.error(error); // ❌
  }

  return <div style={{ color: '#5f88e5' }}>Swipe me</div>; // ❌
};

// AFTER (Refactored)
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types'; // ✅
import { logError } from '@/utils/errorHandling'; // ✅
import { useTranslation } from 'react-i18next'; // ✅
import type { RatingValue } from '@/types/swipe';

interface SwipeCardProps {
  statement: Statement;
  onSwipe: (rating: RatingValue) => void;
}

const SwipeCard: React.FC<SwipeCardProps> = ({ statement, onSwipe }) => {
  const { t } = useTranslation();

  const handleSwipe = async (rating: RatingValue) => {
    try {
      // Logic
    } catch (error) {
      logError(error, {
        operation: 'swipeCard.handleSwipe',
        statementId: statement.statementId,
        rating,
      });
    }
  };

  return (
    <div className="swipe-card">
      {t('swipe.instruction')}
    </div>
  );
};

export default SwipeCard;
```

### Step 3: Add Tests

Create test files for all refactored components.

### Step 4: Verify

```bash
npm run check-all
```

---

## Resources

- **CLAUDE.md Guidelines**: `/Users/talyaron/Documents/Freedi-app/CLAUDE.md`
- **Design Guide**: `/Users/talyaron/Documents/Freedi-app/docs/design-guide.md`
- **Atomic Design System**: `/Users/talyaron/Documents/Freedi-app/ATOMIC-DESIGN-SYSTEM.md`
- **Error Handling Utilities**: `/Users/talyaron/Documents/Freedi-app/src/utils/errorHandling.ts`
- **Firebase Utilities**: `/Users/talyaron/Documents/Freedi-app/src/utils/firebaseUtils.ts`
- **Selector Factories**: `/Users/talyaron/Documents/Freedi-app/src/redux/utils/selectorFactories.ts`
- **Constants**: `/Users/talyaron/Documents/Freedi-app/src/constants/common.ts`
- **Shared Types Package**: `/Users/talyaron/Documents/Freedi-app/packages/shared-types`
  - Main exports: `packages/shared-types/dist/cjs/index.d.ts`
  - Import as: `import { Statement, User, Evaluation, Collections } from '@freedi/shared-types'`
  - Available types: Statement, User, Evaluation, Collections, StatementType, Survey, and many more

---

## Next Steps (Updated Priority)

### Immediate Actions (Week 1)

1. **Answer critical questions** (see Questions to Resolve section):
   - Design token compatibility
   - Email service choice (Firebase Extension vs Resend)
   - Performance monitoring approach
   - Scale expectations (users/day estimate)

2. **Build shared-types package** (if not already built):
   ```bash
   cd packages/shared-types
   npm run build
   ```

3. **Read design guide** (`docs/design-guide.md`):
   - Verify color palette compatibility
   - Check if shadow tokens exist
   - Understand responsive breakpoints

4. **Phase 0 Foundation Setup**:
   - Add constants to `/constants/common.ts` (SWIPE, RATING, etc.)
   - Create i18n files (`swipe.json`, `email.json`) in en/he locales
   - Add pastel colors to `_variables.scss`
   - Set up analytics service integration

### Week 2: Phase 0.5 Prototype

5. **Build minimal prototype** (throwaway code):
   - SwipeCard component with basic drag
   - Test on 3+ real devices (iOS, Android, desktop)
   - Record demo video
   - Validate UX assumptions (threshold distances, rotation, scale)
   - **Decision point**: If UX feels good, proceed. If not, iterate.

### Week 3-4: Phase 1 Refactoring

6. **Audit existing Phase 1 code**:
   ```bash
   npm run lint
   grep -r "catch (error)" src/ | grep -v "logError"
   ```

7. **Refactor with proper architecture**:
   - Move to atomic design system (SCSS first)
   - Add error handling with `logError()`
   - Use Redux for state (remove custom events)
   - Add comprehensive tests
   - Implement offline support

### Week 5+: Phase 2 and Beyond

8. **Implement Phase 2** (Welcome & Transitions)
9. **Continue with subsequent phases** per priority list

### Ongoing

- **Monitor performance** against budget (use Lighthouse)
- **Track analytics** for UX insights
- **Iterate** based on real user behavior

---

## Questions to Resolve Before Implementation

### Design & UX
- [ ] Are pastel colors compatible with existing design tokens?
- [ ] Should we add new color tokens or use existing ones?
- [ ] What's the optimal swipe threshold distance? (needs testing)
- [ ] 5-point vs 3-point rating scale? (A/B test after prototype)
- [ ] Should social feed be real-time (Firestore listeners) or polling?
- [ ] RTL swipe direction: mirror or keep universal?

### Technical Architecture
- [ ] What types exist in `@freedi/shared-types` for evaluations/ratings?
- [ ] Should email system use Firebase Extension or third-party (Resend/Loops)?
- [ ] Email service choice: SendGrid vs AWS SES vs Resend?
- [ ] Offline support: IndexedDB or just Redux persist?
- [ ] Performance monitoring: Firebase Performance vs custom?

### Scale & Operations
- [ ] What's the expected scale? (users/day, questions/day, emails/day)
- [ ] Email volume estimate (for cost planning)?
- [ ] Data retention policy: how long to keep evaluations?
- [ ] Privacy policy requirements for email collection?
- [ ] GDPR/data deletion: how to handle "delete my data" requests?

### Security & Abuse
- [ ] Rate limiting strategy: Firebase App Check vs custom?
- [ ] Bot detection: reCAPTCHA vs hCaptcha vs Firebase App Check?
- [ ] Spam prevention for proposals (character limits, profanity filter)?
- [ ] How to handle rapid swiping abuse (vote manipulation)?

### Future Scope
- [ ] Localization beyond en/he? (es, fr, ar?)
- [ ] Mobile app plans (React Native wrapper)?
- [ ] Desktop app (Electron)?
- [ ] API for third-party integrations?

---

## Production Readiness Checklist

This plan is production-ready because it addresses:

**✅ User Experience**
- Engaging, game-like interface (swipe mechanics)
- Fast, smooth animations (60fps target)
- Accessible to all users (WCAG AA, RTL, keyboard nav)
- Works offline (optimistic updates, sync queue)

**✅ Technical Excellence**
- Type-safe (no `any`, uses `@freedi/shared-types`)
- Tested (80%+ coverage, real device validation)
- Performant (200KB bundle, <2s load, RAF animations)
- Maintainable (atomic design, BEM, SCSS-first)

**✅ Scalability**
- Real-time updates with throttling (handles high traffic)
- Firestore optimizations (query limits, indexes)
- Code splitting (lazy load heavy features)
- Analytics tracking (optimize based on data)

**✅ Resilience**
- Error boundaries (graceful failures)
- Retry logic (exponential backoff)
- Offline support (queue and sync)
- Security (Firebase App Check, rate limiting)

**✅ Operations**
- Simplified email (Firebase Extension or Resend)
- Monitoring (analytics, error tracking, performance)
- A/B testing (validate assumptions with data)
- Clear success metrics (completion rate, engagement)

**🎯 Critical Success Factor:**

**Phase 0.5 prototype** is the make-or-break moment. If the swipe interaction doesn't feel delightful on real devices, iterate until it does. Everything else builds on this foundation.

**Key Risk Mitigation:**
- Prototype before refactor (fail fast on UX issues)
- Use battle-tested tools (Firebase Extensions, not custom)
- Define performance budget upfront (prevent scope creep)
- Test on real devices (simulators lie about performance)
- Track analytics early (optimize based on data, not assumptions)

---

**This refactored plan maintains the excellent UX vision while ensuring technical excellence, scalability, and maintainability through CLAUDE.md compliance and production best practices.**
