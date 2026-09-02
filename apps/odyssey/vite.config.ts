import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Israeli Odyssey — Vite + React SPA (mirrors the studio app's setup).
// Shared workspace packages are aliased to source so changes are picked up
// without a package rebuild.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@freedi/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
			'@freedi/shared-types': path.resolve(
				__dirname,
				'../../packages/shared-types/src'
			),
		},
	},
	build: {
		outDir: 'dist',
	},
});
