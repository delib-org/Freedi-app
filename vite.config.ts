import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import pkg from './package.json';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {

	const isTestMode = mode === 'testing';

	console.log('Build mode:', mode);
	console.log('Minification enabled:', !isTestMode);

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
			minify: !isTestMode, // Only minify when NOT on freedi-test.web.app
			sourcemap: isTestMode, // Only include sourcemaps on freedi-test.web.app
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
