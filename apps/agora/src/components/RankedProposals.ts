import m from 'mithril';
import type { AgoraCarriedAnswer } from '@freedi/shared-types';
import { Icon } from './Icon';
import { t, tCount } from '../lib/i18n';

export interface RankedProposalsAttrs {
	/** Server-ranked rows, highest net agreement first */
	ranked: readonly AgoraCarriedAnswer[];
	/** The decision, when there is one — its row is marked */
	winnerId?: string;
}

const MEDAL_RANKS = ['gold', 'silver', 'bronze'] as const;
/** Rows past this one stop staggering in */
const MAX_STAGGER = 10;

/** Net agreement −1…1 as the figure the live lists print: "+0.5" */
export function formatMean(mean: number): string {
	const rounded = Math.round(mean * 10) / 10;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

/** Top three RATED proposals wear the medal; the rest wear their number */
function rankCell(rank: number, rated: boolean): m.Children {
	if (!rated || rank > MEDAL_RANKS.length) {
		return m('span.ranked__rank-num.scoreboard__num', String(rank));
	}

	return m(Icon, {
		name: 'medal',
		size: 22,
		class: `board__medal board__medal--${MEDAL_RANKS[rank - 1]}`,
	});
}

/**
 * The zero-centred agreement meter: the fill grows from the middle toward
 * "for" or toward "against", the same geometry as the board's meters, so the
 * figure beside it is a picture before it is a number.
 */
function meter(mean: number): m.Children {
	const point = ((Math.max(-1, Math.min(1, mean)) + 1) / 2) * 100;

	return m('span.ranked__meter', { 'aria-hidden': 'true' }, [
		m('span.ranked__meter-zero'),
		m('span.ranked__meter-fill', {
			class: mean < 0 ? 'ranked__meter-fill--against' : undefined,
			style: {
				insetInlineStart: `${Math.min(50, point)}%`,
				'--fill': `${Math.abs(point - 50)}%`,
			},
		}),
	]);
}

/**
 * Every proposal, by agreement — the scoreboard the lesson played toward.
 *
 * Rank first (a medal for the top three that were actually rated), the text
 * in the proposal voice, the author's handle, and the agreement as a meter
 * plus its figure instead of a line of tiny meta. "N rated" stays, as meta:
 * a figure with no coverage beside it is a verdict, with it a measurement.
 */
export const RankedProposals: m.Component<RankedProposalsAttrs> = {
	view(vnode) {
		const { ranked, winnerId } = vnode.attrs;

		return m('.ranked', [
			m('p.teacher__section-title', t('results.agreement_ranked')),
			ranked.length === 0
				? m('p.home-explanation', t('results.agreement_none'))
				: m(
						'ol.ranked__list',
						{ role: 'list' },
						ranked.map((row, index) => {
							const rated = row.raters > 0;
							const rank = index + 1;

							return m(
								'li.ranked__row',
								{
									key: row.statementId,
									class: row.statementId === winnerId ? 'ranked__row--winner' : undefined,
									style: { '--row-index': String(Math.min(index, MAX_STAGGER)) },
									'aria-label': rated
										? t('scoreboard.ranked_aria', {
												rank,
												value: formatMean(row.mean),
												n: row.raters,
											})
										: t('scoreboard.ranked_unrated_aria', { rank }),
								},
								[
									m('span.ranked__rank', { 'aria-hidden': 'true' }, rankCell(rank, rated)),
									m('.ranked__body', [
										m('p.ranked__text', row.statement),
										m('.ranked__foot', [
											row.anonName ? m('span.ranked__who', row.anonName) : null,
											rated
												? m('span.ranked__meta', tCount('scoreboard.rated_count', row.raters))
												: m('span.ranked__meta', t('results.agreement_unrated')),
										]),
									]),
									m('.ranked__score', { 'aria-hidden': 'true' }, [
										m(
											'span.ranked__figure.scoreboard__num',
											{ class: row.mean < 0 ? 'ranked__figure--against' : undefined },
											rated ? formatMean(row.mean) : '—',
										),
										rated ? meter(row.mean) : null,
									]),
								],
							);
						}),
					),
		]);
	},
};
