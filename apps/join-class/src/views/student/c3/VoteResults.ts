import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { SummaryRow, VoteSummary } from '@/lib/classroom/voteSummary';
import { ReplyEntry } from '../replies/ReplyEntry';

export interface VoteResultsAttrs {
	summary: VoteSummary;
	/** The proposals behind the rows: each row gets its replies entry (IA 22). */
	proposals?: readonly Statement[];
	uid?: string | null;
}

function votesLine(row: SummaryRow): string {
	return row.count === 1
		? t('voting.result_one_vote', { percent: row.percent })
		: t('voting.result_votes', { percent: row.percent, n: row.count });
}

function rowView(row: SummaryRow, attrs: VoteResultsAttrs): m.Vnode {
	const proposal = attrs.proposals?.find((p) => p.statementId === row.id);
	const classes = ['vote-result__row'];
	if (row.winner) classes.push('vote-result__row--winner');
	if (row.leading) classes.push('vote-result__row--leading');

	return m('li', { key: row.id, class: classes.join(' '), 'data-testid': 'vote-result-row' }, [
		row.winner ? m('span.vote-result__tag', t('summary.winner')) : null,
		row.leading ? m('span.vote-result__tag', t('summary.leading')) : null,
		m('span.vote-result__text', { dir: 'auto' }, row.text),
		m('span.vote-result__bar', { 'aria-hidden': 'true', style: { '--bar': `${row.percent}%` } }, [
			m('span.vote-result__fill'),
		]),
		m('span.vote-result__count', votesLine(row)),
		proposal ? m(ReplyEntry, { proposal, uid: attrs.uid }) : null,
	]);
}

/**
 * The vote's result on the Summary (IA 20): the title for the state (open,
 * paused, or the plain "Vote results"), the votes per proposal (winner or
 * leader first), and "n of m voted". Counts only, never who voted.
 */
export const VoteResults: m.Component<VoteResultsAttrs> = {
	view({ attrs }) {
		const { summary } = attrs;
		if (summary.kind === 'none') return null;
		const title =
			summary.kind === 'open'
				? t('summary.vote_open')
				: summary.kind === 'paused'
					? t('voting.paused')
					: t('summary.vote_results');

		return m('section.vote-result', { 'aria-labelledby': 'vote-result-title' }, [
			m('h2.vote-result__title', { id: 'vote-result-title' }, title),
			m(
				'ol.vote-result__rows',
				summary.rows.map((row) => rowView(row, attrs)),
			),
			m('p.vote-result__turnout', t('summary.turnout', { n: summary.voted, m: summary.present })),
			summary.tie ? m('p.vote-result__tie', t('summary.tie_by_ratings')) : null,
			summary.kind === 'open' || summary.kind === 'paused'
				? m('p.vote-result__wait', { role: 'status' }, t('summary.wait_close'))
				: null,
		]);
	},
};
