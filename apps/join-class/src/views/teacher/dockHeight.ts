/**
 * The phone's dock is fixed to the bottom edge, so the board needs end padding exactly as tall
 * as the dock, whatever it holds (a stuck table, a "ready" mark, a wrapped label, the safe
 * area). Its real height is measured and published as a CSS custom property that
 * console-next.scss reads. Where the band is not fixed (a laptop, where it is sticky above the
 * board) or is hidden (the keyboard is open) the height is 0.
 */

export const DOCK_HEIGHT_VAR = '--console-dock-height';

function publish(px: number): void {
	document.documentElement.style.setProperty(DOCK_HEIGHT_VAR, `${Math.ceil(px)}px`);
}

function isFixed(el: HTMLElement): boolean {
	return getComputedStyle(el).position === 'fixed';
}

/** Measures `el` now and whenever it changes size; the returned function stops and clears it. */
export function watchDockHeight(el: HTMLElement): () => void {
	const measure = (): void => publish(isFixed(el) ? el.getBoundingClientRect().height : 0);
	measure();
	// A turned phone can change the rule (fixed or not) without changing the band's own size.
	window.addEventListener('resize', measure);
	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
	observer?.observe(el);

	return () => {
		observer?.disconnect();
		window.removeEventListener('resize', measure);
		document.documentElement.style.removeProperty(DOCK_HEIGHT_VAR);
	};
}
