# Freedi App Development Guide

## ⚠️ CRITICAL RULES - MUST FOLLOW

### TypeScript - ABSOLUTELY NO `any` TYPE
- **NEVER use `any` type** - use proper types, `unknown`, or specific interfaces
- All variables, parameters, and return types must be explicitly typed
- If you encounter an `any` type, replace it with the correct type immediately
- **ALWAYS check `delib-npm` package first** for existing types before creating new ones
  - Import types from `delib-npm` when available: `import { Statement, User, Role } from 'delib-npm';`
  - Only create custom types if they don't exist in `delib-npm`
- Examples of what NOT to do:
  ```typescript
  // ❌ WRONG - Never do this
  const data: any = fetchData();
  function process(input: any): any { }

  // ❌ WRONG - Don't create types that already exist in delib-npm
  interface Statement {
    statementId: string;
    // ...
  }

  // ✅ CORRECT - Always do this
  import { Statement, User } from 'delib-npm';
  const data: UserData = fetchData();
  function process(input: Statement): ProcessedStatement { }
  ```

### CSS/SCSS - NEVER Import Global Styles in Components
- **NEVER import global styles** in components: `import './styles.scss'` ❌
- **ONLY import CSS modules** in components: `import styles from './Component.module.scss'` ✅
- Global styles are imported ONLY ONCE in `main.tsx` from `style.scss`
- Each component should have its own `.module.scss` file if it needs styles
- Examples:
  ```typescript
  // ❌ WRONG - Never import global styles in a component
  import './styles.scss';
  import '../styles/global.scss';

  // ✅ CORRECT - Only import CSS modules
  import styles from './MyComponent.module.scss';
  ```

### Design System Guidelines
- **ALWAYS follow design system guidelines** from `docs/design-guide.md`
- **All UI/UX decisions must align** with the design guide
- **Color palette**: Use only CSS variables from the design system (e.g., `var(--btn-primary)`, `var(--agree)`)
  - Never hardcode colors: `#5f88e5` ❌, use `var(--btn-primary)` ✅
- **Typography**: Follow type scale (h1-h6, p) and use design tokens
- **Spacing**: Use 8-point grid system with spacing tokens (`var(--padding)`)
- **Component patterns**: Follow established patterns in design guide (buttons, cards, forms, modals)
- **Animations**: Use standard timing functions and durations from design guide
- **Accessibility**: All components must meet WCAG AA standards
- **Responsive**: Mobile-first approach with established breakpoints
- Examples:
  ```scss
  // ❌ WRONG - Hardcoded values
  .myButton {
    background-color: #5f88e5;
    padding: 16px;
    border-radius: 20px;
  }

  // ✅ CORRECT - Design tokens
  .myButton {
    background-color: var(--btn-primary);
    padding: var(--padding);
    border-radius: 20px; // Specific to button pattern
  }
  ```

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint` or `npm run lint:fix` to auto-fix issues
- Type check: `npm run typecheck`
- Check all: `npm run check-all` (runs lint, typecheck, and build)

### Testing
- Run specific test: `cd functions && npm test -- -t 'test name'`
- Watch tests: `cd functions && npm run test:watch`

## Code Style Guidelines
- **React**: Functional components with hooks only
- **Imports**: Add newline after imports
- **Formatting**: No multiple empty lines, newline before return statements
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error handling**: Use try/catch for all async operations
- **Logging**: Only use `console.error` and `console.info` - no `console.log`
- **Component structure**: Keep components small and focused
- **Redux**: Use Redux Toolkit for state management
- **ESLint**: All code must pass ESLint checks before commit

## Timestamp Guidelines
- **ALWAYS use milliseconds** for all timestamp fields (createdAt, lastUpdate, lastChildUpdate, etc.)
- **ALWAYS use the timestamp utilities** from `@/utils/firebaseUtils`:
  ```typescript
  import { createTimestamps, updateTimestamp, getCurrentTimestamp } from '@/utils/firebaseUtils';

  // For new documents
  const { createdAt, lastUpdate } = createTimestamps();

  // For updates
  const { lastUpdate } = updateTimestamp();

  // For manual timestamp
  const now = getCurrentTimestamp();
  ```
- **Client-side**: Use `Date.now()` or utility functions
- **Firebase Functions**: Use `Date.now()` instead of `FieldValue.serverTimestamp()`
- **Never use**: `Timestamp.now()` without `.toMillis()`, `FieldValue.serverTimestamp()`, or raw `Date` objects
- **When reading from Firestore**: Always convert Timestamps using the helper function:
  ```typescript
  import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
  const data = convertTimestampsToMillis(doc.data());
  ```
- **Valibot validation**: All timestamp fields must be `number()`

---

## ⚠️ ERROR HANDLING - CRITICAL REQUIREMENTS

### NEVER Use Generic console.error()
- **ALWAYS use structured error logging** with context
- **NEVER write**: `console.error(error)` or `catch (error) { console.error(error) }`
- **ALWAYS use**: `logError()` from `@/utils/errorHandling` with full context

### Required Error Handling Pattern
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
  // Optional: rethrow or handle
}
```

