# Comprehensive Testing Strategy

This document outlines a complete testing strategy for the Freedi app, addressing the current lack of test coverage and establishing best practices for ongoing development.

## Current State

- Only 1 test file found (`fn_agree.test.ts`)
- No component tests
- No integration tests
- No E2E tests
- Testing infrastructure exists but underutilized

## 1. Testing Architecture

### 1.1 Testing Pyramid

```
         E2E Tests (10%)
        /              \
    Integration Tests (30%)
   /                      \
  Unit Tests (60%)
```

### 1.2 Test File Organization

```
src/
  components/
    Button/
      Button.tsx
      Button.test.tsx          # Unit tests
      Button.stories.tsx       # Visual tests
  hooks/
    useAuth/
      useAuth.ts
      useAuth.test.ts          # Hook tests
  services/
    api/
      api.ts
      api.test.ts              # Service tests
      api.integration.test.ts  # Integration tests
  redux/
    statements/
      statementsSlice.ts
      statementsSlice.test.ts  # Reducer tests
  __tests__/
    integration/               # Integration tests
    e2e/                      # E2E tests
```

## 2. Unit Testing

### 2.1 Component Testing

```typescript
// src/components/Button/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button Component', () => {
  describe('Rendering', () => {
    it('renders with text content', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('renders with correct variant styles', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole('button')).toHaveClass('button--primary');
      
      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('button--secondary');
    });

    it('renders disabled state', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders loading state', () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Interactions', () => {
    it('calls onClick handler when clicked', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick}>Click me</Button>);
      await user.click(screen.getByRole('button'));
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick} disabled>Click me</Button>);
      await user.click(screen.getByRole('button'));
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('supports keyboard navigation', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick}>Press Enter</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      await user.keyboard('{Enter}');
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(<Button aria-label="Save document">Save</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Save document');
    });

    it('announces loading state to screen readers', () => {
      render(<Button loading loadingText="Saving...">Save</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Saving...')).toHaveClass('sr-only');
    });
  });
});
```

### 2.2 Hook Testing

```typescript
// src/hooks/useDebounce/useDebounce.test.ts
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    expect(result.current).toBe('initial');

    // Change value
    rerender({ value: 'updated', delay: 500 });
    expect(result.current).toBe('initial'); // Still initial

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current).toBe('initial'); // Still initial

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated'); // Now updated
  });

  it('cancels previous timeout on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'first' } }
    );

    rerender({ value: 'second' });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    rerender({ value: 'third' });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe('first'); // Still first

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe('third'); // Skipped 'second'
  });
});
```

### 2.3 Redux Testing

```typescript
// src/redux/statements/statementsSlice.test.ts
import { configureStore } from '@reduxjs/toolkit';
import statementsReducer, {
  setStatement,
  setStatements,
  deleteStatement,
  selectAllStatements,
  selectStatementById,
} from './statementsSlice';

describe('statementsSlice', () => {
  describe('reducers', () => {
    it('handles setStatement', () => {
      const initialState = {
        entities: {},
        ids: [],
      };

      const statement = {
        statementId: '1',
        statement: 'Test statement',
        createdAt: Date.now(),
      };

      const nextState = statementsReducer(
        initialState,
        setStatement(statement)
      );

      expect(nextState.entities['1']).toEqual(statement);
      expect(nextState.ids).toContain('1');
    });

    it('handles setStatements', () => {
      const statements = [
        { statementId: '1', statement: 'First' },
        { statementId: '2', statement: 'Second' },
      ];

      const nextState = statementsReducer(
        undefined,
        setStatements(statements)
      );

      expect(Object.keys(nextState.entities)).toHaveLength(2);
      expect(nextState.ids).toEqual(['1', '2']);
    });

    it('handles deleteStatement', () => {
      const initialState = {
        entities: {
          '1': { statementId: '1', statement: 'Test' },
          '2': { statementId: '2', statement: 'Keep' },
        },
        ids: ['1', '2'],
      };

      const nextState = statementsReducer(
        initialState,
        deleteStatement('1')
      );

      expect(nextState.entities['1']).toBeUndefined();
      expect(nextState.ids).toEqual(['2']);
    });
  });

  describe('selectors', () => {
    const mockState = {
      statements: {
        entities: {
          '1': { statementId: '1', statement: 'First', parentId: null },
          '2': { statementId: '2', statement: 'Second', parentId: '1' },
          '3': { statementId: '3', statement: 'Third', parentId: '1' },
        },
        ids: ['1', '2', '3'],
      },
    };

    it('selectAllStatements returns all statements', () => {
      const result = selectAllStatements(mockState);
      expect(result).toHaveLength(3);
    });

    it('selectStatementById returns specific statement', () => {
      const result = selectStatementById(mockState, '2');
      expect(result?.statement).toBe('Second');
    });

    it('memoizes selector results', () => {
      const result1 = selectAllStatements(mockState);
      const result2 = selectAllStatements(mockState);
      expect(result1).toBe(result2); // Same reference
    });
  });

  describe('async actions', () => {
    it('handles async statement fetching', async () => {
      const store = configureStore({
        reducer: { statements: statementsReducer },
      });

      // Mock the async action
      const mockStatements = [
        { statementId: '1', statement: 'Async statement' },
      ];

      await store.dispatch(fetchStatements.fulfilled(mockStatements, '', {}));

      const state = store.getState();
      expect(selectAllStatements(state)).toHaveLength(1);
    });
  });
});
```

