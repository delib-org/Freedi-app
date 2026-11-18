import { TIME } from '@/constants/common';

/**
 * How long after `load` optional work waits before it may start. The `load`
 * event fires as soon as the small app shell arrives, long before auth and
 * Firestore have put the question on screen. Work started at `load` (route
 * prefetch, Clarity, gtag) competed with those requests on slow 4G and pushed
 * the Largest Contentful Paint back by seconds.
 */
export const PAGE_SETTLE_DELAY_MS = 4 * TIME.SECOND;
/** Upper bound on waiting for an idle period once the settle delay has passed. */
export const PAGE_SETTLE_IDLE_TIMEOUT_MS = 5 * TIME.SECOND;

/**
 * Run optional work once the page has loaded, the first data has had time to
 * arrive, and the main thread is idle. For analytics, prefetch and other work
 * nobody is waiting for.
 */
export function afterPageSettles(callback: () => void): void {
	if (typeof window === 'undefined') return;

	const whenIdle = () => {
		if (typeof window.requestIdleCallback === 'function') {
			window.requestIdleCallback(() => callback(), { timeout: PAGE_SETTLE_IDLE_TIMEOUT_MS });
		} else {
			callback();
		}
	};
	const afterDelay = () => window.setTimeout(whenIdle, PAGE_SETTLE_DELAY_MS);

	if (document.readyState === 'complete') afterDelay();
	else window.addEventListener('load', afterDelay, { once: true });
}
