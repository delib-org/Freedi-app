module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	moduleNameMapper: {
		'^@freedi/shared-types$': '<rootDir>/../shared-types/src/index.ts',
	},
};
