import type { EnhancedEvaluationThumb } from '@/types/evaluation';

/**
 * Pure presentation model for the 5-point face scale.
 *
 * Kept free of React so the ordering and selection rules are testable and so
 * the component never depends on the order of the thumbs array it was given.
 */

/** How a face is painted. */
export type FaceTone =
	/** Nothing rated yet: every face in its own scale colour. */
	| 'own'
	/** This is the user's rating: filled button, white face. */
	| 'selected'
	/** The user rated something else: greyed out so the answer reads as done. */
	| 'idle';

export interface FaceScaleOption {
	thumb: EnhancedEvaluationThumb;
	isSelected: boolean;
	tone: FaceTone;
	/** Translation key for the visible label and the aria-label. */
	labelKey: string;
}

/**
 * Explicit low→high order: strongest dislike first in reading order, so in RTL
 * it sits on the right and in LTR on the left. Returns a new array.
 */
export function orderLowToHigh(
	thumbs: readonly EnhancedEvaluationThumb[],
): EnhancedEvaluationThumb[] {
	return [...thumbs].sort((a, b) => a.evaluation - b.evaluation);
}

/**
 * The thumb matching the user's stored score, or undefined when the user has
 * not rated. A score between two steps snaps to the nearest one.
 */
export function getSelectedThumbId(
	score: number | undefined,
	thumbs: readonly EnhancedEvaluationThumb[],
): string | undefined {
	if (score === undefined || thumbs.length === 0) return undefined;

	let nearest = thumbs[0];
	thumbs.forEach((thumb) => {
		if (Math.abs(score - thumb.evaluation) < Math.abs(score - nearest.evaluation)) {
			nearest = thumb;
		}
	});

	return nearest.id;
}

export function getFaceTone(isSelected: boolean, hasRated: boolean): FaceTone {
	if (isSelected) return 'selected';

	return hasRated ? 'idle' : 'own';
}

export function buildFaceScale(
	thumbs: readonly EnhancedEvaluationThumb[],
	score: number | undefined,
): FaceScaleOption[] {
	const selectedId = getSelectedThumbId(score, thumbs);
	const hasRated = selectedId !== undefined;

	return orderLowToHigh(thumbs).map((thumb) => {
		const isSelected = thumb.id === selectedId;

		return {
			thumb,
			isSelected,
			tone: getFaceTone(isSelected, hasRated),
			labelKey: thumb.label ?? thumb.alt,
		};
	});
}
