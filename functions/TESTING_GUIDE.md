# Testing Guide for Refactored HTTP Requests

## Architecture Overview

The refactored code follows a clean architecture pattern with clear separation of concerns:

```
src/
├── controllers/          # HTTP request handling & validation
│   ├── statementController.ts
│   └── maintenanceController.ts
├── services/            # Business logic
│   ├── statements/
│   │   └── statementService.ts
│   └── maintenance/
│       └── maintenanceService.ts
├── utils/               # Reusable utilities
│   ├── arrayUtils.ts
│   └── validation.ts
└── fn_httpRequests_refactored.ts  # Main entry point
```

## Testing Strategy

### 1. Unit Tests
Test individual components in isolation using mocks.

### 2. Integration Tests
Test how components work together.

### 3. End-to-End Tests
Test the complete flow from HTTP request to response.

## Setting Up Testing

### Install Test Dependencies

```bash
cd functions
npm install --save-dev jest @types/jest ts-jest @firebase/testing firebase-functions-test
```

### Configure Jest

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
```

### Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:specific": "jest --testNamePattern"
  }
}
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test
```bash
npm test -- --testNamePattern="should fetch user options"
```

### Run Tests for a Specific File
```bash
npm test -- statementService.test.ts
```

## Test Examples Explained

### 1. Testing Services (Business Logic)

**File:** `src/services/statements/__tests__/statementService.test.ts`

#### Key Testing Concepts:

```typescript
describe('StatementService', () => {
  let statementService: StatementService;
  let mockCollection: any;

  beforeEach(() => {
    // 1. Create fresh instance for each test
    statementService = new StatementService();

    // 2. Mock external dependencies
    mockCollection = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    // 3. Clear mocks between tests
    jest.clearAllMocks();
  });

  it('should fetch user options with correct filters', async () => {
    // Arrange - Set up test data
    const mockDocs = [/* ... */];
    mockQuery.get.mockResolvedValue({ docs: mockDocs });

    // Act - Execute the function
    const result = await statementService.getUserOptions(/* ... */);

    // Assert - Verify the results
    expect(mockCollection.where).toHaveBeenCalledWith(/* ... */);
    expect(result).toHaveLength(2);
  });
});
```

**What We're Testing:**
- Correct database queries are made
- Data transformation works properly
- Edge cases are handled
- Errors are propagated correctly

### 2. Testing Controllers (HTTP Layer)

**File:** `src/controllers/__tests__/statementController.test.ts`

#### Key Testing Concepts:

```typescript
describe('StatementController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    // Mock HTTP request
    mockRequest = {
      query: { userId: 'user123' }
    };

    // Mock HTTP response
    mockResponse = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('should return 400 when validation fails', async () => {
    // Test input validation
    mockRequest.query = {}; // Missing required fields

    await controller.getUserOptions(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });
});
```

**What We're Testing:**
- Request validation
- HTTP status codes
- Response format
- Error handling

### 3. Testing Utilities

**File:** `src/utils/__tests__/arrayUtils.test.ts`

#### Key Testing Concepts:

```typescript
describe('shuffleArray', () => {
  it('should not mutate original array', () => {
    const original = [1, 2, 3];
    const originalCopy = [...original];

    shuffleArray(original);

    expect(original).toEqual(originalCopy);
  });

  it('should produce different orders (statistically)', () => {
    // Test randomness by running multiple times
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(JSON.stringify(shuffleArray([1,2,3,4,5])));
    }
    expect(results.size).toBeGreaterThan(10);
  });
});
```

**What We're Testing:**
- Pure functions don't have side effects
- Randomness works correctly
- Edge cases (empty arrays, single elements)

## Mocking Strategies

### 1. Mock Firebase Admin

```typescript
jest.mock('../../../index', () => ({
  db: {
    collection: jest.fn(),
    batch: jest.fn(),
  },
}));
```

### 2. Mock External Modules

```typescript
jest.mock('../../../utils/arrayUtils', () => ({
  shuffleArray: jest.fn((arr) => [...arr].reverse()),
}));
```

### 3. Mock Service Dependencies

```typescript
const mockService = new StatementService() as jest.Mocked<StatementService>;
mockService.getUserOptions = jest.fn().mockResolvedValue([]);
```

## Testing Best Practices

### 1. AAA Pattern
- **Arrange:** Set up test data and mocks
- **Act:** Execute the function being tested
- **Assert:** Verify the results

### 2. Test Isolation
- Each test should be independent
- Use `beforeEach` to reset state
- Clean up after tests with `afterEach`

### 3. Descriptive Test Names
```typescript
it('should return empty array when no options found', ...)
it('should cap limit at 50 when exceeds maximum', ...)
```

### 4. Test Edge Cases
- Empty inputs
- Invalid inputs
- Boundary values
- Error conditions

### 5. Use Type-Safe Mocks
```typescript
const mockService = new StatementService() as jest.Mocked<StatementService>;
```

## Coverage Goals

Aim for:
- **80%+ Statement Coverage:** Most lines are executed
- **70%+ Branch Coverage:** Most if/else paths are tested
- **90%+ Function Coverage:** Most functions are tested

View coverage report:
```bash
npm run test:coverage
open coverage/html/index.html
```

## Common Testing Scenarios

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const promise = service.asyncMethod();
  await expect(promise).resolves.toEqual(expectedValue);
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  mockService.method = jest.fn().mockRejectedValue(new Error('Failed'));

  await controller.handleRequest(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.send).toHaveBeenCalledWith({
    error: 'Failed',
    ok: false
  });
});
```

### Testing Database Queries

```typescript
it('should build correct query', async () => {
  await service.getStatements({ parentId: '123' });

  expect(mockQuery.where).toHaveBeenCalledWith('parentId', '==', '123');
  expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  expect(mockQuery.limit).toHaveBeenCalledWith(10);
});
```

## Debugging Tests

### Run Single Test with Debugging
```bash
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

### Use Console Logs in Tests
```typescript
it('debug test', () => {
  console.log('Current value:', value);
  // ...
});
```

### Check Mock Calls
```typescript
console.log(mockFunction.mock.calls); // All calls
console.log(mockFunction.mock.calls[0]); // First call arguments
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Test Functions
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd functions && npm ci
      - run: cd functions && npm test
      - run: cd functions && npm run test:coverage
```

## Troubleshooting

### Issue: "Cannot find module"
**Solution:** Check your import paths and ensure TypeScript paths are configured correctly.

### Issue: "Timeout exceeded"
**Solution:** Increase Jest timeout for async tests:
```typescript
jest.setTimeout(10000); // 10 seconds
```

### Issue: "Firebase not initialized"
**Solution:** Mock Firebase properly:
```typescript
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  // ...
}));
```

## Summary

This refactored architecture provides:
1. **Better testability** through dependency injection
2. **Clear separation of concerns** between layers
3. **Reusable components** that can be tested in isolation
4. **Comprehensive test coverage** ensuring reliability

Remember: Good tests are documentation that never goes out of date!