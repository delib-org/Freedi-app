/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { localePreload } from './vite-plugin-locale-preload';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },

  plugins: [
    localePreload(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually in src/index.ts via `virtual:pwa-register` so we can
      // swallow rejections from crawlers/sandboxed browsers where
      // `navigator.serviceWorker.register()` rejects (would otherwise surface as
      // unhandled promise rejections in Sentry).
      injectRegister: false,
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'icons/apple-touch-icon.png',
      ],
      workbox: {
        // Deliberately narrow. The previous pattern also matched `png`, which
        // pulled the 512×512 logos and the full PWA icon set into the
        // install-time precache — ~1.5 MB fetched the moment the page loaded,
        // in direct competition with the first Firestore read on a slow
        // connection. Images are still cached, just on first real use, by the
        // `image-cache` runtime rule below.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: [
          '**/*.map',
          'wizcol-logo-*',
          // Locale chunks other than the visitor's own, plus the deferred
          // error-reporting SDK. Precaching all seven languages would put
          // ~45 kB of dictionaries nobody will read back into the
          // install-time burst we just removed. They're hashed and immutable,
          // so the runtime rule below caches whichever ones actually get used.
          'assets/{ar,de,es,fa,he,nl}-*.js',
          'assets/sentryClient-*.js',
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        runtimeCaching: [
          {
            // The hashed chunks kept out of the precache above — locale
            // dictionaries and the Sentry SDK. Filenames carry a content hash
            // and are served immutable, so CacheFirst is safe: a new build
            // produces a new URL rather than a stale hit.
            urlPattern: ({ url, sameOrigin }) =>
              Boolean(sameOrigin) && /^\/assets\/.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'deferred-chunks',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(www\.)?googleapis\.com\/identitytoolkit\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          // The fonts.googleapis.com / fonts.gstatic.com rules that used to sit
          // here are gone: Assistant is self-hosted now (src/styles/_fonts.scss)
          // and its woff2 files are covered by the precache glob.
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
      manifest: {
        id: '/',
        name: 'WizCol-Join',
        short_name: 'WizCol-Join',
        description:
          'WizCol-Join — propose, evaluate and choose solutions together.',
        lang: 'en',
        dir: 'auto',
        theme_color: '#1f5895',
        background_color: '#1f5895',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'social', 'business'],
        icons: [
          {
            src: '/icons/icon-48.png',
            sizes: '48x48',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
  ],

  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        },
      },
    },
  },

  server: {
    port: 3007,
  },
});
