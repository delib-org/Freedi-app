/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
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
      '@freedi/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
    },
  },

  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase-sdk';
          }

          return undefined;
        },
      },
    },
  },
});
