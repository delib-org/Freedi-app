/** Run `fn` once the page has loaded and the browser is idle (error reporting must not compete with first paint). */

type IdleWindow = Window & {
	requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

const DEFAULT_IDLE_TIMEOUT_MS = 3000;

export function afterLoad(fn: () => void, timeout = DEFAULT_IDLE_TIMEOUT_MS): void {
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
