import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Freedi Studio — Vite + React SPA.
// Aliases the shared workspace packages to their source so the app picks up
// changes without a rebuild (mirrors the main app's setup).
// `@freedi/shared-i18n` is a prefix alias, so `@freedi/shared-i18n/react`
// resolves to `packages/shared-i18n/src/react` (its index.ts) as well.
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@freedi/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
			'@freedi/event-core': path.resolve(__dirname, '../../packages/event-core/src'),
			'@freedi/shared-i18n': path.resolve(__dirname, '../../packages/shared-i18n/src'),
			'@freedi/shared-styles': path.resolve(__dirname, '../../packages/shared-styles/src'),
		},
	},
	build: {
		outDir: 'dist',
	},
});
