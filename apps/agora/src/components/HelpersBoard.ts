import m from 'mithril';
import { Icon, iconLabel } from './Icon';
import type { AgoraParticipant } from '@freedi/shared-types';
import { t } from '../lib/i18n';

export interface HelpersBoardAttrs {
	/** The whole roster — AI raters are already filtered out upstream */
	participants: readonly AgoraParticipant[];
	userId?: string;
	/**
	 * The end-of-lesson recap rather than the live tab. Only the tense changes:
	 * mid-lesson "nobody has been thanked YET" and end-of-lesson "nobody was"
	 * are different facts, and only the finale is entitled to the past tense.
	 */
	finale?: boolean;
}

export interface HelperRow {
	participant: AgoraParticipant;
	/** Thank-yous received: one per classmate whose proposal your idea improved */
	points: number;
	rank: number;
	isMine: boolean;
	/** 1…WHO_HUES — which identity hue this person wears (see tokens.scss) */
	hue: number;
}

/** How many identity hues the ramp carries — see --who-1 … --who-8 in tokens.scss */
const WHO_HUES = 8;
/* The same medal, tinted by rank, that the results map already uses for its
 * top three. One drawing plus a class, not three near-identical drawings. */
const MEDAL_RANKS = ['gold', 'silver', 'bronze'] as const;

/**
 * The hue a person wears, for the whole lesson, on every device.
 *
 * Deliberately a hash of the uid rather than the row index: a colour that
 * moves when the standings move is decoration, and a colour that stays put is
 * an IDENTITY — the same student is the same teal circle before and after
 * someone overtakes them. Ties and collisions are fine; the name is what
 * identifies, the hue is what makes the list scannable and playful.
 */
export function hueOf(userId: string): number {
	let hash = 0;
	for (let index = 0; index < userId.length; index++) {
		hash = (hash * 31 + userId.charCodeAt(index)) % 100003;
	}

	return (hash % WHO_HUES) + 1;
}

/**
 * The monogram on a circle: the first letter of each of the first two words.
 *
 * BOTH words, and that is not a flourish. An anon name is `<noun> <adjective>`
 * in Hebrew and `<adjective> <noun>` in English (functions/src/agora/
 * anonNames.ts), and the generator varies the ADJECTIVE first — so a class of
 * nine is nine different "lanterns", and a single initial drew nine identical
 * circles reading "פ". The distinguishing word is the second one in Hebrew and
 * the first in English, so the only monogram that works in both is the one
 * that takes them both.
 *
 * Graphemes via Array.from, so a name starting with a surrogate pair does not
 * come apart into half a character.
 */
export function initialsOf(name: string): string {
	const initials = name
		.trim()
		.split(/\s+/)
		.filter((word) => Array.from(word).some((char) => /[\p{L}\p{N}]/u.test(char)))
		.slice(0, 2)
		.map((word) => Array.from(word)[0]);

	return initials.join('') || '?';
}

/**
 * Everyone in the class, ranked by thank-yous.
 *
 * Standard competition ranking: two students thanked the same number of times
 * are BOTH 4th, and nothing is 5th. Helping points are small integers — one
 * per thank-you — so ties are the ordinary case here, not an edge case, and
 * numbering tied students 4 and 5 on the strength of a sort order invents a
 * difference the class never expressed.
 */
export function buildRows(attrs: HelpersBoardAttrs): HelperRow[] {
	const rows = [...attrs.participants]
		// joinedAt breaks ties in roster order, so the list never reshuffles
		// itself between redraws
		.sort((a, b) => b.points.helping - a.points.helping || a.joinedAt - b.joinedAt)
		.map((participant) => ({
			participant,
			points: participant.points.helping,
			rank: 0,
			isMine: participant.userId === attrs.userId,
			hue: hueOf(participant.userId),
		}));

	rows.forEach((row, index) => {
		const previous = rows[index - 1];
		row.rank = previous !== undefined && previous.points === row.points ? previous.rank : index + 1;
	});

	return rows;
}

