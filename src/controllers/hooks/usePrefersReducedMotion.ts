import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Tracks the user's OS-level "reduce motion" setting so JS-driven animations
 * (FLIP glides, springs) can opt out the same way CSS `@media
 * (prefers-reduced-motion: reduce)` blocks do.
 */
export function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(
		() => window.matchMedia?.(QUERY).matches ?? false,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia?.(QUERY);
		if (!mediaQuery) return;

		const handleChange = (event: MediaQueryListEvent): void => {
			setPrefersReducedMotion(event.matches);
		};

		setPrefersReducedMotion(mediaQuery.matches);
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	}, []);

	return prefersReducedMotion;
}