### Custom Error Types - When to Use
Use appropriate error types for better error categorization:

```typescript
import {
  DatabaseError,      // Firestore/database operations
  ValidationError,    // Input validation failures
  AuthenticationError, // Auth issues
  AuthorizationError, // Permission denied
  NetworkError        // Network/connectivity issues
} from '@/utils/errorHandling';

// Example
if (!user) {
  throw new AuthenticationError('User not authenticated', {
    operation: 'createStatement'
  });
}

if (!hasPermission) {
  throw new AuthorizationError('User lacks permission', {
    userId: user.id,
    requiredRole: 'admin'
  });
}
```

### Higher-Order Function Pattern (Recommended)
For reusable functions, wrap them with error handling:

```typescript
import { withErrorHandling, withRetry } from '@/utils/errorHandling';
import { RETRY } from '@/constants/common';

// Wrap async function
export const saveStatement = withErrorHandling(
  async (statement: Statement) => {
    // Your logic here
  },
  { operation: 'statements.saveStatement' }
);

// With retry for critical operations
export const syncWithRetry = withRetry(
  async () => {
    // Critical operation
  },
  {
    maxRetries: RETRY.MAX_ATTEMPTS,
    delayMs: RETRY.INITIAL_DELAY_MS,
    exponentialBackoff: true
  },
  { operation: 'sync.critical' }
);
```

### Error Context Requirements
**ALWAYS include in error context:**
1. **operation** (required): Module and function name (e.g., 'statements.createStatement')
2. **IDs** (when available): userId, statementId, evaluationId, etc.
3. **metadata** (optional): Additional context that helps debugging

---

## 🔥 FIREBASE OPERATIONS - REQUIRED UTILITIES

### ALWAYS Use Firebase Utilities
**NEVER manually create Firebase references** - use the utilities:

```typescript
import {
  createStatementRef,
  createEvaluationRef,
  createSubscriptionRef,
  createDocRef,
  createCollectionRef,
  executeBatchUpdates
} from '@/utils/firebaseUtils';
import { Collections } from 'delib-npm';

// ✅ CORRECT - Use utilities
const statementRef = createStatementRef(statementId);
const evalRef = createEvaluationRef(evaluationId);
const subRef = createSubscriptionRef(subscriptionId);

// For other collections
const docRef = createDocRef(Collections.notifications, notificationId);
const collectionRef = createCollectionRef(Collections.statements);

// ❌ WRONG - Don't do this
const statementRef = doc(FireStore, Collections.statements, statementId);
```

### Batch Operations
Use `executeBatchUpdates()` for bulk operations - it automatically handles the 500-item Firestore limit:

```typescript
import { executeBatchUpdates } from '@/utils/firebaseUtils';

const updates = statements.map(statement => ({
  ref: createStatementRef(statement.statementId),
  data: { lastUpdate: getCurrentTimestamp() }
}));

await executeBatchUpdates(updates); // Automatically splits into batches of 500
```

---

## 📋 CONSTANTS - NEVER USE MAGIC NUMBERS

### ALWAYS Use Named Constants
Import from `@/constants/common` instead of hardcoding values:

```typescript
import { TIME, FIREBASE, UI, VALIDATION, NOTIFICATION } from '@/constants/common';

// ✅ CORRECT
setTimeout(() => {...}, TIME.HOUR);
setTimeout(() => {...}, NOTIFICATION.TOKEN_REFRESH_INTERVAL);
if (batch.length >= FIREBASE.BATCH_SIZE) {...}
if (title.length < VALIDATION.MIN_TITLE_LENGTH) {...}

// ❌ WRONG
setTimeout(() => {...}, 3600000);  // What is this?
setTimeout(() => {...}, 30 * 24 * 60 * 60 * 1000); // Hard to read
if (batch.length >= 500) {...}
if (title.length < 3) {...}
```

