import m from 'mithril';
import type { ClassVoteOrder } from '@freedi/shared-types';
import '@/styles/console-vote-order.scss';
import { t } from '@/lib/i18n';

/**
 * "Order of the proposals": the 3-way switch on the Vote step's own control
 * row (next to open / pause / close). One setting for every phone and the
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
}

export const VOTE_ORDERS: readonly OrderSpec[] = [
	{ value: 'consensus', labelKey: 'console.vote_order_consensus' },
	{ value: 'votes', labelKey: 'console.vote_order_votes' },
	{ value: 'random', labelKey: 'console.vote_order_random' },
];

export const VoteOrderSwitch: m.Component<VoteOrderSwitchAttrs> = {
	view({ attrs }) {
		return m('.vote-order', [
			m('span.vote-order__label#vote-order-label', t('console.vote_order')),
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
						m('span.vote-order__text', t(spec.labelKey)),
					]),
				),
			),
		]);
	},
};
