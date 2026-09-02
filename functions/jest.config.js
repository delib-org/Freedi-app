module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/fn_httpRequests.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  clearMocks: true,
  // Ignore duplicate @freedi/shared-types package to avoid Haste module collision
  modulePathIgnorePatterns: ['<rootDir>/package/'],
  // The deliberation brain is consumed as a packed tgz at deploy time; tests
  // resolve it from the workspace source so they never depend on a repack.
  moduleNameMapper: {
    '^@freedi/deliberation-brain$': '<rootDir>/../packages/deliberation-brain/src/index.ts',
  },
  // Setup file to mock Firebase before tests (for tests that don't provide their own mocks)
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
