import { useEffect, useState } from 'react';

/** Live `matchMedia` result; false during SSR / before the first effect. */
export function useMediaQuery(queryString: string): boolean {
	const [matches, setMatches] = useState(
		() => typeof window !== 'undefined' && window.matchMedia(queryString).matches,
	);

	useEffect(() => {
		const mql = window.matchMedia(queryString);
		const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
		setMatches(mql.matches);
		mql.addEventListener('change', handleChange);

		return () => mql.removeEventListener('change', handleChange);
	}, [queryString]);

	return matches;
}

/** Mirrors the shared-styles breakpoints (`mobile` ≤600, `tablet-and-below` ≤1024). */
export const MEDIA_MOBILE = '(max-width: 600px)';
export const MEDIA_TABLET_AND_BELOW = '(max-width: 1024px)';
