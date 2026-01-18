# Testing Guide for Freedi App

## Overview
The Freedi app uses Jest and React Testing Library for testing React components, Redux stores, hooks, and utility functions.

## Current Test Status
✅ **All tests passing**: 41 tests across 3 test suites
- Redux store tests: userDataSlice
- Utility tests: mathHelpers  
- Component tests: App component

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/utils/__tests__/mathHelpers.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should add"
```

## Test Structure

Tests are organized alongside the code they test using the `__tests__` folder convention:

```
src/
  components/
    ErrorBoundary/
      RootErrorBoundary.tsx
      __tests__/
        RootErrorBoundary.test.tsx
  utils/
    mathHelpers.ts
    __tests__/
      mathHelpers.test.ts
  redux/
    userData/
      userDataSlice.ts
      __tests__/
        userDataSlice.test.ts
```

## Writing Tests

### Component Tests
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<MyComponent onClick={handleClick} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Redux Store Tests
```typescript
import { configureStore } from '@reduxjs/toolkit';
import myReducer, { myAction } from '../mySlice';

describe('mySlice', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: { myFeature: myReducer }
    });
  });

  it('handles actions', () => {
    store.dispatch(myAction('payload'));
    const state = store.getState();
    expect(state.myFeature.value).toBe('payload');
  });
});
```

### Hook Tests
```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '../useMyHook';

describe('useMyHook', () => {
  it('returns initial value', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(0);
  });

  it('updates value', () => {
    const { result } = renderHook(() => useMyHook());
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.value).toBe(1);
  });
});
```

### Utility Function Tests
```typescript
import { myUtility } from '../myUtility';

describe('myUtility', () => {
  it('processes input correctly', () => {
    expect(myUtility('input')).toBe('output');
  });

  it('handles edge cases', () => {
    expect(myUtility(null)).toBe('default');
  });
});
```

## Test Helpers

The project includes test helpers in `src/test-utils/testHelpers.tsx`:

- `renderWithProviders`: Renders components with Redux store and Router
- `createMockStore`: Creates a mock Redux store with initial state
- Mock data factories for common data types
- Firebase mock utilities

Example usage:
```typescript
import { renderWithProviders } from '@/test-utils/testHelpers';

it('renders with store', () => {
  renderWithProviders(<MyComponent />, {
    preloadedState: {
      userData: { userQuestions: [] }
    }
  });
});
```

## Mocking

### Mocking Modules
```typescript
jest.mock('../myModule', () => ({
  myFunction: jest.fn(() => 'mocked value')
}));
```

### Mocking Firebase
```typescript
jest.mock('@/controllers/db/config', () => ({
  app: {},
  DB: {},
  auth: {
    currentUser: { uid: 'test-user' }
  }
}));
```

### Mocking Environment Variables
```typescript
beforeEach(() => {
  (global as any).import.meta.env.DEV = true;
});
```

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
2. **Use Testing Library Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Keep Tests Simple**: Each test should test one thing
4. **Use Descriptive Names**: Test names should clearly describe what is being tested
5. **Clean Up**: Use `beforeEach` and `afterEach` for setup and cleanup
6. **Mock External Dependencies**: Mock Firebase, API calls, and other external services
7. **Test Edge Cases**: Include tests for error states, empty states, and boundary conditions

## Coverage

Run coverage reports to identify untested code:

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory. Open `coverage/lcov-report/index.html` in a browser to view detailed coverage.

## Debugging Tests

### Run Single Test
```bash
npm test -- --testNamePattern="specific test name"
```

### Debug in VS Code
Add this configuration to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "${file}"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Common Issues

1. **Import.meta errors**: Ensure `setupTests.ts` properly mocks `import.meta`
2. **Firebase errors**: Mock Firebase services in test files
3. **Async errors**: Use `waitFor` for async operations
4. **State not updating**: Wrap state changes in `act()`

## CI/CD Integration

Tests are automatically run in CI/CD pipelines. Ensure all tests pass before merging:

```bash
npm run check-all
```

This runs linting, type checking, tests, and build.