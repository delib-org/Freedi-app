/**
 * Jest Setup File
 * Runs before each test file
 */

import '@testing-library/jest-dom';

// Mock console.error to capture error logs in tests
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console.error unless explicitly testing it
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// Add custom matchers if needed
expect.extend({
  toBeValidTimestamp(received: number) {
    const pass = typeof received === 'number' && received > 0 && received <= Date.now() + 60000;
    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid timestamp`
          : `expected ${received} to be a valid timestamp`,
      pass,
    };
  },
});

// Type declaration for custom matchers
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeValidTimestamp(): R;
    }
  }
}
