/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	moduleNameMapper: {
		// Resolve the workspace sibling from source so tests never depend on a
		// stale packages/shared-types/dist build.
		'^@freedi/shared-types$': '<rootDir>/../shared-types/src/index.ts',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true } }],
	},
};
