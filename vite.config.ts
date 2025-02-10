import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import pkg from './package.json';

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [
			react(),
			svgr({
				include: '**/*.svg?react',
			}),
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src'),
			},
		},
		define: {
			'process.env': process.env,
			'process.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
		},
		build: {
			rollupOptions: {
				output: {
					manualChunks: {
						'vendor-react': ['react', 'react-dom', 'react-router'],
						statement: ['./src/view/pages/statement/StatementMain'],
					},
				},
			},
			chunkSizeWarningLimit: 500,
		},
	};
});
