import m from 'mithril';
import { VOTE_AGAINST, type AgoraCarriedAnswer } from '@freedi/shared-types';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

export interface VoteTallyAttrs {
	/** statementId (or VOTE_AGAINST) → votes */
	counts: Readonly<Record<string, number>>;
	total: number;
	/** The ranked rows, to put a text on each candidate id */
	byId: ReadonlyMap<string, AgoraCarriedAnswer>;
	/** The decision, when the vote produced one — its bar wears the crown */
	winnerId?: string;
}

export interface TallyRow {
	id: string;
	label: string;
	count: number;
	/** 0–100 of all votes cast */
	share: number;
	isWinner: boolean;
}

/** Bars past this one stop staggering in */
const MAX_STAGGER = 8;

function shareOf(count: number, total: number): number {
	return total > 0 ? Math.round((count / total) * 100) : 0;
}

/** Every candidate as a row, most votes first — pure, for the test */
export function tallyRows(attrs: VoteTallyAttrs): TallyRow[] {
	return Object.entries(attrs.counts)
		.sort(([, a], [, b]) => b - a)
		.map(([id, count]) => ({
			id,
			label: id === VOTE_AGAINST ? t('voting.against') : (attrs.byId.get(id)?.statement ?? id),
			count,
			share: shareOf(count, attrs.total),
			isWinner: id === attrs.winnerId,
		}));
}

/**
 * The class vote as bars that GROW.
 *
 * Each candidate's bar fills in from zero to its share, one after the other,
 * with the count and the percent riding on it — the recap's "how we voted"
 * said as a picture a thumb can read. The winner's bar is tinted and crowned;
 * every other bar is the same quiet wash, because a vote is one answer to one
 * question and the rows that lost are not a ranking of people.
 */
export const VoteTally: m.Component<VoteTallyAttrs> = {
	view(vnode) {
		const rows = tallyRows(vnode.attrs);

		return m('.tally', [
			m('p.teacher__section-title', t('voting.title')),
			m(
				'ul.tally__list',
				{ role: 'list' },
				rows.map((row, index) =>
					m(
						'li.tally__row',
						{
							key: row.id,
							class: row.isWinner ? 'tally__row--winner' : undefined,
							style: {
								'--share': `${row.share}%`,
								'--row-index': String(Math.min(index, MAX_STAGGER)),
							},
							'aria-label': t('scoreboard.tally_aria', {
								label: row.label,
								n: row.count,
								pct: row.share,
							}),
						},
						[
							m('span.tally__bar', { 'aria-hidden': 'true' }),
							m('span.tally__label', [
								row.isWinner
									? m(
											'span.tally__crown',
											{ 'aria-hidden': 'true' },
											m(Icon, { name: 'crown', size: 16 }),
										)
									: null,
								m('span.tally__text', row.label),
							]),
							m('span.tally__count.scoreboard__num', { 'aria-hidden': 'true' }, [
								m('span.tally__votes', String(row.count)),
								m('span.tally__share', `${row.share}%`),
							]),
						],
					),
				),
			),
			m('p.voting__total', t('voting.total_votes', { n: String(vnode.attrs.total) })),
		]);
	},
};