## 3. Integration Testing

### 3.1 API Integration Tests

```typescript
// src/services/api/statements.integration.test.ts
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '@/redux/store';
import { useGetStatementsQuery } from './statementsApi';

const server = setupServer(
  rest.get('/api/statements', (req, res, ctx) => {
    return res(
      ctx.json([
        { statementId: '1', statement: 'Test statement' },
      ])
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Statements API Integration', () => {
  const wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('fetches statements successfully', async () => {
    const { result } = renderHook(
      () => useGetStatementsQuery('parentId'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].statement).toBe('Test statement');
  });

  it('handles error responses', async () => {
    server.use(
      rest.get('/api/statements', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Server error' }));
      })
    );

    const { result } = renderHook(
      () => useGetStatementsQuery('parentId'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it('retries failed requests', async () => {
    let attempts = 0;
    server.use(
      rest.get('/api/statements', (req, res, ctx) => {
        attempts++;
        if (attempts < 3) {
          return res(ctx.status(500));
        }
        return res(ctx.json([{ statementId: '1', statement: 'Success' }]));
      })
    );

    const { result } = renderHook(
      () => useGetStatementsQuery('parentId', { retry: 3 }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    }, { timeout: 5000 });

    expect(attempts).toBe(3);
  });
});
```

### 3.2 Firebase Integration Tests

```typescript
// src/controllers/db/statements/statements.integration.test.ts
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { createStatement, getStatement, deleteStatement } from './statements';

let testEnv;
let db;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'freedi-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
  db = testEnv.authenticatedContext('testuser').firestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Statements Firestore Integration', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('creates and retrieves a statement', async () => {
    const statementData = {
      statement: 'Integration test statement',
      createdBy: 'testuser',
      createdAt: Date.now(),
    };

    const statementId = await createStatement(db, statementData);
    expect(statementId).toBeDefined();

    const retrieved = await getStatement(db, statementId);
    expect(retrieved.statement).toBe(statementData.statement);
  });

  it('enforces security rules', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    
    await expect(
      createStatement(unauthDb, { statement: 'Unauthorized' })
    ).rejects.toThrow('Missing or insufficient permissions');
  });

  it('handles concurrent updates', async () => {
    const statementId = await createStatement(db, {
      statement: 'Original',
      votes: 0,
    });

    // Simulate concurrent vote updates
    const vote1 = updateVoteCount(db, statementId, 1);
    const vote2 = updateVoteCount(db, statementId, 1);
    
    await Promise.all([vote1, vote2]);
    
    const final = await getStatement(db, statementId);
    expect(final.votes).toBe(2); // Both votes counted
  });
});
```

## 4. E2E Testing

### 4.1 Cypress Setup

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      // Custom tasks
      on('task', {
        seedDatabase() {
          // Seed test data
          return null;
        },
        clearDatabase() {
          // Clear test data
          return null;
        },
      });
    },
  },
  env: {
    TEST_USER_EMAIL: 'test@example.com',
    TEST_USER_PASSWORD: 'testpass123',
  },
});
```

### 4.2 E2E Test Examples

```typescript
// cypress/e2e/statement-flow.cy.ts
describe('Statement Creation and Voting Flow', () => {
  beforeEach(() => {
    cy.task('clearDatabase');
    cy.task('seedDatabase');
    cy.login(Cypress.env('TEST_USER_EMAIL'), Cypress.env('TEST_USER_PASSWORD'));
  });

  it('creates a new statement and votes on it', () => {
    // Navigate to home
    cy.visit('/');
    
    // Create new statement
    cy.findByRole('button', { name: /create statement/i }).click();
    cy.findByLabelText(/statement title/i).type('E2E Test Statement');
    cy.findByLabelText(/description/i).type('This is a test statement created by E2E test');
    cy.findByRole('button', { name: /submit/i }).click();
    
    // Verify creation
    cy.findByText('E2E Test Statement').should('be.visible');
    cy.url().should('match', /\/statement\/[\w-]+$/);
    
    // Vote on statement
    cy.findByRole('button', { name: /vote/i }).click();
    cy.findByRole('button', { name: /agree/i }).click();
    
    // Verify vote recorded
    cy.findByText(/your vote has been recorded/i).should('be.visible');
    cy.findByTestId('vote-count').should('contain', '1');
  });

  it('handles real-time updates', () => {
    cy.visit('/statement/test-statement-id');
    
    // Open in another window (simulated)
    cy.window().then((win) => {
      // Simulate another user voting
      cy.task('simulateVote', {
        statementId: 'test-statement-id',
        userId: 'other-user',
        vote: 1,
      });
    });
    
    // Verify real-time update
    cy.findByTestId('vote-count', { timeout: 10000 })
      .should('contain', '2'); // Our vote + simulated vote
  });

  it('handles offline mode', () => {
    cy.visit('/statement/test-statement-id');
    
    // Go offline
    cy.intercept('*', { forceNetworkError: true }).as('offline');
    
    // Try to vote
    cy.findByRole('button', { name: /vote/i }).click();
    cy.findByRole('button', { name: /agree/i }).click();
    
    // Should show offline message
    cy.findByText(/you are offline/i).should('be.visible');
    
    // Go back online
    cy.intercept('*').as('online');
    
    // Vote should be synced
    cy.findByText(/vote synced/i, { timeout: 10000 }).should('be.visible');
  });
});
```

### 4.3 Visual Regression Testing

```typescript
// cypress/e2e/visual-regression.cy.ts
describe('Visual Regression Tests', () => {
  beforeEach(() => {
    cy.login();
  });

  it('captures statement page appearance', () => {
    cy.visit('/statement/test-statement-id');
    cy.wait(1000); // Wait for animations
    
    // Take screenshot
    cy.screenshot('statement-page', {
      capture: 'viewport',
      overwrite: true,
    });
    
    // Compare with baseline
    cy.compareSnapshot('statement-page', {
      threshold: 0.1, // 10% difference allowed
    });
  });

  it('captures mobile view', () => {
    cy.viewport('iphone-x');
    cy.visit('/');
    
    cy.screenshot('home-mobile', {
      capture: 'viewport',
      overwrite: true,
    });
    
    cy.compareSnapshot('home-mobile', {
      threshold: 0.1,
    });
  });
});
```

## 5. Test Utilities

### 5.1 Custom Render Function

```typescript
// src/test-utils/render.tsx
import { render as rtlRender } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '@/redux/store';
import { AuthProvider } from '@/context/AuthContext';

