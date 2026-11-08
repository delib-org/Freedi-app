/** Scheduling helpers for work that must not compete with the first render.
 *
 *  The join app is routinely opened from a shared link on a phone with a poor
 *  connection, so anything that isn't needed to paint the question and its
 *  options — error reporting, service-worker precaching — has to wait until
 *  the critical requests are done. Both of those used to run during module
 *  evaluation, stealing bandwidth from the first Firestore read. */

type IdleWindow = Window & {
	requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/** Run `fn` once the page has loaded and the browser is idle.
 *
 *  Falls back to a plain timeout where `requestIdleCallback` is missing
 *  (Safari before 16.4), and to a direct schedule when the page has already
 *  finished loading by the time this is called. `timeout` caps how long we're
 *  willing to keep waiting for an idle slot — on a busy low-end phone an idle
 *  period may never arrive on its own. */
export function afterLoad(fn: () => void, timeout = 3000): void {
	const run = (): void => {
		const idle = (window as IdleWindow).requestIdleCallback;
		if (idle) {
			idle(fn, { timeout });
		} else {
			window.setTimeout(fn, 1);
		}
	};

	if (document.readyState === 'complete') {
		run();

		return;
	}

	window.addEventListener('load', run, { once: true });
}
