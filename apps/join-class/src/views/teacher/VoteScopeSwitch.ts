import m from 'mithril';
import '@/styles/console-vote-order.scss';
import { t } from '@/lib/i18n';
import { MIN_ABOVE_GOAL } from '@/lib/classroom/voteScope';
import { icon } from './ConsoleIcon';

/**
 * "Proposals on the vote": All proposals / Only above the goal, on the Vote
 * step's own control row (next to the order switch). The goal is the lesson's
 * gate; the count says how many proposals have entered it. One setting for
 * every phone and the projector. Fewer than two above the goal: a warning (the vote keeps the top proposals). Locked once the vote is open.
 * (Trello OaZEhcB7.) Reuses the order switch's segmented-radio look.
 */

export interface VoteScopeSwitchAttrs {
	/** "Only above the goal" is chosen. */
	onlyAbove: boolean;
	/** Proposals on the vote, and how many of them are above the goal. */
	total: number;
	above: number;
	/** The vote is open: the set is frozen, so the choice is locked. */
	locked: boolean;
	/** No challenge yet, or a write is in flight. */
	disabled: boolean;
	onChange: (onlyAbove: boolean) => void;
}

/** What the console passes down: the switch without its `disabled`. */
export type VoteScopeAttrs = Omit<VoteScopeSwitchAttrs, 'disabled'>;

const GROUP_LABEL_ID = 'vote-scope-label';
const NONE_ID = 'vote-scope-none';

function option(attrs: VoteScopeSwitchAttrs, value: boolean, labelKey: string): m.Vnode {
	return m('label.vote-order__option', { key: String(value) }, [
		m('input.vote-order__input', {
			type: 'radio',
			name: 'vote-scope',
			value: value ? 'above' : 'all',
			checked: attrs.onlyAbove === value,
			disabled: attrs.disabled || attrs.locked,
			'data-testid': `vote-scope-${value ? 'above' : 'all'}`,
			onchange: () => attrs.onChange(value),
		}),
		m('span.vote-order__text', m('span', t(labelKey))),
	]);
}

export const VoteScopeSwitch: m.Component<VoteScopeSwitchAttrs> = {
	view({ attrs }) {
		const none =
			!attrs.locked && attrs.onlyAbove && attrs.total > 0 && attrs.above < MIN_ABOVE_GOAL;

		return m('.vote-order.vote-scope', [
			m(`span.vote-order__label#${GROUP_LABEL_ID}`, [icon('check'), t('console.vote_scope')]),
			m(
				'.vote-order__group',
				{
					role: 'radiogroup',
					'aria-labelledby': GROUP_LABEL_ID,
					'aria-describedby': none ? NONE_ID : undefined,
					'data-testid': 'vote-scope',
				},
				[
					option(attrs, false, 'console.vote_scope_all'),
					option(attrs, true, 'console.vote_scope_above'),
				],
			),
			m(
				'span.vote-scope__count',
				{ 'data-testid': 'vote-scope-count' },
				t('console.vote_scope_count', { above: attrs.above, total: attrs.total }),
			),
			attrs.locked
				? m(
						'span.vote-scope__warn',
						{ 'data-testid': 'vote-scope-locked' },
						t('console.vote_scope_locked'),
					)
				: null,
			none
				? m(
						`span.vote-scope__warn#${NONE_ID}`,
						{ role: 'status', 'data-testid': 'vote-scope-none' },
						t('console.vote_scope_none'),
					)
				: null,
		]);
	},
};
