// Sub-pixel rounding can make scrollHeight exceed clientHeight by a fraction.
const CLAMP_TOLERANCE_PX = 1;

function isCut(element: HTMLElement): boolean {
	return element.scrollHeight - element.clientHeight > CLAMP_TOLERANCE_PX;
}

/**
 * True when the element, or anything inside it, is cut off by a line clamp or a
 * height cap. The card clamps the title and the body (paragraphs, markdown)
 * separately, so the wrapper itself never overflows: each clamped child is
 * checked. Used to decide whether "Show more" has anything to reveal.
 */
export function hasClampedContent(container: HTMLElement): boolean {
	if (isCut(container)) return true;

	return Array.from(container.querySelectorAll<HTMLElement>('div, span')).some(isCut);
}