### Available Constant Categories
- **TIME**: SECOND, MINUTE, HOUR, DAY, WEEK, MONTH
- **FIREBASE**: BATCH_SIZE, MAX_TRANSACTION_RETRIES, QUERY_LIMIT_DEFAULT, QUERY_LIMIT_MAX
- **RETRY**: MAX_ATTEMPTS, INITIAL_DELAY_MS, MAX_DELAY_MS, EXPONENTIAL_BASE
- **NOTIFICATION**: TOKEN_REFRESH_INTERVAL, TOKEN_CHECK_INTERVAL, SERVICE_WORKER_TIMEOUT
- **UI**: DEBOUNCE_DELAY, THROTTLE_DELAY, ANIMATION_DURATION, MODAL_Z_INDEX
- **VALIDATION**: MIN_STATEMENT_LENGTH, MIN_TITLE_LENGTH, MAX_STATEMENT_LENGTH, MAX_DESCRIPTION_LENGTH
- **CACHE**: DEFAULT_TTL, LONG_TTL, SHORT_TTL
- **ERROR_MESSAGES**: GENERIC, NETWORK, AUTHENTICATION, AUTHORIZATION, VALIDATION
- **SUCCESS_MESSAGES**: STATEMENT_CREATED, STATEMENT_UPDATED, etc.
- **STORAGE_KEYS**: USER_PREFERENCES, THEME, LANGUAGE, etc.
- **ROUTES**: HOME, LOGIN, STATEMENT, MY_SUGGESTIONS, etc.

---

## 🔄 REDUX SELECTORS - USE FACTORIES

### ALWAYS Use Selector Factories
Don't duplicate selector patterns - use factories from `@/redux/utils/selectorFactories`:

```typescript
import {
  createStatementsByParentSelector,
  createStatementsByParentAndTypeSelector,
  createStatementByIdSelector,
  createFilteredStatementsSelector,
  sortByCreatedAt,
  sortByConsensus,
  sortByLastUpdate,
  sortByEvaluationCount
} from '@/redux/utils/selectorFactories';
import { StatementType } from 'delib-npm';

// ✅ CORRECT - Use factory
const selectStatementsByParent = createStatementsByParentSelector(
  (state: RootState) => state.statements.statements
);

const selectOptionsByParent = createStatementsByParentAndTypeSelector(
  (state: RootState) => state.statements.statements
)(parentId, StatementType.option);

// Custom filtering with factory
const selectActiveStatements = createFilteredStatementsSelector(
  (state: RootState) => state.statements.statements
)(
  (statement) => !statement.hide,
  sortByCreatedAt
);

// ❌ WRONG - Don't duplicate this pattern
const selectStatementsByParent = (parentId: string) =>
  createSelector(
    [(state: RootState) => state.statements.statements],
    (statements) => statements.filter(s => s.parentId === parentId)
  );
```

### Available Selector Factories
- `createStatementsByParentSelector()` - Filter by parent ID
- `createStatementsByParentAndTypeSelector()` - Filter by parent + type
- `createStatementByIdSelector()` - Find by ID
- `createStatementsByTopParentSelector()` - Filter by top parent
- `createFilteredStatementsSelector()` - Custom filtering with optional sorting
- `createCountSelector()` - Count items
- `createExistsSelector()` - Check if item exists

### Available Sort Functions
- `sortByCreatedAt` - Oldest to newest
- `sortByLastUpdate` - Most recently updated first
- `sortByConsensus` - Highest consensus first
- `sortByEvaluationCount` - Most evaluated first

---

## ✅ TESTING REQUIREMENTS

### ALL New Code Must Include Tests
- **Utilities/Helpers**: 80%+ coverage required
- **Redux Slices**: Test all reducers and selectors
- **Controllers**: Test happy paths and error cases
- **Components**: Test user interactions and edge cases

### Test File Location
- Place tests in `__tests__` folder next to the file being tested
- Name test files: `fileName.test.ts` or `fileName.test.tsx`

### Example Test Structure
See `src/utils/__tests__/errorHandling.test.ts` and `src/utils/__tests__/firebaseUtils.test.ts` for comprehensive examples.

```typescript
import { myFunction } from '../myModule';

describe('myModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('myFunction', () => {
    it('should handle success case', () => {
      const result = myFunction('input');
      expect(result).toBe('expected');
    });

    it('should handle error case', () => {
      expect(() => myFunction(null)).toThrow();
    });
  });
});
```

### Run Tests Before Commit
```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run check-all         # Full validation
```

---

## 📁 FILE ORGANIZATION

### Keep Files Small and Focused
- **Maximum file size**: 500 lines (ideally <300)
- **Single Responsibility**: Each file should have one clear purpose
- **Break down large files** into smaller modules

