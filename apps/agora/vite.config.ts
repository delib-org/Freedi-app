/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

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
    {
      // A production-build service worker once registered on this origin
      // pins every browser to its stale precache (dev changes "never
      // arrive"). Serving a kill-switch /sw.js lets the old worker's
      // auto-update check replace itself with one that unregisters and
      // reloads — a single refresh heals any poisoned browser/profile.
      name: 'agora-dev-sw-killswitch',
      apply: 'serve' as const,
      configureServer(server) {
        server.middlewares.use('/sw.js', (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            'self.addEventListener("install",()=>self.skipWaiting());' +
              'self.addEventListener("activate",e=>{e.waitUntil(' +
              'self.registration.unregister()' +
              '.then(()=>self.clients.matchAll({type:"window"}))' +
              '.then(clients=>{clients.forEach(client=>client.navigate(client.url));})' +
              ');});',
          );
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Large illustrations (home hero + scene artwork) load on demand — cache
        // them at runtime rather than bloating the install precache.
        globIgnores: ['**/scenes/**', 'time-machine.webp'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            // Bundled illustrations: home hero + scene media (images + video)
            urlPattern: /(?:\/scenes\/.*|\/time-machine)\.(?:png|jpe?g|webp|gif|mp4|webm|mov)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'agora-scene-cache',
              rangeRequests: true,
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Teacher-uploaded scene videos + era artwork — cache aggressively
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'agora-media-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'Agora — משחק דיוני',
        short_name: 'Agora',
        description: 'Classroom deliberative time-tunnel game',
        theme_color: '#141126',
        background_color: '#141126',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
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
    port: 3009,
  },
});
