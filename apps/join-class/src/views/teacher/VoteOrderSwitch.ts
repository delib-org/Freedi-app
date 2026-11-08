import m from 'mithril';
import type { ClassVoteOrder } from '@freedi/shared-types';
import '@/styles/console-vote-order.scss';
import { t } from '@/lib/i18n';
import { icon } from './ConsoleIcon';
import type { ConsoleIconName } from './ConsoleIcon';

/**
 * "Order of the proposals": the 3-way switch on the Vote step's own control
 * row (inside the vote bar). One setting for every phone and the
 * projector (IA 21). Native radios, so the arrow keys and the group's single
 * tab stop come from the browser.
 */

export interface VoteOrderSwitchAttrs {
	value: ClassVoteOrder;
	/** No challenge yet, or a write is in flight. */
	disabled: boolean;
	onChange: (order: ClassVoteOrder) => void;
}

interface OrderSpec {
	value: ClassVoteOrder;
	labelKey: string;
	icon: ConsoleIconName;
}

export const VOTE_ORDERS: readonly OrderSpec[] = [
	{ value: 'consensus', labelKey: 'console.vote_order_consensus', icon: 'barChart' },
	{ value: 'votes', labelKey: 'console.vote_order_votes', icon: 'ballot' },
	{ value: 'random', labelKey: 'console.vote_order_random', icon: 'shuffle' },
];

export const VoteOrderSwitch: m.Component<VoteOrderSwitchAttrs> = {
	view({ attrs }) {
		return m('.vote-order', [
			m('span.vote-order__label#vote-order-label', [icon('sort'), t('console.vote_order')]),
			m(
				'.vote-order__group',
				{ role: 'radiogroup', 'aria-labelledby': 'vote-order-label', 'data-testid': 'vote-order' },
				VOTE_ORDERS.map((spec) =>
					m('label.vote-order__option', { key: spec.value }, [
						m('input.vote-order__input', {
							type: 'radio',
							name: 'vote-order',
							value: spec.value,
							checked: attrs.value === spec.value,
							disabled: attrs.disabled,
							'data-testid': `vote-order-${spec.value}`,
							onchange: () => attrs.onChange(spec.value),
						}),
						m('span.vote-order__text', [icon(spec.icon), m('span', t(spec.labelKey))]),
					]),
				),
			),
		]);
	},
};
