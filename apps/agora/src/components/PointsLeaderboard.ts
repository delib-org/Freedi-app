import m from 'mithril';
import type { AgoraParticipant } from '@freedi/shared-types';
import { Icon, iconLabel, type IconName } from './Icon';
import { hueOf, initialsOf } from './HelpersBoard';
import { formatPoints } from './PointsPill';
import { t } from '../lib/i18n';
import {
	buildLeaderboard,
	classPointsTotal,
	podiumRows,
	wearsMedal,
	type LeaderboardRow,
	type PointRole,
} from '../lib/leaderboard';

export interface PointsLeaderboardAttrs {
	/** The whole roster — AI raters are filtered inside buildLeaderboard too */
	participants: readonly AgoraParticipant[];
	/** The viewing student; absent on the teacher's projector */
	userId?: string;
}

/* The same medal, tinted by rank, that the proposal board and the helpers
 * board already wear. One drawing plus a class. */
const MEDAL_RANKS = ['gold', 'silver', 'bronze'] as const;

/** The podium's steps, in the order they stand: 2nd, 1st, 3rd */
const PODIUM_STEP_ORDER = [1, 0, 2] as const;

/** Rows past this one stop staggering in — a class of thirty must not take a minute to appear */
const MAX_STAGGER = 12;

const ROLE_ICONS: Record<PointRole, IconName> = {
	helping: 'helped',
	rating: 'square',
	revising: 'edit',
	appreciation: 'thanks',
	proposals: 'proposal',
	valueAccuracy: 'target',
};

function roleLabel(role: PointRole): string {
	return t(`scoreboard.role_${role}`);
}

function nameOf(row: LeaderboardRow): string {
	return row.isMine ? t('board.you') : row.participant.anonName;
}

function avatar(row: LeaderboardRow, large = false): m.Children {
	return m(
		'span.helpers-board__avatar',
		{
			'aria-hidden': 'true',
			class: [
				row.isMine
					? 'helpers-board__avatar--mine'
					: `helpers-board__avatar--who-${hueOf(row.participant.userId)}`,
				large ? 'scoreboard__avatar--large' : undefined,
			]
				.filter(Boolean)
				.join(' '),
		},
		initialsOf(row.participant.anonName),
	);
}

/** Top three wear the medal; everyone else wears their number */
function rankCell(row: LeaderboardRow): m.Children {
	if (!wearsMedal(row)) {
		return m('span.scoreboard__rank-num.scoreboard__num', String(row.rank));
	}

	return m(Icon, {
		name: 'medal',
		size: 22,
		class: `board__medal board__medal--${MEDAL_RANKS[row.rank - 1]}`,
	});
}

function roleTag(row: LeaderboardRow): m.Children {
	if (!row.role) return null;

	return m('span.scoreboard__role', [
		m(Icon, { name: ROLE_ICONS[row.role], size: 13 }),
		m('span', roleLabel(row.role)),
	]);
}

/**
 * The three steps. Rendered 2nd–1st–3rd so the winner stands in the middle
 * and tallest; an empty step (fewer than three earners) is simply not drawn,
 * and the list under the podium still names everyone.
 */
function podium(rows: LeaderboardRow[]): m.Children {
	if (rows.length === 0) return null;

	return m(
		'.scoreboard__podium',
		{ role: 'list', 'aria-label': t('scoreboard.podium_aria') },
		// Keyed children only: a `null` hole beside keyed steps is a Mithril
		// crash, so the empty steps are dropped rather than left as holes
		PODIUM_STEP_ORDER.filter((slot) => rows[slot] !== undefined).map((slot) => {
			const row = rows[slot];

			return m(
				'.scoreboard__step',
				{
					key: row.participant.participantId,
					role: 'listitem',
					// The step's PLACE comes from the slot (2nd–1st–3rd), its tint
					// from the rank — three students tied at 1 all wear gold and
					// still stand on three different steps
					class: [
						`scoreboard__step--slot-${slot}`,
						`scoreboard__step--${MEDAL_RANKS[Math.min(row.rank, MEDAL_RANKS.length) - 1]}`,
						row.isMine ? 'scoreboard__step--mine' : undefined,
					]
						.filter(Boolean)
						.join(' '),
					style: { '--step-slot': String(slot) },
					'aria-label': t('scoreboard.row_aria', {
						rank: row.rank,
						name: nameOf(row),
						n: formatPoints(row.points),
					}),
				},
				[
					avatar(row, true),
					m('span.scoreboard__step-name', nameOf(row)),
					m('span.scoreboard__step-points.scoreboard__num', formatPoints(row.points)),
					m('span.scoreboard__step-block', { 'aria-hidden': 'true' }, [
						m(Icon, {
							name: 'medal',
							size: 26,
							class: `board__medal board__medal--${MEDAL_RANKS[row.rank - 1]}`,
						}),
						m('span.scoreboard__step-rank', String(row.rank)),
					]),
				],
			);
		}),
	);
}

