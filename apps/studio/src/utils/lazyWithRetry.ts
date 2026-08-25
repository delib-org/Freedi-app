import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'studio-chunk-reload';

/**
 * Whether an error is a failed dynamic `import()` — the signature of a tab
 * that loaded a previous deploy and now asks for a chunk that no longer
 * exists on hosting (Firebase's SPA rewrite answers with index.html).
 */
export function isChunkLoadError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? '');

	return (
		/Failed to fetch dynamically imported module/i.test(message) ||
		/Importing a module script failed/i.test(message) ||
		/Loading chunk [\w-]+ failed/i.test(message) ||
		/Expected a JavaScript-or-Wasm module script/i.test(message)
	);
}

function readFlag(): string | null {
	try {
		return sessionStorage.getItem(RELOAD_FLAG);
	} catch {
		return null;
	}
}

function writeFlag(value: string | null): void {
	try {
		if (value === null) sessionStorage.removeItem(RELOAD_FLAG);
		else sessionStorage.setItem(RELOAD_FLAG, value);
	} catch {
		// sessionStorage unavailable — reload once without the guard
	}
}

/**
 * `React.lazy` that reloads the page once when a chunk fails to load, so a
 * user who kept a tab open across a deploy gets the new build instead of a
 * blank page. A per-tab flag prevents a reload loop; if the chunk still fails
 * after the reload the error propagates to the error boundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
	factory: () => Promise<{ default: T }>,
	chunkName: string,
): LazyExoticComponent<T> {
	return lazy(async () => {
		try {
			const module = await factory();
			if (readFlag() === chunkName) writeFlag(null);

			return module;
		} catch (error) {
			if (isChunkLoadError(error) && readFlag() !== chunkName) {
				writeFlag(chunkName);
				window.location.reload();
				// Keep the Suspense fallback on screen until the reload lands.
				await new Promise<never>(() => undefined);
			}
			throw error;
		}
	});
}
