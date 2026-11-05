import m from 'mithril';
import '@/styles/console-vote-order.scss';
import '@/styles/console-vote-bar.scss';
import { t } from '@/lib/i18n';
import { icon } from './ConsoleIcon';

/**
 * "Who sees the results": the two-button segmented control (Only me / The
 * whole class) on the Vote step's control row, next to the order switch, and
 * on the Summary step. The same radiogroup shape as VoteOrderSwitch (native
 * radios: arrow keys and one tab stop come from the browser), reusing its
 * look. Reusable: the label, the hint, the group name and the test ids are
 * attrs, so another results switch (another field) can reuse it. Closed is the
 * default, and the hint under the control says how to open (Trello uVEcfwbB).
 */

export interface ResultsAudienceSwitchAttrs {
	/** True = the whole class sees the results. */
	shown: boolean;
	/** No challenge yet, or a write is in flight. */
	disabled: boolean;
	onChange: (shown: boolean) => void;
	/** Unique per switch on a screen: the radio group name, the label id and the test ids. */
	name: string;
	labelKey: string;
	/** Shown under the control while the results are closed. */
	hintKey: string;
}

/** The vote results' own switch: the name and strings of "Who sees the results". */
export const VOTE_RESULTS_AUDIENCE = {
	name: 'vote-results-audience',
	labelKey: 'console.results_audience',
	hintKey: 'console.results_hint_closed',
} as const;

function option(attrs: ResultsAudienceSwitchAttrs, shown: boolean, labelKey: string): m.Vnode {
	const id = shown ? 'class' : 'me';

	return m('label.vote-order__option', { key: id }, [
		m('input.vote-order__input', {
			type: 'radio',
			name: attrs.name,
			value: id,
			checked: attrs.shown === shown,
			disabled: attrs.disabled,
			'data-testid': `${attrs.name}-${id}`,
			onchange: () => attrs.onChange(shown),
		}),
		m('span.vote-order__text', [icon(shown ? 'eye' : 'lock'), m('span', t(labelKey))]),
	]);
}

export const ResultsAudienceSwitch: m.Component<ResultsAudienceSwitchAttrs> = {
	view({ attrs }) {
		const labelId = `${attrs.name}-label`;
		const hintId = `${attrs.name}-hint`;

		return m('.vote-order.results-audience', [
			m(`span.vote-order__label#${labelId}`, t(attrs.labelKey)),
			m(
				'.vote-order__group',
				{
					role: 'radiogroup',
					'aria-labelledby': labelId,
					'aria-describedby': attrs.shown ? undefined : hintId,
					'data-testid': attrs.name,
				},
				[
					option(attrs, false, 'console.results_audience_me'),
					option(attrs, true, 'console.results_audience_class'),
				],
			),
			attrs.shown
				? null
				: m(
						`p.results-audience__hint#${hintId}`,
						{ 'data-testid': `${attrs.name}-hint` },
						t(attrs.hintKey),
					),
		]);
	},
};

/** The chip beside the vote-status chip: lock + "hidden" or eye + "shown" (text and icon, not colour alone). */
export const ResultsChip: m.Component<{ shown: boolean }> = {
	view({ attrs }) {
		return m(
			`span.vote-status.vote-status--results-${attrs.shown ? 'shown' : 'closed'}`,
			{ role: 'status', 'aria-live': 'polite', 'data-testid': 'results-chip' },
			[
				icon(attrs.shown ? 'eye' : 'lock'),
				m('span', t(attrs.shown ? 'console.results_chip_shown' : 'console.results_chip_closed')),
			],
		);
	},
};