/**
 * The class points board.
 *
 * Two channels on one card, kept distinct so neither eats the other: the
 * CLASS total up top (the number that belongs to everyone), then every
 * student by the points the game already paid them. The top three stand on
 * a podium; the rows below are a plain list in points order — no "last
 * place", no deficit styling on a zero, and the viewing student's own row
 * lit wherever it landed. Each row also names the role the student earned
 * most in, so the classmate who spent the lesson rating others has an
 * identity on the board and not only a small number.
 *
 * Reads participant docs the room already streams (lib/session.ts) — no new
 * read path, no new points. Names are the in-game handles; real names never
 * reach this component.
 */
export const PointsLeaderboard: m.Component<PointsLeaderboardAttrs> = {
	view(vnode) {
		const rows = buildLeaderboard(vnode.attrs.participants, vnode.attrs.userId);
		const total = classPointsTotal(rows);
		const top = podiumRows(rows);

		return m('.scoreboard', [
			m(
				'.scoreboard__crest',
				m('span.scoreboard__crest-pill', iconLabel('trophy', t('scoreboard.points_title'))),
			),

			m('.scoreboard__class', [
				m('span.scoreboard__class-label', t('scoreboard.class_total')),
				m(
					'span.scoreboard__class-total.scoreboard__num',
					{ 'aria-label': t('scoreboard.class_total_aria', { n: formatPoints(total) }) },
					iconLabel('spark', formatPoints(total), 24),
				),
				m('span.scoreboard__class-unit', t('scoreboard.points_unit')),
			]),
			m('p.scoreboard__sub', t('scoreboard.points_sub')),

			podium(top),

			rows.length === 0
				? m('p.scoreboard__empty', t('scoreboard.empty_roster'))
				: m('.scoreboard__table', [
						m('.scoreboard__cols', { 'aria-hidden': 'true' }, [
							m('span.scoreboard__col.scoreboard__col--rank', t('helpers.col_rank')),
							m('span.scoreboard__col', t('helpers.col_name')),
							m('span.scoreboard__col.scoreboard__col--score', t('scoreboard.col_points')),
						]),
						m(
							'ul.scoreboard__rows',
							{ role: 'list' },
							rows.map((row, index) =>
								m(
									'li.scoreboard__row',
									{
										key: row.participant.participantId,
										class: [
											row.isMine ? 'scoreboard__row--mine' : undefined,
											wearsMedal(row) ? 'scoreboard__row--podium' : undefined,
										]
											.filter(Boolean)
											.join(' '),
										style: { '--row-index': String(Math.min(index, MAX_STAGGER)) },
										'aria-label': t('scoreboard.row_aria', {
											rank: row.rank,
											name: nameOf(row),
											n: formatPoints(row.points),
										}),
									},
									[
										m('span.scoreboard__rank', { 'aria-hidden': 'true' }, rankCell(row)),
										m('span.scoreboard__who', [
											avatar(row),
											m('span.scoreboard__who-text', [
												m('span.scoreboard__name', nameOf(row)),
												roleTag(row),
											]),
										]),
										m(
											'span.scoreboard__score.scoreboard__num',
											{ 'aria-hidden': 'true' },
											formatPoints(row.points),
										),
									],
								),
							),
						),
					]),

			// A board of zeros is a true board and a bleak one — say what fills it
			rows.length > 0 && total === 0 ? m('p.scoreboard__empty', t('scoreboard.empty')) : null,
		]);
	},
};
