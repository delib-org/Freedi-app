import { type RefObject, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 600px)';
const SCROLL_THRESHOLD = 15;
const MIN_SCROLL_TOP = 60;
const COOLDOWN_MS = 350;
const HIDDEN_CLASS = 'page--header-hidden';
// Minimum scrollable distance (scrollHeight - clientHeight) required before hiding.
// Must be larger than the combined header height (~170px) so the user can still
// scroll back up after the header is hidden and the viewport grows.
const MIN_SCROLLABLE_DISTANCE = 250;

/**
 * Detects scroll direction on mobile and toggles a CSS class on the .page ancestor.
 * Uses imperative DOM manipulation to avoid React re-renders entirely.
 * Includes a cooldown to prevent flickering from layout-shift-induced scroll events.
 * Only activates after a real scroll gesture (touchmove) to ignore programmatic scrolls and taps.
 */
export function useHeaderHideOnScroll(scrollRef: RefObject<HTMLElement | null>): void {
	const lastScrollTop = useRef(0);
	const isHidden = useRef(false);
	const lastToggleTime = useRef(0);
	const isReady = useRef(false);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) return;

		const page = scrollElement.closest('.page');
		if (!page) return;

		const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);

		// Only activate on actual scroll gestures (touchmove), not taps (touchstart).
		// This ignores programmatic scrolls AND scroll caused by content changes after tapping send.
		let isTouching = false;

		const handleTouchStart = () => {
			isTouching = true;
		};

		const handleTouchMove = () => {
			if (!isReady.current && isTouching) {
				lastScrollTop.current = scrollElement.scrollTop;
				isReady.current = true;
			}
		};

		const handleTouchEnd = () => {
			isTouching = false;
		};

		scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true });
		scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true });
		scrollElement.addEventListener('touchend', handleTouchEnd, { passive: true });

		const showHeader = () => {
			if (!isHidden.current) return;
			isHidden.current = false;
			lastToggleTime.current = Date.now();
			page.classList.remove(HIDDEN_CLASS);

			requestAnimationFrame(() => {
				lastScrollTop.current = scrollElement.scrollTop;
			});
		};

		const hideHeader = () => {
			if (isHidden.current) return;
			isHidden.current = true;
			lastToggleTime.current = Date.now();
			page.classList.add(HIDDEN_CLASS);

			requestAnimationFrame(() => {
				lastScrollTop.current = scrollElement.scrollTop;
			});
		};

		const handleMediaChange = (e: MediaQueryListEvent) => {
			if (!e.matches) showHeader();
		};

		let ticking = false;

		const handleScroll = () => {
			if (!isReady.current || !mediaQuery.matches || ticking) return;

			if (Date.now() - lastToggleTime.current < COOLDOWN_MS) return;

			ticking = true;

			requestAnimationFrame(() => {
				const currentScrollTop = scrollElement.scrollTop;
				const diff = currentScrollTop - lastScrollTop.current;

				if (Math.abs(diff) > SCROLL_THRESHOLD) {
					const scrollableDistance = scrollElement.scrollHeight - scrollElement.clientHeight;

					if (diff > 0 && currentScrollTop > MIN_SCROLL_TOP && scrollableDistance > MIN_SCROLLABLE_DISTANCE) {
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
			isReady.current = false;
			scrollElement.removeEventListener('touchstart', handleTouchStart);
			scrollElement.removeEventListener('touchmove', handleTouchMove);
			scrollElement.removeEventListener('touchend', handleTouchEnd);
			scrollElement.removeEventListener('scroll', handleScroll);
			mediaQuery.removeEventListener('change', handleMediaChange);
			showHeader();
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
