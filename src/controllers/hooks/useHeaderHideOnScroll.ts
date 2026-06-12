import { type RefObject, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 600px)';
const SCROLL_THRESHOLD = 15;
const MIN_SCROLL_TOP = 60;
const COOLDOWN_MS = 350;
const HIDDEN_CLASS = 'page__header--minimized';
// Minimum scrollable distance (scrollHeight - clientHeight) required before
// hiding. Collapsing frees real viewport height, which shrinks the remaining
// scrollable distance — keep this high enough that the user can always
// scroll back up to restore the header.
const MIN_SCROLLABLE_DISTANCE = 360;

/**
 * Detects scroll direction on mobile and toggles `page__header--minimized` on
 * the header: the full header is swapped for a slim mini title bar in a single
 * layout pass (the freed space goes to the content). Tapping the mini bar
 * restores the full header.
 * Includes a cooldown to prevent rapid toggling from momentum scroll events.
 * Arms only after a real user gesture (touchmove or wheel) so programmatic
 * scrolls — Virtuoso pinning, scrollIntoView — never trigger it.
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

		const header = page.querySelector('.page__header');
		if (!header) return;

		const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);

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

		// Mouse/trackpad scrolling arms the hook too — touch-only arming meant
		// the behavior never activated in desktop browsers at mobile widths.
		const handleWheel = () => {
			if (!isReady.current) {
				lastScrollTop.current = scrollElement.scrollTop;
				isReady.current = true;
			}
		};

		scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true });
		scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true });
		scrollElement.addEventListener('touchend', handleTouchEnd, { passive: true });
		scrollElement.addEventListener('wheel', handleWheel, { passive: true });

		const showHeader = () => {
			if (!isHidden.current) return;
			isHidden.current = false;
			lastToggleTime.current = Date.now();
			header.classList.remove(HIDDEN_CLASS);

			requestAnimationFrame(() => {
				lastScrollTop.current = scrollElement.scrollTop;
			});
		};

		const hideHeader = () => {
			if (isHidden.current) return;
			isHidden.current = true;
			lastToggleTime.current = Date.now();
			header.classList.add(HIDDEN_CLASS);

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

					if (
						diff > 0 &&
						currentScrollTop > MIN_SCROLL_TOP &&
						scrollableDistance > MIN_SCROLLABLE_DISTANCE
					) {
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

		// Tapping the mini bar restores the full header
		const miniBar = page.querySelector('.page__header__mini');
		miniBar?.addEventListener('click', showHeader);

		return () => {
			isReady.current = false;
			scrollElement.removeEventListener('touchstart', handleTouchStart);
			scrollElement.removeEventListener('touchmove', handleTouchMove);
			scrollElement.removeEventListener('touchend', handleTouchEnd);
			scrollElement.removeEventListener('wheel', handleWheel);
			scrollElement.removeEventListener('scroll', handleScroll);
			miniBar?.removeEventListener('click', showHeader);
			mediaQuery.removeEventListener('change', handleMediaChange);
			showHeader();
		};
	}, []);
}
