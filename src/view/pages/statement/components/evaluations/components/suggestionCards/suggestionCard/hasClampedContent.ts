import { RefObject, useLayoutEffect, useState } from 'react';

// Sub-pixel rounding can make scrollHeight exceed clientHeight by a fraction.
const CLAMP_TOLERANCE_PX = 1;

function isCut(element: HTMLElement): boolean {
	return element.scrollHeight - element.clientHeight > CLAMP_TOLERANCE_PX;
}

/**
 * True when the element, or anything inside it, is cut off by a line clamp or a
 * height cap. The card clamps the title and the body block separately, so the
 * wrapper itself never overflows: every descendant is checked, whatever tag the
 * clamped block is (div, p, ul, blockquote ...).
 */
export function hasClampedContent(container: HTMLElement): boolean {
	if (isCut(container)) return true;

	return Array.from(container.querySelectorAll<HTMLElement>('*')).some(isCut);
}

/**
 * Whether any of the referenced blocks is cut off right now. Measures on layout
 * and again when a block changes size (resize, a card that was skipped by
 * content-visibility being rendered) and when web fonts arrive. While `isPaused`
 * (the text is expanded and so not clamped) the last result is kept.
 */
export function useIsClamped(
	refs: ReadonlyArray<RefObject<HTMLElement | null>>,
	isPaused: boolean,
	contentKey: string,
): boolean {
	const [isCutOff, setIsCutOff] = useState(false);

	useLayoutEffect(() => {
		if (isPaused) return;

		const elements = refs.map((ref) => ref.current).filter((el): el is HTMLElement => !!el);
		let isActive = true;
		const measure = (): void => {
			if (!isActive) return;
			setIsCutOff(elements.some(hasClampedContent));
		};

		measure();
		document.fonts?.ready.then(measure).catch(() => undefined);

		if (typeof ResizeObserver === 'undefined') {
			return () => {
				isActive = false;
			};
		}

		const observer = new ResizeObserver(measure);
		elements.forEach((el) => observer.observe(el));

		return () => {
			isActive = false;
			observer.disconnect();
		};
		// refs are stable ref objects.
	}, [isPaused, contentKey]);

	return isCutOff;
}
