import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@freedi/shared-types': fileURLToPath(
				new URL('../shared-types/src/index.ts', import.meta.url),
			),
		},
	},
	test: {
		include: ['src/**/__tests__/**/*.test.ts'],
	},
});
