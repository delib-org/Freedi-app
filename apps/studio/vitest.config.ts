import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Studio unit tests — jsdom + Testing Library. Mirrors vite.config.ts aliases
// so components resolve the shared workspace packages from source.
// vitest, jsdom and @testing-library/react are resolved from the repo-root
// node_modules; `react`/`react-dom` are pinned to that same copy so the
// components, the shared packages and Testing Library share one React.
const rootModules = path.resolve(__dirname, '../../node_modules');
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			react: path.join(rootModules, 'react'),
			'react-dom': path.join(rootModules, 'react-dom'),
			'@': path.resolve(__dirname, './src'),
			'@freedi/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
			'@freedi/event-core': path.resolve(__dirname, '../../packages/event-core/src'),
			'@freedi/shared-i18n': path.resolve(__dirname, '../../packages/shared-i18n/src'),
			'@freedi/shared-styles': path.resolve(__dirname, '../../packages/shared-styles/src'),
		},
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.{ts,tsx}'],
	},
});
