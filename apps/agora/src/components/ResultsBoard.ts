import m from 'mithril';
import { Icon, iconLabel, type IconName } from './Icon';
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
	type AgoraProposalScore,
	type AgoraRatingDist,
	type AgoraTopicPackage,
} from '@freedi/shared-types';
import { isRTL, t, tCount } from '../lib/i18n';
import { celebrate } from '../lib/celebration';
import type { AgoraProposal } from '../lib/proposals';

export interface ResultsBoardAttrs {
	sessionId: string;
	topic: AgoraTopicPackage;
	proposals: readonly AgoraProposal[];
	scores: Readonly<Record<string, AgoraProposalScore>>;
	/** Positioned students per camp — the finite population C_p divides by */
	census: { left: number; right: number; center: number };
	userId?: string;
	/** Server-named winner; while the lesson runs, whoever is on top */
	leadStatementId?: string;
	/**
	 * The end-of-lesson recap rather than the live tab. Only the finale
	 * celebrates — a cheer spent mid-game is a cheer the ending cannot fire,
	 * because it is deliberately allowed to happen once per session.
	 */
	finale?: boolean;
}

/** One proposal as a point on the map */
interface BoardPoint {
	proposal: AgoraProposal;
	/** Absent until the first rating creates the score doc */
	score?: AgoraProposalScore;
	/** Absent until a classmate rates it — an unplaced proposal has no position */
	consensus?: AgoraClassConsensus;
	/** C_p as a signed percent — the vertical axis */
	percent: number;
	/**
	 * Which camp backs it more, -1 (only the left camp supports it) … +1 (only
	 * the right camp does), 0 = both sides equally — the horizontal axis.
	 */
	lean: number;
	/** Plot position in percent of the plot box, already de-overlapped */
	x: number;
	y: number;
	/** Point diameter in px — how much of the class rated it */
	size: number;
	rank: number;
	isMine: boolean;
	isLead: boolean;
}

/** The five bucket faces, most against to most for */
const BUCKET_ICONS: readonly IconName[] = [
	'face-strong-against',
	'face-against',
	'face-neutral',
	'face-for',
	'face-strong-for',
];
/* Rank is carried by the CSS class, not by three different drawings — one
 * medal tinted gold/silver/bronze says the same thing and stays in family. */
const MEDAL_RANKS = ['gold', 'silver', 'bronze'] as const;
const PODIUM_SIZE = 3;
const COUNT_MS = 40;

/** Point geometry, in percent of the plot box unless named px */
const POINT_MIN_PX = 26;
const POINT_MAX_PX = 52;
/** Below this centre distance two points read as one blob and get nudged apart */
const MIN_GAP_X = 17;
const MIN_GAP_Y = 12;
const NUDGE_X = 7;
const NUDGE_TRIES = 6;
/** Keep whole points inside the plot box, whatever their value */
const EDGE_PAD = 8;
/** Gap between a point's edge and its callout, in px */
const CALLOUT_GAP_PX = 10;
/** A proposal is "backed by both sides" inside this band around centre */
const BRIDGE_BAND = 0.28;
/** Ties the help tile to the panel it opens */
const HELP_ID = 'board-help-pop';

/**
 * Render `content` at the end of <body>, outside every stacking context the
 * board happens to sit in.
 *
 * `.game` and `.shell` are both `position: relative; z-index: 1`, and the toast
 * stack is a sibling of the shell at z-index 90 — so a fixed sheet INSIDE the
 * shell paints under a toast whatever z-index it claims, and the first thing a
 * toast covers is the sheet's own way out. A portal is the only fix that does
 * not make every screen in the game responsible for the board's layering.
 *
 * The host is rendered with m.render, which does NOT wire up autoredraw, so
 * every handler inside the portal must call m.redraw() itself.
 */
const Portal: m.ClosureComponent<{ content: m.Children }> = () => {
	const host = document.createElement('div');

	return {
		oncreate(vnode) {
			document.body.appendChild(host);
			m.render(host, vnode.attrs.content);
		},
		onupdate(vnode) {
			m.render(host, vnode.attrs.content);
		},
		onremove() {
			// Render nothing first: this runs the subtree's own onremove hooks
			// (keydown listener, focus restore) before the node disappears
			m.render(host, []);
			host.remove();
		},
		view: () => null,
	};
};

function reducedMotion(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value));
}

