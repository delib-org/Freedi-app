import { getEvaluationEntry, type RatingMode } from '@freedi/shared-types';
import {
	enhancedEvaluationsThumbs,
	reactionEvaluationsThumbs,
} from '../../evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';

/**
 * One face in the mind-map toolbar's rating row.
 *
 * Either an `svg` (the app's drawn faces, used by the default agree-disagree
 * scale) or an `emoji` (reactions mode) — never both.
 */
export interface MapEvaluationFace {
	value: number;
	/** i18n key for the aria-label / tooltip. */
	labelKey: string;
	emoji?: string;
	svg?: string;
	color: string;
	colorSelected: string;
}

/**
 * The faces for a rating mode, ordered high → low like every other rating row
 * in the app. The row is laid out `row-reverse`, so on screen this reads
 * unhappy → happy and mirrors correctly in RTL, exactly as the option cards do.
 */
export function getMapEvaluationFaces(mode: RatingMode): MapEvaluationFace[] {
	const thumbs = mode === 'reactions' ? reactionEvaluationsThumbs : enhancedEvaluationsThumbs;

	return thumbs.map((thumb) => ({
		value: thumb.evaluation,
		// The shared scale owns the wording; the thumb's own `alt` ("half like")
		// is a fallback for a value the scale does not name.
		labelKey: getEvaluationEntry(thumb.evaluation, mode)?.labelKey ?? thumb.alt,
		emoji: thumb.emoji,
		svg: thumb.svg || undefined,
		color: thumb.color,
		colorSelected: thumb.colorSelected,
	}));
}
