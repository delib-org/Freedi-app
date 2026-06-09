import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// adapter-node: small (~1-2KB) runtime; the handler is wrapped by the
		// `ssrChat` onRequest Cloud Function for hosting (see firebase.json).
		adapter: adapter({ out: 'build' }),
		// `@freedi/evidence` and `@freedi/shared-types` resolve via the installed
		// `file:` deps → their built `dist` (+ .d.ts). Mirrors the functions
		// tarball workflow; rebuild the packages after editing their source.
	},
};

export default config;
