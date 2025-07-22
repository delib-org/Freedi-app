# Freedi App Testing Guide

## Testing Infrastructure

### Available Tools
- **Jest** - Test runner and assertion library
- **React Testing Library** - Component testing utilities
- **MSW** - API mocking (setup required: `npm install --save-dev msw`)
- **Custom test utilities** - Located in `src/test-utils/`

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Run specific test
npm test -- Loader.test

# Run tests in functions directory
cd functions && npm test
```

## Writing Tests

### 1. Component Tests

#### Simple Component
```typescript
import { render, screen } from '@testing-library/react';
import Component from './Component';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });
});
```

#### Component with Redux
```typescript
import { render, screen } from '@/test-utils/test-utils';
import Component from './Component';

describe('Component with Redux', () => {
  it('renders with preloaded state', () => {
    render(<Component />, {
      preloadedState: {
        auth: { user: mockUser },
      },
    });
    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
  });
});
```

#### Component with User Interaction
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Component from './Component';

describe('Interactive Component', () => {
  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    
    render(<Component onClick={handleClick} />);
    
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### 2. Redux Slice Tests

```typescript
import { configureStore } from '@reduxjs/toolkit';
import sliceReducer, { action } from './slice';

describe('slice', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: { slice: sliceReducer },
    });
  });

  it('handles action', () => {
    store.dispatch(action(payload));
    const state = store.getState().slice;
    expect(state.property).toBe(expectedValue);
  });
});
```

### 3. API Tests with MSW

```typescript
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import { fetchData } from './api';

describe('API calls', () => {
  it('handles successful response', async () => {
    server.use(
      http.get('/api/data', () => {
        return HttpResponse.json({ data: 'test' });
      })
    );

    const result = await fetchData();
    expect(result.data).toBe('test');
  });

  it('handles error response', async () => {
    server.use(
      http.get('/api/data', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    await expect(fetchData()).rejects.toThrow();
  });
});
```

### 4. Firebase Tests

```typescript
import { setupFirebaseMocks, mockFirebaseUser } from '@/test-utils/firebase-test-utils';
import { getCurrentUser } from './auth';

// Setup mocks before importing modules that use Firebase
setupFirebaseMocks();

describe('Firebase Auth', () => {
  it('gets current user', async () => {
    const user = await getCurrentUser();
    expect(user.uid).toBe(mockFirebaseUser.uid);
  });
});
```

## Best Practices

### 1. Test Organization
- Place test files next to the code they test
- Use `.test.ts(x)` or `.spec.ts(x)` suffix
- Group related tests with `describe` blocks

### 2. Test Structure
```typescript
describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // Common setup
  });

  // Group related tests
  describe('when condition', () => {
    it('does something', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### 3. What to Test
- User interactions and outcomes
- Component rendering with different props
- Edge cases and error states
- State changes in Redux
- API integration points

### 4. What NOT to Test
- Implementation details
- Third-party libraries
- Styles (unless critical)
- Framework internals

### 5. Testing Checklist
- [ ] Component renders without crashing
- [ ] User interactions work as expected
- [ ] Error states are handled
- [ ] Loading states are shown
- [ ] Accessibility requirements are met
- [ ] Redux actions update state correctly
- [ ] API calls handle success and failure

## Common Testing Patterns

### Testing Async Operations
```typescript
it('loads data', async () => {
  render(<Component />);
  
  // Wait for async operation
  await waitFor(() => {
    expect(screen.getByText('Loaded data')).toBeInTheDocument();
  });
});
```

### Testing Conditional Rendering
```typescript
it('shows content when condition is true', () => {
  render(<Component showContent={true} />);
  expect(screen.getByText('Content')).toBeInTheDocument();
});

it('hides content when condition is false', () => {
  render(<Component showContent={false} />);
  expect(screen.queryByText('Content')).not.toBeInTheDocument();
});
```

### Testing Form Submission
```typescript
it('submits form with data', async () => {
  const user = userEvent.setup();
  const handleSubmit = jest.fn();
  
  render(<Form onSubmit={handleSubmit} />);
  
  await user.type(screen.getByLabelText('Name'), 'John Doe');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  
  expect(handleSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
  });
});
```

## Debugging Tests

- Use `screen.debug()` to see rendered output
- Use `screen.logTestingPlaygroundURL()` for interactive debugging
- Check test coverage with `npm run test:coverage`
- Use `test.only()` to run single test during development
- Use `describe.skip()` to temporarily skip test suites

## Next Steps

1. Start with simple component tests
2. Add tests for critical user flows
3. Achieve 50% coverage, then aim for 80%
4. Set up pre-commit hooks to run tests
5. Add tests to CI/CD pipeline