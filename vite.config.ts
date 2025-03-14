import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import pkg from './package.json';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {

	const isTestMode = mode === 'testing';

	// Read custom service worker content
	const customSWContent = fs.readFileSync(
		path.resolve(__dirname, 'public/custom-sw.js'),
		'utf-8'
	);

	return {
		plugins: [
			react(),
			svgr({
				include: '**/*.svg?react',
			}),
			VitePWA({
				registerType: 'prompt',
				includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
				manifest: false, // We're using our own manifest file
				strategies: 'injectManifest',
				srcDir: 'src',
				filename: 'sw.js',
				injectRegister: false, // We'll register the service worker manually
				workbox: {
					// Don't cache firebase messaging service worker
					globIgnores: ['firebase-messaging-sw.js'],
					// Force update on any content change
					clientsClaim: true,
					skipWaiting: true,
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
									maxAgeSeconds: 60, // Cache HTML for only 1 minute
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
									maxAgeSeconds: 60 * 60, // 1 hour
								}
							}
						}
					]
				},
				// Append our custom service worker code to the generated one
				injectManifest: {
					injectionPoint: null,
					additionalManifestEntries: [],
					additionalPrecacheEntries: [],
					maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
					transformManifest: (manifest) => manifest,
					additionalServiceWorkerCode: customSWContent
				}
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
			cssCodeSplit: false, // Extract all CSS into a single file
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						// React and core dependencies - should be bundled together
						if (id.includes('node_modules/react/') || 
							id.includes('node_modules/react-dom/') ||
							id.includes('node_modules/scheduler/') ||
							id.includes('node_modules/react-router') ||
							id.includes('node_modules/react-redux') ||
							id.includes('node_modules/@reduxjs/toolkit')) {
							return 'vendor-react';
						}
						
						// Handle other node_modules
						if (id.includes('node_modules')) {
							return 'vendor-other';
						}
						
						// Mass consensus section
						if (id.includes('/view/pages/massConsensus/')) {
							return 'mass-consensus';
						}
						
						// Start page section
						if (id.includes('/view/pages/start/Start')) {
							return 'start-page';
						}
						
						// CSS styles
						if (id.includes('.scss') || id.includes('.css')) {
							return 'styles';
						}
						
						// All other app code in a single chunk
						return 'main-app';
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