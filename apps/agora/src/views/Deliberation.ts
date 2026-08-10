import m from 'mithril';
import { t, tCount } from '../lib/i18n';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
	submitProposal,
	rateProposal,
	askCharacterReview,
	getHelpedProposals,
	getOwnerThreads,
	getThreadMessages,
	isSuggestionKind,
	AgoraProposal,
	AgoraRating,
	HelpedProposal,
} from '../lib/proposals';
import { orderSquare, studentOrder as studentOrderFor } from '../lib/squareOrder';
import { CountdownTimer } from '../components/CountdownTimer';
import { Collapsible } from '../components/Collapsible';
import { ThreadChat, threadEntry } from './ThreadChat';
import {
	registerHelpedNavigator,
	unregisterHelpedNavigator,
	registerMineNavigator,
	unregisterMineNavigator,
} from '../lib/helpedFocus';
import { EraMapLantern } from '../components/EraMap';
import { NeedsPeek } from '../components/NeedsBoard';
import { celebrate } from '../lib/celebration';
import {
	flushSeenState,
	isEditedSinceSeen,
	isNewToMe,
	markProposalSeen,
	seedSeenBaselineIfNeeded,
	seenEditWatermark,
	threadUnreadCount,
} from '../lib/seenState';
import {
	AgoraCharacter,
	AgoraCharacterReview,
	AgoraParticipant,
	AgoraProposalScore,
	AgoraSession,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	AGORA_CYCLE,
	AGORA_LIMITS,
	createAgoraCharacterReviewId,
	createAgoraThreadKey,
} from '@freedi/shared-types';

export interface DeliberationAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
	topic: AgoraTopicPackage;
}

export function lanternsFromState(
	proposals: readonly AgoraProposal[],
	scores: Readonly<
		Record<
			string,
			{
				bridgingScore: number;
				perCamp: {
					left: { sum: number; n: number };
					right: { sum: number; n: number };
					center: { sum: number; n: number };
				};
			}
		>
	>,
	userId: string,
): EraMapLantern[] {
	return proposals.map((proposal) => {
		const score = scores[proposal.statementId];
		const leftN = score?.perCamp.left.n ?? 0;
		const rightN = score?.perCamp.right.n ?? 0;
		const positives = (score?.perCamp.left.sum ?? 0) + (score?.perCamp.right.sum ?? 0);
		const raters = leftN + rightN + (score?.perCamp.center.n ?? 0);

		return {
			id: proposal.statementId,
			brightness: raters > 0 ? Math.max(0, Math.min(1, positives / Math.max(3, raters))) : 0.2,
			leftShare: leftN + rightN > 0 ? leftN / (leftN + rightN) : 0.5,
			bridging: (score?.bridgingScore ?? 0) / 100,
			isMine: proposal.creatorId === userId,
		};
	});
}

/**
 * Each cycle step is a PLACE the student travels to, not a toggled mode —
 * playtests showed color coding alone couldn't separate "mine" from "help".
 * The banner scene, wash and icon repeat in the cycle strip and splashes,
 * so every surface tells the same "where am I?" story.
 */
const PLACES: Record<
	'mine' | 'rate' | 'help',
	{ icon: string; titleKey: string; subKey: string; shellClass: string }
> = {
	mine: {
		icon: '🛠️',
		titleKey: 'place.mine_title',
		subKey: 'place.mine_sub',
		shellClass: 'shell--place-mine',
	},
	rate: {
		icon: '⚖️',
		titleKey: 'place.rate_title',
		subKey: 'place.rate_sub',
		shellClass: 'shell--place-square',
	},
	help: {
		icon: '🤝',
		titleKey: 'place.help_title',
		subKey: 'place.help_sub',
		shellClass: 'shell--place-visit',
	},
};

