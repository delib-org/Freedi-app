import evaluation1 from '@/assets/icons/evaluation/evaluation1.svg';
import evaluation2 from '@/assets/icons/evaluation/evaluation2.svg';
import evaluation3 from '@/assets/icons/evaluation/evaluation3.svg';
import evaluation4 from '@/assets/icons/evaluation/evaluation4.svg';
import evaluation5 from '@/assets/icons/evaluation/evaluation5.svg';
import type { EnhancedEvaluationThumb } from '@/types/evaluation';

export type { EnhancedEvaluationThumb } from '@/types/evaluation';

/**
 * Agree/disagree face scale. Stored high→low for the consumers that index into
 * it (maps, CreatorEvaluationIcon); the face scale renders it low→high through
 * `orderLowToHigh` in faceScaleModel, never by relying on this array order.
 */
export const enhancedEvaluationsThumbs: EnhancedEvaluationThumb[] = [
	{
		id: 'a',
		evaluation: 1,
		svg: evaluation1,
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-smiley)',
		alt: 'like',
		face: 'strong-like',
		label: 'Strongly like',
	},
	{
		id: 'b',
		evaluation: 0.5,
		svg: evaluation2,
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-happy)',
		alt: 'half like',
		face: 'like',
		label: 'Like',
	},
	{
		id: 'c',
		evaluation: 0,
		svg: evaluation3,
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-neutral)',
		alt: 'neutral',
		face: 'neutral',
		label: 'Not sure',
	},
	{
		id: 'd',
		evaluation: -0.5,
		svg: evaluation4,
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-thinking)',
		alt: 'half dislike',
		face: 'dislike',
		label: 'Dislike',
	},
	{
		id: 'e',
		evaluation: -1,
		svg: evaluation5,
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-sad)',
		alt: 'dislike',
		face: 'strong-dislike',
		label: 'Strongly dislike',
	},
];

/**
 * Reaction-mode thumbs (statementSettings.ratingMode === 'reactions').
 * Positive-only 0→1 scale rendered as emoji, ordered high→low to match the
 * layout of enhancedEvaluationsThumbs. Values mirror the shared cross-app
 * REACTIONS_SCALE in @freedi/shared-types.
 */
export const reactionEvaluationsThumbs: EnhancedEvaluationThumb[] = [
	{
		id: 'ra',
		evaluation: 1,
		svg: '',
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-smiley)',
		alt: 'I love it',
		emoji: '❤️',
	},
	{
		id: 'rb',
		evaluation: 0.75,
		svg: '',
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-happy)',
		alt: 'I really like it',
		emoji: '👍',
	},
	{
		id: 'rc',
		evaluation: 0.5,
		svg: '',
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-neutral)',
		alt: 'I like it',
		emoji: '😊',
	},
	{
		id: 'rd',
		evaluation: 0.25,
		svg: '',
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-thinking)',
		alt: "It's okay",
		emoji: '🙂',
	},
	{
		id: 're',
		evaluation: 0,
		svg: '',
		color: 'var(--evaluation-thumb-inactive)',
		colorSelected: 'var(--emoji-sad)',
		alt: 'Not for me',
		emoji: '😐',
	},
];