/**
 * The consensus a point should show. Prefers what the server wrote; falls back
 * to recomputing from the histogram with the same shared rule the trigger uses,
 * so a board opened before the trigger lands still reads the real number.
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

/** How much positive support one camp gave: half-marks count half */
function backing(dist?: AgoraRatingDist): number {
	if (!dist) return 0;

	return 0.5 * Math.max(0, dist[3]) + Math.max(0, dist[4]);
}

/**
 * The horizontal axis: who is behind this proposal.
 *
 * Deliberately built from POSITIVE support only, not from the two camp
 * averages. "Who supports it more" is a question about backing, and a
 * difference of averages answers a different one — a proposal both sides
 * dislike equally would land dead centre, in the very spot reserved for the
 * proposals both sides are behind. Only-left-backs-it → -1, only-right → +1,
 * equally backed → 0, and nobody-backs-it → 0 with a score low enough on the
 * vertical axis that the centre column cannot be mistaken for a bridge.
 *
 * The centre camp is left out on purpose: they are the middle by definition,
 * so their backing says nothing about which side a proposal leans toward.
 */
function campLean(score: AgoraProposalScore): number {
	const left = backing(score.perCamp.left.studentDist);
	const right = backing(score.perCamp.right.studentDist);
	if (left + right === 0) return 0;

	return (right - left) / (right + left);
}

/* Top three get the medal, tinted by rank in CSS; everyone else gets their
 * number. One drawing plus a class beats three near-identical drawings. */
function rankBadge(rank: number): m.Children {
	if (rank > MEDAL_RANKS.length) return `#${rank}`;

	return m(Icon, {
		name: 'medal',
		size: 20,
		class: `board__medal board__medal--${MEDAL_RANKS[rank - 1]}`,
	});
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
	return `⁦${text}⁩`;
}

/**
 * The end-of-game results board — the class, mapped.
 *
 * Every rated proposal is a point on one field. Up the side: how much the class
 * agrees with it, +100% (everyone for) down to -100% (everyone against). Across
 * the bottom: which camp is actually behind it, one side to the other, with the
 * middle column meaning both. That geometry makes the game's goal a PLACE — top
 * centre, where a proposal has the whole class behind it — instead of a number
 * students have to be told to care about. Your own point is lit up wherever it
 * landed, and pressing any point reads out the proposal and the arithmetic
 * behind its score. The classmates who spent the lesson improving other
 * people's proposals have a board of their own, one press away on the switch
 * above this one — the lesson pays for that as much as for writing your own.
 */
