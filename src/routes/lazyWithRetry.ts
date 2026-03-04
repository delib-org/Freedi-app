import { lazy, ComponentType } from 'react';

const RELOAD_FLAG_PREFIX = 'chunk-reload:';

/**
 * Wraps React.lazy() with automatic retry on chunk load failures.
 * After a new deployment, old chunk files may no longer exist on the server.
 * This detects the failure and reloads the page once to fetch the new index.html
 * with correct chunk references.
 *
 * Uses sessionStorage to prevent infinite reload loops.
 */
export default function lazyWithRetry(
	importFn: () => Promise<{ default: ComponentType }>,
	chunkName?: string,
) {
	return lazy(() =>
		importFn().catch((error: unknown) => {
			const key = `${RELOAD_FLAG_PREFIX}${chunkName ?? 'unknown'}`;
			const hasReloaded = sessionStorage.getItem(key);

			if (!hasReloaded) {
				sessionStorage.setItem(key, 'true');
				window.location.reload();

				// Return a never-resolving promise to prevent rendering while reloading
				return new Promise(() => {});
			}

			// Already reloaded once — clear the flag and let the error propagate
			sessionStorage.removeItem(key);
			throw error;
		}),
	);
}