/** Tiny inline scene per place — same visual language as the EraMap */
function placeScene(kind: 'mine' | 'rate' | 'help'): m.Children {
	const svg = (children: m.Children) =>
		m(
			'svg',
			{ viewBox: '0 0 200 64', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' },
			children,
		);

	if (kind === 'mine') {
		// My workbench: a table with MY blue lantern hanging above it
		return svg([
			m('rect', { x: 40, y: 44, width: 120, height: 6, rx: 3, fill: '#a97e52' }),
			m('rect', { x: 52, y: 50, width: 8, height: 12, fill: '#8a6a45' }),
			m('rect', { x: 140, y: 50, width: 8, height: 12, fill: '#8a6a45' }),
			m('line', { x1: 100, y1: 4, x2: 100, y2: 16, stroke: '#8a6a45', 'stroke-width': 2 }),
			m('circle', { cx: 100, cy: 26, r: 13, fill: '#ffd23f', opacity: 0.35 }),
			m('rect', { x: 93, y: 18, width: 14, height: 17, rx: 4, fill: '#2b6fd6' }),
			m('rect', { x: 96, y: 22, width: 8, height: 9, rx: 2, fill: '#ffd23f' }),
			m('rect', {
				x: 70,
				y: 36,
				width: 26,
				height: 8,
				rx: 1.5,
				fill: '#fff8ea',
				transform: 'rotate(-6 83 40)',
			}),
			m('rect', {
				x: 108,
				y: 37,
				width: 20,
				height: 7,
				rx: 1.5,
				fill: '#efe3c8',
				transform: 'rotate(4 118 40)',
			}),
		]);
	}

	if (kind === 'rate') {
		// The open square: obelisk + a row of classmates' lanterns to weigh
		return svg([
			m('ellipse', { cx: 100, cy: 56, rx: 86, ry: 8, fill: '#f2e4c6' }),
			m('path', { d: 'M97 54 L99 18 L101 18 L103 54 Z', fill: '#d3c6ab' }),
			m('circle', { cx: 100, cy: 14, r: 5, fill: '#ffd23f' }),
			[46, 68, 132, 154].map((x, index) =>
				m('g', { key: `lantern-${x}` }, [
					m('line', { x1: x, y1: 30, x2: x, y2: 38, stroke: '#8a6a45', 'stroke-width': 1.5 }),
					m('rect', {
						x: x - 5,
						y: 38,
						width: 10,
						height: 12,
						rx: 3,
						fill: index % 2 === 0 ? '#8a52cf' : '#14a08f',
					}),
					m('rect', { x: x - 2.5, y: 41, width: 5, height: 6, rx: 1, fill: '#ffd23f' }),
				]),
			),
		]);
	}

	// Visiting a classmate's stand: an orange-awning market stall
	return svg([
		m('rect', { x: 58, y: 34, width: 84, height: 24, rx: 2, fill: '#e3d8c4' }),
		m('rect', { x: 62, y: 58, width: 6, height: 6, fill: '#8a6a45' }),
		m('rect', { x: 132, y: 58, width: 6, height: 6, fill: '#8a6a45' }),
		m('path', { d: 'M50 34 L100 12 L150 34 Z', fill: '#e07714' }),
		[62, 84, 106, 128].map((x) =>
			m('path', {
				key: `scallop-${x}`,
				d: `M${x} 34 Q ${x + 5.5} 42 ${x + 11} 34 Z`,
				fill: '#f0994a',
			}),
		),
		m('rect', { x: 84, y: 40, width: 32, height: 14, rx: 2, fill: '#fff8ea' }),
		m('line', { x1: 88, y1: 45, x2: 112, y2: 45, stroke: '#c9b892', 'stroke-width': 1.5 }),
		m('line', { x1: 88, y1: 49, x2: 106, y2: 49, stroke: '#c9b892', 'stroke-width': 1.5 }),
	]);
}

/** The dock's expandable panel — one id, referenced by both handles */
const DOCK_PANEL_ID = 'proposal-dock-panel';

/**
 * The received-feedback handle, named so the "feedback is waiting" toast can
 * aim at THIS accordion. It used to be found by position ("the first
 * collapsible section"), which quietly became ambiguous the moment a second
 * section learned to fold.
 */
const DOCK_FEEDBACK_HEAD_ID = 'dock-feedback-head';

/**
 * One labeled drawer of the workshop card. The board reads as a stack of
 * these: every part gets an icon chip + a real title, so the eye can tell
 * where one tool ends and the next begins (was: bare hairline dividers).
 */
function workbenchSection(
	icon: string,
	title: string,
	body: m.Children,
	opts?: {
		count?: number;
		variant?: 'edit' | 'plain';
		/** Pass a toggle to make the head an accordion handle */
		open?: boolean;
		onToggle?: () => void;
		/** Names the handle so a deep link can aim at THIS one by id */
		headId?: string;
	},
): m.Children {
	const collapsible = opts?.onToggle !== undefined;
	const open = !collapsible || opts?.open === true;
	const head: m.Children = [
		m('span.workbench__icon', { 'aria-hidden': 'true' }, icon),
		m('span.workbench__title', title),
		opts?.count !== undefined && opts.count > 0
			? m('span.workbench__count', String(opts.count))
			: null,
		collapsible
			? m('span.workbench__chevron', {
					class: open ? 'workbench__chevron--open' : undefined,
					'aria-hidden': 'true',
				})
			: null,
	];

	return m(
		'.workbench__section',
		{
			class: [
				opts?.variant ? `workbench__section--${opts.variant}` : undefined,
				collapsible ? 'workbench__section--collapsible' : undefined,
				collapsible && !open ? 'workbench__section--closed' : undefined,
			]
				.filter(Boolean)
				.join(' '),
		},
		[
			collapsible
				? m(
						'button.workbench__head.workbench__head--button',
						{
							type: 'button',
							id: opts?.headId,
							'aria-expanded': String(open),
							onclick: opts?.onToggle,
						},
						head,
					)
				: m('.workbench__head', head),
			// Sections unfold and fold away — the sheet never reflows in a jump
			open ? (collapsible ? m(Collapsible, body) : body) : null,
		],
	);
}

/**
 * The place header: scene strip + name + one-line "what happens here".
 * `peek` marks the state where the workshop is only being glanced at from
 * another place — otherwise the banner flatly contradicts the cycle strip.
 */
function placeBanner(kind: 'mine' | 'rate' | 'help'): m.Children {
	const place = PLACES[kind];

	return m('.place-banner', { class: `place-banner--${kind}` }, [
		m('.place-banner__scene', placeScene(kind)),
		m('.place-banner__text', [
			// The "peek" badge retired with the peek itself: my workshop is no
			// longer a place I teleport to, it is the dock at the bottom
			m('h2.place-banner__title', `${place.icon} ${t(place.titleKey)}`),
			m('p.place-banner__sub', t(place.subKey)),
		]),
	]);
}

/** The five-level rating scale, MC-style, ordered strongest-against → strongest-for */
const RATE_OPTIONS: ReadonlyArray<{
	value: AgoraRating;
	variant: string;
	emoji: string;
	labelKey: string;
}> = [
	{ value: -1, variant: 'strong-against', emoji: '😠', labelKey: 'rate.strong_against' },
	{ value: -0.5, variant: 'against', emoji: '🙁', labelKey: 'rate.against' },
	{ value: 0, variant: 'abstain', emoji: '😐', labelKey: 'rate.abstain' },
	{ value: 0.5, variant: 'for', emoji: '🙂', labelKey: 'rate.for' },
	{ value: 1, variant: 'strong-for', emoji: '😍', labelKey: 'rate.strong_for' },
];

type CycleStep = 'mine' | 'rate' | 'help' | 'done';

/** How long a sent suggestion is announced on its stall before the row settles */
const SENT_ACK_MS = 1400;

interface CycleState {
	round: number;
	step: CycleStep;
	/** Ratings given so far in this cycle round */
	rated: number;
}

/**
 * The deliberation square as a PERSONAL cycle (the book's protocol, self-
 * paced): my proposal (write, then improve on later laps) → evaluate a few
 * classmates' proposals → help someone with a suggestion — repeated for
 * AGORA_CYCLE.ROUNDS laps. No teacher-synchronized phases; the teacher only
 * decides when the square closes (advance to results).
 */
export function Deliberation(
	initialVnode: m.Vnode<DeliberationAttrs>,
): m.Component<DeliberationAttrs> {
	const { session, userId } = initialVnode.attrs;
	let draft = '';
	let submitting = false;
	/** Which stall on the row is unfolded — one at a time, one task at a time */
	let openStallId = '';
	/** The stall that just took a suggestion, held for one acknowledgment beat */
	let sentAckId = '';
	let sentAckTimer = 0;
	/** Stalls I helped on this lap — the way forward earns its weight once I have */
	const helpedThisLap = new Set<string>();
	/**
	 * The row's order, computed once per lap and then held still. The sort key
	 * (open ideas per proposal) changes live as classmates send theirs, and a
	 * list that reshuffles under a reading finger is worse than a stale one.
	 */
	let stallOrder: string[] = [];
	let stallOrderRound = 0;
	/**
	 * The always-editable box in the workshop + the proposal text it was
	 * seeded from. Restored from sessionStorage below: the box now lives
	 * inside a collapsible dock, so an unsaved draft has to survive a fold
	 * AND a refresh.
	 */
	let mineDraft = '';
	let mineDraftBase = '';
	/** Which character's verdict accordion is expanded */
	let openCharacterId = '';
	/** characterId → in-flight review request */
	const reviewBusy: Record<string, boolean> = {};
	/** The elders' chips: an optional helper, so it starts folded */
	let charactersOpen = false;
	/**
	 * The received-improvements accordion. null = follow the feedback: fresh
	 * suggestions open it by themselves, and once a student closes it their
	 * choice sticks.
	 */
	let suggestionsToggle: boolean | null = null;
	/**
	 * The conversation I am standing IN, or null for "somewhere in the game".
	 * A thread is a sub-page like every other Freedi chat — the cards carry
	 * only an indicator, and opening one takes the whole screen.
	 */
	let chatOpen: { proposalId: string; helperUid: string; role: 'helper' | 'owner' } | null = null;

	/**
	 * Entering a conversation pushes a history entry (the URL is unchanged, so
	 * Mithril's router stays put) — the phone's back gesture then leaves the
	 * chat instead of leaving the game.
	 */
	function openChat(proposalId: string, helperUid: string, role: 'helper' | 'owner'): void {
		chatOpen = { proposalId, helperUid, role };
		try {
			window.history.pushState({ agoraChat: true }, '');
		} catch {
			// No history access (rare sandboxes) — the back button still works
		}
		m.redraw();
	}

	function closeChat(fromPopState: boolean): void {
		if (!chatOpen) return;
		chatOpen = null;
		if (!fromPopState) {
			try {
				const state = window.history.state as { agoraChat?: boolean } | null;
				if (state?.agoraChat === true) window.history.back();
			} catch {
				// Nothing to unwind
			}
		}
		m.redraw();
	}

	function onPopState(): void {
		if (chatOpen) closeChat(true);
	}

	window.addEventListener('popstate', onPopState);
	/**
	 * The proposal dock: my workshop is no longer a screen you travel to, it
	 * is a notebook docked at the bottom of every place. Collapsed it shows a
	 * one-line peek of my text (or what needs me); tapping lifts the whole
	 * workshop over the room I'm standing in.
	 *
	 * Collapsed-by-default is the point — the workshop used to occupy the
	 * mine screen whether or not it had anything to say. It never opens by
	 * itself for arriving feedback (the badge says so quietly instead); the
	 * ONE exception is the intro below.
	 */
	let dockOpen = false;
	/**
	 * One-shot: right after the very first proposal is submitted the dock
	 * opens itself once, so "where did my text go?" is answered by watching
	 * it land in the notebook. Spent as soon as it fires; a refresh loses it.
	 */
	let pendingDockIntro = false;
	/**
	 * ...but that reveal arrives on the SQUARE, one step later, and a modal
	 * sheet there would make every student dismiss a card before they can
	 * rate anything. So the intro is a PEEK, not an opening: no scrim, the
	 * room stays live behind it, and it folds itself away after a beat —
	 * unless the student reaches into it, which promotes it to a real open.
	 */
	let dockIntro = false;
	let dockIntroTimer = 0;

	function endDockIntro(fold: boolean): void {
		if (!dockIntro) return;
		window.clearTimeout(dockIntroTimer);
		dockIntro = false;
		if (fold) dockOpen = false;
	}
	/** Mirror of the unsaved edit box, so a refresh can't eat a draft */
	const mineDraftKey = `agora_${session.sessionId}_mine_draft`;
	/**
	 * The results tab: a second screen you can stand on, NOT a cycle step —
	 * looking at the class picture must not move your lap along. Deliberately
	 * in memory only: a refresh puts you back where the work is.
	 */
	let showResults = false;
	/**
	 * A helped proposal the "woven in" celebration pointed at: the next render
	 * of its card scrolls to it and spotlights it, then the intent is spent.
	 */
	let focusHelpedId: string | null = null;

	/**
	 * Travel to a helped proposal so its improved text can be re-read and
	 * re-rated. Same semantics as tapping the Others tab: from the real mine
	 * step the lap continues to the square (helpedSection lives on the whole
	 * Others side); from anywhere else, only the dock folds out of the way.
	 */
	function goToHelped(proposalId: string): void {
		focusHelpedId = proposalId;
		closeDock();
		if (cycle.step === 'mine') setCycle({ step: 'rate', rated: 0 });
		m.redraw();
	}

	registerHelpedNavigator(goToHelped);

	/**
	 * A selector to focus after the dock has expanded and rendered, or ''.
	 * Deep links point at what they promised; a plain tap keeps focus on the
	 * handle, the standard disclosure behavior.
	 */
	let focusOnOpen = '';
	/**
	 * The panel is never unmounted, so its scroll position outlives a fold.
	 * Deliberately reset on a fresh open: reopening two screens deep into
	 * the elders reads as "the sheet lost my proposal", and the edit box is
	 * what the notebook is for.
	 */
	let resetDockScroll = false;

	/**
	 * "Feedback is waiting" → lift the workshop over whatever place I'm
	 * standing in, received drawer open. No step travel at all any more: the
	 * notebook comes to me, which is the whole point of the dock.
	 */
	function goToMine(): void {
		suggestionsToggle = true;
		if (!dockOpen) resetDockScroll = true;
		dockOpen = true;
		// The toast promised feedback — land the reader on it, not on the
		// edit box (whose focus would summon the keyboard over the answer)
		focusOnOpen = `#${DOCK_FEEDBACK_HEAD_ID}`;
		m.redraw();
	}

	/** Fold the notebook. */
	function closeDock(): boolean {
		endDockIntro(false);
		dockOpen = false;

		return true;
	}

	function rememberMineDraft(): void {
		try {
			sessionStorage.setItem(mineDraftKey, mineDraft);
		} catch {
			// Storage full or blocked — the in-memory draft still stands
		}
	}

	function forgetMineDraft(): void {
		try {
			sessionStorage.removeItem(mineDraftKey);
		} catch {
			// Nothing to do
		}
	}

	/** Both handles (the dock bar and the Mine tab) drive this */
	function toggleDock(): void {
		if (dockOpen) {
			closeDock();
		} else {
			dockOpen = true;
			resetDockScroll = true;
		}
	}

	/**
	 * The intro peek reveals; it does not detain. Anything the student aims
	 * INTO the sheet promotes it to a real, scrimmed open — they came for
	 * the workshop after all — and stops the fold-away timer.
	 */
	function keepDockOpen(): void {
		endDockIntro(false);
	}

	registerMineNavigator(goToMine);

	/** Scroll to + flash the celebrated card, once, when it appears */
	function spotlightHelped(dom: Element, proposalId: string): void {
		if (focusHelpedId !== proposalId) return;
		focusHelpedId = null;
		dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
		dom.classList.add('stall--spotlight');
		window.setTimeout(() => dom.classList.remove('stall--spotlight'), 2400);
	}

	const cycleKey = `agora_${session.sessionId}_cycle`;
	let cycle: CycleState = { round: 1, step: 'mine', rated: 0 };
	try {
		const stored = sessionStorage.getItem(cycleKey);
		if (stored) cycle = { ...cycle, ...(JSON.parse(stored) as Partial<CycleState>) };
	} catch {
		// Corrupt storage — start the cycle over
	}

	// An unsaved edit outlives the tab. The seeding rule below leaves it
	// alone (it only re-seeds an empty or untouched box), so a restored
	// draft is never clobbered by the server text.
	try {
		mineDraft = sessionStorage.getItem(mineDraftKey) ?? '';
	} catch {
		// Storage unavailable — the draft just starts from the proposal
	}

	// --- Travel splashes: a short "you are moving to a new place" card on
	// every step change, a bigger "lap N" card when a round completes. The
	// same icons as the place banners — one visual story everywhere.
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let splash:
		| { kind: 'step'; step: 'mine' | 'rate' | 'help' }
		| { kind: 'round'; round: number }
		| null = null;
	let splashTimer: number | undefined;

	function showSplash(next: NonNullable<typeof splash>): void {
		splash = next;
		window.clearTimeout(splashTimer);
		const hold = next.kind === 'round' ? (reducedMotion ? 1100 : 2000) : reducedMotion ? 600 : 1300;
		splashTimer = window.setTimeout(() => {
			splash = null;
			m.redraw();
		}, hold);
	}

	function dismissSplash(): void {
		window.clearTimeout(splashTimer);
		splash = null;
	}

	function setCycle(patch: Partial<CycleState>): void {
		const roundChanged = patch.round !== undefined && patch.round !== cycle.round;
		const stepChanged = patch.step !== undefined && patch.step !== cycle.step;
		if (stepChanged) {
			// Walking into a new place folds the notebook: the room you just
			// arrived in is what you came to look at
			closeDock();
			// ...and folds whatever stall was left open in the room behind me,
			// so the next room's list opens the same way every time
			openStallId = '';
		}
		cycle = { ...cycle, ...patch };
		sessionStorage.setItem(cycleKey, JSON.stringify(cycle));
		// A new lap outranks a step change — one splash at a time
		if (roundChanged) {
			showSplash({ kind: 'round', round: cycle.round });
		} else if (stepChanged && cycle.step !== 'done') {
			showSplash({ kind: 'step', step: cycle.step });
		}
		m.redraw();
	}

	function advanceRound(): void {
		openStallId = '';
		helpedThisLap.clear();
		if (cycle.round >= AGORA_CYCLE.ROUNDS) {
			setCycle({ step: 'done' });
		} else {
			setCycle({ round: cycle.round + 1, step: 'mine', rated: 0 });
			draft = '';
		}
	}

	/**
	 * The Others | Results tabs. Mobile: fixed bottom bar; desktop: tab row
	 * under the HUD (CSS switches placement on one element). Hidden until
	 * the student has a proposal — lap 1 starts with writing.
	 *
	 * There is no "Mine" tab: my proposal is not a place any more, it is the
	 * dock sitting right above this bar, and one thing should have exactly
	 * one way in. What the bar switches between is the two screens I can
	 * stand on — the classmates' side, and the class picture.
	 */
	function delibNav(myProposal: AgoraProposal | undefined): m.Children {
		if (!myProposal) return null;

		return m('nav.delib-nav', [
			m(
				'button.delib-nav__item.delib-nav__item--peer',
				{
					class: showResults ? undefined : 'delib-nav__item--active',
					'aria-selected': String(!showResults),
					onclick: () => {
						closeDock();
						if (showResults) {
							showResults = false;
							m.redraw();
						} else if (cycle.step === 'mine') {
							setCycle({ step: 'rate', rated: 0 });
						} else if (cycle.step === 'done') {
							// After the laps, "Others" means: keep helping
							setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
						} else {
							m.redraw();
						}
					},
				},
				[
					m('span.delib-nav__icon', '👥'),
					m('span.delib-nav__label', t('delib.nav_others')),
					// Proposals I helped moved while I was away — come see.
					// Only meaningful when I'm not already looking at them.
					(showResults || cycle.step === 'mine') && attentionCount() > 0
						? m('span.delib-nav__badge', String(attentionCount()))
						: null,
				],
			),
			m(
				'button.delib-nav__item.delib-nav__item--results',
				{
					class: showResults ? 'delib-nav__item--active' : undefined,
					'aria-selected': String(showResults),
					onclick: () => {
						closeDock();
						showResults = true;
						m.redraw();
					},
				},
				[m('span.delib-nav__icon', '📊'), m('span.delib-nav__label', t('delib.nav_results'))],
			),
		]);
	}

	/** Deterministic per-student ordering so classmates fan out over different proposals */
	function studentOrder(id: string): number {
		return studentOrderFor(userId, id);
	}

	listenToDeliberation(session.sessionId, userId);

	/**
	 * Proposals are shown by NUMBER, not by author name — evaluate the idea,
	 * not the person. Stable across clients: state.proposals is sorted by
	 * createdAt everywhere.
	 */
	function proposalNumber(proposal: AgoraProposal): number {
		const index = getDeliberationState().proposals.findIndex(
			(candidate) => candidate.statementId === proposal.statementId,
		);

		return index + 1;
	}

	function asksLeftFor(live: AgoraSession, review: AgoraCharacterReview | undefined): number {
		const asksUsed = review?.asksByRound?.[String(live.roundNumber)] ?? 0;

		return Math.max(0, AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed);
	}

	function askCharacter(
		live: AgoraSession,
		character: AgoraCharacter,
		myProposal: AgoraProposal,
	): void {
		if (reviewBusy[character.characterId]) return;
		reviewBusy[character.characterId] = true;
		askCharacterReview(live.sessionId, character.characterId, myProposal.statementId)
			.catch((error: unknown) => {
				console.error('[Delib] Character review failed:', error);
			})
			.finally(() => {
				reviewBusy[character.characterId] = false;
				m.redraw();
			});
	}

	function characterReviewCard(
		live: AgoraSession,
		character: AgoraCharacter,
		myProposal: AgoraProposal,
		review: AgoraCharacterReview | undefined,
	): m.Children {
		const asksLeft = asksLeftFor(live, review);
		const busy = reviewBusy[character.characterId] === true;
		// The verdict was given about an OLDER text — say so, don't let it
		// impersonate an opinion of the current proposal
		const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;
		const ask = () => {
			askCharacter(live, character, myProposal);
		};

		// No key: these cards are spread among unkeyed siblings, and Mithril
		// forbids mixed keyed/unkeyed fragments (two stable cards need no key)
		return m('.card.char-review', [
			m('.char-review__header', [
				character.portraitUrl
					? m('img.char-review__portrait', { src: character.portraitUrl, alt: character.name })
					: m('.char-review__portrait.char-review__portrait--fallback', character.name.charAt(0)),
				m('.char-review__who', [
					m('strong', character.name),
					m('span.char-review__role', character.role),
				]),
			]),
			busy
				? m('p.char-review__thinking', t('delib.character_thinking', { name: character.name }))
				: review
					? m('.stack', [
							stale ? m('p.char-review__stale', t('delib.stale_review')) : null,
							m(
								'p.char-review__bubble',
								{ class: stale ? 'char-review__bubble--stale' : undefined },
								review.verdictText,
							),
							m('.char-review__meter', [
								m('.char-review__meter-track', [
									m('.char-review__meter-fill', {
										style: { width: `${review.acceptanceScore}%` },
									}),
								]),
								m('span.values__score', `${review.acceptanceScore}/100`),
							]),
							review.advice.length > 0
								? m('.stack', [
										m('p.teacher__section-title', t('delib.character_advice')),
										m(
											'ul.char-review__advice',
											review.advice.map((entry, index) => m('li', { key: index }, entry)),
										),
									])
								: null,
							m(
								// A stale verdict makes re-asking THE next action
								stale ? 'button.btn.btn--primary' : 'button.btn.btn--secondary',
								{ disabled: asksLeft === 0, onclick: ask },
								asksLeft > 0
									? `${t('delib.ask_again')} (${t('delib.asks_left', { n: asksLeft })})`
									: t('delib.no_asks_left'),
							),
						])
					: m(
							'button.btn.btn--secondary',
							{ disabled: asksLeft === 0, onclick: ask },
							t('delib.ask_character', { name: character.name }),
						),
		]);
	}

	/**
	 * MY whole workshop as ONE card: the always-editable proposal text, the
	 * improvements received, the ask-the-characters helpers and the needs
	 * reminder — everything under the same frame. No AI rewriting anywhere:
	 * the AI only reacts. (The numbers-only reception forecast was removed
	 * 2026-07-28 — it duplicated the in-character reviews' scores.)
	 */
	function editableProposalCard(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		// Seed / re-seed the draft when the proposal changes underneath —
		// without clobbering what the student is currently typing
		if (mineDraftBase !== myProposal.statement) {
			if (mineDraft.trim() === '' || mineDraft === mineDraftBase) {
				mineDraft = myProposal.statement;
			}
			mineDraftBase = myProposal.statement;
		}
		const text = mineDraft.trim();
		const changed =
			text !== myProposal.statement && text.length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

		// Fresh feedback count surfaces on the drawer label, not buried inside
		const openCount = (getDeliberationState().suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		const myScoreDoc = getDeliberationState().scores[myProposal.statementId];
		// The cycle's return signal to the OWNER: classmates who (re)rated
		// after my latest improvement. Aggregate count only — never who.
		//
		// Measured against the server-stamped time of MY last edit, not the
		// statement's lastUpdate: the shared evaluation pipeline writes its
		// aggregates back onto the proposal doc, so every rating bumped
		// lastUpdate past its own timestamp and the signal raced itself out
		// of existence.
		const editedAt = myScoreDoc?.lastEditAt ?? myProposal.lastUpdate;
		const ratingsMoved = (
			getDeliberationState().studentEvalTimes[myProposal.statementId] ?? []
		).filter((entry) => entry.evaluatorId !== userId && entry.updatedAt > editedAt).length;
		// Direction rides on the AGGREGATE: current bridge power vs where it
		// stood when I last saved. The score consequence is game state;
		// individual rating values stay private (see docs/feedback-cycle.md).
		// The baseline is stamped SERVER-side at save time — it used to live in
		// sessionStorage, so one refresh silently erased the direction and left
		// the student a bare count with nothing to learn from.
		const bridgeNow = myScoreDoc?.bridgingScore ?? 0;
		const bridgeBase = myScoreDoc?.bridgingAtLastEdit;
		const bridgeDelta = bridgeBase === undefined ? 0 : bridgeNow - bridgeBase;

		// No header: the sheet's own bar already says "my proposal", and a live
		// textarea is its own invitation to type — the "you can edit anytime"
		// line was standing prose about an affordance you can see
		return m('.card.my-lantern.my-lantern--workshop', [
			ratingsMoved > 0
				? m(
						'p.my-lantern__moved',
						// Down is muted amber, not danger-red: a dip is information
						// for the next edit, never a punishment
						{ class: bridgeDelta < 0 ? 'my-lantern__moved--down' : undefined },
						bridgeDelta === 0
							? `📈 ${tCount('delib.ratings_moved', ratingsMoved)}`
							: `${bridgeDelta > 0 ? '📈' : '📉'} ${tCount('delib.ratings_moved', ratingsMoved)} · ${t(
									bridgeDelta > 0 ? 'delib.bridge_up' : 'delib.bridge_down',
									{ n: Math.abs(bridgeDelta) },
								)}`,
					)
				: null,
			// The primary zone: text + its ONE action, visually bound together
			m('.workbench__section.workbench__section--edit', [
				m('textarea.my-lantern__textarea', {
					value: mineDraft,
					rows: 4,
					maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
					placeholder: t('delib.placeholder'),
					'aria-label': t('delib.my_proposal'),
					oninput: (event: InputEvent) => {
						mineDraft = (event.target as HTMLTextAreaElement).value;
						rememberMineDraft();
					},
				}),
				m('.delib__actions', [
					m(
						'button.btn.btn--primary.my-lantern__save',
						{
							disabled: !changed || submitting,
							onclick: () => {
								submitting = true;
								submitProposal(
									live,
									initialVnode.attrs.myParticipant.anonName,
									text,
									myProposal.statementId,
								)
									.then(() => {
										// Saved — the mirror has nothing left to protect
										forgetMineDraft();
										// The baseline for the direction chip is stamped by the
										// server on this same save (onAgoraProposalWritten), so
										// it survives a refresh and a device switch.
										// Improving your own proposal earns glitter — the
										// behavior the game most wants to reinforce
										celebrate({ message: t('celebrate.proposal_improved'), detail: text });
									})
									.catch((error: unknown) => {
										console.error('[Delib] Update proposal failed:', error);
									})
									.finally(() => {
										submitting = false;
										m.redraw();
									});
							},
						},
						// The button states its own condition instead of apologising
						// in a line underneath. A greyed button with no reason reads
						// as "broken" (playtests: students tapped it twice and gave
						// up) — but "✓ saved" is a true status, and the first
						// keystroke flips it to the live action, which teaches the
						// rule at the exact moment it starts to matter.
						changed ? t('delib.update_proposal') : `✓ ${t('delib.update_saved')}`,
					),
				]),
			]),
			workbenchSection('💡', t('delib.suggestions_received'), suggestionsSection(myProposal), {
				headId: DOCK_FEEDBACK_HEAD_ID,
				// Waiting decisions AND unread replies — everything in the
				// section that still wants the owner's eyes
				count: openCount + ownerThreadUnread(myProposal),
				open: suggestionsToggle ?? (openCount > 0 || ownerThreadUnread(myProposal) > 0),
				onToggle: () => {
					suggestionsToggle = !(suggestionsToggle ?? openCount > 0);
				},
			}),
			// The elders are an optional helper, not the loop — folded away until
			// asked for, so the sheet's resting state is my text and my feedback
			workbenchSection('🎭', t('delib.ask_elders'), askSection(live, myProposal, topic), {
				open: charactersOpen,
				onToggle: () => {
					charactersOpen = !charactersOpen;
				},
			}),
			// Open by default (explicit call, 2026-08-10): improving is writing
			// too, and the two sides' needs are its raw material. It sits last
			// in the sheet, so standing open costs the primary zone nothing.
			m(
				'.workbench__section.workbench__section--plain',
				m(NeedsPeek, { topic, defaultOpen: true }),
			),
		]);
	}

	/**
	 * The notebook docked at the bottom of every place: a collapsed bar that
	 * says what my proposal needs (or shows a line of it), and the whole
	 * workshop card sliding up over the room when it's tapped.
	 *
	 * Collapsed is the resting state on purpose. The workshop used to fill
	 * the mine screen whether or not anything was waiting there, which made
	 * a lap that had nothing to do feel like a wall of work.
	 */
	function proposalDock(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const state = getDeliberationState();
		const all = state.suggestions[myProposal.statementId] ?? [];
		const openCount = all.filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		// Same measurement as the chip inside the card: classmates who
		// (re)rated since my last save (see editableProposalCard)
		const myScoreDoc = state.scores[myProposal.statementId];
		const editedAt = myScoreDoc?.lastEditAt ?? myProposal.lastUpdate;
		const ratingsMoved = (state.studentEvalTimes[myProposal.statementId] ?? []).filter(
			(entry) => entry.evaluatorId !== userId && entry.updatedAt > editedAt,
		).length;
		const unsaved =
			mineDraft.trim().length > 0 &&
			mineDraft.trim() !== myProposal.statement &&
			mineDraftBase === myProposal.statement;

		const threadUnread = ownerThreadUnread(myProposal);

		// ONE line, strict priority: what needs me outranks what happened to
		// me, which outranks the text itself. It doubles as the live region,
		// so a screen reader hears arriving feedback without focus moving.
		let sub: m.Children;
		let subClass: string | undefined;
		if (openCount > 0) {
			sub = `💡 ${tCount('delib.dock_new_ideas', openCount)}`;
			subClass = 'proposal-dock__sub--alert';
		} else if (threadUnread > 0) {
			sub = `💬 ${tCount('delib.thread_unread', threadUnread)}`;
			subClass = 'proposal-dock__sub--alert';
		} else if (unsaved) {
			sub = [m('span.proposal-dock__dot', { 'aria-hidden': 'true' }), t('delib.dock_unsaved')];
			subClass = 'proposal-dock__sub--alert';
		} else if (ratingsMoved > 0) {
			sub = `📈 ${tCount('delib.ratings_moved', ratingsMoved)}`;
		} else {
			sub = myProposal.statement;
		}

		return m(
			'.proposal-dock',
			{
				class: [dockOpen ? 'proposal-dock--open' : '', dockIntro ? 'proposal-dock--intro' : '']
					.filter(Boolean)
					.join(' '),
				// Reaching into the peek means "I actually want this open"
				onpointerdown: keepDockOpen,
				onfocusin: keepDockOpen,
				onkeydown: (event: KeyboardEvent) => {
					if (event.key !== 'Escape' || !dockOpen) return;
					if (!closeDock()) return;
					// Standard disclosure: the handle you opened it with gets
					// the focus back, never the void behind the sheet
					document.querySelector<HTMLElement>('.proposal-dock__bar')?.focus();
				},
			},
			[
				m(
					'button.proposal-dock__bar',
					{
						type: 'button',
						'aria-expanded': String(dockOpen),
						'aria-controls': DOCK_PANEL_ID,
						onclick: () => {
							toggleDock();
						},
					},
					[
						m('span.proposal-dock__icon', { 'aria-hidden': 'true' }, '📘'),
						m('span.proposal-dock__text', [
							m('span.proposal-dock__title', t('delib.my_proposal')),
							m('span.proposal-dock__sub', { class: subClass, role: 'status' }, sub),
						]),
						// The count is decoration: the sub line above already
						// says the same thing in words
						openCount + threadUnread > 0
							? m(
									'span.proposal-dock__badge',
									{ 'aria-hidden': 'true' },
									String(openCount + threadUnread),
								)
							: null,
						m('span.proposal-dock__chevron', { 'aria-hidden': 'true' }),
						// Named for the screen reader, since the visible label
						// ("My proposal") doesn't say what pressing does
						m('span.sr-only', t(dockOpen ? 'delib.dock_close' : 'delib.dock_open')),
					],
				),
				// Never unmounted: the 0fr→1fr grid transition needs the panel
				// in the tree, and so does the unsaved draft inside it. `inert`
				// (not just aria-hidden) keeps its textarea and buttons out of
				// the tab order while it is folded away.
				m(
					'.proposal-dock__panel',
					{
						id: DOCK_PANEL_ID,
						'aria-hidden': String(!dockOpen),
						inert: dockOpen ? undefined : 'true',
					},
					m(
						'.proposal-dock__inner',
						{
							oncreate: onDockPanelRender,
							onupdate: onDockPanelRender,
						},
						editableProposalCard(live, myProposal, topic),
					),
				),
			],
		);
	}

	/**
	 * Once the sheet has actually rendered: start it at the top on a fresh
	 * open, and, if a deep link ("feedback is waiting") promised something,
	 * put the cursor on that instead. A plain tap leaves focus on the
	 * handle, as a disclosure should.
	 */
	function onDockPanelRender(vnode: m.VnodeDOM): void {
		if (!dockOpen) return;
		const inner = vnode.dom as HTMLElement;
		if (resetDockScroll) {
			resetDockScroll = false;
			inner.scrollTop = 0;
		}
		if (!focusOnOpen) return;
		const target = inner.querySelector<HTMLElement>(focusOnOpen);
		if (!target) return;
		focusOnOpen = '';
		target.focus();
		target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
	}

	/**
	 * The scrim behind an open dock: tapping the dimmed room closes it. The
	 * intro peek gets none — it is a reveal, and the square behind it must
	 * stay live so nobody has to dismiss a card to start rating.
	 */
	function dockScrim(): m.Children {
		if (!dockOpen || dockIntro) return null;

		return m('.proposal-dock__scrim', {
			'aria-hidden': 'true',
			onclick: () => {
				closeDock();
			},
		});
	}

	/**
	 * Unread CHAT across every conversation on MY proposal. Suggestion-kind
	 * messages are deliberately excluded: the open-ideas count already speaks
	 * for them, and one new idea must never count as two alerts.
	 */
	function ownerThreadUnread(myProposal: AgoraProposal): number {
		let unread = 0;
		for (const [helperUid, messages] of getOwnerThreads(myProposal.statementId)) {
			unread += threadUnreadCount(
				createAgoraThreadKey(myProposal.statementId, helperUid),
				messages.filter((message) => !isSuggestionKind(message)),
				userId,
			);
		}

		return unread;
	}

	/**
	 * The owner's inbox: one INDICATOR per helper conversation, under the
	 * editable text. The conversation itself is a page you travel to (see
	 * ThreadChat) — a card carries only the bubble, the last thing said, when
	 * it was said, and what is still unread.
	 */
	function suggestionsSection(myProposal: AgoraProposal): m.Children {
		const threads = [...getOwnerThreads(myProposal.statementId).entries()];
		if (threads.length === 0) {
			return m('.stack', [m('p.square-says__meaning.text-center', t('delib.no_feedback_yet'))]);
		}
		// Freshest conversation first
		const lastAt = (messages: AgoraProposal[]): number =>
			messages[messages.length - 1]?.createdAt ?? 0;
		threads.sort((a, b) => lastAt(b[1]) - lastAt(a[1]));
		const isOpenIdea = (message: AgoraProposal): boolean =>
			isSuggestionKind(message) &&
			(message.suggestionStatus ?? AgoraSuggestionStatus.open) === AgoraSuggestionStatus.open;

		return m(
			'.chat-entry-list',
			threads.map(([helperUid, messages]) => {
				const threadKey = createAgoraThreadKey(myProposal.statementId, helperUid);
				const name = messages.find((message) => message.creatorId === helperUid)?.anonName ?? '';

				return m('.chat-entry-list__item', { key: threadKey }, [
					threadEntry({
						label: name || t('delib.chat_with_author'),
						messages,
						unread: threadUnreadCount(
							threadKey,
							messages.filter((message) => !isSuggestionKind(message)),
							userId,
						),
						openIdeas: messages.filter(isOpenIdea).length,
						onOpen: () => {
							openChat(myProposal.statementId, helperUid, 'owner');
						},
					}),
				]);
			}),
		);
	}

	/** The era's AI helpers: ask each character what's wrong and how to improve */
	function askSection(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const { characterReviews } = getDeliberationState();
		const openCharacter = topic.characters.find(
			(character) => character.characterId === openCharacterId,
		);

		return m('.stack', [
			m(
				'.char-chips',
				topic.characters.map((character) => {
					const review =
						characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, character.characterId)
						];
					const open = openCharacterId === character.characterId;
					const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;

					return m(
						'button.char-chips__chip',
						{
							class: open ? 'char-chips__chip--open' : undefined,
							'aria-expanded': String(open),
							onclick: () => {
								openCharacterId = open ? '' : character.characterId;
								// One tap does it: opening a character with no verdict
								// (or one about older text) asks them right away
								if (!open && (!review || stale) && asksLeftFor(live, review) > 0) {
									askCharacter(live, character, myProposal);
								}
							},
						},
						[
							character.portraitUrl
								? m('img.char-review__portrait', {
										src: character.portraitUrl,
										alt: character.name,
									})
								: m(
										'.char-review__portrait.char-review__portrait--fallback',
										character.name.charAt(0),
									),
							m('span.char-chips__name', character.name),
							review
								? stale
									? m('span.char-chips__cta', t('delib.stale_chip'))
									: m('span.char-chips__score', `${review.acceptanceScore}/100`)
								: m('span.char-chips__cta', t('delib.ask_me')),
						],
					);
				}),
			),
			// Same handoff as the conversations: the elder you left folds away
			// while the one you tapped unfolds
			openCharacter
				? m(
						Collapsible,
						characterReviewCard(
							live,
							openCharacter,
							myProposal,
							getDeliberationState().characterReviews[
								createAgoraCharacterReviewId(myProposal.statementId, openCharacter.characterId)
							],
						),
					)
				: null,
		]);
	}

	// ---------- The collaboration loop: "proposals I helped" ----------

	/**
	 * The two change clocks of a classmate's proposal. `editAt` is the owner's
	 * real edit time (agoraScores.lastEditAt — the statement's own lastUpdate is
	 * bumped by every rating anyone gives). `mineAt` is when one of MY ideas was
	 * last woven into the text — the resolve callable stamps statusChangedAt a
	 * beat after the save, so acknowledging only editAt would leave the personal
	 * chip lit forever.
	 */
	function changeStamps(proposal: AgoraProposal): { editAt: number; mineAt: number } {
		const state = getDeliberationState();
		const id = proposal.statementId;
		const editAt = state.scores[id]?.lastEditAt ?? 0;
		let mineAt = 0;
		for (const suggestion of state.suggestions[id] ?? []) {
			if (suggestion.creatorId !== userId) continue;
			// The author's acknowledgment of MY idea. A thank-you is that mark
			// now (the accept → woven-in lifecycle retired with the tray);
			// `implemented` stays readable so older sessions keep their history.
			if (
				suggestion.suggestionStatus !== AgoraSuggestionStatus.thanked &&
				suggestion.suggestionStatus !== AgoraSuggestionStatus.implemented
			) {
				continue;
			}
			mineAt = Math.max(mineAt, suggestion.statusChangedAt ?? suggestion.lastUpdate);
		}

		return { editAt, mineAt };
	}

	/** Opening or rating a card acknowledges everything it currently signals */
	function ackProposalSeen(proposal: AgoraProposal): void {
		const { editAt, mineAt } = changeStamps(proposal);
		markProposalSeen(proposal.statementId, Math.max(editAt, mineAt));
	}

	/**
	 * The ONE status chip a classmate's card wears, strictest precedence first:
	 * my idea landed in their text (personal, celebratory) > the owner edited
	 * (generic) > I've never looked at it at all. NEW can't co-occur with the
	 * others — they require a seen watermark, NEW requires its absence.
	 */
	function changeChip(proposal: AgoraProposal): m.Children {
		const { editAt, mineAt } = changeStamps(proposal);
		const watermark = seenEditWatermark(proposal.statementId);
		if (watermark !== undefined && mineAt > watermark) {
			return m(
				'span.stall__chip.stall__chip--improved-mine',
				{ 'aria-label': t('delib.chip_improved_mine') },
				`✨ ${t('delib.chip_improved_mine')}`,
			);
		}
		if (isEditedSinceSeen(proposal.statementId, editAt)) {
			return m('span.stall__chip.stall__chip--edited', `✏️ ${t('delib.chip_edited')}`);
		}
		if (isNewToMe(proposal.statementId)) {
			return m('span.stall__chip.stall__chip--new', `🌱 ${t('delib.chip_new')}`);
		}

		return null;
	}

	/**
	 * What still wants my eyes on the Others side — feeds the nav badge.
	 * Scoped to proposals I HELPED (my loops, not the whole square's churn),
	 * and cleared by engagement — opening or re-rating the card — not by mere
	 * rendering: the badge is an invitation to look, and a glance at the list
	 * is not a look at the change.
	 */
	function attentionCount(): number {
		const changed = getHelpedProposals(userId).filter(({ proposal }) => {
			const { editAt, mineAt } = changeStamps(proposal);
			const watermark = seenEditWatermark(proposal.statementId);
			if (watermark !== undefined && mineAt > watermark) return true;

			return isEditedSinceSeen(proposal.statementId, editAt);
		}).length;
		// ...plus stalls where the owner wrote back into my conversation
		const unreadThreads = getDeliberationState().proposals.filter(
			(proposal) => proposal.creatorId !== userId && myThreadUnread(proposal) > 0,
		).length;

		return changed + unreadThreads;
	}

	/**
	 * Re-rating is step 5 — the move that closes the whole cycle — and it was
	 * the one handoff with no feedback at all: the press changed a ring and
	 * nothing else. proposalId → the transient "counted" acknowledgment.
	 */
	const reRateAcked: Record<string, boolean> = {};
	const reRateAckTimers: Record<string, number> = {};

	function ackReRate(proposalId: string): void {
		reRateAcked[proposalId] = true;
		window.clearTimeout(reRateAckTimers[proposalId]);
		reRateAckTimers[proposalId] = window.setTimeout(() => {
			delete reRateAcked[proposalId];
			m.redraw();
		}, 2600);
	}

	/**
	 * The compact five-level scale. `onFirstVote` fires only when this is the
	 * first time I weigh THIS proposal — out on the square that is what counts
	 * toward the lap; everywhere else the scale stays free of cycle state.
	 */
	function reRateScale(
		live: AgoraSession,
		proposal: AgoraProposal,
		opts?: { onFirstVote?: () => void },
	): m.Children {
		const current = getDeliberationState().myRatings[proposal.statementId]?.value;

		// Join-app selection grammar: once a vote exists the group knows it
		// (siblings recede), the chosen card wears ring + scale + ✓ badge —
		// three redundant cues, so "where did I press?" never needs hunting
		return m(
			'.rate-scale.rate-scale--compact',
			{
				class: current !== undefined ? 'rate-scale--has-selection' : undefined,
				role: 'radiogroup',
			},
			RATE_OPTIONS.map((option) => {
				const active = current === option.value;

				return m(
					`button.rate-scale__option.rate-scale__option--${option.variant}`,
					{
						class: active ? 'rate-scale__option--selected' : undefined,
						role: 'radio',
						'aria-checked': String(active),
						onclick: () => {
							const first = getDeliberationState().myRatings[proposal.statementId] === undefined;
							void rateProposal(live, proposal.statementId, option.value);
							// Weighing the text IS reading it — the change chips clear
							ackProposalSeen(proposal);
							ackReRate(proposal.statementId);
							if (first) opts?.onFirstVote?.();
						},
					},
					[
						m('span.rate-scale__emoji', option.emoji),
						m('span.rate-scale__label', t(option.labelKey)),
						active ? m('span.rate-scale__check', { 'aria-hidden': 'true' }, '✓') : null,
					],
				);
			}),
		);
	}

	/**
	 * Did the author change the text after my last idea, without me having
	 * looked again since? "Take another look" must stop nagging the student
	 * who already did: the marker used to depend only on the proposal's
	 * timestamp, so it stayed lit forever after a re-rate — the loop's last
	 * step gave no sign it had registered.
	 *
	 * The author's real edit time comes from the score doc: the statement's
	 * own lastUpdate is bumped by the evaluation pipeline's aggregate writes,
	 * which would flag a proposal as "improved" when nobody touched a word.
	 */
	function helpedImprovedSince(proposal: AgoraProposal): boolean {
		const mySuggestions = getThreadMessages(proposal.statementId, userId).filter(
			(message) => message.creatorId === userId && isSuggestionKind(message),
		);
		if (mySuggestions.length === 0) return false;
		// createdAt, NOT lastUpdate: resolving a suggestion bumps its lastUpdate,
		// which would wrongly hide the marker when the owner edited first
		const latestInput = Math.max(...mySuggestions.map((suggestion) => suggestion.createdAt));
		const state = getDeliberationState();
		const editedAt = state.scores[proposal.statementId]?.lastEditAt ?? proposal.lastUpdate;
		const myRating = state.myRatings[proposal.statementId];
		const reRatedSinceUpdate = myRating !== undefined && myRating.updatedAt > editedAt;

		return editedAt > latestInput && !reRatedSinceUpdate;
	}

	/**
	 * One helped proposal: my suggestions + status, the current text, re-rate,
	 * follow-up. `bare` drops the heading and the proposal text for the callers
	 * that already show them (the stalls row shows both in its handle).
	 */
	/**
	 * ONE card per classmate, everywhere. Unfolded, a stall answers all three
	 * questions a student has about someone else's proposal without leaving
	 * it: does it need weighing again (the invitation + the scale), what did
	 * I offer and what became of it (the thread's status chips), and can I
	 * say something to the author (the same thread's box).
	 *
	 * It used to be two places on one screen — a folded row up top and a
	 * second "proposals you helped" section repeating the same proposal as a
	 * full card below. One proposal cannot live in two lists: whichever one
	 * you were looking at, the other held half the story.
	 */
	function stallBody(
		live: AgoraSession,
		proposal: AgoraProposal,
		opts?: { countsTowardLap?: boolean },
	): m.Children {
		const myRating = getDeliberationState().myRatings[proposal.statementId];
		const { editAt, mineAt } = changeStamps(proposal);
		// The text moved after I weighed it — my rating is about an older
		// version, and the scale below is how to say so. Self-clearing: a
		// re-rate advances updatedAt past the edit.
		const changedSinceRating = myRating !== undefined && editAt > myRating.updatedAt;
		const mineSinceRating = myRating !== undefined && mineAt > myRating.updatedAt;
		const acked = reRateAcked[proposal.statementId] === true;

		return [
			changedSinceRating
				? m(
						'p.stall__reinvite',
						{ class: mineSinceRating ? 'stall__reinvite--mine' : undefined },
						mineSinceRating
							? `✨ ${t('delib.reinvite_improved')}`
							: `✏️ ${t('delib.reinvite_prompt')}`,
					)
				: helpedImprovedSince(proposal)
					? m('p.helped__improved', `✨ ${t('delib.helped_improved_marker')}`)
					: null,
			// The cycle's final beat: the press is answered in words, once,
			// then the prompt returns
			acked ? m('p.helped__rerate-ack', { role: 'status' }, `✓ ${t('delib.rerate_ack')}`) : null,
			reRateScale(
				live,
				proposal,
				opts?.countsTowardLap === true
					? {
							// Only a FIRST vote moves the lap along; changing my mind
							// about a proposal I already weighed is free, and must not
							// buy a lap step. The stall no longer folds itself after the
							// press — the way into the conversation with the author lives
							// in this same card, and folding it would hide the next step.
							onFirstVote: () => {
								setCycle({ rated: cycle.rated + 1 });
							},
						}
					: undefined,
			),
			// The conversation is one line here, and a whole page one tap away
			threadEntry({
				label: t('delib.chat_with_author'),
				messages: getThreadMessages(proposal.statementId, userId),
				unread: myThreadUnread(proposal),
				onOpen: () => {
					openChat(proposal.statementId, userId, 'helper');
				},
			}),
		];
	}

	/**
	 * The market row: every classmate's stall, ordered once per lap. Proposals
	 * nobody has answered yet come first, then a per-student shuffle so the
	 * class fans out over different stalls instead of piling onto the first
	 * one; stalls I already visited sink to the bottom.
	 */
	function orderedStalls(
		proposals: readonly AgoraProposal[],
		suggestions: Readonly<Record<string, AgoraProposal[]>>,
	): AgoraProposal[] {
		const others = proposals.filter((proposal) => proposal.creatorId !== userId);
		const byId = new Map(others.map((proposal) => [proposal.statementId, proposal]));

		if (stallOrderRound !== cycle.round) {
			const openIdeas = (proposal: AgoraProposal): number =>
				(suggestions[proposal.statementId] ?? []).filter(
					(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
				).length;
			const mine = (proposal: AgoraProposal): number =>
				(suggestions[proposal.statementId] ?? []).some((entry) => entry.creatorId === userId)
					? 1
					: 0;
			stallOrder = others
				.slice()
				.sort(
					(a, b) =>
						mine(a) - mine(b) ||
						openIdeas(a) - openIdeas(b) ||
						studentOrder(a.statementId) - studentOrder(b.statementId),
				)
				.map((proposal) => proposal.statementId);
			stallOrderRound = cycle.round;
		} else {
			// A classmate who posts mid-lap joins the end of the row rather than
			// jumping into the middle of what I'm reading
			for (const proposal of others) {
				if (!stallOrder.includes(proposal.statementId)) stallOrder.push(proposal.statementId);
			}
		}

		const ordered = stallOrder
			.map((id) => byId.get(id))
			.filter((proposal): proposal is AgoraProposal => proposal !== undefined);

		// Did the ROW ORDER change, or did rows merely move because something
		// folded? Only the first is a FLIP (see flipRow).
		const key = ordered.map((proposal) => proposal.statementId).join('|');
		stallsResorted = stallOrderKey !== '' && key !== stallOrderKey;
		stallOrderKey = key;

		return ordered;
	}

	/** proposalId → where its row last sat in the list, for the FLIP move */
	const rowOffsets = new Map<string, number>();
	/** The row order the square last rendered, and whether it just changed */
	let stallOrderKey = '';
	let stallsResorted = false;

	function rememberRow(dom: HTMLElement, id: string): void {
		rowOffsets.set(id, dom.offsetTop);
	}

	/**
	 * The square re-sorts itself as classmates improve their proposals, so a
	 * row can change place under a reading finger. FLIP: put it back where the
	 * eye left it, then let it slide to its new home — the movement is the
	 * message ("this one just changed"), and a row that teleports instead just
	 * makes the reader lose their place.
	 *
	 * offsetTop, not getBoundingClientRect: scrolling must not read as motion.
	 *
	 * ONLY when the order actually changed. Rows also move when a stall folds
	 * open above them, and treating that as a re-sort was violent: every row
	 * below the one you tapped was yanked back by the height of the body that
	 * was still growing, which flung a card up over the banner and read as
	 * the page jumping. The fold animates that displacement by itself.
	 */
	function flipRow(dom: HTMLElement, id: string): void {
		const now = dom.offsetTop;
		const before = rowOffsets.get(id);
		rowOffsets.set(id, now);
		if (before === undefined || reducedMotion || !stallsResorted) return;
		const delta = before - now;
		if (Math.abs(delta) < 2) return;
		// Frame 1: no transition, sitting at the old place
		dom.style.transition = 'none';
		dom.style.transform = `translateY(${delta}px)`;
		requestAnimationFrame(() => {
			// Frame 2: hand the transition back to the stylesheet and let go
			dom.style.transition = '';
			dom.style.transform = '';
		});
	}

	/**
	 * One stall — the row both rooms of the square are built from. Folded, the
	 * classmate's proposal IS the handle: no chip, no label, no title competing
	 * with it. What unfolds is the room's own business — a rating scale out on
	 * the square, an improvement box at someone's stand.
	 */
	function stallRow(opts: {
		proposal: AgoraProposal;
		open: boolean;
		onToggle: () => void;
		/** At most two render: one change-status chip + one room-specific chip */
		chips?: m.Children[];
		/**
		 * A THUNK, called only when the stall is open: the body carries live
		 * side effects (the thread marks itself read on render), and a folded
		 * stall must not read its own mail.
		 */
		body: () => m.Children;
		/** Live-sorted lists slide a row to its new place instead of teleporting */
		flip?: boolean;
	}): m.Children {
		const { proposal, open } = opts;
		const number = proposalNumber(proposal);
		const chips = (opts.chips ?? []).filter((chip) => chip !== null && chip !== undefined);

		return m(
			'.stall',
			{
				key: proposal.statementId,
				class: open ? 'stall--open' : undefined,
				oncreate: (vnode: m.VnodeDOM) => {
					if (opts.flip) rememberRow(vnode.dom as HTMLElement, proposal.statementId);
					spotlightHelped(vnode.dom as HTMLElement, proposal.statementId);
				},
				onupdate: (vnode: m.VnodeDOM) => {
					if (opts.flip) flipRow(vnode.dom as HTMLElement, proposal.statementId);
					spotlightHelped(vnode.dom as HTMLElement, proposal.statementId);
				},
			},
			[
				m('button.stall__head', { 'aria-expanded': String(open), onclick: opts.onToggle }, [
					m(
						'span.stall__num',
						{ 'aria-label': t('delib.proposal_number', { n: number }) },
						String(number),
					),
					m('span.stall__preview', proposal.statement),
					chips.length > 0 ? m('span.stall__chips', chips) : null,
					m('span.stall__chevron', {
						class: open ? 'stall__chevron--open' : undefined,
						'aria-hidden': 'true',
					}),
				]),
				// A row on the square unfolds in place: the rows below it slide
				// down with the growth instead of being teleported
				open
					? m(Collapsible, m('.stall__body', [m('p.stall__text', proposal.statement), opts.body()]))
					: null,
			],
		);
	}

	/**
	 * The square, live-ordered by the author's own hand: posted, or rewritten.
	 * A classmate who just improved theirs rises and gets read again; nobody
	 * moves because somebody pressed a face. See lib/squareOrder.
	 */
	function squareOrder(
		proposals: readonly AgoraProposal[],
		scores: Readonly<Record<string, AgoraProposalScore>>,
	): AgoraProposal[] {
		return orderSquare(proposals, scores, userId);
	}

	/** The chip a square stall wears: the face I already gave it */
	function rateStallChip(proposal: AgoraProposal): m.Children {
		const mine = getDeliberationState().myRatings[proposal.statementId];
		if (mine === undefined) return null;
		const option = RATE_OPTIONS.find((entry) => entry.value === mine.value);
		if (!option) return null;

		return m(
			'span.stall__chip.stall__chip--rated',
			{ 'aria-label': t(option.labelKey) },
			`${option.emoji} ✓`,
		);
	}

	/** Unread replies waiting in MY thread at this classmate's stall */
	function myThreadUnread(proposal: AgoraProposal): number {
		return threadUnreadCount(
			createAgoraThreadKey(proposal.statementId, userId),
			// Chat only, same as the owner side: an idea's news travels through
			// its status chip, not through an unread count
			getThreadMessages(proposal.statementId, userId).filter(
				(message) => !isSuggestionKind(message),
			),
			userId,
		);
	}

	/**
	 * The market-room chip: sent just now, an unread reply, or a stall I
	 * already helped — one story at a time, strongest first. The "improved
	 * since" news moved to changeChip, which rides alongside.
	 */
	function helpStallChip(proposal: AgoraProposal, helped: HelpedProposal | undefined): m.Children {
		if (sentAckId === proposal.statementId) {
			return m(
				'span.stall__chip.stall__chip--sent',
				{ role: 'status' },
				`✓ ${t('delib.sent_ack')}`,
			);
		}
		const unread = myThreadUnread(proposal);
		if (unread > 0) {
			return m(
				'span.stall__chip.stall__chip--unread',
				{ 'aria-label': tCount('delib.thread_unread', unread) },
				`💬 ${unread}`,
			);
		}

		return helped ? m('span.stall__chip', `🤝 ${t('delib.helped_chip')}`) : null;
	}

	return {
		onremove() {
			window.clearTimeout(splashTimer);
			window.clearTimeout(sentAckTimer);
			window.clearTimeout(dockIntroTimer);
			Object.values(reRateAckTimers).forEach((timer) => window.clearTimeout(timer));
			void flushSeenState();
			stopDeliberationListeners();
			unregisterHelpedNavigator(goToHelped);
			unregisterMineNavigator(goToMine);
			window.removeEventListener('popstate', onPopState);
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, scores } = getDeliberationState();
			// Mid-session rollout guard: already-rated proposals get watermarks
			// once, so the square doesn't shout NEW at everything (no-op after)
			seedSeenBaselineIfNeeded();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			const anonName = myParticipant.anonName;

			// ---------- SUB-PAGE: one conversation, full screen ----------
			// A chat is a place of its own in every Freedi app, and this one is
			// no different: the game waits behind it, and back returns to the
			// exact card the conversation was opened from.
			if (chatOpen) {
				const chatProposal = proposals.find(
					(proposal) => proposal.statementId === chatOpen?.proposalId,
				);
				if (!chatProposal) {
					// The proposal vanished under us (session reset) — nothing to talk about
					chatOpen = null;
				} else {
					return m(ThreadChat, {
						session: live,
						proposal: chatProposal,
						helperUid: chatOpen.helperUid,
						role: chatOpen.role,
						userId,
						anonName,
						proposalNumber: proposalNumber(chatProposal),
						onBack: () => {
							closeChat(false);
						},
						onSuggestionSent: (proposalId: string) => {
							// An idea sent from the conversation counts as helping this
							// lap, exactly like one sent from the stall itself
							helpedThisLap.add(proposalId);
							sentAckId = proposalId;
							window.clearTimeout(sentAckTimer);
							sentAckTimer = window.setTimeout(() => {
								sentAckId = '';
								m.redraw();
							}, SENT_ACK_MS);
						},
					});
				}
			}

			// Orientation strip: lap chip + the three steps of the loop, current
			// one lit. A dead countdown reads as "broken" — only show a live one.
			const STEPS: Array<{ id: CycleStep; labelKey: string }> = [
				{ id: 'mine', labelKey: 'delib.step_mine' },
				{ id: 'rate', labelKey: 'delib.step_rate' },
				{ id: 'help', labelKey: 'delib.step_help' },
			];
			const activeIndex = STEPS.findIndex((entry) => entry.id === cycle.step);
			const cycleStrip = m('.cycle-strip', [
				m(
					'.cycle-strip__laps',
					{ 'aria-label': t('delib.cycle_round', { n: cycle.round, total: AGORA_CYCLE.ROUNDS }) },
					[
						Array.from({ length: AGORA_CYCLE.ROUNDS }, (_, index) =>
							m('span.cycle-strip__pip', {
								class:
									index + 1 < cycle.round
										? 'cycle-strip__pip--done'
										: index + 1 === cycle.round
											? 'cycle-strip__pip--current'
											: undefined,
							}),
						),
					],
				),
				m(
					'.cycle-strip__steps',
					STEPS.map((entry, index) =>
						m(
							'span.cycle-strip__step',
							{
								class:
									entry.id === cycle.step
										? 'cycle-strip__step--active'
										: activeIndex !== -1 && index < activeIndex
											? 'cycle-strip__step--done'
											: undefined,
							},
							// The step chip wears its place's icon — the same one on
							// the banner below, so strip and screen always agree
							`${PLACES[entry.id as 'mine' | 'rate' | 'help'].icon} ${t(entry.labelKey)}`,
						),
					),
				),
				live.roundEndsAt && live.roundEndsAt > Date.now()
					? m(CountdownTimer, { endsAt: live.roundEndsAt })
					: null,
			]);

			// Travel splash: covers the step/lap change so a new place never
			// hard-cuts in. Tap anywhere to skip.
			const splashOverlay = splash
				? m(
						'.delib-splash',
						{
							onclick: () => {
								dismissSplash();
							},
							'aria-live': 'polite',
						},
						splash.kind === 'round'
							? m('.delib-splash__card', [
									m(
										'h2.delib-splash__title',
										t('round.splash_title', { n: splash.round, total: AGORA_CYCLE.ROUNDS }),
									),
									m(
										'.delib-splash__steps',
										STEPS.map((entry, index) =>
											m(
												'.delib-splash__step',
												{ class: index === 0 ? 'delib-splash__step--first' : undefined },
												[
													m(
														'span.delib-splash__step-icon',
														PLACES[entry.id as 'mine' | 'rate' | 'help'].icon,
													),
													m('span', t(entry.labelKey)),
												],
											),
										),
									),
								])
							: m('.delib-splash__card', [
									m('span.delib-splash__icon', PLACES[splash.step].icon),
									m('h2.delib-splash__title', t(PLACES[splash.step].titleKey)),
									m('p.delib-splash__sub', t(PLACES[splash.step].subKey)),
								]),
					)
				: null;

			// The deliberation "location": the town square (agora) where ideas
			// gather. Teacher-editable via topic artwork; hidden if absent/broken.
			const squareUrl = topic.artwork?.locationVignetteUrls?.square;
			// No score HUD above the work: scores belong to the results screen,
			// not over the shoulder of a student mid-sentence.
			const header = [
				splashOverlay,
				squareUrl
					? m('img.delib-banner', {
							src: squareUrl,
							alt: '',
							onerror: (event: Event) => {
								(event.target as HTMLElement).style.display = 'none';
							},
						})
					: null,
				cycleStrip,
			];

			// The notebook rides along on every place, so the dock and the
			// padding that keeps content clear of it are computed once here
			const dock = myProposal ? proposalDock(live, myProposal, topic) : null;
			const scrim = myProposal ? dockScrim() : null;
			const shellClass = myProposal ? '.shell--docked' : '';

			// The one-shot intro peek: fires after the travel splash clears, so
			// the "here is where your text now lives" reveal isn't spent under
			// a card the student can't see through — then folds itself away
			// rather than standing between them and the square.
			if (pendingDockIntro && myProposal && !splash) {
				pendingDockIntro = false;
				dockOpen = true;
				dockIntro = true;
				dockIntroTimer = window.setTimeout(
					() => {
						endDockIntro(true);
						m.redraw();
					},
					reducedMotion ? 2000 : 3200,
				);
			}

			// ---------- TAB: RESULTS (a screen, not a step) ----------
			// Placeholder for now: the class picture that belongs here is not
			// designed yet, and a tab that leads nowhere is worse than one
			// that says so. Standing here does NOT advance the lap.
			if (showResults && myProposal) {
				return m(`.shell.shell--delib.shell--mode-mine.shell--place-mine${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						m('.results-soon', [
							m('span.results-soon__icon', { 'aria-hidden': 'true' }, '📊'),
							m('h2.results-soon__title', t('delib.results_title')),
							m('p.results-soon__body', t('delib.results_soon')),
						]),
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								onclick: () => {
									showResults = false;
								},
							},
							cycle.step === 'help' ? t('delib.back_to_stand') : t('delib.back_to_square'),
						),
					]),
					scrim,
					dock,
				]);
			}

			// ---------- STEP: MY PROPOSAL (write, later improve) ----------
			if (cycle.step === 'mine') {
				const writeMode = !myProposal;

				// Lap 1: nothing exists yet. The screen's ONE job is the first
				// write, so it is built as a single writing desk: mission brief,
				// the live textarea and the lantern CTA bound in one blue-framed
				// card — instead of a muted hint, a bare input and a button
				// floating apart. The needs board stands OPEN underneath (explicit
				// call, 2026-08-10): the raw material in view while writing, but
				// below the CTA so it never pushes the pen or the button off a
				// phone screen.
				if (writeMode) {
					const ready = draft.trim().length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

					return m('.shell.shell--mode-mine.shell--place-mine', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							placeBanner('mine'),
							m('.card.write-desk', [
								// The challenge pinned to the desk as a mission brief,
								// visually part of the writing surface it belongs to
								m('.write-desk__mission', [
									m('span.write-desk__mission-icon', { 'aria-hidden': 'true' }, '🎯'),
									m('.write-desk__mission-text', [
										m('span.write-desk__mission-label', t('delib.mission_label')),
										m('p', t('delib.propose_hint')),
									]),
								]),
								m('textarea.my-lantern__textarea.write-desk__textarea', {
									value: draft,
									rows: 4,
									maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
									placeholder: t('delib.placeholder'),
									'aria-label': t('delib.my_proposal'),
									oninput: (event: InputEvent) => {
										draft = (event.target as HTMLTextAreaElement).value;
									},
								}),
								m('.delib__actions', [
									m(
										'button.btn.btn--primary.btn--full.btn--lg.write-desk__cta',
										{
											class: ready ? 'write-desk__cta--ready' : undefined,
											disabled: submitting || !ready,
											onclick: () => {
												submitting = true;
												const text = draft.trim();
												submitProposal(live, anonName, text)
													.then(() => {
														// The first write moves the lap forward
														setCycle({ step: 'rate', rated: 0 });
														// ...and the notebook opens itself once on arrival, so
														// the text visibly LANDS somewhere instead of just
														// vanishing off the screen it was typed on
														pendingDockIntro = true;
													})
													.catch((error: unknown) => {
														console.error('[Delib] Submit proposal failed:', error);
													})
													.finally(() => {
														submitting = false;
														m.redraw();
													});
											},
										},
										// The button states its own condition — the same rule the
										// update button learned in playtests (a grey button with
										// no reason reads as "broken"). Empty desk: it says what
										// to do; first real sentence: it flips to the lit action
										// with a lantern halo, teaching the rule at the exact
										// moment it starts to matter.
										ready ? `🏮 ${t('delib.submit_proposal')}` : `✍️ ${t('delib.write_first')}`,
									),
								]),
							]),
							m(NeedsPeek, { topic, defaultOpen: true }),
						]),
					]);
				}

				// Lap 2+: the workshop itself now lives in the dock below, so
				// standing in it is a short, honest screen — where you are, a
				// pointer at the notebook, and the one way onward. A lap with
				// nothing waiting can be walked through in one tap.
				return m(`.shell.shell--delib.shell--mode-mine.shell--place-mine${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						placeBanner('mine'),
						m('p.home-explanation', t('delib.dock_hint')),
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								onclick: () => {
									setCycle({ step: 'rate', rated: 0 });
								},
							},
							t('delib.to_rating'),
						),
					]),
					scrim,
					dock,
				]);
			}

			// ---------- STEP: RATE OTHERS (peer mode — silver accent) ----------
			if (cycle.step === 'rate') {
				// The whole square at once, freshest first. One proposal at a time
				// behind a "next" beat hid the class from the class: you could see
				// only what you had been handed, never what anyone else wrote.
				const square = squareOrder(proposals, scores);
				// A deep link from the "woven in" celebration points at a card:
				// unfold it, or what it promised stays inside a folded handle
				if (
					focusHelpedId !== null &&
					square.some((proposal) => proposal.statementId === focusHelpedId)
				) {
					openStallId = focusHelpedId;
				}
				const quotaDone = cycle.rated >= AGORA_CYCLE.RATINGS_PER_ROUND;
				const allWeighed =
					square.length > 0 &&
					square.every((proposal) => myRatings[proposal.statementId] !== undefined);
				// The lap asks for a few ratings first — but a student who has
				// already weighed every proposal there is must never be stuck
				const canMoveOn = quotaDone || allWeighed;
				const onward = m(
					'button.btn.btn--primary.btn--full',
					{
						onclick: () => {
							setCycle({ step: 'help' });
						},
					},
					t('delib.to_helping'),
				);

				return m(`.shell.shell--delib.shell--mode-peer.shell--place-square${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						placeBanner('rate'),
						square.length > 0
							? [
									// The goal as a counter rather than a sentence — the
									// banner above already said what this place is for
									m(
										'p.rate-progress',
										{
											'aria-label': t('delib.rate_progress', {
												n: cycle.rated,
												total: AGORA_CYCLE.RATINGS_PER_ROUND,
											}),
										},
										`⚖️ ${cycle.rated}/${AGORA_CYCLE.RATINGS_PER_ROUND}`,
									),
									m(
										'.stall-list',
										square.map((proposal) =>
											stallRow({
												proposal,
												flip: true,
												open: openStallId === proposal.statementId,
												onToggle: () => {
													const opening = openStallId !== proposal.statementId;
													openStallId = opening ? proposal.statementId : '';
													// Unfolding the card is engaging with the change —
													// the NEW/EDITED chip has delivered its message
													if (opening) ackProposalSeen(proposal);
												},
												chips: [changeChip(proposal), rateStallChip(proposal)],
												body: () => stallBody(live, proposal, { countsTowardLap: true }),
											}),
										),
									),
									canMoveOn ? onward : null,
									m(NeedsPeek, { topic }),
								]
							: [
									m('.text-center.stack', [
										m('.scene__waiting-glow'),
										m('h3', t('delib.nothing_to_rate')),
									]),
									onward,
								],
					]),
					scrim,
					dock,
				]);
			}

			// ---------- STEP: HELP SOMEONE ----------
			if (cycle.step === 'help') {
				const stalls = orderedStalls(proposals, suggestions);
				const helpedById = new Map(
					getHelpedProposals(userId).map((entry) => [entry.proposal.statementId, entry]),
				);
				// The badge clears per card as each stall is opened or re-rated —
				// standing in the market alone doesn't count as reading the news.
				// A deep link from the "woven in" toast points at a stall: open it,
				// or the card it promised is folded away inside a handle
				if (focusHelpedId !== null && helpedById.has(focusHelpedId)) {
					openStallId = focusHelpedId;
				}
				const lastLap = cycle.round >= AGORA_CYCLE.ROUNDS;
				const helpedNow = helpedThisLap.size > 0;
				const forwardLabel = lastLap
					? t('delib.finish_cycles')
					: helpedNow
						? t('delib.next_lap')
						: t('delib.skip_help');
				// Before I've helped anyone, moving on is an escape hatch and must
				// not compete with the stalls; once I have, it is the way forward
				const forward =
					helpedNow || lastLap
						? m('button.btn.btn--secondary.btn--full', { onclick: advanceRound }, forwardLabel)
						: m('button.text-link.text-link--quiet', { onclick: advanceRound }, forwardLabel);

				// The whole market in one screen: every classmate's stall folded
				// into a row you can read down. No scoreboard here on purpose —
				// when I come to help, their numbers are noise, and judging a
				// classmate's score is not the job.
				return m(`.shell.shell--delib.shell--mode-peer.shell--place-visit${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						placeBanner('help'),
						stalls.length > 0
							? [
									m(
										'.stall-list',
										stalls.map((proposal) => {
											const helped = helpedById.get(proposal.statementId);

											return stallRow({
												proposal,
												open: openStallId === proposal.statementId,
												onToggle: () => {
													const opening = openStallId !== proposal.statementId;
													openStallId = opening ? proposal.statementId : '';
													if (opening) ackProposalSeen(proposal);
												},
												chips: [helpStallChip(proposal, helped), changeChip(proposal)],
												body: () => stallBody(live, proposal),
											});
										}),
									),
									forward,
									m(NeedsPeek, { topic }),
								]
							: [m('p.text-center.lobby__status', t('delib.no_more')), forward],
					]),
					scrim,
					dock,
				]);
			}

			// ---------- DONE: all cycles complete ----------
			// The ScoreHUD's chart is the data view here — no map scenery needed
			return m(`.shell.shell--wide.shell--delib.shell--mode-mine.shell--place-mine${shellClass}`, [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					header,
					delibNav(myProposal),
					m('h3.text-center', t('delib.cycle_done_title')),
					m('p.home-explanation', t('delib.cycle_done_hint')),
					// The same one card per classmate as everywhere else — the laps
					// are over, but re-reading, re-weighing and answering the
					// author are not, and they live in the row they always did
					m(
						'.stall-list',
						squareOrder(proposals, scores).map((proposal) =>
							stallRow({
								proposal,
								open: openStallId === proposal.statementId,
								onToggle: () => {
									const opening = openStallId !== proposal.statementId;
									openStallId = opening ? proposal.statementId : '';
									if (opening) ackProposalSeen(proposal);
								},
								chips: [changeChip(proposal), rateStallChip(proposal)],
								body: () => stallBody(live, proposal),
							}),
						),
					),
					m(
						'button.btn.btn--secondary.btn--full',
						{
							onclick: () => {
								setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
							},
						},
						t('delib.keep_helping'),
					),
				]),
				scrim,
				dock,
			]);
		},
	};
}