### Module Structure
```
src/
├── components/          # Reusable UI components
├── constants/          # Application constants
├── controllers/        # Business logic and data operations
├── helpers/           # Pure helper functions
├── hooks/             # Custom React hooks
├── redux/             # State management
│   └── utils/         # Redux utilities (selectors, factories)
├── services/          # External services (Firebase, analytics)
├── types/             # TypeScript type definitions
├── utils/             # Utility functions and helpers
│   └── __tests__/     # Tests for utilities
└── view/              # Pages and components
```

---

## 🎯 ARCHITECTURE PRINCIPLES

### 1. Separation of Concerns
- **View**: React components (presentation only)
- **Controllers**: Business logic and Firebase operations
- **Services**: External integrations (FCM, analytics, logger)
- **Redux**: Application state management
- **Utils/Helpers**: Reusable pure functions

### 2. Dependency Direction
```
View → Controllers → Services
  ↓         ↓
Redux    Utils/Helpers
```

Never import upward (e.g., Controllers should NOT import from View)

### 3. Error Handling Philosophy
- **Fail loudly in development** (detailed errors)
- **Fail gracefully in production** (user-friendly messages)
- **Always log with context** (debugging information)
- **Categorize errors** (use custom error types)

### 4. Type Safety
- **No `any` types** (ESLint enforced)
- **Import from `delib-npm`** when types exist
- **Explicit typing** for all functions
- **Runtime validation** with Valibot at boundaries

### 5. Code Reusability
- **DRY principle** - Don't Repeat Yourself
- **Use utilities** instead of copying code
- **Create factories** for common patterns
- **Extract constants** from magic numbers

---

## 📚 REFERENCE DOCUMENTATION

### Core Utilities
- **Error Handling**: `src/utils/errorHandling.ts`
- **Firebase Utils**: `src/utils/firebaseUtils.ts`
- **Selector Factories**: `src/redux/utils/selectorFactories.ts`
- **Constants**: `src/constants/common.ts`

### Example Code
- **Redux Slice**: `src/redux/statements/statementsSlice.ts` (updated with proper error handling)
- **Error Handling Tests**: `src/utils/__tests__/errorHandling.test.ts`
- **Firebase Utils Tests**: `src/utils/__tests__/firebaseUtils.test.ts`

### Documentation
- **Code Quality Review**: `CODE_QUALITY_REVIEW.md`
- **Implementation Guide**: `CODE_QUALITY_IMPROVEMENTS.md`
- **Design Guide**: `docs/design-guide.md`
- **Architecture**: `docs/FREEDI_ARCHITECTURE.md`

---

## 🚀 QUICK REFERENCE CHEATSHEET

### Starting a New Feature

```typescript
// 1. Import necessary utilities
import { logError, DatabaseError } from '@/utils/errorHandling';
import { createStatementRef, createTimestamps } from '@/utils/firebaseUtils';
import { TIME, VALIDATION } from '@/constants/common';
import { Statement } from 'delib-npm';

// 2. Define types (import from delib-npm if available)
interface MyFeatureProps {
  statement: Statement;
  userId: string;
}

// 3. Implement with proper error handling
export async function myFeature({ statement, userId }: MyFeatureProps): Promise<void> {
  try {
    // Validate input
    if (!statement.statement || statement.statement.length < VALIDATION.MIN_STATEMENT_LENGTH) {
      throw new ValidationError('Statement too short', {
        length: statement.statement.length,
        minLength: VALIDATION.MIN_STATEMENT_LENGTH
      });
    }

    // Use Firebase utilities
    const statementRef = createStatementRef(statement.statementId);
    const { lastUpdate } = updateTimestamp();

    // Perform operation
    await updateDoc(statementRef, { lastUpdate });

  } catch (error) {
    logError(error, {
      operation: 'features.myFeature',
      userId,
      statementId: statement.statementId
    });
    throw error; // Re-throw if caller should handle
  }
}

// 4. Write tests
// Create __tests__/myFeature.test.ts
```

### Code Review Checklist
Before submitting PR, verify:
- ✅ No `any` types used
- ✅ All errors use `logError()` with context
- ✅ Firebase operations use utilities
- ✅ No magic numbers (use constants)
- ✅ Selectors use factories
- ✅ Tests included (80%+ coverage for utilities)
- ✅ All tests pass (`npm run test`)
- ✅ TypeScript validates (`npm run typecheck`)
- ✅ ESLint passes (`npm run lint`)
- ✅ Build succeeds (`npm run build`)

---

## 💡 TIPS FOR SUCCESS

1. **Read the examples** - Check `CODE_QUALITY_IMPROVEMENTS.md` for detailed examples
2. **Use the utilities** - They save time and improve quality
3. **Test as you go** - Don't leave testing until the end
4. **Ask for help** - If patterns are unclear, check documentation or ask
5. **Follow the checklist** - Use the code review checklist above