/** Top three wear the medal, tinted by rank; everyone else wears their number */
function rankCell(row: HelperRow): m.Children {
	// A medal for a rank nobody earned would be a prize for zero thank-yous
	if (row.rank > MEDAL_RANKS.length || row.points === 0) {
		return m('span.helpers-board__rank-num.helpers-board__num', String(row.rank));
	}

	return m(Icon, {
		name: 'medal',
		size: 22,
		class: `board__medal board__medal--${MEDAL_RANKS[row.rank - 1]}`,
	});
}

/**
 * The helpers scoreboard: the whole class, ranked by the thank-yous they were
 * given for making someone else's proposal better.
 *
 * The lesson's other scoreboard — the class map — ranks PROPOSALS, which means
 * the students who spent the hour improving other people's texts appear on it
 * only through someone else's point. This one is theirs. Everybody is on it,
 * including the students on zero, because a name missing from a list reads as
 * an absence rather than as a starting line.
 *
 * Every classmate wears a colour, drawn from their uid so it never moves. My
 * own circle is purple, because in this app purple is what mine looks like —
 * the standings can reorder around me and I can still find myself instantly.
 */
export const HelpersBoard: m.Component<HelpersBoardAttrs> = {
	view(vnode) {
		const { finale } = vnode.attrs;
		const rows = buildRows(vnode.attrs);
		const total = rows.reduce((sum, row) => sum + row.points, 0);
		const emptyLine = t(finale ? 'board.helpers_empty_finale' : 'board.helpers_empty_live');

		return m('.helpers-board', [
			m(
				'.helpers-board__crest',
				m('span.helpers-board__crest-pill', iconLabel('helped', t('helpers.title'))),
			),

			m(
				'p.helpers-board__tally.helpers-board__num',
				{ 'aria-label': t('board.helpers_tally_aria', { n: total }) },
				iconLabel('thanks', String(total), 22),
			),
			m('p.helpers-board__sub', t('board.helpers_sub')),

			rows.length === 0
				? m('p.helpers-board__empty', emptyLine)
				: m('.helpers-board__table', [
						// Every row carries its own sentence for a screen reader, so
						// the column strip is a sighted reader's key and nothing else
						m('.helpers-board__cols', { 'aria-hidden': 'true' }, [
							m('span.helpers-board__col.helpers-board__col--rank', t('helpers.col_rank')),
							m('span.helpers-board__col', t('helpers.col_name')),
							m(
								'span.helpers-board__col.helpers-board__col--score',
								iconLabel('thanks', t('helpers.col_score'), 15),
							),
						]),
						m(
							'ul.helpers-board__rows',
							{ role: 'list' },
							rows.map((row) => {
								const name = row.isMine ? t('board.you') : row.participant.anonName;

								return m(
									'li.helpers-board__row',
									{
										key: row.participant.participantId,
										class: [
											row.isMine ? 'helpers-board__row--mine' : undefined,
											row.points === 0 ? 'helpers-board__row--zero' : undefined,
										]
											.filter(Boolean)
											.join(' '),
										// One sentence per row: the three cells read out as
										// "4th", a name and "2" without it
										'aria-label': t('helpers.row_aria', {
											rank: row.rank,
											name,
											n: row.points,
										}),
									},
									[
										m('span.helpers-board__rank', { 'aria-hidden': 'true' }, rankCell(row)),
										m('span.helpers-board__who', [
											m(
												'span.helpers-board__avatar',
												{
													'aria-hidden': 'true',
													class: row.isMine
														? 'helpers-board__avatar--mine'
														: `helpers-board__avatar--who-${row.hue}`,
												},
												initialsOf(row.participant.anonName),
											),
											m('span.helpers-board__name', name),
										]),
										m(
											'span.helpers-board__score.helpers-board__num',
											{ 'aria-hidden': 'true' },
											String(row.points),
										),
									],
								);
							}),
						),
					]),

			// A board of nothing but zeros is a true board and a bleak one. The
			// line under it is the only thing on this screen that says what
			// filling a zero actually takes.
			rows.length > 0 && total === 0 ? m('p.helpers-board__empty', emptyLine) : null,
		]);
	},
};
