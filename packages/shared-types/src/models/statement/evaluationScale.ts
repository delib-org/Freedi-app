import type { RatingMode } from './StatementSettings';

/**
 * Evaluation scale — the single, cross-app source of truth for how the
 * `evaluation` number maps to a face/emoji, a label and a swipe direction.
 *
 * Every app that lets a participant rate an option (mass-consensus swipe +
 * classic, main-app faces, etc.) builds its UI from `getEvaluationScale(mode)`
 * so the values, ordering and validation stay identical everywhere. The stored
 * `evaluation` field is always a plain number; only its allowed set and visual
 * presentation change with the mode.
 *
 * Two modes (see `RatingMode` in StatementSettings):
 * - 'agree-disagree' (default): signed [-1, +1] — polarity + intensity.
 * - 'reactions': positive-only 0→1 emoji reactions — degrees of liking.
 */

export type EvaluationDirection = 'left' | 'up' | 'right';

export interface EvaluationScaleEntry {
	/** Persisted `evaluation` value for this option. */
	value: number;
	/** Emoji representation (used directly by reaction mode + simple apps). */
	emoji: string;
	/** i18n key / English fallback for the full label. */
	labelKey: string;
	/** i18n key / English fallback for the short label. */
	shortLabelKey: string;
	/** CSS variant suffix (e.g. `agree`, `reaction-love`). */
	variant: string;
	/** Throw direction for swipe UIs; ordering hint for button rows. */
	direction: EvaluationDirection;
	/** Left→right zone index (0..4). */
	zoneIndex: number;
}

/**
 * Classic signed agree/disagree scale, ordered left→right (value -1 → +1).
 * Label keys match the strings already translated in the apps — do not rename
 * without updating i18n.
 */
export const AGREE_DISAGREE_SCALE: readonly EvaluationScaleEntry[] = [
	{ value: -1, emoji: '🚫', labelKey: 'Strongly Disagree', shortLabelKey: 'Strong No', variant: 'strongly-disagree', direction: 'left', zoneIndex: 0 },
	{ value: -0.5, emoji: '👎', labelKey: 'Disagree', shortLabelKey: 'No', variant: 'disagree', direction: 'left', zoneIndex: 1 },
	{ value: 0, emoji: '🤔', labelKey: 'Neutral', shortLabelKey: 'Unsure', variant: 'neutral', direction: 'up', zoneIndex: 2 },
	{ value: 0.5, emoji: '👍', labelKey: 'Agree', shortLabelKey: 'Yes', variant: 'agree', direction: 'right', zoneIndex: 3 },
	{ value: 1, emoji: '🎉', labelKey: 'Strongly Agree', shortLabelKey: 'Strong Yes', variant: 'strongly-agree', direction: 'right', zoneIndex: 4 },
] as const;

/**
 * Positive-only emoji-reaction scale, ordered left→right (value 0 → 1).
 * Label keys are English-text keys so untranslated apps fall back gracefully.
 */
export const REACTIONS_SCALE: readonly EvaluationScaleEntry[] = [
	{ value: 0, emoji: '😐', labelKey: 'Not for me', shortLabelKey: 'Meh', variant: 'reaction-meh', direction: 'left', zoneIndex: 0 },
	{ value: 0.25, emoji: '🙂', labelKey: "It's okay", shortLabelKey: 'Okay', variant: 'reaction-okay', direction: 'left', zoneIndex: 1 },
	{ value: 0.5, emoji: '😊', labelKey: 'I like it', shortLabelKey: 'Like', variant: 'reaction-good', direction: 'up', zoneIndex: 2 },
	{ value: 0.75, emoji: '👍', labelKey: 'I really like it', shortLabelKey: 'Great', variant: 'reaction-great', direction: 'right', zoneIndex: 3 },
	{ value: 1, emoji: '❤️', labelKey: 'I love it', shortLabelKey: 'Love', variant: 'reaction-love', direction: 'right', zoneIndex: 4 },
] as const;

/** Undefined / unknown mode falls back to the classic agree-disagree scale. */
export function getEvaluationScale(mode?: RatingMode): readonly EvaluationScaleEntry[] {
	return mode === 'reactions' ? REACTIONS_SCALE : AGREE_DISAGREE_SCALE;
}

/** Inclusive numeric bounds for a mode — used for server-side validation. */
export function getEvaluationRange(mode?: RatingMode): { min: number; max: number } {
	return mode === 'reactions' ? { min: 0, max: 1 } : { min: -1, max: 1 };
}

/** True when `value` is one of the discrete steps allowed for the mode. */
export function isValidEvaluationValue(value: number, mode?: RatingMode): boolean {
	return getEvaluationScale(mode).some((entry) => entry.value === value);
}

/** Look up the scale entry for a stored value (nearest-none: exact match). */
export function getEvaluationEntry(value: number, mode?: RatingMode): EvaluationScaleEntry | undefined {
	return getEvaluationScale(mode).find((entry) => entry.value === value);
}
