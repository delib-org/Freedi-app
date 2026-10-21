/** Celebration toast for earning a helper point. Unlike the utilitarian
 *  facilitator toast, this one gets a full little performance: it drops in
 *  from the top edge, settles with a couple of glowing blinks so the star
 *  registers, then floats back up and away. The whole timeline lives in CSS
 *  (`.points-toast` keyframes); this module only mounts the element and
 *  removes it when the show is over. Re-triggering while visible restarts
 *  the animation with the new text rather than stacking toasts. */

// Keep in sync with the animation timeline in _components.scss (.points-toast):
// 0.55s drop-in + blinks + hold, exit starts at 3.9s and runs 0.6s.
export const POINTS_TOAST_TOTAL_MS = 4600;

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

export function showPointsToast(text: string): void {
	// Restart cleanly: removing and re-adding the element re-runs the CSS
	// animation from the top (a class toggle wouldn't).
	clearActive();

	const el = document.createElement('div');
	el.className = 'points-toast';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');

	const star = document.createElement('span');
	star.className = 'points-toast__star';
	star.setAttribute('aria-hidden', 'true');
	star.textContent = '⭐';

	const label = document.createElement('span');
	label.className = 'points-toast__text';
	label.textContent = text;

	el.appendChild(star);
	el.appendChild(label);
	document.body.appendChild(el);
	activeEl = el;

	activeTimer = window.setTimeout(clearActive, POINTS_TOAST_TOTAL_MS);
}
