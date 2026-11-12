import { useEffect, useState } from 'react';

/** Matches the `max-width: 767px` phone breakpoint the map styles already use. */
export const PHONE_VIEWPORT_QUERY = '(max-width: 767px)';

/**
 * True while the viewport is phone-sized. Lets a component swap a floating
 * panel for a bottom sheet without duplicating the breakpoint in JS.
 */
export function useIsPhoneViewport(): boolean {
	const [isPhone, setIsPhone] = useState(
		() => window.matchMedia?.(PHONE_VIEWPORT_QUERY).matches ?? false,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia?.(PHONE_VIEWPORT_QUERY);
		if (!mediaQuery) return;

		const handleChange = (event: MediaQueryListEvent): void => {
			setIsPhone(event.matches);
		};

		setIsPhone(mediaQuery.matches);
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	}, []);

	return isPhone;
}
