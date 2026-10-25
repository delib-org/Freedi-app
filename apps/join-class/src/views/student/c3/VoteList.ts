import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

export interface VoteListAttrs {
	candidates: Statement[];
	selectedId: string | null;
	/** The ballot is closed or paused: no radio semantics, nothing to tap. */
	locked: boolean;
	onSelect: (id: string) => void;
}

/**
 * The ballot (UX §2.8): one radio card per proposal, full text, no numbers, no
 * author, no table. A tap selects; "Vote" (a second tap) casts.
 */
export const VoteList: m.Component<VoteListAttrs> = {
	view({ attrs }) {
		const { candidates, selectedId, locked } = attrs;

		return m(
			'.vote-list',
			{ role: locked ? 'list' : 'radiogroup', 'aria-label': t('voting.pick_one') },
			candidates.map((option) => {
				const on = selectedId === option.statementId;
				const attributes = locked
					? { role: 'listitem' }
					: {
							role: 'radio',
							'aria-checked': on ? 'true' : 'false',
							onclick: () => attrs.onSelect(option.statementId),
						};

				return m(
					locked ? 'div.vote-list__item' : 'button.vote-list__item',
					{
						key: option.statementId,
						'data-testid': 'vote-option',
						type: locked ? undefined : 'button',
						class: on ? 'vote-list__item--on' : '',
						...attributes,
					},
					[
						m('span.vote-list__mark', { 'aria-hidden': 'true' }, on ? '◉' : '○'),
						m('span.vote-list__text', { dir: 'auto' }, option.statement),
					],
				);
			}),
		);
	},
};
