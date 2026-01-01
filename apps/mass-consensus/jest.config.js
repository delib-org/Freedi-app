/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@freedi/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    // i18n mocks
    '^@freedi/shared-i18n/next$': '<rootDir>/src/__mocks__/shared-i18n.ts',
    '^@freedi/shared-i18n$': '<rootDir>/src/__mocks__/shared-i18n.ts',
    // CSS Modules - mock with identity-obj-proxy style
    '\\.module\\.(css|scss|sass)$': 'identity-obj-proxy',
    // Regular CSS - mock as empty module
    '\\.(css|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.js',
    // Static assets - mock
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupTests.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

module.exports = config;
