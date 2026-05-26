import { FACILITATOR_TOAST_MS } from './facilitator';

/** Lightweight standalone toast. Appended to <body> on demand and auto-removed
 *  after FACILITATOR_TOAST_MS. Idempotent — calling again while a toast is
 *  showing replaces the text and resets the timer rather than stacking. */

let activeEl: HTMLElement | null = null;
let activeTimer: number | null = null;

function clearActive(): void {
	if (activeTimer !== null) {
		window.clearTimeout(activeTimer);
		activeTimer = null;
	}
	if (activeEl && activeEl.parentNode) {
		activeEl.parentNode.removeChild(activeEl);
	}
	activeEl = null;
}

export function showFacilitatorToast(text: string): void {
	if (activeEl) {
		activeEl.textContent = text;
		if (activeTimer !== null) window.clearTimeout(activeTimer);
		activeTimer = window.setTimeout(clearActive, FACILITATOR_TOAST_MS);

		return;
	}

	const el = document.createElement('div');
	el.className = 'facilitator-toast';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.textContent = text;
	document.body.appendChild(el);
	activeEl = el;

	// Force reflow then add the visible class so the CSS transition runs.
	void el.offsetWidth;
	el.classList.add('facilitator-toast--visible');

	activeTimer = window.setTimeout(clearActive, FACILITATOR_TOAST_MS);
}
