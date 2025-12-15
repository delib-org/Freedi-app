# Freedi Main App Architecture

This document provides a comprehensive overview of the main Freedi application architecture.

## Overview

The Freedi main app is a **React-based single-page application (SPA)** built with TypeScript, Vite, and Firebase. It serves as the core deliberation platform where users can create, discuss, and evaluate statements in a collaborative environment.

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | React 18 with Vite |
| State Management | Redux Toolkit |
| Database | Firebase Firestore (real-time) |
| Authentication | Firebase Auth |
| Styling | SCSS Modules + Atomic Design |
| Type System | TypeScript (strict) |
| Validation | Valibot |
| Monitoring | Sentry |
| Analytics | Firebase Analytics |
| i18n | @freedi/shared-i18n |

## Directory Structure

```
/src
├── App.tsx                          # Root app component
├── main.tsx                         # Application entry point
├── controllers/                     # Business logic & data operations
│   ├── db/                         # Firebase data access layer
│   ├── hooks/                      # Custom React hooks
│   ├── auth/                       # Authentication logic
│   ├── general/                    # General utilities
│   └── utils/                      # Controller utilities
├── services/                        # External service integrations
│   ├── notificationService.ts      # Push notifications (FCM)
│   ├── analytics/                  # Analytics tracking
│   ├── logger/                     # Logging service
│   ├── mindMap/                    # Mind map service
│   └── monitoring/                 # Error monitoring (Sentry)
├── redux/                           # State management
│   ├── store.ts                    # Redux store configuration
│   ├── statements/                 # Statement state slices
│   ├── evaluations/                # Evaluation state
│   ├── vote/                       # Voting state
│   ├── creator/                    # User/creator state
│   └── utils/                      # Selector factories
├── view/                            # UI presentation layer
│   ├── components/                 # Reusable components
│   │   ├── atomic/                 # Atomic Design System
│   │   └── [legacy components]     # Existing components
│   ├── pages/                      # Page-level components
│   ├── style/                      # Global & modular SCSS
│   └── styles/                     # Additional styles
├── routes/                          # React Router configuration
├── context/                         # React Context providers
├── hooks/                           # Custom React hooks
├── helpers/                         # Pure helper functions
├── utils/                           # Utility functions
├── constants/                       # Application constants
├── types/                           # TypeScript type definitions
└── assets/                          # Static assets
```

## Application Bootstrap Flow

```
main.tsx
    │
    ├── 1. Load global styles (SCSS)
    ├── 2. Initialize Sentry monitoring
    ├── 3. Setup IndexedDB error handling
    ├── 4. Register Firebase service worker
    ├── 5. Initialize Redux store
    │
    └── 6. Render Provider hierarchy:
        └── RootErrorBoundary
            └── Redux Provider
                └── UserConfigProvider
                    └── PWAWrapper
                        └── Router Provider
                            └── App.tsx
```

## Core Architectural Patterns

### 1. Composite Pattern (Statement Model)

Everything in Freedi is a **Statement**. The unified data model uses a composite pattern where statements can contain other statements:

```
Question (Statement)
  ├── Option (Statement)
  │   ├── Pro Argument (Statement)
  │   └── Con Argument (Statement)
  ├── Result (Statement)
  └── Nested Question (Statement)
```

### 2. Layer Architecture

```
┌─────────────────────────────────────┐
│           VIEW (React)              │
│   Components, Pages, Styles         │
├─────────────────────────────────────┤
│         CONTROLLERS                 │
│   Business Logic, Firebase Ops      │
├─────────────────────────────────────┤
│          SERVICES                   │
│   FCM, Analytics, Sentry, Logger    │
├─────────────────────────────────────┤
│           REDUX                     │
│   State Management, Selectors       │
├─────────────────────────────────────┤
│        UTILS / HELPERS              │
│   Pure Functions, Constants         │
└─────────────────────────────────────┘
```

**Dependency Rule:** Never import upward (e.g., Controllers should NOT import from View)

### 3. Real-Time Data Flow

```
Firebase Firestore
       │
       ▼
Controllers (listenToStatements)
       │
       ▼
Redux Actions (setStatement)
       │
       ▼
Redux State (statements slice)
       │
       ▼
Selectors (memoized via factories)
       │
       ▼
React Components (useAppSelector)
       │
       ▼
UI Render
```

