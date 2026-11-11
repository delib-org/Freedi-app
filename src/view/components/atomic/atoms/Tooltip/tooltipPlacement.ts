import type { TooltipPosition } from './Tooltip';

/** Room kept between the tooltip and the edge of the screen. */
export const VIEWPORT_MARGIN_PX = 8;
/** The distance the tooltip styles leave between the trigger and the tooltip. */
export const TRIGGER_GAP_PX = 10;

export interface AnchorBox {
	top: number;
	bottom: number;
}

/**
 * Keeps the requested side when the tooltip fits there, and moves to the
 * opposite side only when that one does fit. Side positions are left alone.
 */
export function resolvePlacement(
	position: TooltipPosition,
	anchor: AnchorBox,
	contentHeight: number,
	viewportHeight: number,
): TooltipPosition {
	const needed = contentHeight + TRIGGER_GAP_PX + VIEWPORT_MARGIN_PX;
	const fitsAbove = anchor.top >= needed;
	const fitsBelow = viewportHeight - anchor.bottom >= needed;

	if (position.startsWith('top') && !fitsAbove && fitsBelow) {
		return position.replace('top', 'bottom') as TooltipPosition;
	}
	if (position.startsWith('bottom') && !fitsBelow && fitsAbove) {
		return position.replace('bottom', 'top') as TooltipPosition;
	}

	return position;
}

/** How far to slide a tooltip sideways so that it stays on the screen. */
export function viewportShift(left: number, right: number, viewportWidth: number): number {
	if (viewportWidth <= 0) return 0;
	if (left < VIEWPORT_MARGIN_PX) return VIEWPORT_MARGIN_PX - left;
	if (right > viewportWidth - VIEWPORT_MARGIN_PX) return viewportWidth - VIEWPORT_MARGIN_PX - right;

	return 0;
}
