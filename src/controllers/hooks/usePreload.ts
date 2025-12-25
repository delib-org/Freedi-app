import { useCallback } from 'react';

// Preload functions for lazy-loaded routes
const preloadFunctions = {
	statement: () => import('@/view/pages/statement/StatementMain'),
	home: () => import('@/view/pages/home/Home'),
	my: () => import('@/view/pages/my/My'),
	mySuggestions: () => import('@/view/pages/my-suggestions/MySuggestions'),
	settings: () =>
		import(
			'@/view/pages/statement/components/settings/StatementSettings'
		),
	mindMap: () =>
		import(
			'@/view/pages/statement/components/map/MindMap'
		),
	chat: () =>
		import(
			'@/view/pages/statement/components/chat/Chat'
		),
} as const;

type PreloadKey = keyof typeof preloadFunctions;

// Track what's already been preloaded
const preloadedChunks = new Set<PreloadKey>();

/**
 * Hook for preloading route chunks on hover/focus
 *
 * Usage:
 * ```tsx
 * const { preload, preloadOnHover } = usePreload();
 *
 * <Link to="/statement/123" {...preloadOnHover('statement')}>
 *   View Statement
 * </Link>
 * ```
 */
export function usePreload() {
	const preload = useCallback((key: PreloadKey) => {
		if (preloadedChunks.has(key)) {
			return;
		}

		preloadedChunks.add(key);
		preloadFunctions[key]();
	}, []);

	const preloadOnHover = useCallback(
		(key: PreloadKey) => ({
			onMouseEnter: () => preload(key),
			onFocus: () => preload(key),
		}),
		[preload]
	);

	return {
		preload,
		preloadOnHover,
	};
}

/**
 * Preload a specific chunk immediately (useful for predictive loading)
 */
export function preloadChunk(key: PreloadKey): void {
	if (preloadedChunks.has(key)) {
		return;
	}

	preloadedChunks.add(key);
	preloadFunctions[key]();
}

/**
 * Preload multiple chunks at once
 */
export function preloadChunks(keys: PreloadKey[]): void {
	keys.forEach((key) => preloadChunk(key));
}

export default usePreload;
