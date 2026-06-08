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
	// `@freedi/shared-i18n` ships raw TS (+ JSON) from `src/`, so Vite must
	// transform it for SSR rather than externalize it as a runtime `import`.
	ssr: {
		external: ['firebase-admin'],
		noExternal: ['@freedi/shared-i18n'],
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
	},
});