export function ResultsBoard(
	initialVnode: m.Vnode<ResultsBoardAttrs>,
): m.Component<ResultsBoardAttrs> {
	const cheerKey = `agora_${initialVnode.attrs.sessionId}_boardcheer`;
	const helpKey = `agora_${initialVnode.attrs.sessionId}_boardhelp`;

	let openId = '';
	/**
	 * The map's help, open. It starts open the FIRST time the board is shown in
	 * a session and never auto-opens again — a one-for-one swap for the hint
	 * paragraph that used to be printed above the field on every single visit.
	 */
	let helpOpen = sessionStorage.getItem(helpKey) === null;
	if (helpOpen) sessionStorage.setItem(helpKey, '1');
	/**
	 * The proposal whose full arithmetic is open as a sub-screen. Separate from
	 * `openId` on purpose: pressing a point opens the callout ON the map, and
	 * pressing THAT travels to the numbers — two presses, two different things,
	 * so a student poking at the map never loses the map.
	 */
	let detailId = '';
	/** Where the keyboard was standing before the sub-screen took over */
	let focusBeforeDetail: HTMLElement | null = null;
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
	function cheerOnce(points: BoardPoint[]): void {
		if (sessionStorage.getItem(cheerKey)) return;
		const mine = points.find((point) => point.isMine);
		if (!mine || mine.rank > PODIUM_SIZE || mine.consensus === undefined) return;
		sessionStorage.setItem(cheerKey, '1');
		celebrate({
			message: t('board.cheer_podium', { rank: mine.rank }),
			detail: mine.proposal.statement,
		});
	}

	/**
	 * Two proposals with near-identical numbers land on the same spot and read
	 * as one point. Nudge them sideways in a fixed alternating pattern —
	 * deterministic, so the map does not reshuffle itself on every redraw.
	 */
	function spread(points: BoardPoint[]): void {
		const placed: BoardPoint[] = [];
		for (const point of points) {
			for (let attempt = 0; attempt < NUDGE_TRIES; attempt++) {
				const clash = placed.some(
					(other) =>
						Math.abs(other.x - point.x) < MIN_GAP_X && Math.abs(other.y - point.y) < MIN_GAP_Y,
				);
				if (!clash) break;
				const offset = NUDGE_X * (attempt + 1) * (attempt % 2 === 0 ? 1 : -1);
				point.x = clamp(point.x + offset, EDGE_PAD, 100 - EDGE_PAD);
			}
			placed.push(point);
		}
	}

	function buildPoints(attrs: ResultsBoardAttrs): BoardPoint[] {
		const { proposals, scores, census, userId } = attrs;

		const points: BoardPoint[] = [];
		for (const proposal of proposals) {
			// A proposal nobody rated has no score doc at all, and it still belongs
			// on the board — it just cannot be placed on the field yet
			const score = scores[proposal.statementId];
			const consensus = score ? readConsensus(score, census) : undefined;
			const percent = consensus ? Math.round(consensus.consensus * 100) : 0;
			const lean = score ? campLean(score) : 0;
			const raters = consensus?.n ?? 0;

			points.push({
				proposal,
				score,
				consensus,
				percent,
				lean,
				x: clamp(((lean + 1) / 2) * 100, EDGE_PAD, 100 - EDGE_PAD),
				y: clamp(((percent + 100) / 200) * 100, EDGE_PAD, 100 - EDGE_PAD),
				size: clamp(POINT_MIN_PX + raters * 2.5, POINT_MIN_PX, POINT_MAX_PX),
				rank: 0,
				isMine: proposal.creatorId === userId,
				isLead: false,
			});
		}

		// Unrated proposals have no standing on the board — they queue at the end
		// rather than pretending to a score of zero
		points.sort((a, b) => {
			if (a.consensus === undefined || b.consensus === undefined) {
				return Number(a.consensus === undefined) - Number(b.consensus === undefined);
			}

			return b.consensus.consensus - a.consensus.consensus;
		});
		// Standard competition ranking: two proposals the class agrees with
		// equally are BOTH second, and nothing is third. Numbering them 2 and 3
		// on the strength of a sort order invents a difference the class never
		// expressed — the same lie a podium over tied data always tells.
		points.forEach((point, index) => {
			const previous = points[index - 1];
			point.rank =
				previous !== undefined &&
				previous.percent === point.percent &&
				previous.consensus !== undefined &&
				point.consensus !== undefined
					? previous.rank
					: index + 1;
		});

		// The server names the winner once the lesson ends (by the same class
		// consensus this map ranks on); until then it is simply whoever is on top
		const lead =
			points.find((point) => point.proposal.statementId === attrs.leadStatementId) ??
			points.find((point) => point.consensus !== undefined);
		if (lead) lead.isLead = true;

		spread(points.filter((point) => point.consensus !== undefined));

		return points;
	}

	// ---------- the map ----------

	function sideLabel(point: BoardPoint, topic: AgoraTopicPackage): string {
		if (Math.abs(point.lean) <= BRIDGE_BAND) return t('board.side_both');

		return point.lean < 0 ? topic.positioningScale.leftLabel : topic.positioningScale.rightLabel;
	}

	function pointAria(point: BoardPoint, topic: AgoraTopicPackage): string {
		return t('board.point_aria', {
			rank: point.rank,
			author: point.isMine ? t('board.you') : point.proposal.anonName,
			n: point.percent,
			side: sideLabel(point, topic),
		});
	}

	/** The short line tying a callout back to the point it belongs to */
	function stem(point: BoardPoint): m.Children {
		const above = point.y < 50;
		const offset = `${point.size / 2}px`;

		return m('.board__callout-stem', {
			style: {
				insetInlineStart: `${point.x}%`,
				height: `${CALLOUT_GAP_PX}px`,
				...(above
					? { insetBlockEnd: `calc(${point.y}% + ${offset})` }
					: { insetBlockStart: `calc(${100 - point.y}% + ${offset})` }),
			},
		});
	}

	/**
	 * The callout the sketch asks for: the statement, and its score, on the spot.
	 *
	 * It hangs off the point itself — above one sitting low on the field, below
	 * one sitting high, always by the same short gap, with a stem drawn back to
	 * the point. Parking it at the far end of the plot instead kept the field
	 * clear and cost the only thing that matters here: which point is being
	 * talked about.
	 *
	 * It is a BUTTON, and that is the second half of the gesture: the card says
	 * what the proposal is and what it scored, and pressing it travels to the
	 * arithmetic behind that score. The full breakdown used to unfold under the
	 * map, which pushed the map itself off a phone screen the moment anyone
	 * pressed a point — the very thing they were reading.
	 *
	 * The horizontal clamp is CSS rather than arithmetic, because only the
	 * browser knows how wide the card actually came out — `clamp()` mixing
	 * percentages and rems keeps the card on the point wherever there is room,
	 * and inside the plot where there is not.
	 */
	function callout(point: BoardPoint): m.Children {
		const above = point.y < 50;
		const gap = point.size / 2 + CALLOUT_GAP_PX;
		const inlineStart = `clamp(var(--callout-half), ${point.x}%, calc(100% - var(--callout-half)))`;
		// The plot clips whatever leaves it, so the card is never allowed to be
		// taller than the room on the side it hangs off — the side rule above
		// always picks the roomier half, so this is at worst half the plot
		const room = above ? 100 - point.y : point.y;

		return m(
			'button.board__callout',
			{
				type: 'button',
				class: above ? 'board__callout--above' : 'board__callout--below',
				style: {
					insetInlineStart: inlineStart,
					maxHeight: `calc(${room}% - ${gap + EDGE_PAD}px)`,
					...(above
						? { insetBlockEnd: `calc(${point.y}% + ${gap}px)` }
						: { insetBlockStart: `calc(${100 - point.y}% + ${gap}px)` }),
				},
				'aria-live': 'polite',
				'aria-label': t('board.callout_aria', {
					author: point.isMine ? t('board.you') : point.proposal.anonName,
				}),
				onclick: () => {
					detailId = point.proposal.statementId;
				},
			},
			[
				m('p.board__callout-text', point.proposal.statement),
				m('.board__callout-foot', [
					m(
						'span.board__callout-score.board__num',
						{ class: point.percent < 0 ? 'board__callout-score--against' : undefined },
						signed(point.percent),
					),
					m('span.board__callout-by', point.isMine ? t('board.you') : point.proposal.anonName),
				]),
				// The affordance said out loud: a card that merely looks pressable
				// is a card most of the class never presses
				m('span.board__callout-more', { 'aria-hidden': 'true' }, [
					m('span.board__callout-more-text', [
						m(Icon, { name: 'chart', size: 14 }),
						m('span', t('board.callout_more')),
					]),
					m('span.board__callout-more-arrow', isRTL() ? '←' : '→'),
				]),
			],
		);
	}

	function mapPoint(point: BoardPoint, topic: AgoraTopicPackage): m.Children {
		const selected = openId === point.proposal.statementId;

		return m(
			'button.board__point',
			{
				key: point.proposal.statementId,
				type: 'button',
				class: [
					point.isMine ? 'board__point--mine' : undefined,
					point.isLead ? 'board__point--lead' : undefined,
					selected ? 'board__point--selected' : undefined,
					openId && !selected ? 'board__point--dimmed' : undefined,
				]
					.filter(Boolean)
					.join(' '),
				style: {
					insetInlineStart: `${point.x}%`,
					insetBlockEnd: `${point.y}%`,
					width: `${point.size}px`,
					height: `${point.size}px`,
				},
				'aria-label': pointAria(point, topic),
				'aria-pressed': String(selected),
				onclick: () => {
					openId = selected ? '' : point.proposal.statementId;
				},
			},
			[
				point.isLead
					? m(
							'span.board__point-crown',
							{ 'aria-hidden': 'true' },
							m(Icon, { name: 'crown', size: 16 }),
						)
					: null,
				m('span.board__point-rank', { 'aria-hidden': 'true' }, String(point.rank)),
			],
		);
	}

	/**
	 * One line of the help: a miniature of the thing on the map, then five
	 * words. A row is a picture with a caption, not a sentence with a bullet —
	 * which is the whole reason the paragraph could be deleted.
	 */
	function helpRow(swatch: m.Children, line: string): m.Children {
		return m('.board__help-row', [
			m('span.board__help-swatch', { 'aria-hidden': 'true' }, swatch),
			m('span', line),
		]);
	}

	/** Escape closes the help, the same as pressing the tile again */
	function onHelpKey(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		helpOpen = false;
		m.redraw();
	}

	/**
	 * The map's instructions, folded into one tile.
	 *
	 * They used to be a 130-character paragraph printed above the field on every
	 * visit — the largest block of text on a screen whose entire point is that
	 * it can be read at a glance. Hover does not exist on a classroom phone, so
	 * the tooltip is a DISCLOSURE a thumb can hit rather than something pointed
	 * at, and it opens by itself the first time the board is shown in a session:
	 * the one encoding a student cannot guess (big dot = more raters) is taught
	 * exactly once, and never printed again.
	 */
	function help(): m.Children {
		if (!helpOpen) return null;

		return [
			m('button.board__help-scrim', {
				type: 'button',
				tabindex: -1,
				'aria-hidden': 'true',
				onclick: () => {
					helpOpen = false;
				},
			}),
			m(
				'.board__help-pop',
				{
					id: HELP_ID,
					role: 'region',
					tabindex: -1,
					'aria-label': t('board.help_aria'),
					oncreate: () => document.addEventListener('keydown', onHelpKey),
					onremove: () => document.removeEventListener('keydown', onHelpKey),
				},
				[
					helpRow(m('span.board__help-ramp'), t('board.help_up')),
					helpRow(m('span.board__help-zone'), t('board.help_zone')),
					helpRow(
						[
							m('span.board__help-dot.board__help-dot--sm'),
							m('span.board__help-dot.board__help-dot--md'),
							m('span.board__help-dot.board__help-dot--lg'),
						],
						t('board.help_size'),
					),
					helpRow(m('span.board__help-dot.board__help-dot--mine'), t('board.help_mine')),
					helpRow(m('span.board__help-dot.board__help-dot--lead'), t('board.help_lead')),
					helpRow(m(Icon, { name: 'chart', size: 20 }), t('board.help_tap')),
				],
			),
		];
	}

	function plot(points: BoardPoint[], topic: AgoraTopicPackage): m.Children {
		const placed = points.filter((point) => point.consensus !== undefined);
		const selected = placed.find((point) => point.proposal.statementId === openId);

		return m('.board__map', [
			m('.board__map-head', [
				m('p.board__eyebrow', t('board.map_title')),
				m(
					'button.board__help',
					{
						type: 'button',
						'aria-expanded': String(helpOpen),
						'aria-controls': HELP_ID,
						'aria-label': t('board.help_aria'),
						onclick: () => {
							helpOpen = !helpOpen;
						},
					},
					m('span', { 'aria-hidden': 'true' }, '?'),
				),
				help(),
			]),

			m('.board__plot-frame', [
				// The vertical axis reads bottom-up: the class's agreement. The
				// marks are pinned to the values they name — a rail that merely
				// spaces them evenly puts 0% somewhere it never sits. The rotated
				// title that used to stand beside them is gone: the field's own
				// red→green ramp says which way is up, and these two faces are the
				// same two the class pressed while rating.
				m('.board__axis-y', [
					m('.board__axis-y-marks', [
						m('span.board__axis-y-mark.board__axis-y-mark--top', [
							m(Icon, {
								name: 'face-strong-for',
								size: 18,
								class: 'board__axis-y-face board__axis-y-face--top',
							}),
							m('span.board__num', signed(100)),
						]),
						m('span.board__axis-y-mark.board__axis-y-mark--zero.board__num', '0%'),
						m('span.board__axis-y-mark.board__axis-y-mark--bottom', [
							m(Icon, {
								name: 'face-strong-against',
								size: 18,
								class: 'board__axis-y-face board__axis-y-face--bottom',
							}),
							m('span.board__num', signed(-100)),
						]),
					]),
				]),

				// The label the sighted paragraph used to carry now lives here, and
				// says MORE than it ever did: both axes, in one sentence, for the
				// one reader who cannot see the ramp
				m('.board__plot', { role: 'group', 'aria-label': t('board.plot_aria') }, [
					// The goal made into a place: whole-class backing, high agreement
					m('.board__bridge-zone', [
						m(
							'.board__bridge-chip',
							m('span.board__bridge-label', [
								m(Icon, { name: 'trophy', size: 14 }),
								m('span', t('board.zone_bridge')),
							]),
						),
					]),
					m('.board__grid-zero'),
					m('.board__grid-centre'),
					placed.length === 0
						? m('p.board__plot-empty', t('picture.empty'))
						: placed.map((point) => mapPoint(point, topic)),
					selected ? stem(selected) : null,
					selected ? callout(selected) : null,
				]),
			]),

			// The horizontal axis: who is actually behind it. The camp name IS the
			// swatch, and the sentence between them is two arrows meeting at a dot,
			// sitting under the centre column so the drawing points at the bridge.
			m('.board__axis-x', [
				m('span.board__axis-x-camp.board__axis-x-camp--left', topic.positioningScale.leftLabel),
				m('span.board__axis-x-mid', { 'aria-hidden': 'true' }, [
					m('span', '→'),
					m('span.board__axis-x-meet'),
					m('span', '←'),
				]),
				m('span.board__axis-x-camp.board__axis-x-camp--right', topic.positioningScale.rightLabel),
			]),
		]);
	}

	// ---------- the crown ----------

	function champion(points: BoardPoint[], attrs: ResultsBoardAttrs): m.Children {
		const lead = points.find((point) => point.isLead);
		if (!lead || lead.consensus === undefined) return null;

		countTo(lead.percent);
		const display = reducedMotion() ? lead.percent : shown;

		return m('.board__champion', { class: lead.isMine ? 'board__champion--mine' : undefined }, [
			m(
				'p.board__eyebrow',
				attrs.finale
					? iconLabel('trophy', t('board.champion_title'))
					: iconLabel('megaphone', t('board.champion_leading')),
			),
			m(
				'.board__champion-score.board__num',
				{
					class: lead.percent < 0 ? 'board__champion-score--against' : undefined,
					'aria-label': t('board.champion_aria', { n: lead.percent }),
				},
				signed(display),
			),
			m('p.board__champion-label', t('board.agreement_label')),
			m('p.board__champion-text', lead.proposal.statement),
			m('.board__champion-by', [
				lead.isMine
					? m('span.board__you', t('board.you'))
					: m('span.board__author', lead.proposal.anonName),
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

	// ---------- pressing a point: the actual score ----------

	/**
	 * One line of the arithmetic. `numeric` lines are bidi-isolated so a signed
	 * percent keeps its sign on the left in Hebrew and Arabic; sentence lines
	 * must stay in the page's own direction.
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
					m(
						'span.board__bucket-face',
						{ 'aria-hidden': 'true' },
						m(Icon, { name: BUCKET_ICONS[index], size: 20 }),
					),
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
			{
				key: 'center' as AgoraCamp,
				label: t('picture.camp_center'),
				color: '--camp-center-glow',
			},
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
				const point = ((clamp(mean, -1, 1) + 1) / 2) * 100;

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
	function detailBody(
		point: BoardPoint,
		points: BoardPoint[],
		topic: AgoraTopicPackage,
	): m.Children {
		const consensus = point.consensus;
		const score = point.score;
		if (!consensus || !score) {
			return m('p.board__detail-empty', t('board.unrated_detail'));
		}

		const meanPercent = Math.round(consensus.mean * 100);
		const caution = Math.max(0, meanPercent - point.percent);
		const ceiling = Math.round(consensusCeiling(consensus.n, consensus.eligible) * 100);
		const leader = points.find((candidate) => candidate.isLead);
		const behind = leader ? leader.percent - point.percent : 0;

		return m('.board__detail', [
			// The headline of the sub-screen: the score this whole page is about,
			// at the size of the thing being explained
			m('.board__detail-hero', [
				m('span.board__rank', rankBadge(point.rank)),
				m(
					'span.board__detail-score.board__num',
					{ class: point.percent < 0 ? 'board__detail-score--against' : undefined },
					signed(point.percent),
				),
				m('span.board__detail-score-label', t('board.agreement_label')),
			]),
			m('p.board__detail-statement', point.proposal.statement),
			m('p.board__detail-title', t('board.detail_title')),
			m('.board__stats', [
				statLine(t('board.detail_mean'), signed(meanPercent)),
				statLine(t('board.detail_caution'), `−${caution}%`),
				statLine(t('board.detail_cp'), signed(point.percent), { strong: true }),
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
				statLine(t('board.detail_backing'), sideLabel(point, topic), { numeric: false }),
				statLine(
					t('board.detail_rank'),
					behind > 0
						? t('board.detail_behind', { n: behind, rank: point.rank })
						: // Level with the leader without BEING the leader: the old
							// two-way branch told a joint-second proposal that nobody
							// scored higher, which the map beside it contradicted
							t(point.isLead ? 'board.detail_leader' : 'board.detail_tied'),
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

	/** Escape leaves the sub-screen, the same as the back tile */
	function onDetailKey(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		detailId = '';
		m.redraw();
	}

	/**
	 * The full statistics as a PLACE, not as a fold.
	 *
	 * Same chrome as every other place in the game (a bar, a back tile, a
	 * title) so travelling here from the map feels like the trip to a thread
	 * rather than a card growing. It covers the dock deliberately: this screen
	 * is one proposal's numbers and nothing else, and the way back is the one
	 * button.
	 */
	function detailScreen(points: BoardPoint[], topic: AgoraTopicPackage): m.Children {
		const point = points.find((candidate) => candidate.proposal.statementId === detailId);
		if (!point) return null;

		const sheet = m(
			'.board-detail',
			{
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': t('board.detail_screen_title'),
				oncreate: () => {
					focusBeforeDetail =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
					document.addEventListener('keydown', onDetailKey);
				},
				onremove: () => {
					document.removeEventListener('keydown', onDetailKey);
					// Back to the point that was pressed, so the keyboard resumes
					// where it left the map
					focusBeforeDetail?.focus();
					focusBeforeDetail = null;
				},
			},
			[
				m('header.board-detail__bar', [
					m(
						'button.board-detail__back',
						{
							type: 'button',
							'aria-label': t('common.back'),
							// Rendered through the portal, so the redraw is ours to ask for
							onclick: () => {
								detailId = '';
								m.redraw();
							},
							oncreate: (node: m.VnodeDOM) => (node.dom as HTMLElement).focus(),
						},
						m('span', { 'aria-hidden': 'true' }, isRTL() ? '→' : '←'),
					),
					m('.board-detail__who', [
						m('span.board-detail__title', t('board.detail_screen_title')),
						m('span.board-detail__sub', point.isMine ? t('board.you') : point.proposal.anonName),
					]),
				]),
				m('.board-detail__body', detailBody(point, points, topic)),
			],
		);

		return m(Portal, { content: sheet });
	}

	/** Proposals with no rating at all: named, so nobody's text silently vanishes */
	function unplaced(points: BoardPoint[]): m.Children {
		const waiting = points.filter((point) => point.consensus === undefined);
		if (waiting.length === 0) return null;

		return m('.board__waiting', [
			m('p.board__waiting-title', t('board.unrated')),
			m(
				'.board__waiting-list',
				waiting.map((point) =>
					m('span.board__waiting-chip', { key: point.proposal.statementId }, [
						point.isMine
							? m('span.board__you', t('board.you'))
							: m('span.board__author', point.proposal.anonName),
						m('span.board__waiting-text', point.proposal.statement),
					]),
				),
			),
		]);
	}

	return {
		onremove() {
			if (timer) clearInterval(timer);
		},

		view(vnode) {
			const attrs = vnode.attrs;
			const points = buildPoints(attrs);

			if (points.length === 0) {
				return m('.board.board--empty', [
					m(
						'span.board__empty-icon',
						{ 'aria-hidden': 'true' },
						m(Icon, { name: 'chart', size: 32 }),
					),
					m('p.board__empty', t('picture.empty')),
				]);
			}

			if (attrs.finale) cheerOnce(points);
			const mine = points.find((point) => point.isMine);

			return m('.board', [
				champion(points, attrs),

				mine
					? m(
							'p.board__my-standing',
							{ class: mine.rank <= MEDAL_RANKS.length ? 'board__my-standing--podium' : undefined },
							mine.consensus === undefined
								? // Mid-lesson "nobody has rated it YET" and end-of-lesson
									// "nobody ever did" are different facts. Only the finale
									// is entitled to the past tense.
									t(attrs.finale ? 'board.my_standing_unrated' : 'board.my_standing_waiting')
								: t('board.my_standing', {
										rank: mine.rank,
										total: points.length,
										n: isolate(signed(mine.percent)),
									}),
						)
					: null,

				plot(points, attrs.topic),
				unplaced(points),
				detailScreen(points, attrs.topic),
			]);
		},
	};
}
