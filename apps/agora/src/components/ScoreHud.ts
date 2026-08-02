import m from 'mithril';
import { t } from '../lib/i18n';
import { celebrate } from '../lib/celebration';
import { AgoraProposal } from '../lib/proposals';
import {
	AgoraParticipant,
	AgoraProposalScore,
	AgoraSession,
	AgoraTopicPackage,
	AGORA_POINTS,
	AGORA_SESSION,
} from '@freedi/shared-types';

export type ScoreHudStep = 'mine' | 'rate' | 'help' | 'done';

export interface ScoreHudAttrs {
	session: AgoraSession;
	topic: AgoraTopicPackage;
	myParticipant: AgoraParticipant;
	myProposal?: AgoraProposal;
	proposals: readonly AgoraProposal[];
	scores: Readonly<Record<string, AgoraProposalScore>>;
	userId: string;
	step: ScoreHudStep;
	ratingsMoved: number;
	/** Jump straight to the help step (helping tile CTA) */
	onGoHelp?: () => void;
}

/** One bar of "the square": a proposal's live support geometry */
interface ChartBar {
	proposal: AgoraProposal;
	number: number;
	/** Net average support across all camps, -1..1 (0 when unrated) */
	avg: number;
	raters: number;
	leftN: number;
	rightN: number;
	centerN: number;
	leftSupport: number | undefined;
	rightSupport: number | undefined;
	bridging: number;
	isMine: boolean;
	isTop: boolean;
}

/** Count-up state for one displayed metric (PointsPill idiom) */
interface TickState {
	shown: number;
	timer: ReturnType<typeof setInterval> | null;
	delta: number;
	deltaUntil: number;
}

const DELTA_MS = 1400;
const RECORD_MS = 3000;
const BAR_NUMBERS_MAX = 12;

