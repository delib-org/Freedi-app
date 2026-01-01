import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import pkg from './package.json';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const isTestMode = mode === 'testing';
	const isTestMinified = mode === 'test-minified';
	const isProdUnminified = mode === 'prod-unminified';

	return {
		envDir: './env',
		plugins: [
			react(),
			svgr({
				include: '**/*.svg?react',
			}),
			VitePWA({
				registerType: 'prompt', // Change from autoUpdate to prompt
				includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
				manifest: false, // We're using our own manifest file
				strategies: 'injectManifest',
				srcDir: 'src',
				filename: 'sw.js',
				injectRegister: false, // We'll register the service worker manually
				workbox: {
					// Don't cache firebase messaging service worker
					globIgnores: ['firebase-messaging-sw.js'],
					// Don't force immediate updates
					clientsClaim: false,
					skipWaiting: false,
					// Set a very short cache expiration for any HTML or API content
					// This ensures users always get the newest version
					runtimeCaching: [
						{
							urlPattern: /\.(?:html)$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'html-cache',
								expiration: {
									maxEntries: 10,
									maxAgeSeconds: 60 * 60, // Cache HTML for 1 hour instead of 1 minute
								},
							}
						},
						{
							urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'firebase-cache',
								expiration: {
									maxEntries: 10,
									maxAgeSeconds: 60 * 5, // 5 minutes
								},
								networkTimeoutSeconds: 10
							}
						},
						{
							urlPattern: /\.(?:js|css)$/,
							handler: 'StaleWhileRevalidate',
							options: {
								cacheName: 'static-resources',
								expiration: {
									maxEntries: 50,
									maxAgeSeconds: 60 * 60 * 24, // 24 hours for JS/CSS files
								}
							}
						}
					]
				},
				// Append our custom service worker code to the generated one
				injectManifest: {
					injectionPoint: null,
					additionalManifestEntries: [],
					maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
				}
			}),
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src'),
				'@freedi/shared-i18n': path.resolve(__dirname, './packages/shared-i18n/src'),
				'@freedi/shared-types': path.resolve(__dirname, './packages/shared-types/src'),
			},
		},
		optimizeDeps: {
			include: [
				'@tiptap/react',
				'@tiptap/starter-kit',
				'@tiptap/extension-placeholder',
			],
		},
		define: {
			'process.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
			// Only expose environment variables that start with VITE_
			...Object.keys(process.env)
				.filter(key => key.startsWith('VITE_'))
				.reduce((env, key) => {
					env[`process.env.${key}`] = JSON.stringify(process.env[key]);

					return env;
				}, {} as Record<string, string>),
		},
		build: {
			minify: (!isTestMode && !isProdUnminified) || isTestMinified, // Minify unless test mode or prod-unminified
			sourcemap: (isTestMode && !isTestMinified) || isProdUnminified, // Sourcemaps for test (non-minified) and prod-unminified
			cssCodeSplit: false, // Extract all CSS into a single file
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						// React core libraries and essential React dependencies
						// use-sync-external-store MUST be bundled with React to avoid initialization errors
						if (id.includes('node_modules/react/') ||
							id.includes('node_modules/react-dom/') ||
							id.includes('node_modules/react-router') ||
							id.includes('node_modules/use-sync-external-store') ||
							id.includes('node_modules/scheduler')) {
							return 'vendor-react';
						}
						// Firebase - large, only needed after auth
						if (id.includes('node_modules/firebase/') ||
							id.includes('node_modules/@firebase/')) {
							return 'vendor-firebase';
						}
						// Redux - state management
						if (id.includes('node_modules/@reduxjs/') ||
							id.includes('node_modules/react-redux/') ||
							id.includes('node_modules/redux')) {
							return 'vendor-redux';
						}
						// ReactFlow - only used in MindMap
						if (id.includes('node_modules/reactflow/') ||
							id.includes('node_modules/@reactflow/') ||
							id.includes('node_modules/dagre')) {
							return 'vendor-reactflow';
						}
						// TipTap editor - only used in suggestions
						if (id.includes('node_modules/@tiptap/') ||
							id.includes('node_modules/prosemirror')) {
							return 'vendor-editor';
						}
						// i18n - internationalization
						if (id.includes('node_modules/i18next') ||
							id.includes('node_modules/react-i18next')) {
							return 'vendor-i18n';
						}
						// Sentry - error monitoring
						if (id.includes('node_modules/@sentry/')) {
							return 'vendor-sentry';
						}
						// Markdown renderer
						if (id.includes('node_modules/react-markdown') ||
							id.includes('node_modules/remark') ||
							id.includes('node_modules/unified') ||
							id.includes('node_modules/micromark')) {
							return 'vendor-markdown';
						}
					},
					assetFileNames: (assetInfo) => {
						if (assetInfo.name?.endsWith('.css')) {
							return 'assets/style.[hash].css';
						}

						return 'assets/[name]-[hash][extname]';
					},
				},
			},
			chunkSizeWarningLimit: 500,
		},
	};
});