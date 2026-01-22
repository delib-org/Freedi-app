# Freedi App Coding Style & Best Practices Guide

This guide outlines the coding standards and best practices for contributing to the Freedi app. Following these conventions ensures consistency, maintainability, and quality across the codebase.

## Table of Contents
1. [React Component Patterns](#react-component-patterns)
2. [TypeScript Conventions](#typescript-conventions)
3. [State Management (Redux Toolkit)](#state-management-redux-toolkit)
4. [Firebase Integration](#firebase-integration)
5. [File Organization](#file-organization)
6. [CSS/SCSS Patterns](#cssscss-patterns)
7. [Error Handling & Logging](#error-handling--logging)
8. [Testing Conventions](#testing-conventions)
9. [Code Quality](#code-quality)
10. [Import Organization](#import-organization)
11. [Async Operations](#async-operations)
12. [Performance Considerations](#performance-considerations)
13. [PWA & Service Workers](#pwa--service-workers)
14. [Multi-language Support](#multi-language-support)

## React Component Patterns

### Functional Components Only
Always use React functional components with hooks. Class components are not used in this project.

```typescript
import React, { FC } from 'react';
import styles from './ComponentName.module.scss';

interface Props {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}

const ComponentName: FC<Props> = ({ 
  title, 
  onClick, 
  disabled = false 
}) => {
  // Component logic here
  
  return (
    <div className={styles.container}>
      {/* JSX content */}
    </div>
  );
};

export default ComponentName;
```

### Component Best Practices
- **Single Responsibility**: Each component should have one clear purpose
- **Props Interface**: Always define a Props interface with clear types
- **Default Props**: Use destructuring with default values
- **Naming**: Components use PascalCase, props use camelCase
- **Event Handlers**: Name as `handleActionName` (e.g., `handleClick`, `handleSubmit`)
- **Early Returns**: Use early returns for conditional rendering
- **Accessibility**: Include appropriate ARIA labels and roles

### Custom Hooks
Custom hooks must start with `use` and follow React hooks rules:
```typescript
export function useCustomHook(param: string) {
  const [state, setState] = useState<string>('');
  
  useEffect(() => {
    // Effect logic
  }, [param]);
  
  return { state, setState };
}
```

## TypeScript Conventions

### Strict Mode
- **No `any` types allowed** - always use proper typing
- Enable all strict TypeScript compiler options
- Use type inference where possible, explicit types where necessary

### Type Imports from delib-npm
**Important**: Core types and Valibot schemas are imported from the `delib-npm` package to maintain consistency across all Freedi applications.

```typescript
import { 
  Statement, 
  StatementSchema,
  User,
  UserSchema,
  Collections,
  StatementType,
  Access
} from 'delib-npm';
```

### Local Type Definitions
Only create local types for app-specific needs that aren't covered by `delib-npm`:
```typescript
// src/types/local/AppSpecificTypes.ts
export interface LocalFeature {
  id: string;
  appSpecificField: string;
}
```

### Type Validation
Use Valibot schemas from `delib-npm` for validation:
```typescript
import { parse } from 'valibot';
import { StatementSchema } from 'delib-npm';

// Validate data before using
const validatedStatement = parse(StatementSchema, rawData);
```

## State Management (Redux Toolkit)

### Store Structure
Organize Redux slices by feature:
```
src/redux/
├── store.ts
├── statements/
│   ├── statementsSlice.ts
│   └── statementsMetaSlice.ts
├── evaluations/
│   └── evaluationsSlice.ts
└── user/
    └── userSlice.ts
```

### Slice Pattern
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Statement } from 'delib-npm';

interface SliceState {
  items: Statement[];
  loading: boolean;
}

const initialState: SliceState = {
  items: [],
  loading: false,
};

export const sliceName = createSlice({
  name: 'sliceName',
  initialState,
  reducers: {
    setItems: (state, action: PayloadAction<Statement[]>) => {
      state.items = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setItems, setLoading } = sliceName.actions;
export default sliceName.reducer;
```

### Type-Safe Hooks
Always use the typed hooks:
```typescript
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
```

## Firebase Integration

### Modular Database Operations
Organize Firebase operations by feature in `/src/controllers/db/`:
```typescript
// src/controllers/db/statements/setStatements.ts
import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Statement, StatementSchema } from 'delib-npm';
import { parse } from 'valibot';

export async function setStatementToDB(statement: Statement): Promise<void> {
  try {
    // Validate before saving
    parse(StatementSchema, statement);
    
    const statementRef = doc(
      FireStore,
      Collections.statements,
      statement.statementId
    );
    
    await setDoc(statementRef, statement, { merge: true });
  } catch (error) {
    console.error('Error setting statement:', error);
    throw error;
  }
}
```

### Firebase Best Practices
- Always wrap Firebase calls in try-catch blocks
- Validate data with Valibot schemas before database operations
- Use `Collections` enum from `delib-npm` for collection names
- Use `writeBatch` for multiple operations
- Use `Timestamp.now().toMillis()` for timestamps

## File Organization

### Component Structure
```
src/view/components/ComponentName/
├── ComponentName.tsx        # Main component
├── ComponentName.module.scss # Styles
├── ComponentNameVM.tsx      # View Model (if needed)
└── index.ts                # Barrel export (optional)
```

### Directory Structure
```
src/
├── assets/              # Static assets
├── constants/           # App constants
├── context/             # React contexts
├── controllers/         # Business logic
│   ├── db/             # Firebase operations
│   └── hooks/          # Custom hooks
├── redux/              # State management
├── routes/             # Routing configuration
├── services/           # External services
├── types/              # Local TypeScript types
├── utils/              # Utility functions
└── view/               # UI components
    ├── components/     # Reusable components
    └── pages/          # Page components
```

## CSS/SCSS Patterns

### CSS Modules
Always use CSS modules for component styling:
```scss
// ComponentName.module.scss
.container {
  display: flex;
  padding: 1rem;
  
  &--modifier {
    background-color: var(--primary-color);
  }
  
  &__element {
    margin: 0.5rem;
    
    &--active {
      color: var(--accent-color);
    }
  }
}
```

### Styling Best Practices
- Use BEM-like naming with CSS modules
- Use CSS variables for theming: `var(--color-name)`
- Support RTL languages with `.rtl` and `.ltr` classes
- No global styles except in designated files
- Use `rem` units for better accessibility

### RTL Support
```scss
.button {
  display: flex;
  flex-direction: row;
  
  &.rtl {
    flex-direction: row-reverse;
    
    svg {
      transform: scaleX(-1);
    }
  }
}
```

## Error Handling & Logging

### Console Usage Rules
- **`console.error()`** - For errors only
- **`console.info()`** - For important information
- **Never use `console.log()`** in production code

### Error Handling Pattern
```typescript
try {
  // Operation that might fail
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Descriptive error message:', error);
  // Handle error appropriately
  // Consider user notification if needed
  return undefined;
}
```

### Async Error Boundaries
Use error boundaries for component-level error handling:
```typescript
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
    </div>
  );
}

// Usage
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <YourComponent />
</ErrorBoundary>
```

## Testing Conventions

### Test Structure
```typescript
import { functionToTest } from './module';

describe('functionToTest', () => {
  it('should handle normal case', () => {
    const result = functionToTest(validInput);
    expect(result).toEqual(expectedOutput);
  });
  
  it('should handle edge case', () => {
    const result = functionToTest(edgeInput);
    expect(result).toBeUndefined();
  });
  
  it('should throw error for invalid input', () => {
    expect(() => functionToTest(invalidInput)).toThrow();
  });
});
```

### Testing Best Practices
- Use descriptive test names
- Test both happy paths and edge cases
- Mock Firebase and external dependencies
- Keep tests focused and independent
- Run tests before committing: `npm test`

## Code Quality

### Required Checks
Before committing code, always run:
```bash
npm run check-all
```

This runs:
- `npm run lint` - ESLint checks
- `npm run typecheck` - TypeScript compilation
- `npm run build` - Build verification

### Individual Commands
- `npm run lint` - Check linting issues
- `npm run lint:fix` - Auto-fix linting issues
- `npm run typecheck` - TypeScript type checking
- `npm run test` - Run tests

### Git Hooks
The project uses pre-commit hooks to ensure code quality. Never bypass these checks.

## Import Organization

Organize imports in the following order:
```typescript
// 1. React imports
import React, { FC, useState, useEffect } from 'react';

// 2. Third-party library imports
import { useSelector } from 'react-redux';
import { doc, setDoc } from 'firebase/firestore';

// 3. delib-npm imports
import { Statement, StatementSchema, Collections } from 'delib-npm';

// 4. Internal imports (use @ alias)
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { setStatementToDB } from '@/controllers/db/statements/setStatements';

// 5. Type imports
import type { LocalType } from '@/types/LocalType';

// 6. Style imports
import styles from './Component.module.scss';

// 7. Asset imports
import BellIcon from '@/assets/icons/bellIcon.svg?react';
```

### Import Best Practices
- Use the `@/` alias for src directory imports
- Group related imports together
- Add a blank line between import groups
- Use named imports where possible
- Import React icons as components with `?react`

## Async Operations

### Async/Await Pattern
Always use async/await instead of promises:
```typescript
// Good
async function fetchData() {
  try {
    const data = await getData();
    return processData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    return null;
  }
}

// Avoid
function fetchData() {
  return getData()
    .then(data => processData(data))
    .catch(error => {
      console.error('Failed to fetch data:', error);
      return null;
    });
}
```

### useEffect Cleanup
Always clean up side effects:
```typescript
useEffect(() => {
  let cancelled = false;
  
  async function loadData() {
    try {
      const data = await fetchData();
      if (!cancelled) {
        setData(data);
      }
    } catch (error) {
      if (!cancelled) {
        console.error('Error loading data:', error);
      }
    }
  }
  
  loadData();
  
  return () => {
    cancelled = true;
  };
}, [dependency]);
```

## Performance Considerations

### Memoization
Use React's memoization tools appropriately:
```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(prop1, prop2);
}, [prop1, prop2]);

// Memoize callbacks
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

// Memoize components
const MemoizedComponent = React.memo(Component);
```

### Code Splitting
Use dynamic imports for route-based code splitting:
```typescript
const LazyComponent = lazy(() => import('./LazyComponent'));
```

### Performance Best Practices
- Avoid unnecessary re-renders
- Use React.memo for pure components
- Implement virtualization for long lists
- Optimize bundle size with tree shaking
- Use production builds for deployment

## PWA & Service Workers

### Service Worker Setup
The app uses Workbox for service worker generation:
- Configuration in `vite.config.ts`
- Custom service worker in `public/firebase-messaging-sw.js`
- Update prompts in `PWAUpdateToast` component

### PWA Best Practices
- Handle offline scenarios gracefully
- Implement background sync for offline actions
- Show clear update notifications
- Cache static assets appropriately
- Test offline functionality regularly

## Multi-language Support

### Internationalization
```typescript
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/utils/i18n';

function Component() {
  const { language } = useLanguage();
  
  return <h1>{t('welcome_message', language)}</h1>;
}
```

### RTL Support
```typescript
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

function Component() {
  const { dir } = useUserConfig();
  
  return (
    <div className={`${styles.container} ${dir === 'rtl' ? styles.rtl : styles.ltr}`}>
      {/* Content */}
    </div>
  );
}
```

### Language Best Practices
- Store translations in `/src/assets/translations/`
- Support Arabic (`ar`), Hebrew (`he`), and other RTL languages
- Test UI in both LTR and RTL modes
- Use language-agnostic icons where possible

## Contributing

1. Read this guide thoroughly before contributing
2. Follow all conventions consistently
3. Run `npm run check-all` before committing
4. Write meaningful commit messages
5. Update documentation when adding features
6. Add tests for new functionality
7. Request code review for significant changes

## Questions?

If you have questions about these guidelines or need clarification:
1. Check existing code for examples
2. Ask in the project's discussion forum
3. Consult the CLAUDE.md file for AI assistance guidelines

Remember: Consistency is key to maintainability. When in doubt, follow existing patterns in the codebase.