import m from 'mithril';
import { evaluationThumbs } from '@/components/Evaluation';
import { t } from '@/lib/i18n';

export interface RateFacesAttrs {
	/** Current score -1..+1; undefined = not rated yet. */
	value?: number;
	onRate: (score: number) => void;
	/** Accessible name of the radio group. */
	label?: string;
	disabled?: boolean;
	/** data-testid prefix: `${prefix}-1` ... `${prefix}-5`. */
	testPrefix?: string;
}

const SCORE_EPSILON = 0.001;
const MINUS = '−1';

/**
 * The five rating faces (UX §4) with a "-1 ... +1" scale line. Same markup and
 * classes as Join's `.evaluation`, but props in / callback out: Join's own
 * `Evaluation` reads one question's ratings from its store, and a table rates
 * answers of several questions at once.
 */
export const RateFaces: m.Component<RateFacesAttrs> = {
	view({ attrs }) {
		const { value, onRate, disabled } = attrs;
		const hasSelection = value !== undefined;

		return m('.rate-faces', [
			m(
				'.evaluation',
				{
					class: hasSelection ? 'evaluation--has-selection' : '',
					role: 'radiogroup',
					'aria-label': attrs.label ?? t('evaluation.aria_label'),
				},
				evaluationThumbs.map((thumb, index) => {
					const active =
						hasSelection && Math.abs((value as number) - thumb.evaluation) < SCORE_EPSILON;
					const label = t(thumb.altKey);

					return m(
						'button.evaluation__thumb',
						{
							key: thumb.id,
							'data-testid': `${attrs.testPrefix ?? 'rate-face'}-${index + 1}`,
							type: 'button',
							role: 'radio',
							'aria-checked': active ? 'true' : 'false',
							'aria-label': label,
							title: label,
							class: active ? 'evaluation__thumb--active' : '',
							disabled: disabled ? true : undefined,
							style: { backgroundColor: `var(${thumb.colorVar})` },
							onclick: () => onRate(thumb.evaluation),
						},
						m('img.evaluation__thumb-img', { src: thumb.svg, alt: '' }),
						active ? m('span.evaluation__thumb-check', { 'aria-hidden': 'true' }, '✓') : null,
					);
				}),
			),
			m('.rate-faces__scale', { 'aria-hidden': 'true' }, [m('span', MINUS), m('span', '+1')]),
		]);
	},
};
