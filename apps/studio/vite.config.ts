import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Freedi Studio — Vite + React SPA.
// Aliases the shared workspace packages to their source so the app picks up
// changes without a rebuild (mirrors the main app's setup).
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@freedi/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
			'@freedi/event-core': path.resolve(__dirname, '../../packages/event-core/src'),
		},
	},
	build: {
		outDir: 'dist',
	},
});