interface RenderOptions {
  preloadedState?: any;
  store?: any;
  route?: string;
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({ reducer: rootReducer, preloadedState }),
    route = '/',
    ...renderOptions
  }: RenderOptions = {}
) {
  window.history.pushState({}, 'Test page', route);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <BrowserRouter>
          <AuthProvider>
            {children}
          </AuthProvider>
        </BrowserRouter>
      </Provider>
    );
  }

  return {
    store,
    ...rtlRender(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
```

### 5.2 Mock Factories

```typescript
// src/test-utils/factories.ts
import { Statement, User, Vote } from '@/types';

export const createMockUser = (overrides?: Partial<User>): User => ({
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  createdAt: Date.now(),
  ...overrides,
});

export const createMockStatement = (overrides?: Partial<Statement>): Statement => ({
  statementId: 'test-statement-id',
  statement: 'Test statement',
  description: 'Test description',
  createdBy: 'test-user-id',
  createdAt: Date.now(),
  lastUpdate: Date.now(),
  parentId: null,
  statementType: 'option',
  consensus: 0,
  ...overrides,
});

export const createMockVote = (overrides?: Partial<Vote>): Vote => ({
  voteId: 'test-vote-id',
  statementId: 'test-statement-id',
  userId: 'test-user-id',
  vote: 1,
  createdAt: Date.now(),
  ...overrides,
});
```

## 6. Testing Best Practices

### 6.1 Test Structure

```typescript
// Follow AAA pattern
describe('Component/Feature', () => {
  it('should do something', () => {
    // Arrange
    const props = { /* setup */ };
    
    // Act
    const result = doSomething(props);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

### 6.2 Testing Checklist

```markdown
## Component Testing Checklist

- [ ] Renders correctly with default props
- [ ] Handles all prop variations
- [ ] Responds to user interactions
- [ ] Updates state correctly
- [ ] Calls callbacks with correct arguments
- [ ] Handles edge cases (null, undefined, empty)
- [ ] Is accessible (ARIA attributes, keyboard nav)
- [ ] Has proper error boundaries
- [ ] Matches snapshot (if applicable)
```

### 6.3 Coverage Goals

```json
// jest.config.json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    },
    "src/components/": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  }
}
```

## 7. CI/CD Integration

### 7.1 GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit -- --coverage
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
      
      - name: Run E2E tests
        run: |
          npm run build
          npm run preview &
          npx wait-on http://localhost:4173
          npm run test:e2e
```

## Implementation Timeline

### Week 1: Foundation
- Set up testing infrastructure
- Create test utilities and helpers
- Write first unit tests for core components

### Week 2: Component Testing
- Test all UI components
- Test custom hooks
- Achieve 80% coverage for components

### Week 3: Integration Testing
- Test Redux slices
- Test Firebase operations
- Test API integrations

### Week 4: E2E Testing
- Set up Cypress
- Write critical user flow tests
- Add visual regression tests

### Ongoing: Maintenance
- Require tests for all new features
- Maintain coverage above 80%
- Regular test refactoring

This comprehensive testing strategy will ensure code quality, prevent regressions, and enable confident refactoring and feature development.