function reducedMotion(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

function campAvg(aggregate: { sum: number; n: number } | undefined): number | undefined {
	if (!aggregate || aggregate.n === 0) return undefined;

	return Math.max(-1, Math.min(1, aggregate.sum / aggregate.n));
}

/** Live class score: the best agreement any proposal has reached so far */
export function liveClassMax(scores: Readonly<Record<string, AgoraProposalScore>>): number {
	let max = 0;
	for (const score of Object.values(scores)) {
		if (score.bridgingScore > max) max = score.bridgingScore;
	}

	return max;
}

function buildBars(
	proposals: readonly AgoraProposal[],
	scores: Readonly<Record<string, AgoraProposalScore>>,
	userId: string,
): ChartBar[] {
	const classMax = liveClassMax(scores);
	let topTaken = false;

	return proposals.map((proposal, index) => {
		const score = scores[proposal.statementId];
		const leftN = score?.perCamp.left.n ?? 0;
		const rightN = score?.perCamp.right.n ?? 0;
		const centerN = score?.perCamp.center.n ?? 0;
		const raters = leftN + rightN + centerN;
		const sum =
			(score?.perCamp.left.sum ?? 0) +
			(score?.perCamp.right.sum ?? 0) +
			(score?.perCamp.center.sum ?? 0);
		const bridging = score?.bridgingScore ?? 0;
		const isTop = !topTaken && classMax > 0 && bridging === classMax;
		if (isTop) topTaken = true;

		return {
			proposal,
			number: index + 1,
			avg: raters > 0 ? Math.max(-1, Math.min(1, sum / raters)) : 0,
			raters,
			leftN,
			rightN,
			centerN,
			leftSupport: campAvg(score?.perCamp.left),
			rightSupport: campAvg(score?.perCamp.right),
			bridging,
			isMine: proposal.creatorId === userId,
			isTop,
		};
	});
}

/**
 * The game scoreboard HUD — "Raising the Festival Bridge".
 * Hero: the CLASS score (best agreement any proposal reached, the shared win
 * condition) as a bridge meter with a goal flag at the success threshold.
 * Below: my proposal score + helping points as game tiles, and "the square" —
 * a variable-width bar chart of every proposal (height = net support, width =
 * raters, split by camp colors). Cooperative, never shaming: low numbers read
 * as "early game" and every score names the action that moves it.
 */
export function ScoreHud(initialVnode: m.Vnode<ScoreHudAttrs>): m.Component<ScoreHudAttrs> {
	const { session } = initialVnode.attrs;
	const hudKey = `agora_${session.sessionId}_hud`;
	const maxKey = `agora_${session.sessionId}_classmax`;

	/** User's explicit expand/collapse choice ('open' | 'closed'), if any */
	let userToggle = sessionStorage.getItem(hudKey);
	let selectedBarId = '';
	let recordUntil = 0;
	const ticks: Record<string, TickState> = {};
	const timeouts: Array<ReturnType<typeof setTimeout>> = [];

	function later(callback: () => void, ms: number): void {
		timeouts.push(
			setTimeout(() => {
				callback();
				m.redraw();
			}, ms),
		);
	}

	/** Chase `target`; on an increase, arm the one-shot "+n" chip */
	function tick(key: string, target: number): TickState {
		const state = (ticks[key] ??= { shown: target, timer: null, delta: 0, deltaUntil: 0 });
		if (state.shown === target || state.timer) return state;
		if (target > state.shown) {
			state.delta = target - state.shown;
			state.deltaUntil = Date.now() + DELTA_MS;
			later(() => undefined, DELTA_MS);
		}
		if (reducedMotion()) {
			state.shown = target;

			return state;
		}
		state.timer = setInterval(() => {
			const step = Math.max(1, Math.ceil(Math.abs(target - state.shown) / 6));
			state.shown += state.shown < target ? step : -step;
			if (Math.abs(target - state.shown) <= 0 || (step > 0 && state.shown === target)) {
				state.shown = target;
				if (state.timer) clearInterval(state.timer);
				state.timer = null;
			}
			m.redraw();
		}, 60);

		return state;
	}

	/** Record + goal moments, seeded from sessionStorage so reloads stay quiet */
	function trackRecord(classMax: number, threshold: number): void {
		const stored = sessionStorage.getItem(maxKey);
		if (stored === null) {
			sessionStorage.setItem(maxKey, String(classMax));

			return;
		}
		const previous = Number(stored);
		if (classMax <= previous) return;
		sessionStorage.setItem(maxKey, String(classMax));
		recordUntil = Date.now() + RECORD_MS;
		later(() => undefined, RECORD_MS);
		if (previous < threshold && classMax >= threshold) {
			celebrate({ message: t('hud.goal_reached') });
		}
	}

	function setOpen(open: boolean): void {
		userToggle = open ? 'open' : 'closed';
		sessionStorage.setItem(hudKey, userToggle);
	}

	function deltaChip(state: TickState): m.Children {
		if (state.delta <= 0 || Date.now() >= state.deltaUntil) return null;

		return m(
			'span.scorehud__delta',
			{ 'aria-hidden': 'true' },
			t('hud.delta_up', { n: state.delta }),
		);
	}

	// ---------- hero: the class bridge ----------

	function classHint(step: ScoreHudStep, hasScores: boolean, goalReached: boolean): string {
		if (goalReached) return t('hud.goal_reached');
		if (!hasScores) return t('hud.class_hint_empty');

		return t(`hud.class_hint_${step}`);
	}

	function classHero(
		topic: AgoraTopicPackage,
		classMax: number,
		threshold: number,
		step: ScoreHudStep,
		hasScores: boolean,
	): m.Children {
		const state = tick('class', classMax);
		const goalReached = classMax >= threshold;
		const recordNow = Date.now() < recordUntil;

		return m('.scorehud__class', [
			// The stadium header: camp banner ribbons flanking the score plate
			m('.scorehud__header', [
				m('span.scorehud__banner.scorehud__banner--left', topic.positioningScale.leftLabel),
				m('.scorehud__plate', [
					m(
						'span.scorehud__class-label',
						recordNow ? `✨ ${t('hud.record_broken')}` : t('hud.class_label'),
					),
					m(
						'span.scorehud__class-value',
						{ 'aria-label': t('hud.class_aria', { score: classMax, goal: threshold }) },
						hasScores
							? [String(state.shown), m('span.scorehud__class-max', '/100'), deltaChip(state)]
							: m(
									'span.scorehud__class-dash',
									{ 'aria-label': t('hud.class_empty_dash_aria') },
									'—',
								),
					),
				]),
				m('span.scorehud__banner.scorehud__banner--right', topic.positioningScale.rightLabel),
			]),
			m('.scorehud__meter', [
				m('.scorehud__meter-goalzone', { style: { insetInlineStart: `${threshold}%` } }),
				m(
					'.scorehud__meter-fill',
					{ style: { width: `${Math.max(0, Math.min(100, state.shown))}%` } },
					m('span.scorehud__meter-spark'),
				),
				m('.scorehud__goal', { style: { insetInlineStart: `${threshold}%` } }, [
					m('span.scorehud__goal-flag'),
					m('span.scorehud__goal-num', t('hud.goal_num', { n: threshold })),
				]),
			]),
			m('p.scorehud__class-hint', classHint(step, hasScores, goalReached)),
		]);
	}

	// ---------- the stat board: rows with per-camp side chips ----------

	/** A camp value chip: signed percent, or an empty socket before any raters */
	function campChip(side: 'left' | 'right', value: number | undefined): m.Children {
		return m(
			`span.scorehud__chip.scorehud__chip--${side}`,
			{ class: value === undefined ? 'scorehud__chip--empty' : undefined },
			value === undefined ? '—' : `${Math.round(value * 100)}%`,
		);
	}

	/** Static stat row: left-camp count | centered label | right-camp count */
	function statRow(label: string, leftN: number, rightN: number): m.Children {
		return m('.scorehud__row', [
			m('span.scorehud__chip.scorehud__chip--left', String(leftN)),
			m('span.scorehud__row-label', label),
			m('span.scorehud__chip.scorehud__chip--right', String(rightN)),
		]);
	}

	function mineTile(
		myProposal: AgoraProposal | undefined,
		myScore: AgoraProposalScore | undefined,
		ratingsMoved: number,
		detailOpen: boolean,
		onToggleDetail: () => void,
	): m.Children {
		const raters = myScore
			? myScore.perCamp.left.n + myScore.perCamp.right.n + myScore.perCamp.center.n
			: 0;
		const hasScore = myProposal !== undefined && raters > 0;
		const state = hasScore ? tick('mine', myScore?.bridgingScore ?? 0) : undefined;
		// The loop-closing signal outranks the generic hint: classmates re-rated
		// after my latest improvement — worth seeing without opening the detail
		const moved = ratingsMoved > 0;
		const hint = moved
			? `📈 ${t('delib.ratings_moved', { n: ratingsMoved })}`
			: !myProposal
				? t('hud.mine_no_score')
				: !hasScore
					? t('hud.mine_waiting')
					: t('hud.mine_hint');

		return m(
			'button.scorehud__tile.scorehud__tile--mine',
			{
				type: 'button',
				'aria-expanded': String(detailOpen),
				'aria-label': t('hud.tile_mine_aria', { n: myScore?.bridgingScore ?? 0 }),
				onclick: onToggleDetail,
			},
			[
				campChip('left', campAvg(myScore?.perCamp.left)),
				m('span.scorehud__tile-mid', [
					m('span.scorehud__tile-label', [
						t('hud.mine_label'),
						state
							? m(
									'span.scorehud__tile-score',
									{ class: state.timer ? 'scorehud__tile-value--ticking' : undefined },
									[` · ${state.shown}`, deltaChip(state)],
								)
							: null,
					]),
					m(
						'span.scorehud__tile-hint',
						{ class: moved ? 'scorehud__tile-hint--moved' : undefined },
						`${hint} ↗`,
					),
				]),
				campChip('right', campAvg(myScore?.perCamp.right)),
			],
		);
	}

	function helpingTile(points: number, step: ScoreHudStep, onGoHelp?: () => void): m.Children {
		const state = tick('helping', points);

		return m(
			'button.scorehud__tile.scorehud__tile--helping',
			{
				type: 'button',
				'aria-label': t('hud.tile_helping_aria', { n: points }),
				onclick: () => {
					if (step !== 'help' && onGoHelp) onGoHelp();
				},
			},
			[
				m('span.scorehud__tile-mid', [
					m('span.scorehud__tile-label', t('hud.helping_label')),
					m(
						'span.scorehud__tile-hint',
						`${t('hud.helping_hint', { n: AGORA_POINTS.SUGGESTION_ACCEPTED })} ↗`,
					),
				]),
				m(
					'span.scorehud__chip.scorehud__chip--gold',
					{ class: state.timer ? 'scorehud__tile-value--ticking' : undefined },
					[String(state.shown), deltaChip(state)],
				),
			],
		);
	}

	// ---------- my per-camp breakdown (reuses .scoreboard__camp* styles) ----------

	let detailOpen = false;

	function campColumn(
		label: string,
		colorVar: string,
		aggregate: { sum: number; n: number } | undefined,
	): m.Children {
		const n = aggregate?.n ?? 0;
		const support = n > 0 ? Math.max(0, Math.min(1, (aggregate?.sum ?? 0) / n)) : 0;

		return m('.scoreboard__camp', [
			m('.scoreboard__camp-name', [
				m('span.camp-bar__dot', { style: { background: `var(${colorVar})` } }),
				m('span', { style: { color: `var(${colorVar})` } }, label),
			]),
			m('.scoreboard__camp-track', [
				m('.scoreboard__camp-fill', {
					style: { width: `${support * 100}%`, background: `var(${colorVar})` },
				}),
			]),
			m('span.scoreboard__camp-count', t('delib.raters_count', { n })),
		]);
	}

	function mineDetail(
		topic: AgoraTopicPackage,
		myScore: AgoraProposalScore | undefined,
		ratingsMoved: number,
	): m.Children {
		if (!detailOpen) return null;

		return m('.scorehud__detail.scorehud__detail--open', { role: 'region' }, [
			m('.scorehud__camps', [
				campColumn(topic.positioningScale.leftLabel, '--camp-left-glow', myScore?.perCamp.left),
				m('.scoreboard__divider'),
				campColumn(topic.positioningScale.rightLabel, '--camp-right-glow', myScore?.perCamp.right),
			]),
			ratingsMoved > 0
				? m('p.scorehud__moved', `📈 ${t('delib.ratings_moved', { n: ratingsMoved })}`)
				: null,
		]);
	}

	// ---------- the square: variable-width support chart ----------

	function barAria(bar: ChartBar, topic: AgoraTopicPackage): string {
		let label = t('chart.bar_aria', {
			n: bar.number,
			support: Math.round(bar.avg * 100),
			raters: bar.raters,
			left: bar.leftN,
			leftLabel: topic.positioningScale.leftLabel,
			right: bar.rightN,
			rightLabel: topic.positioningScale.rightLabel,
		});
		if (bar.isMine) label += ` ${t('chart.bar_mine_aria')}`;
		if (bar.isTop) label += ` ${t('chart.bar_top_aria')}`;

		return label;
	}

	function chartBar(bar: ChartBar, topic: AgoraTopicPackage, showNumbers: boolean): m.Children {
		const width = Math.max(12, Math.min(44, 8 + bar.raters * 4));
		const negative = bar.avg < 0;
		const height = Math.abs(bar.avg) * 50;
		const segments: m.Children[] = [];
		if (bar.raters > 0) {
			const share = (n: number) => `${(n / bar.raters) * 100}%`;
			if (bar.leftN > 0)
				segments.push(
					m('span.support-chart__seg.support-chart__seg--left', {
						style: { flexBasis: share(bar.leftN) },
					}),
				);
			if (bar.centerN > 0)
				segments.push(
					m('span.support-chart__seg.support-chart__seg--center', {
						style: { flexBasis: share(bar.centerN) },
					}),
				);
			if (bar.rightN > 0)
				segments.push(
					m('span.support-chart__seg.support-chart__seg--right', {
						style: { flexBasis: share(bar.rightN) },
					}),
				);
		}

		return m(
			'button.support-chart__bar',
			{
				key: bar.proposal.statementId,
				type: 'button',
				class: [
					bar.isMine ? 'support-chart__bar--mine' : undefined,
					bar.isTop ? 'support-chart__bar--top' : undefined,
					negative ? 'support-chart__bar--negative' : undefined,
					selectedBarId === bar.proposal.statementId ? 'support-chart__bar--selected' : undefined,
					selectedBarId && selectedBarId !== bar.proposal.statementId
						? 'support-chart__bar--dimmed'
						: undefined,
				]
					.filter(Boolean)
					.join(' '),
				style: { width: `${width}px` },
				'aria-label': barAria(bar, topic),
				'aria-pressed': String(selectedBarId === bar.proposal.statementId),
				onclick: () => {
					selectedBarId =
						selectedBarId === bar.proposal.statementId ? '' : bar.proposal.statementId;
				},
			},
			[
				bar.raters > 0
					? m(
							'span.support-chart__col',
							{
								class: negative ? 'support-chart__col--negative' : undefined,
								style: negative
									? { top: '50%', height: `${Math.max(2, height)}%` }
									: { bottom: '50%', height: `${Math.max(2, height)}%` },
							},
							segments,
						)
					: m('span.support-chart__col.support-chart__col--ghost', {
							style: { bottom: '50%', height: '2%' },
						}),
				bar.isMine ? m('span.support-chart__keel') : null,
				showNumbers ? m('span.support-chart__num', String(bar.number)) : null,
			],
		);
	}

	function supportRow(label: string, colorVar: string, value: number | undefined): m.Children {
		return m('.estimate__row', [
			m('span.estimate__label', { style: { color: `var(${colorVar})` } }, label),
			m('.estimate__track', [
				value !== undefined
					? m('.estimate__fill', {
							class: value < 0 ? 'chart-detail__fill--negative' : undefined,
							style: { width: `${Math.abs(value) * 100}%`, background: `var(${colorVar})` },
						})
					: null,
			]),
			m('span.estimate__value', value !== undefined ? `${Math.round(value * 100)}%` : '—'),
		]);
	}

	function chartDetail(bars: ChartBar[], topic: AgoraTopicPackage): m.Children {
		const bar = bars.find((candidate) => candidate.proposal.statementId === selectedBarId);
		if (!bar) return null;

		return m('.chart-detail', { 'aria-live': 'polite' }, [
			m('.owner-row.chart-detail__head', [
				m(
					'span.owner-chip',
					{ class: bar.isMine ? 'owner-chip--mine' : 'owner-chip--peer' },
					bar.isMine ? `📘 ${t('delib.owner_mine')}` : `📙 ${t('delib.owner_peer')}`,
				),
				m('span.owner-row__number', t('delib.proposal_number', { n: bar.number })),
				bar.isTop ? m('span.chart-detail__crown', `🏆 ${t('hud.record_holder')}`) : null,
			]),
			m('p.chart-detail__text', bar.proposal.statement),
			m('.chart-detail__stats', [
				supportRow(topic.positioningScale.leftLabel, '--camp-left-glow', bar.leftSupport),
				supportRow(topic.positioningScale.rightLabel, '--camp-right-glow', bar.rightSupport),
				m('.estimate__row', [
					m('span.estimate__label.chart-detail__bridge-label', t('delib.bridge_power')),
					m('.estimate__track', [
						m('.estimate__fill.chart-detail__bridge-fill', {
							style: { width: `${bar.bridging}%` },
						}),
					]),
					m('span.estimate__value', `${bar.bridging}/100`),
				]),
				m('p.chart-detail__raters', t('delib.raters_count', { n: bar.raters })),
			]),
			m(
				'button.btn.btn--ghost.chart-detail__close',
				{
					onclick: () => {
						selectedBarId = '';
					},
				},
				t('chart.detail_close'),
			),
		]);
	}

	function supportChart(bars: ChartBar[], topic: AgoraTopicPackage): m.Children {
		const showNumbers = bars.length <= BAR_NUMBERS_MAX;

		return m('.support-chart', { role: 'group', 'aria-label': t('chart.title_aria') }, [
			m('p.support-chart__title', t('chart.title')),
			m('.support-chart__legend', [
				m('span.support-chart__legend-item', [
					m('span.camp-bar__dot', { style: { background: 'var(--camp-left)' } }),
					topic.positioningScale.leftLabel,
				]),
				m('span.support-chart__legend-item', [
					m('span.camp-bar__dot', { style: { background: 'var(--camp-center)' } }),
					t('chart.legend_center'),
				]),
				m('span.support-chart__legend-item', [
					m('span.camp-bar__dot', { style: { background: 'var(--camp-right)' } }),
					topic.positioningScale.rightLabel,
				]),
			]),
			bars.length === 0
				? m('.support-chart__empty', [
						m('.support-chart__plot.support-chart__plot--ghost', [
							m('.support-chart__zero'),
							m('span.support-chart__ghost', { style: { height: '30%', bottom: '50%' } }),
							m('span.support-chart__ghost', { style: { height: '55%', bottom: '50%' } }),
							m('span.support-chart__ghost', { style: { height: '40%', bottom: '50%' } }),
						]),
						m('p.support-chart__empty-caption', t('chart.empty')),
					])
				: m('.support-chart__scroll', [
						m('.support-chart__plot', [
							m('.support-chart__zero'),
							m('span.support-chart__axis.support-chart__axis--up', t('chart.axis_support')),
							m('span.support-chart__axis.support-chart__axis--down', t('chart.axis_oppose')),
							bars.map((bar) => chartBar(bar, topic, showNumbers)),
						]),
					]),
			chartDetail(bars, topic),
		]);
	}

	// ---------- collapsed strip ----------

	function collapsedStrip(
		classMax: number,
		threshold: number,
		myScore: AgoraProposalScore | undefined,
		helping: number,
		hasScores: boolean,
	): m.Children {
		const state = tick('class', classMax);
		const recordNow = Date.now() < recordUntil;

		return m(
			'button.scorehud.scorehud--collapsed',
			{
				type: 'button',
				class: [
					classMax >= threshold ? 'scorehud--goal' : undefined,
					recordNow ? 'scorehud--record' : undefined,
				]
					.filter(Boolean)
					.join(' '),
				'aria-expanded': 'false',
				'aria-label': t('hud.expand'),
				onclick: () => {
					setOpen(true);
				},
			},
			[
				m('span.scorehud__strip-item.scorehud__strip-item--class', [
					'🌉 ',
					m('strong', hasScores ? String(state.shown) : '—'),
					deltaChip(state),
				]),
				m('span.scorehud__strip-meter', [
					m('span.scorehud__strip-fill', {
						style: { width: `${Math.max(0, Math.min(100, state.shown))}%` },
					}),
					m('span.scorehud__strip-goal', { style: { insetInlineStart: `${threshold}%` } }),
				]),
				m('span.scorehud__strip-item', `📘 ${myScore ? myScore.bridgingScore : '—'}`),
				m('span.scorehud__strip-item', `🤝 ${helping}`),
				m('span.scorehud__chevron.scorehud__chevron--down'),
			],
		);
	}

	return {
		onremove() {
			for (const state of Object.values(ticks)) {
				if (state.timer) clearInterval(state.timer);
			}
			timeouts.forEach((timeout) => clearTimeout(timeout));
		},

		view(vnode) {
			const {
				session: live,
				topic,
				myParticipant,
				myProposal,
				proposals,
				scores,
				userId,
				step,
				ratingsMoved,
				onGoHelp,
			} = vnode.attrs;
			const threshold = live.classScore?.threshold ?? AGORA_SESSION.SUCCESS_THRESHOLD;
			const classMax = liveClassMax(scores);
			const hasScores = Object.keys(scores).length > 0 && proposals.length > 0;
			trackRecord(classMax, threshold);

			// Lap 1, still writing: the hero alone — a promise of the game ahead
			if (!myProposal) {
				return m('section.scorehud.scorehud--intro', [
					classHero(topic, classMax, threshold, step, hasScores),
				]);
			}

			const open = userToggle !== null ? userToggle === 'open' : step === 'mine' || step === 'done';
			const myScore = scores[myProposal.statementId];

			if (!open) {
				return collapsedStrip(
					classMax,
					threshold,
					myScore,
					myParticipant.points.helping,
					hasScores,
				);
			}

			const bars = buildBars(proposals, scores, userId);
			const recordNow = Date.now() < recordUntil;
			// Whole-class activity: total ratings per camp across all proposals —
			// a number every student's own rating visibly moves
			const classLeftN = Object.values(scores).reduce(
				(sum, score) => sum + score.perCamp.left.n,
				0,
			);
			const classRightN = Object.values(scores).reduce(
				(sum, score) => sum + score.perCamp.right.n,
				0,
			);

			return m(
				'section.scorehud',
				{
					class: [
						classMax >= threshold ? 'scorehud--goal' : undefined,
						recordNow ? 'scorehud--record' : undefined,
					]
						.filter(Boolean)
						.join(' '),
				},
				[
					classHero(topic, classMax, threshold, step, hasScores),
					m('.scorehud__tiles', [
						mineTile(myProposal, myScore, ratingsMoved, detailOpen, () => {
							detailOpen = !detailOpen;
						}),
						statRow(
							t('hud.row_ratings_mine'),
							myScore?.perCamp.left.n ?? 0,
							myScore?.perCamp.right.n ?? 0,
						),
						statRow(t('hud.row_class_ratings'), classLeftN, classRightN),
						helpingTile(myParticipant.points.helping, step, onGoHelp),
					]),
					mineDetail(topic, myScore, ratingsMoved),
					supportChart(bars, topic),
					m(
						'button.scorehud__toggle',
						{
							type: 'button',
							'aria-expanded': 'true',
							onclick: () => {
								setOpen(false);
							},
						},
						[t('hud.collapse'), m('span.scorehud__chevron.scorehud__chevron--up')],
					),
				],
			);
		},
	};
}