## State Management (Redux)

### Store Configuration

The Redux store contains **14 slices**:

| Slice | Purpose |
|-------|---------|
| `statements` | Main statement data |
| `statementMetaData` | Statement metadata |
| `evaluations` | User evaluations |
| `votes` | User voting data |
| `results` | Evaluation results |
| `creator` | Current user info |
| `subscriptions` | User subscriptions |
| `notifications` | In-app notifications |
| `pwa` | PWA state |
| `choseBys` | Choice tracking |
| `newStatement` | New statement form state |
| `userDemographic` | User demographic data |
| `roomAssignment` | Room assignment state |

### Selector Factory Pattern

Reusable selectors are created via factories:

```typescript
import { createStatementsByParentSelector } from '@/redux/utils/selectorFactories';

// Create selector
const selectStatementsByParent = createStatementsByParentSelector(
  (state: RootState) => state.statements.statements
);

// Use in component
const statements = useAppSelector(state =>
  selectStatementsByParent(state, parentId)
);
```

**Available Factories:**
- `createStatementsByParentSelector()`
- `createStatementsByParentAndTypeSelector()`
- `createStatementByIdSelector()`
- `createStatementsByTopParentSelector()`
- `createFilteredStatementsSelector()`
- `createCountSelector()`
- `createExistsSelector()`

## Routing Architecture

### Three-Layer Route Protection

```typescript
// 1. Public routes (no auth required)
/start, /home, /login

// 2. Protected routes (require authorization)
/statement/:statementId     → ProtectedLayout → useAuthorization()

// 3. User routes (require authentication)
/my-profile, /settings      → useAuthentication()
```

### Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Home/landing page |
| `/statement/:statementId` | Main statement view |
| `/statement/:statementId/:sort` | Statement with sorting |
| `/home/addStatement` | Create new statement |
| `/my-suggestions/statement/:id` | User's suggestions |
| `/my-profile` | User profile |
| `/settings` | App settings |

## Controllers Layer

### Data Access Layer (`controllers/db/`)

Organized by domain with 30+ subdirectories:

```
controllers/db/
├── statements/      # Statement CRUD, listeners
├── evaluation/      # Evaluation operations
├── vote/           # Voting operations
├── membership/     # Member management
├── subscription/   # User subscriptions
├── notifications/  # Notification handling
└── ...
```

### Firebase Integration Pattern

```typescript
// Example: Statement listener
export function listenToStatements(parentId: string): Unsubscribe {
  const statementsRef = createCollectionRef(Collections.statements);
  const q = query(statementsRef, where('parentId', '==', parentId));

  return onSnapshot(q, (snapshot) => {
    const statements = snapshot.docs.map(doc => {
      const data = parse(StatementSchema, doc.data());
      return normalizeStatementData(data);
    });
    store.dispatch(setStatements(statements));
  });
}
```

### Custom Hooks (`controllers/hooks/`)

| Hook | Purpose |
|------|---------|
| `useAuthentication()` | Firebase auth state + Redux sync |
| `useAuthorization()` | Access control checking |
| `useStatementData()` | Statement fetching & management |
| `useNotifications()` | Notification system |
| `usePanelState()` | Panel UI state |
| `useTranslation()` | i18n integration |

## Services Layer

### Notification Service (Singleton Pattern)

```typescript
class NotificationService {
  private static instance: NotificationService;

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async requestPermission(): Promise<void>
  async getToken(): Promise<string>
  onMessage(callback: MessageHandler): void
}
```

### Service Integration Points

| Service | Purpose |
|---------|---------|
| `notificationService` | FCM push notifications |
| `analytics/` | Firebase Analytics events |
| `logger/` | Structured logging |
| `monitoring/sentry` | Error capture & reporting |

## Atomic Design System

### Component Hierarchy

```
Atoms (Basic blocks)     → Button, Input, Badge, Icon
Molecules (Combinations) → Card, Modal, Toast, Form Group
Organisms (Sections)     → Header, Navigation, Complex layouts
```

### SCSS-First Approach

All styling lives in SCSS files with BEM naming:

```scss
// src/view/style/atoms/_button.scss
.button {
  // Base styles
  padding: var(--padding);

  // Elements
  &__text { }
  &__icon { }

  // Modifiers
  &--primary { background: var(--btn-primary); }
  &--large { font-size: 1.2rem; }
}
```

### React Component (TypeScript Wrapper)

```typescript
// src/view/components/atomic/atoms/Button/Button.tsx
const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'medium',
  className,
  children,
}) => {
  const classes = clsx(
    'button',
    variant !== 'default' && `button--${variant}`,
    size !== 'medium' && `button--${size}`,
    className
  );
  return <button className={classes}>{children}</button>;
};
```

## Context Providers

### UserConfigContext

Manages cross-cutting user preferences:

- Language selection (RTL/LTR support)
- Font size accessibility
- Color contrast toggle
- Learning statistics tracking

### AgreementProvider

Handles terms of service acceptance:

- Checks acceptance status
- Shows modal for new users
- Persists to Firestore

## Error Handling

### Structured Error Logging

```typescript
import { logError, DatabaseError } from '@/utils/errorHandling';

try {
  await someOperation();
} catch (error) {
  logError(error, {
    operation: 'moduleName.functionName',
    userId: user?.id,
    statementId: statement?.id,
    metadata: { relevantData: 'value' }
  });
}
```

### Custom Error Types

| Error Type | Use Case |
|------------|----------|
| `DatabaseError` | Firestore operations |
| `ValidationError` | Input validation |
| `AuthenticationError` | Auth issues |
| `AuthorizationError` | Permission denied |
| `NetworkError` | Connectivity issues |

## Firebase Utilities

### Reference Helpers

```typescript
import { createStatementRef, createEvaluationRef } from '@/utils/firebaseUtils';

// Use utilities instead of manual refs
const statementRef = createStatementRef(statementId);
const evalRef = createEvaluationRef(evaluationId);
```

### Batch Operations

```typescript
import { executeBatchUpdates } from '@/utils/firebaseUtils';

const updates = statements.map(statement => ({
  ref: createStatementRef(statement.statementId),
  data: { lastUpdate: getCurrentTimestamp() }
}));

// Automatically handles 500-item limit
await executeBatchUpdates(updates);
```

## Timestamp Convention

All timestamps use **milliseconds** (not Firestore Timestamps):

```typescript
import { createTimestamps, updateTimestamp } from '@/utils/firebaseUtils';

// For new documents
const { createdAt, lastUpdate } = createTimestamps();

// For updates
const { lastUpdate } = updateTimestamp();

// Manual timestamp
const now = Date.now();
```

## Constants

All magic numbers are replaced with named constants:

```typescript
import { TIME, FIREBASE, VALIDATION } from '@/constants/common';

// Usage
setTimeout(() => {}, TIME.HOUR);
if (batch.length >= FIREBASE.BATCH_SIZE) { }
if (title.length < VALIDATION.MIN_TITLE_LENGTH) { }
```

## Development Scripts

```bash
npm run dev          # Development with Vite
npm run deve         # Development with Firebase emulators
npm run build        # Production build
npm run lint         # ESLint checks
npm run typecheck    # TypeScript validation
npm run check-all    # Full validation suite
npm run test         # Run tests
```

## Key Design Decisions

1. **Unified Data Model**: Everything is a Statement (Composite pattern)
2. **Real-Time First**: Firebase listeners for live collaboration
3. **Type Safety**: TypeScript throughout, types from `delib-npm`
4. **Modular Organization**: Feature-based vertical slicing
5. **Error Resilience**: Multiple error boundaries, Sentry monitoring
6. **Accessibility**: RTL support, font sizing, color contrast
7. **Performance**: Memoized selectors, lazy loading, Firebase caching

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/main.tsx` | Entry point |
| `src/App.tsx` | Root component |
| `src/routes/router.tsx` | Route configuration |
| `src/redux/store.ts` | Redux store |
| `src/controllers/db/config.ts` | Firebase config |
| `src/constants/common.ts` | Constants |
| `src/utils/errorHandling.ts` | Error utilities |
| `src/utils/firebaseUtils.ts` | Firebase utilities |
| `src/redux/utils/selectorFactories.ts` | Selector factories |
