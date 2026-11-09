import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import { UI } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { getHeaderElements, syncStatusBarColor } from '@/utils/systemBarSync';

const THEME_ATTRIBUTES = ['data-theme', 'data-contrast', 'data-brand'];
const HEADER_ATTRIBUTES = ['class', 'style'];
const MEDIA_QUERIES = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'];

/**
 * Keeps the installed app's status bar (`<meta name="theme-color">`) the same
 * colour as the header on screen. Mounted once near the app root.
 *
 * Re-reads the colour on: route change (and once more after a short settle,
 * because the statement and its header paint after the route), html theme
 * attributes, OS colour-scheme / contrast queries, resize, and class/style
 * changes on the header element itself (no subtree, so page animations cost
 * nothing). Everything is released on unmount.
 *
 * Limit: theme-color drives only the top bar. The Android navigation bar comes
 * from the manifest and is fixed at install or WebAPK refresh; iOS standalone
 * is unverified. See utils/systemBarSync.ts.
 */
export function useSystemBarColors(): void {
	const { pathname } = useLocation();
	const syncRef = useRef<() => void>(() => undefined);

	useEffect(() => {
		let headerObserver: MutationObserver | undefined;
		let frame: number | undefined;

		const bindHeaderObserver = (): void => {
			headerObserver?.disconnect();
			headerObserver = new MutationObserver(sync);
			getHeaderElements(document).forEach((element) =>
				headerObserver?.observe(element, { attributes: true, attributeFilter: HEADER_ATTRIBUTES }),
			);
		};

		function sync(): void {
			try {
				syncStatusBarColor(document, window);
				bindHeaderObserver();
			} catch (error) {
				logError(error, { operation: 'hooks.useSystemBarColors.sync' });
			}
		}

		const scheduleSync = (): void => {
			if (frame !== undefined) return;
			frame = window.requestAnimationFrame(() => {
				frame = undefined;
				sync();
			});
		};

		syncRef.current = sync;

		const themeObserver = new MutationObserver(sync);

		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: THEME_ATTRIBUTES,
		});

		const queries = MEDIA_QUERIES.map((query) => window.matchMedia(query));

		queries.forEach((query) => query.addEventListener('change', sync));
		window.addEventListener('resize', scheduleSync);
		sync();

		return () => {
			syncRef.current = () => undefined;
			themeObserver.disconnect();
			headerObserver?.disconnect();
			queries.forEach((query) => query.removeEventListener('change', sync));
			window.removeEventListener('resize', scheduleSync);

			if (frame !== undefined) window.cancelAnimationFrame(frame);
		};
	}, []);

	// Route change: after the first paint, and again once the statement settled.
	useEffect(() => {
		const frame = window.requestAnimationFrame(() => syncRef.current());
		const settle = window.setTimeout(() => syncRef.current(), UI.DEBOUNCE_DELAY);

		return () => {
			window.cancelAnimationFrame(frame);
			window.clearTimeout(settle);
		};
	}, [pathname]);
}
