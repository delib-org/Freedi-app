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
				'@freedi/shared-styles': path.resolve(__dirname, './packages/shared-styles/scss'),
			},
		},
		css: {
			preprocessorOptions: {
				scss: {
					includePaths: [path.resolve(__dirname, './packages/shared-styles/scss')],
				},
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
					manualChunks: {
						'vendor-react': ['react', 'react-dom', 'react-router'],
						// Removed statement manual chunking to allow better code splitting
						styles: ['./src/view/style/style.scss'],
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