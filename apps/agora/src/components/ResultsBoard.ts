import m from 'mithril';
import {
	AGORA_RATING_LEVELS,
	addDist,
	calcAgoraClassConsensus,
	consensusCeiling,
	distMoments,
	eligiblePoolFor,
	emptyDist,
	type AgoraCamp,
	type AgoraClassConsensus,
	type AgoraParticipant,
	type AgoraProposalScore,
	type AgoraRatingDist,
	type AgoraTopicPackage,
} from '@freedi/shared-types';
import { t, tCount } from '../lib/i18n';
import { celebrate } from '../lib/celebration';
import type { AgoraProposal } from '../lib/proposals';

export interface ResultsBoardAttrs {
	sessionId: string;
	topic: AgoraTopicPackage;
	proposals: readonly AgoraProposal[];
	scores: Readonly<Record<string, AgoraProposalScore>>;
	/** Positioned students per camp — the finite population C_p divides by */
	census: { left: number; right: number; center: number };
	/** The whole roster, for the helpers podium */
	participants: readonly AgoraParticipant[];
	userId?: string;
	/** Server-named winner; while the lesson runs, whoever is on top */
	leadStatementId?: string;
}

/** One line of the ladder */
interface BoardRow {
	proposal: AgoraProposal;
	/** Absent until the first rating creates the score doc */
	score?: AgoraProposalScore;
	/** Absent until a classmate rates it — an unrated proposal has no standing */
	consensus?: AgoraClassConsensus;
	/** C_p as a signed percent on the -100…100 board axis */
	percent: number;
	rank: number;
	isMine: boolean;
}

interface HelperRow {
	participant: AgoraParticipant;
	points: number;
	rank: number;
	isMine: boolean;
}

/** The five bucket faces, most against to most for */
const BUCKET_EMOJI = ['😠', '🙁', '😐', '🙂', '😍'] as const;
const MEDALS = ['🥇', '🥈', '🥉'] as const;
const PODIUM_SIZE = 3;
const COUNT_MS = 40;

