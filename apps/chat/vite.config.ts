import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler',
			},
		},
	},
	// firebase-admin is server-only; never let it leak into the client bundle.
	ssr: {
		external: ['firebase-admin'],
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
	},
});
