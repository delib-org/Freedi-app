module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'\\.(css|less|scss|sass)$': 'identity-obj-proxy',
		'\\.(gif|ttf|eot|svg|png)$': 'jest-transform-stub',
	},
	transform: {
		'^.+\\.(ts|tsx)$': 'ts-jest',
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	testMatch: [
		'<rootDir>/src/**/__tests__/**/*.(ts|tsx|js)',
		'<rootDir>/src/**/?(*.)(spec|test).(ts|tsx|js)',
	],
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/main.tsx',
		'!src/vite-env.d.ts',
	],
	coverageReporters: ['text', 'lcov', 'html'],
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	watchPlugins: [
		'jest-watch-typeahead/filename',
		'jest-watch-typeahead/testname',
	],
};