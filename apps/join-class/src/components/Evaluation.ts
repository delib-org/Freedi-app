import m from 'mithril';
import { Statement, getEvaluationScale, type RatingMode } from '@freedi/shared-types';
import evaluation1 from '@/assets/evaluation/evaluation1.svg';
import evaluation2 from '@/assets/evaluation/evaluation2.svg';
import evaluation3 from '@/assets/evaluation/evaluation3.svg';
import evaluation4 from '@/assets/evaluation/evaluation4.svg';
import evaluation5 from '@/assets/evaluation/evaluation5.svg';
import { setEvaluation, getEffectiveEvaluation, getQuestion } from '@/lib/store';
import { t } from '@/lib/i18n';

interface EvaluationThumb {
	id: 'a' | 'b' | 'c' | 'd' | 'e';
	evaluation: number;
	svg: string;
	/** CSS variable name used as the selected-state background. */
	colorVar: string;
	altKey: string;
}

// Mirrors `enhancedEvaluationsThumbs` in the main app
// (src/view/pages/statement/components/evaluations/components/evaluation/
// enhancedEvaluation/EnhancedEvaluationModel.ts) — same five values, same
// SVGs, same -1..1 scale, so the join card writes evaluations the cloud
// function and the main app already understand without any conversion.
//
// DOM order is -1 → +1 so a plain `flex-direction: row` flows the disliked
// face at the reading-start and the liked face at the reading-end in both
// LTR and RTL (no `row-reverse` games needed).
export const evaluationThumbs: EvaluationThumb[] = [
	{
		id: 'e',
		evaluation: -1,
		svg: evaluation5,
		colorVar: '--emoji-sad',
		altKey: 'evaluation.dislike',
	},
	{
		id: 'd',
		evaluation: -0.5,
		svg: evaluation4,
		colorVar: '--emoji-thinking',
		altKey: 'evaluation.half_dislike',
	},
	{
		id: 'c',
		evaluation: 0,
		svg: evaluation3,
		colorVar: '--emoji-neutral',
		altKey: 'evaluation.neutral',
	},
	{
		id: 'b',
		evaluation: 0.5,
		svg: evaluation2,
		colorVar: '--emoji-happy',
		altKey: 'evaluation.half_like',
	},
	{
		id: 'a',
		evaluation: 1,
		svg: evaluation1,
		colorVar: '--emoji-smiley',
		altKey: 'evaluation.like',
	},
];

/** Map a stored evaluation score back to the closest thumb id, matching the
 *  main app's `getEvaluationThumbIdByScore` so a score saved by either
 *  surface highlights the same face. */
function thumbIdForScore(score: number): EvaluationThumb['id'] {
	if (score > 0.75) return 'a';
	if (score > 0.25) return 'b';
	if (score >= -0.25) return 'c';
	if (score >= -0.75) return 'd';

	return 'e';
}

/** Normalized descriptor consumed by `renderThumb`, so the agree-disagree
 *  thumbs and the reaction faces share one button/aria/active/frozen path
 *  while differing only in the face content and background treatment. */
interface RenderThumb {
	key: string;
	/** Value written to Firestore when this face is chosen. */
	evaluation: number;
	/** Accessible label (also the hover title). */
	label: string;
	/** Whether this face reflects the user's current (optimistic or confirmed) pick. */
	active: boolean;
	/** Face content — an SVG `<img>` for agree-disagree, an emoji `<span>` for reactions. */
	content: m.Children;
	/** Inline background style (agree-disagree paints a per-face `--emoji-*` colour). */
	bgStyle?: Record<string, string>;
	/** Marks emoji-rendered faces so the SCSS can give them a neutral backdrop. */
	isEmoji?: boolean;
}

/** Nearest reaction step (0, 0.25, 0.5, 0.75, 1) for a stored score, so a value
 *  saved elsewhere still highlights the closest reaction face. */
function reactionValueForScore(score: number, scale: readonly { value: number }[]): number {
	let best = scale[0]?.value ?? 0;
	let bestDist = Math.abs(score - best);
	for (const entry of scale) {
		const dist = Math.abs(score - entry.value);
		if (dist < bestDist) {
			best = entry.value;
			bestDist = dist;
		}
	}

	return best;
}

/** Build the agree-disagree descriptors — unchanged behaviour: SVG faces,
 *  per-face colour background, and the main-app-matching active highlight. */
