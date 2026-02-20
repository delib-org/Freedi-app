import { type RefObject, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 600px)';
const SCROLL_THRESHOLD = 15;
const MIN_SCROLL_TOP = 60;
const COOLDOWN_MS = 350;
const HIDDEN_CLASS = 'page--header-hidden';

/**
 * Detects scroll direction on mobile and toggles a CSS class on the .page ancestor.
 * Uses imperative DOM manipulation to avoid React re-renders entirely.
 * Includes a cooldown to prevent flickering from layout-shift-induced scroll events.
 */
export function useHeaderHideOnScroll(scrollRef: RefObject<HTMLElement | null>): void {
	const lastScrollTop = useRef(0);
	const isHidden = useRef(false);
	const lastToggleTime = useRef(0);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) return;

		const page = scrollElement.closest('.page');
		if (!page) return;

		const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);

		const showHeader = () => {
			if (!isHidden.current) return;
			isHidden.current = false;
			lastToggleTime.current = Date.now();
			page.classList.remove(HIDDEN_CLASS);

			// Reset scroll reference after layout settles to prevent feedback loop
			requestAnimationFrame(() => {
				lastScrollTop.current = scrollElement.scrollTop;
			});
		};

		const hideHeader = () => {
			if (isHidden.current) return;
			isHidden.current = true;
			lastToggleTime.current = Date.now();
			page.classList.add(HIDDEN_CLASS);

			// Reset scroll reference after layout settles to prevent feedback loop
			requestAnimationFrame(() => {
				lastScrollTop.current = scrollElement.scrollTop;
			});
		};

		const handleMediaChange = (e: MediaQueryListEvent) => {
			if (!e.matches) showHeader();
		};

		let ticking = false;

		const handleScroll = () => {
			if (!mediaQuery.matches || ticking) return;

			// Ignore scroll events during cooldown after a toggle
			if (Date.now() - lastToggleTime.current < COOLDOWN_MS) return;

			ticking = true;

			requestAnimationFrame(() => {
				const currentScrollTop = scrollElement.scrollTop;
				const diff = currentScrollTop - lastScrollTop.current;

				if (Math.abs(diff) > SCROLL_THRESHOLD) {
					if (diff > 0 && currentScrollTop > MIN_SCROLL_TOP) {
						hideHeader();
					} else if (diff < 0) {
						showHeader();
					}
					lastScrollTop.current = currentScrollTop;
				}

				ticking = false;
			});
		};

		scrollElement.addEventListener('scroll', handleScroll, { passive: true });
		mediaQuery.addEventListener('change', handleMediaChange);

		return () => {
			scrollElement.removeEventListener('scroll', handleScroll);
			mediaQuery.removeEventListener('change', handleMediaChange);
			showHeader();
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