function reducedMotion(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * The consensus a row should show. Prefers what the server wrote; falls back to
 * recomputing from the histogram with the same shared rule the trigger uses, so
 * a board opened before the trigger lands still reads the real number.
 */
function readConsensus(
	score: AgoraProposalScore,
	census: ResultsBoardAttrs['census'],
): AgoraClassConsensus | undefined {
	if (score.classConsensus) return score.classConsensus;

	return calcAgoraClassConsensus({
		perCamp: score.perCamp,
		eligible: eligiblePoolFor(score, census),
	});
}

function classDist(score: AgoraProposalScore): AgoraRatingDist {
	return [score.perCamp.left, score.perCamp.right, score.perCamp.center].reduce(
		(total, camp) => addDist(total, camp.studentDist ?? emptyDist()),
		emptyDist(),
	);
}

/** Signed percent → position on the -100…100 track, where 0 sits at 50% */
function trackPercent(percent: number): number {
	return (Math.max(-100, Math.min(100, percent)) + 100) / 2;
}

function rankBadge(rank: number): string {
	return rank <= MEDALS.length ? MEDALS[rank - 1] : `#${rank}`;
}

/**
 * A signed percent, always written the Latin way round. Rendered inside a
 * .board__num isolate: without one, "+52%" comes out as "52%+" on an RTL page,
 * which reads as a different number entirely.
 */
function signed(percent: number): string {
	return `${percent > 0 ? '+' : ''}${percent}%`;
}

/**
 * Isolate a Latin number dropped into a translated sentence (U+2066 … U+2069).
 * A CSS isolate cannot reach inside an interpolated string, and "+29%" in the
 * middle of a Hebrew line otherwise comes out as "29%+".
 */
function isolate(text: string): string {
	return `\u2066${text}\u2069`;
}

/**
 * The end-of-game results board.
 *
 * One question, answered in one shape: how much did the class agree with each
 * proposal? Every proposal sits on the same -100%…+100% axis, ranked by the
 * class consensus C_p (which already accounts for class size and for the
 * classmates who never rated), the winner is crowned, your own proposal is
 * marked wherever it landed, and pressing any row opens the actual arithmetic
 * behind its score. The helpers podium sits alongside it, because the lesson
 * rewards making someone else's proposal better as much as writing your own.
 */
export function ResultsBoard(
	initialVnode: m.Vnode<ResultsBoardAttrs>,
): m.Component<ResultsBoardAttrs> {
	const cheerKey = `agora_${initialVnode.attrs.sessionId}_boardcheer`;

	let openId = '';
	/** Count-up state for the champion score */
	let shown = 0;
	let target = 0;
	let timer: ReturnType<typeof setInterval> | null = null;

	/** Chase the champion percent so the headline lands rather than appears */
	function countTo(next: number): void {
		if (next === target) return;
		target = next;
		if (reducedMotion()) {
			shown = next;

			return;
		}
		if (timer) return;
		timer = setInterval(() => {
			const step = Math.max(1, Math.ceil(Math.abs(target - shown) / 8));
			shown += shown < target ? step : -step;
			if (Math.abs(target - shown) < step) shown = target;
			if (shown === target) {
				if (timer) clearInterval(timer);
				timer = null;
			}
			m.redraw();
		}, COUNT_MS);
	}

	/**
	 * One cheer, the first time a student sees their own proposal on the
	 * podium. Seeded from sessionStorage so a refresh stays quiet — a
	 * celebration that repeats on every reload stops meaning anything.
	 */
	function cheerOnce(rows: BoardRow[]): void {
		if (sessionStorage.getItem(cheerKey)) return;
		const mine = rows.find((row) => row.isMine);
		if (!mine || mine.rank > PODIUM_SIZE || mine.consensus === undefined) return;
		sessionStorage.setItem(cheerKey, '1');
		celebrate({
			message: t('board.cheer_podium', { rank: mine.rank }),
			detail: mine.proposal.statement,
		});
	}

	function buildRows(attrs: ResultsBoardAttrs): BoardRow[] {
		const { proposals, scores, census, userId } = attrs;

		const rows: BoardRow[] = [];
		for (const proposal of proposals) {
			// A proposal nobody rated has no score doc at all, and it still belongs
			// on the board — "every proposal" has to mean every proposal
			const score = scores[proposal.statementId];
			const consensus = score ? readConsensus(score, census) : undefined;
			rows.push({
				proposal,
				score,
				consensus,
				percent: consensus ? Math.round(consensus.consensus * 100) : 0,
				rank: 0,
				isMine: proposal.creatorId === userId,
			});
		}

		// Unrated proposals have no standing on the board — they queue at the
		// bottom rather than pretending to a score of zero
		rows.sort((a, b) => {
			if (a.consensus === undefined || b.consensus === undefined) {
				return Number(a.consensus === undefined) - Number(b.consensus === undefined);
			}

			return b.consensus.consensus - a.consensus.consensus;
		});
		rows.forEach((row, index) => {
			row.rank = index + 1;
		});

		return rows;
	}

	function buildHelpers(attrs: ResultsBoardAttrs): HelperRow[] {
		return attrs.participants
			.map((participant) => ({
				participant,
				points: participant.points.helping,
				rank: 0,
				isMine: participant.userId === attrs.userId,
			}))
			.filter((row) => row.points > 0)
			.sort((a, b) => b.points - a.points)
			.map((row, index) => ({ ...row, rank: index + 1 }));
	}

	// ---------- the shared -100…100 track ----------

	/** The diverging bar every row and the champion share, so lengths compare */
	function meter(percent: number, hasScore: boolean): m.Children {
		const zero = 50;
		const point = trackPercent(percent);

		return m('.board__meter', [
			m('.board__meter-zero'),
			hasScore
				? m('.board__meter-fill', {
						class: percent < 0 ? 'board__meter-fill--against' : 'board__meter-fill--for',
						style: {
							insetInlineStart: `${Math.min(zero, point)}%`,
							width: `${Math.abs(point - zero)}%`,
						},
					})
				: null,
		]);
	}

	function scaleLegend(): m.Children {
		return m('.board__scale', [
			m('span', [m('span.board__num', '-100%'), ` · ${t('board.scale_against')}`]),
			m('span.board__scale-mid', '0'),
			m('span', [m('span.board__num', '+100%'), ` · ${t('board.scale_for')}`]),
		]);
	}

	function valueChip(row: BoardRow): m.Children {
		if (row.consensus === undefined) {
			return m('span.board__value.board__value--none', t('board.unrated'));
		}

		// The isolate lives on an inner span: an element whose own direction is
		// ltr resolves its margin-inline-start against ITSELF, which would break
		// the "push the score to the far edge" layout on an RTL page.
		return m(
			'span.board__value',
			{ class: row.percent < 0 ? 'board__value--against' : 'board__value--for' },
			m('span.board__num', signed(row.percent)),
		);
	}

	function authorChip(row: BoardRow): m.Children {
		return row.isMine
			? m('span.board__you', t('board.you'))
			: m('span.board__author', row.proposal.anonName);
	}

	// ---------- the crown ----------

	function champion(rows: BoardRow[], attrs: ResultsBoardAttrs): m.Children {
		const { leadStatementId } = attrs;
		const lead =
			(leadStatementId
				? rows.find((row) => row.proposal.statementId === leadStatementId)
				: undefined) ?? rows[0];
		if (!lead || lead.consensus === undefined) return null;

		countTo(lead.percent);
		const display = reducedMotion() ? lead.percent : shown;

		return m('.board__champion', { class: lead.isMine ? 'board__champion--mine' : undefined }, [
			m('p.board__eyebrow', `🏆 ${t('board.champion_title')}`),
			m(
				'.board__champion-score.board__num',
				{
					class: lead.percent < 0 ? 'board__champion-score--against' : undefined,
					'aria-label': t('board.champion_aria', { n: lead.percent }),
				},
				signed(display),
			),
			m('p.board__champion-label', t('board.agreement_label')),
			meter(display, true),
			scaleLegend(),
			m('p.board__champion-text', lead.proposal.statement),
			m('.board__champion-by', [
				authorChip(lead),
				m(
					'span.board__coverage',
					t('picture.coverage', {
						n: String(lead.consensus.n),
						total: String(lead.consensus.eligible),
					}),
				),
			]),
			lead.isMine ? m('p.board__champion-mine-note', t('board.champion_mine')) : null,
		]);
	}

	// ---------- pressing a row: the actual score ----------

	/**
	 * One line of the arithmetic. `numeric` lines are bidi-isolated so a signed
	 * percent keeps its sign on the left in Hebrew and Arabic; the rank line is
	 * a sentence and must stay in the page's own direction.
	 */
	function statLine(
		label: string,
		value: string,
		options?: { strong?: boolean; numeric?: boolean },
	): m.Children {
		return m('.board__stat', [
			m('span.board__stat-label', label),
			m(
				'span.board__stat-value',
				{
					class: [
						options?.strong ? 'board__stat-value--strong' : undefined,
						options?.numeric === false ? undefined : 'board__num',
					]
						.filter(Boolean)
						.join(' '),
				},
				value,
			),
		]);
	}

	function histogram(dist: AgoraRatingDist): m.Children {
		const peak = Math.max(1, ...dist);

		return m(
			'.board__histogram',
			AGORA_RATING_LEVELS.map((level, index) =>
				m('.board__bucket', { key: level }, [
					m('.board__bucket-column', [
						m('.board__bucket-bar', {
							class:
								level < 0
									? 'board__bucket-bar--against'
									: level > 0
										? 'board__bucket-bar--for'
										: 'board__bucket-bar--neutral',
							style: { height: `${(dist[index] / peak) * 100}%` },
						}),
					]),
					m('span.board__bucket-count', String(dist[index])),
					m('span.board__bucket-face', { 'aria-hidden': 'true' }, BUCKET_EMOJI[index]),
				]),
			),
		);
	}

	function campSplit(score: AgoraProposalScore, topic: AgoraTopicPackage): m.Children {
		const camps: Array<{ key: AgoraCamp; label: string; color: string }> = [
			{
				key: 'left' as AgoraCamp,
				label: topic.positioningScale.leftLabel,
				color: '--camp-left-glow',
			},
			{ key: 'center' as AgoraCamp, label: t('picture.camp_center'), color: '--camp-center-glow' },
			{
				key: 'right' as AgoraCamp,
				label: topic.positioningScale.rightLabel,
				color: '--camp-right-glow',
			},
		];

		return m(
			'.board__camps',
			camps.map(({ key, label, color }) => {
				const moments = distMoments(score.perCamp[key].studentDist);
				const mean = moments.n > 0 ? moments.sum / moments.n : 0;
				const point = trackPercent(mean * 100);

				return m('.board__camp', { key }, [
					m('span.board__camp-label', { style: { color: `var(${color})` } }, label),
					m('.board__meter.board__meter--camp', [
						m('.board__meter-zero'),
						moments.n > 0
							? m('.board__meter-fill', {
									style: {
										insetInlineStart: `${Math.min(50, point)}%`,
										width: `${Math.abs(point - 50)}%`,
										background: `var(${color})`,
									},
								})
							: null,
					]),
					m(
						'span.board__camp-n',
						moments.n > 0 ? tCount('delib.raters_count', moments.n) : t('picture.camp_none'),
					),
				]);
			}),
		);
	}

	/**
	 * The number, opened up. A score a student cannot take apart is a verdict;
	 * the same score with its arithmetic showing is a lesson — what the class
	 * actually gave, what was held back for the classmates who never rated, and
	 * how high this proposal could still have gone at this coverage.
	 */
	function detail(row: BoardRow, rows: BoardRow[], topic: AgoraTopicPackage): m.Children {
		const consensus = row.consensus;
		const score = row.score;
		if (!consensus || !score) {
			return m('.board__detail', { 'aria-live': 'polite' }, [
				m('p.board__detail-empty', t('board.unrated_detail')),
			]);
		}

		const meanPercent = Math.round(consensus.mean * 100);
		const caution = Math.max(0, meanPercent - row.percent);
		const ceiling = Math.round(consensusCeiling(consensus.n, consensus.eligible) * 100);
		const leader = rows[0];
		const behind =
			leader && leader.consensus ? Math.round(leader.consensus.consensus * 100) - row.percent : 0;

		return m('.board__detail', { 'aria-live': 'polite' }, [
			m('p.board__detail-title', t('board.detail_title')),
			m('.board__stats', [
				statLine(t('board.detail_mean'), signed(meanPercent)),
				statLine(t('board.detail_caution'), `−${caution}%`),
				statLine(t('board.detail_cp'), signed(row.percent), { strong: true }),
				statLine(
					t('board.detail_coverage'),
					t('board.detail_coverage_value', {
						n: consensus.n,
						total: consensus.eligible,
						pct: Math.round(consensus.coverage * 100),
					}),
					// A translated phrase, not a bare number — it keeps the page's
					// own direction
					{ numeric: false },
				),
				statLine(t('board.detail_ceiling'), `${ceiling}%`),
				statLine(t('board.detail_split'), `${Math.round(consensus.polarization * 100)}%`),
				statLine(
					t('board.detail_rank'),
					behind > 0
						? t('board.detail_behind', { n: behind, rank: row.rank })
						: t('board.detail_leader'),
					{ numeric: false },
				),
			]),
			m('p.board__detail-sub', t('board.detail_spread')),
			histogram(classDist(score)),
			m('p.board__detail-sub', t('board.detail_camps')),
			campSplit(score, topic),
			m('p.board__detail-why', t('board.detail_why')),
		]);
	}

	// ---------- the ladder ----------

	function ladderRow(row: BoardRow, rows: BoardRow[], topic: AgoraTopicPackage): m.Children {
		const open = openId === row.proposal.statementId;

		return m('.board__entry', { key: row.proposal.statementId }, [
			m(
				'button.board__row',
				{
					type: 'button',
					class: [
						row.isMine ? 'board__row--mine' : undefined,
						row.rank <= MEDALS.length && row.consensus ? 'board__row--medal' : undefined,
						open ? 'board__row--open' : undefined,
					]
						.filter(Boolean)
						.join(' '),
					'aria-expanded': String(open),
					'aria-label': t('board.row_aria', {
						rank: row.rank,
						n: row.percent,
						author: row.isMine ? t('board.you') : row.proposal.anonName,
					}),
					onclick: () => {
						openId = open ? '' : row.proposal.statementId;
					},
				},
				[
					m('.board__row-head', [
						m('span.board__rank', rankBadge(row.rank)),
						authorChip(row),
						valueChip(row),
					]),
					m('p.board__row-text', row.proposal.statement),
					meter(row.percent, row.consensus !== undefined),
					m('.board__row-foot', [
						// The value chip already says "not rated yet" — saying it twice
						// on one row reads as two different facts
						row.consensus
							? m(
									'span.board__coverage',
									t('picture.coverage', {
										n: String(row.consensus.n),
										total: String(row.consensus.eligible),
									}),
								)
							: m('span'),
						m('span.board__row-cue', open ? t('board.hide_score') : t('board.show_score')),
					]),
				],
			),
			open ? detail(row, rows, topic) : null,
		]);
	}

	// ---------- the helpers podium ----------

	function helperCard(row: HelperRow): m.Children {
		return m(
			'.board__helper',
			{
				key: row.participant.participantId,
				class: [`board__helper--${row.rank}`, row.isMine ? 'board__helper--mine' : undefined]
					.filter(Boolean)
					.join(' '),
			},
			[
				m('span.board__helper-medal', { 'aria-hidden': 'true' }, rankBadge(row.rank)),
				m('span.board__helper-name', row.isMine ? t('board.you') : row.participant.anonName),
				m('span.board__helper-points', t('board.helper_points', { n: row.points })),
			],
		);
	}

	function helpersPodium(helpers: HelperRow[]): m.Children {
		if (helpers.length === 0) {
			return m('.board__helpers', [
				m('p.board__eyebrow', `🤝 ${t('board.helpers_title')}`),
				m('p.board__helpers-empty', t('board.helpers_empty')),
			]);
		}

		const podium = helpers.slice(0, PODIUM_SIZE);
		const mine = helpers.find((row) => row.isMine);
		const mineOffPodium = mine && mine.rank > PODIUM_SIZE ? mine : undefined;

		return m('.board__helpers', [
			m('p.board__eyebrow', `🤝 ${t('board.helpers_title')}`),
			m('p.board__helpers-sub', t('board.helpers_sub')),
			// Silver-gold-bronze reading order, so the tallest step is the middle
			m(
				'.board__podium',
				[podium[1], podium[0], podium[2]].filter(Boolean).map((row) => helperCard(row)),
			),
			mineOffPodium
				? m(
						'p.board__helpers-mine',
						t('board.helpers_my_rank', {
							rank: mineOffPodium.rank,
							total: helpers.length,
							n: mineOffPodium.points,
						}),
					)
				: null,
		]);
	}

	return {
		onremove() {
			if (timer) clearInterval(timer);
		},

		view(vnode) {
			const attrs = vnode.attrs;
			const rows = buildRows(attrs);

			if (rows.length === 0) {
				return m('.board.board--empty', [
					m('span.board__empty-icon', { 'aria-hidden': 'true' }, '📊'),
					m('p.board__empty', t('picture.empty')),
				]);
			}

			cheerOnce(rows);
			const mine = rows.find((row) => row.isMine);

			return m('.board', [
				champion(rows, attrs),

				mine
					? m(
							'p.board__my-standing',
							{ class: mine.rank <= MEDALS.length ? 'board__my-standing--podium' : undefined },
							mine.consensus === undefined
								? t('board.my_standing_unrated')
								: t('board.my_standing', {
										rank: mine.rank,
										total: rows.length,
										n: isolate(signed(mine.percent)),
									}),
						)
					: null,

				m('.board__ladder', [
					m('p.board__eyebrow', t('board.all_title')),
					m('p.board__tap-hint', t('board.tap_hint')),
					// The keyed rows live in their own fragment: mithril refuses a
					// fragment where only some children carry keys
					m(
						'.board__ladder-list',
						rows.map((row) => ladderRow(row, rows, attrs.topic)),
					),
				]),

				helpersPodium(buildHelpers(attrs)),
			]);
		},
	};
}