function agreeDisagreeThumbs(score: number | undefined): RenderThumb[] {
	const activeId = score === undefined ? null : thumbIdForScore(score);

	return evaluationThumbs.map((thumb) => {
		const altLabel = t(thumb.altKey);

		return {
			key: thumb.id,
			evaluation: thumb.evaluation,
			label: altLabel,
			active: thumb.id === activeId,
			content: m('img.evaluation__thumb-img', { src: thumb.svg, alt: altLabel }),
			bgStyle: { backgroundColor: `var(${thumb.colorVar})` },
		};
	});
}

/** Build the positive-only reaction descriptors from the shared scale
 *  (`getEvaluationScale('reactions')`) — degrees of liking, values 0..1,
 *  rendered as the emoji character. Single source of truth with the other apps. */
function reactionThumbs(score: number | undefined): RenderThumb[] {
	const scale = getEvaluationScale('reactions');
	const activeValue = score === undefined ? null : reactionValueForScore(score, scale);

	return scale.map((entry) => {
		// `labelKey` is an English fallback string; `t()` returns it verbatim when
		// no matching i18n key exists, so it doubles as the accessible label.
		const label = t(entry.labelKey);

		return {
			key: entry.variant,
			evaluation: entry.value,
			label,
			active: activeValue !== null && entry.value === activeValue,
			content: m('span.evaluation__thumb-emoji', { 'aria-hidden': 'true' }, entry.emoji),
			isEmoji: true,
		};
	});
}

/** Render one face button — shared by both modes so the frozen gate, the
 *  radio semantics, the active halo and the check badge stay identical. */
function renderThumb(option: Statement, thumb: RenderThumb, frozen: boolean): m.Vnode {
	const classes = [
		thumb.active ? 'evaluation__thumb--active' : '',
		thumb.isEmoji ? 'evaluation__thumb--emoji' : '',
	]
		.filter(Boolean)
		.join(' ');

	return m(
		'button.evaluation__thumb',
		{
			key: thumb.key,
			type: 'button',
			role: 'radio',
			'aria-checked': thumb.active ? 'true' : 'false',
			'aria-label': thumb.label,
			title: frozen ? t('frozen.aria_disabled') : thumb.label,
			class: classes || undefined,
			disabled: frozen ? true : undefined,
			style: thumb.bgStyle,
			onclick: (e: Event) => {
				e.stopPropagation();
				if (frozen) return;
				void setEvaluation(option, thumb.evaluation);
			},
		},
		thumb.content,
		// Decorative check badge — only rendered for the active face. Rendering
		// the element (vs pure CSS) makes the pulse-in animation easy to scope
		// and skips painting it for unselected faces.
		thumb.active ? m('span.evaluation__thumb-check', { 'aria-hidden': 'true' }, '✓') : null,
	);
}

interface EvaluationAttrs {
	option: Statement;
}

export const Evaluation: m.Component<EvaluationAttrs> = {
	view(vnode) {
		const { option } = vnode.attrs;
		const question = getQuestion();
		// Cross-app evaluation-mode setting. Undefined ⇒ classic agree-disagree.
		const ratingMode = question?.statementSettings?.ratingMode as RatingMode | undefined;

		// `getEffectiveEvaluation` returns the optimistic score if the user just
		// clicked, otherwise whatever's been confirmed by the server snapshot.
		// Either way the highlighted face matches what the user expects.
		const score = getEffectiveEvaluation(option.statementId);

		const thumbs = ratingMode === 'reactions' ? reactionThumbs(score) : agreeDisagreeThumbs(score);
		const hasSelection = thumbs.some((thumb) => thumb.active);

		// Facilitator-controlled freeze: once the question is frozen, evaluation
		// becomes read-only — existing selection still highlights, but the
		// thumbs disable so the user can't change or cast a new vote.
		const frozen = question?.statementSettings?.questionStatus === 'frozen';

		// Once the user has made a choice, the parent gets a modifier class so
		// sibling (non-active) thumbs can recede further. Before any choice all
		// five faces stay equally vivid — we only introduce visual hierarchy
		// *after* the user has voted, never before.
		const groupClasses = [
			'.evaluation',
			ratingMode === 'reactions' ? '.evaluation--reactions' : '',
			hasSelection ? '.evaluation--has-selection' : '',
			frozen ? '.evaluation--frozen' : '',
		].join('');

		return m(
			groupClasses,
			{
				role: 'radiogroup',
				'aria-label': t('evaluation.aria_label'),
				'aria-disabled': frozen ? 'true' : undefined,
				// The card itself is a button; the evaluation row must absorb its
				// own clicks so picking a face never navigates to chat.
				onclick: (e: Event) => e.stopPropagation(),
			},
			thumbs.map((thumb) => renderThumb(option, thumb, frozen)),
		);
	},
};
