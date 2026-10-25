import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { VoteResult } from '@/lib/classroom/voteResults';

export interface VoteListAttrs {
	candidates: Statement[];
	selectedId: string | null;
	/** The ballot is closed or paused: no radio semantics, nothing to tap. */
	locked: boolean;
	/** Live results per proposal (the teacher's switch); null = no numbers. */
	results: Record<string, VoteResult> | null;
	onSelect: (id: string) => void;
}

function resultLine(result: VoteResult): string {
	return result.count === 1
		? t('voting.result_one_vote', { percent: result.percent })
		: t('voting.result_votes', { percent: result.percent, n: result.count });
}

function resultView(result: VoteResult | undefined): m.Children {
	if (!result) return null;

	return m('span.vote-list__result', [
		m(
			'span.vote-list__track',
			{ 'aria-hidden': 'true', style: { '--bar': `${result.percent}%` } },
			m('span.vote-list__fill'),
		),
		m('span.vote-list__count', resultLine(result)),
	]);
}

/**
 * The ballot (UX §2.8): one radio card per proposal, full text, no author, no
 * table. A tap selects; "Vote" (a second tap) casts. With live results on,
 * each card also shows its share of the votes (counts only, never who).
 */
export const VoteList: m.Component<VoteListAttrs> = {
	view({ attrs }) {
		const { candidates, selectedId, locked, results } = attrs;

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
						'data-key': option.statementId,
						type: locked ? undefined : 'button',
						class: on ? 'vote-list__item--on' : '',
						...attributes,
					},
					[
						m('span.vote-list__mark', { 'aria-hidden': 'true' }, on ? '◉' : '○'),
						m('span.vote-list__body', [
							m('span.vote-list__text', { dir: 'auto' }, option.statement),
							results ? resultView(results[option.statementId]) : null,
						]),
					],
				);
			}),
		);
	},
};
