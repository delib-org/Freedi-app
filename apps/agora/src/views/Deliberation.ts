import m from 'mithril';
import { t, tCount } from '../lib/i18n';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
	submitProposal,
	rateProposal,
	submitSuggestion,
	resolveSuggestion,
	askCharacterReview,
	getHelpedProposals,
	openSuggestionsBy,
	AgoraProposal,
	AgoraRating,
	HelpedProposal,
} from '../lib/proposals';
import { CountdownTimer } from '../components/CountdownTimer';
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
	AgoraCharacter,
	AgoraCharacterReview,
	AgoraParticipant,
	AgoraProposalScore,
	AgoraSession,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	AGORA_ANTI_GAMING,
	AGORA_CYCLE,
	AGORA_LIMITS,
	createAgoraCharacterReviewId,
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
						{ type: 'button', 'aria-expanded': String(open), onclick: opts?.onToggle },
						head,
					)
				: m('.workbench__head', head),
			open ? body : null,
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

function totalRaters(score: AgoraProposalScore | undefined): number {
	if (!score) return 0;

	return score.perCamp.left.n + score.perCamp.right.n + score.perCamp.center.n;
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

/** How long a pressed rating stays visibly selected before the square moves on */
const RATE_ACK_MS = 700;

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
	/**
	 * The classmates' stalls are a LIST now, not a carousel: one draft per
	 * proposal, so folding a stall never eats what was typed in it.
	 */
	const helpDrafts: Record<string, string> = {};
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
	 * The just-pressed rating in the square, held for one acknowledgment
	 * beat (ring + ✓ + receding siblings) before the next proposal swaps
	 * in — the instant swap read as "nothing happened" when pressed.
	 */
	let justRated: { statementId: string; value: AgoraRating } | null = null;
	let rateAckTimer = 0;
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
	/** proposalId → follow-up comment draft (the collaboration loop; per-proposal) */
	const followUpDrafts: Record<string, string> = {};
	const followUpBusy: Record<string, boolean> = {};
	/**
	 * suggestionId → ticked-but-not-yet-announced "woven in" mark. A tick is
	 * LOCAL and freely untickable; only saving the proposal resolves it, so the
	 * suggester's announcement always arrives together with a real change.
	 */
	const wovenPending: Record<string, boolean> = {};
	/** The accepted-ideas drawer under the edit box (collapsed by default) */
	let acceptedDrawerOpen = false;
	/**
	 * The accept → tick → save chain is the least self-evident mechanic in
	 * the game: nothing ever told students the tick is PENDING until they
	 * save, so "I accepted it, why didn't they get their points?" was a real
	 * dead end. Shown once, on the first accept of the session.
	 */
	const weaveCoachKey = `agora_${session.sessionId}_weavecoach`;
	let showWeaveCoach = false;
	/** The woven-in archive: history, so it opens only when asked for */
	let archiveOpen = false;
	/**
	 * The received-improvements accordion. null = follow the feedback: fresh
	 * suggestions open it by themselves, and once a student closes it their
	 * choice sticks.
	 */
	let suggestionsToggle: boolean | null = null;
	/**
	 * The text just accepted, held until the resolve lands in the snapshot —
	 * the drawer must not look empty in the moment right after "accept".
	 */
	let pendingAcceptText: string | undefined;
	/**
	 * Suggestions mid-flight to the accepted-ideas drawer. Membership does two
	 * jobs: it hides the card from the received list on the very click (before
	 * the snapshot confirms), and it tells onbeforeremove THIS removal is an
	 * acceptance — deserving the flight — and not an accordion fold.
	 */
	const flyingAccepted = new Set<string>();
	/**
	 * Flights currently on screen. Distinct from the set above on purpose:
	 * the set may retire mid-flight (the snapshot confirming is what retires
	 * it), while THIS pins the accordion open until the card actually lands.
	 */
	let flightsInAir = 0;

	/**
	 * The exit animation of an accepted card: it shrinks and sails INTO the
	 * accepted-ideas drawer, so "where did it go?" is answered by the motion
	 * itself. Returns the promise Mithril awaits before dropping the node.
	 */
	function flyToAcceptedDrawer(dom: HTMLElement, suggestionId: string): Promise<void> | undefined {
		// Membership is only READ here — it must outlive the flight, or a
		// redraw racing the server snapshot resurrects the card mid-air.
		// The list filter retires the id once the accepted status lands.
		if (!flyingAccepted.has(suggestionId)) return undefined;
		const target = document.querySelector<HTMLElement>('.chat-drawer__head');
		if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return undefined;
		}
		const from = dom.getBoundingClientRect();
		const to = target.getBoundingClientRect();
		dom.style.setProperty('--fly-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
		dom.style.setProperty('--fly-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
		dom.classList.add('workshop__item--flying');
		flightsInAir++;

		return new Promise((resolve) => {
			let settled = false;
			const done = () => {
				if (settled) return;
				settled = true;
				flightsInAir--;
				// The drawer visibly CATCHES the idea — the landing half of the arc
				target.classList.add('chat-drawer__head--landed');
				window.setTimeout(() => target.classList.remove('chat-drawer__head--landed'), 700);
				resolve();
				m.redraw();
			};
			dom.addEventListener('animationend', done, { once: true });
			// If the animation never runs (styles missing, tab hidden), the
			// card must not haunt the list as an un-removable ghost
			window.setTimeout(done, 1600);
		});
	}
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
		focusOnOpen = '.workbench__section--collapsible .workbench__head--button';
		m.redraw();
	}

	/**
	 * Fold the notebook. Refused while an accepted idea is mid-flight to the
	 * adopted-ideas drawer — the sheet closing would swallow the card before
	 * it can land (same reasoning as the accordion pin below).
	 */
	function closeDock(): boolean {
		if (flightsInAir > 0 || flyingAccepted.size > 0) return false;
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
		dom.classList.add('helped__item--spotlight');
		window.setTimeout(() => dom.classList.remove('helped__item--spotlight'), 2400);
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
					(showResults || cycle.step === 'mine') && helpedChangedCount() > 0
						? m('span.delib-nav__badge', String(helpedChangedCount()))
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
		const seed = `${userId}--${id}`;
		let hash = 0;
		for (let index = 0; index < seed.length; index++) {
			hash = (hash * 31 + seed.charCodeAt(index)) | 0;
		}

		return hash;
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

		// The tray is a WORKBENCH, not a history: it holds only ideas still
		// waiting to be woven in. Once an idea is in the text its job here is
		// done — it moves to the archive below, so a long game can't bury
		// today's two open ideas under twenty finished ones.
		const allAdopted = getDeliberationState().suggestions[myProposal.statementId] ?? [];
		const acceptedIdeas = allAdopted.filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.accepted,
		);
		const archivedIdeas = allAdopted.filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.implemented,
		);
		const pendingAccept =
			pendingAcceptText !== undefined &&
			!acceptedIdeas.some((entry) => entry.statement === pendingAcceptText) &&
			!archivedIdeas.some((entry) => entry.statement === pendingAcceptText)
				? pendingAcceptText
				: undefined;
		const ideaCount = acceptedIdeas.length + (pendingAccept ? 1 : 0);
		const hasPendingWoven = acceptedIdeas.some((entry) => wovenPending[entry.statementId] === true);
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

		return m('.card.my-lantern.my-lantern--workshop', [
			m('.my-lantern__header', [
				m('span.my-lantern__icon', '📘'),
				m('span.my-lantern__title', t('delib.my_proposal')),
				m('span.my-lantern__hint', `✏️ ${t('delib.always_editable')}`),
			]),
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
					oninput: (event: InputEvent) => {
						mineDraft = (event.target as HTMLTextAreaElement).value;
						rememberMineDraft();
					},
				}),
				m('.delib__actions', [
					m(
						'button.btn.btn--primary.my-lantern__save',
						{
							// Pending woven-in ticks also arm the save button: the
							// update is what announces them to the suggesters
							disabled: (!changed && !hasPendingWoven) || submitting,
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
										// NOW the ticked ideas go out: the suggesters'
										// "woven in" notification arrives together with
										// the change they can inspect and re-rate
										for (const [suggestionId, pending] of Object.entries(wovenPending)) {
											if (!pending) continue;
											delete wovenPending[suggestionId];
											resolveSuggestion(
												live.sessionId,
												suggestionId,
												AgoraSuggestionStatus.implemented,
											).catch((error: unknown) => {
												console.error('[Delib] Mark woven failed:', error);
											});
										}
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
						t('delib.update_proposal'),
					),
				]),
				// A greyed button with no stated reason reads as "broken" —
				// playtests had students tapping it twice and giving up
				!changed && !hasPendingWoven ? m('p.action-hint', t('delib.update_hint')) : null,
			]),
			// Accepted improvement ideas live in a drawer right BENEATH the
			// editor — the count invites a peek without stealing the stage,
			// and a tick marks an idea as woven into the text above.
			ideaCount > 0
				? m('.chat-drawer', { class: acceptedDrawerOpen ? 'chat-drawer--open' : undefined }, [
						m(
							'button.chat-drawer__head',
							{
								'aria-expanded': String(acceptedDrawerOpen),
								onclick: () => {
									acceptedDrawerOpen = !acceptedDrawerOpen;
								},
							},
							[
								// Its own title, not chat.accepted_reminder: the
								// "improvements you received" section sits right below,
								// and two identical headers would read as one thing
								m('span.chat-drawer__title', `💡 ${t('delib.accepted_ideas')}`),
								m('span.chat-drawer__count', String(ideaCount)),
								m('span.chat-drawer__chevron', { 'aria-hidden': 'true' }),
							],
						),
						// The panel stays in the DOM so the 0fr→1fr grid transition
						// can animate the expand/collapse (see chat.scss)
						m(
							'.chat-drawer__panel',
							{ 'aria-hidden': String(!acceptedDrawerOpen) },
							m('.chat-drawer__inner', [
								// The contract, stated once, exactly where the work happens
								showWeaveCoach
									? m('.weave-coach', [
											m('p.weave-coach__text', t('delib.weave_coach')),
											m(
												'button.btn.btn--ghost.btn--sm',
												{
													onclick: () => {
														showWeaveCoach = false;
													},
												},
												t('delib.weave_coach_got_it'),
											),
										])
									: null,
								m('.chat-drawer__list', [
									// Nested array (own fragment) — keyed items must not be
									// spread among unkeyed siblings (Mithril mixed-keys crash).
									// The second mark of the lifecycle: accept said "I like
									// it"; the ✓ here says "it's in the text now" — precise
									// attribution the suggester gets notified about.
									acceptedIdeas.map((entry) => {
										const pending = wovenPending[entry.statementId] === true;

										return m('.chat-drawer__item', { key: entry.statementId }, [
											m('label.chat-drawer__check', { title: t('chat.mark_woven') }, [
												m('input.chat-drawer__check-input', {
													type: 'checkbox',
													// A tick is a PENDING mark — saving the
													// proposal is what announces it (until then
													// it can be freely unticked)
													checked: pending,
													'aria-label': t('chat.mark_woven'),
													onchange: () => {
														wovenPending[entry.statementId] = !pending;
													},
												}),
												m('span.chat-drawer__check-box', { 'aria-hidden': 'true' }),
											]),
											m('p.chat-drawer__item-text', entry.statement),
										]);
									}),
									pendingAccept
										? m('.chat-drawer__item', m('p.chat-drawer__item-text', pendingAccept))
										: null,
								]),
							]),
						),
					])
				: null,
			// The archive: every idea that MADE IT into the text. Not a drawer
			// like the tray above — a button, because this is history you go
			// look at, not work waiting on you. Hidden until there is one.
			archivedIdeas.length > 0
				? m('.archive', [
						m(
							'button.btn.btn--ghost.btn--sm.archive__toggle',
							{
								'aria-expanded': String(archiveOpen),
								onclick: () => {
									archiveOpen = !archiveOpen;
								},
							},
							[
								`📦 ${t('delib.archive_open')}`,
								m('span.archive__count', String(archivedIdeas.length)),
							],
						),
						archiveOpen
							? m('.archive__list', [
									m('p.archive__hint', t('delib.archive_hint')),
									archivedIdeas.map((entry) =>
										m('.archive__item', { key: entry.statementId }, [
											m('span.archive__mark', { 'aria-hidden': 'true' }, '✓'),
											m('.archive__body', [
												m('p.archive__text', entry.statement),
												// The suggester is named here on purpose: this is
												// the credit ledger of who improved my proposal
												entry.anonName
													? m(
															'p.archive__from',
															t('delib.suggestion_from', { name: entry.anonName }),
														)
													: null,
											]),
										]),
									),
								])
							: null,
					])
				: null,
			workbenchSection(
				'💡',
				t('delib.suggestions_received'),
				suggestionsSection(live, myProposal),
				{
					count: openCount,
					// A live flight pins the section open: accepting the LAST open
					// suggestion drops openCount to 0 on the same redraw, and a
					// folding accordion would swallow the card before it can fly
					open: (suggestionsToggle ?? openCount > 0) || flyingAccepted.size > 0 || flightsInAir > 0,
					onToggle: () => {
						suggestionsToggle = !(suggestionsToggle ?? openCount > 0);
					},
				},
			),
			workbenchSection('🎭', t('delib.ask_elders'), askSection(live, myProposal, topic)),
			m('.workbench__section.workbench__section--plain', m(NeedsPeek, { topic })),
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

		// ONE line, strict priority: what needs me outranks what happened to
		// me, which outranks the text itself. It doubles as the live region,
		// so a screen reader hears arriving feedback without focus moving.
		let sub: m.Children;
		let subClass: string | undefined;
		if (openCount > 0) {
			sub = `💡 ${tCount('delib.dock_new_ideas', openCount)}`;
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
						openCount > 0
							? m('span.proposal-dock__badge', { 'aria-hidden': 'true' }, String(openCount))
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

	/** The latest comments & improvement suggestions, right under the editable text */
	function suggestionsSection(live: AgoraSession, myProposal: AgoraProposal): m.Children {
		const { suggestions } = getDeliberationState();
		const allSuggestions = suggestions[myProposal.statementId] ?? [];
		// Newest first — the freshest feedback sits closest to the edit box.
		// Accepted ideas are NOT listed here: they moved (visibly, by flight)
		// into the adopted-ideas drawer, and a card can't live in two places.
		let declinedCount = 0;
		const mySuggestions = [...allSuggestions].reverse().filter((entry) => {
			const resolved =
				entry.suggestionStatus === AgoraSuggestionStatus.accepted ||
				entry.suggestionStatus === AgoraSuggestionStatus.implemented;
			// The snapshot has confirmed the acceptance — the local
			// in-flight flag has done both its jobs and can retire
			if (resolved) flyingAccepted.delete(entry.statementId);
			// Declined ideas retire too. Left in place they turned the workshop
			// into a growing pile of things you said no to, burying the open
			// feedback that actually needs a decision — and the tray is meant to
			// be a to-do list, not a museum of refusals. Nothing is lost: the
			// suggester's own card carries the canonical status.
			if (entry.suggestionStatus === AgoraSuggestionStatus.declined) {
				declinedCount++;

				return false;
			}

			return !resolved && !flyingAccepted.has(entry.statementId);
		});

		return m('.stack', [
			// "No feedback yet" only when there is truly none — a list whose
			// every idea was adopted is a success, not an empty inbox
			allSuggestions.length === 0
				? m('p.square-says__meaning.text-center', t('delib.no_feedback_yet'))
				: null,
			// Retired declines collapse to one muted line — the record stays
			// honest without the workshop wearing every "no" as a card
			declinedCount > 0
				? m('p.workshop__declined-note', tCount('delib.declined_count', declinedCount))
				: null,
			// Nested array (own fragment) — keyed cards must not be spread
			// among unkeyed siblings (Mithril mixed-keys crash)
			mySuggestions.map((suggestion) =>
				m(
					'.card.stack.workshop__item',
					{
						key: suggestion.statementId,
						onbeforeremove: (vnode: m.VnodeDOM) =>
							flyToAcceptedDrawer(vnode.dom as HTMLElement, suggestion.statementId),
					},
					[
						suggestion.anonName
							? m(
									'p.workshop__from',
									`💡 ${t('delib.suggestion_from', { name: suggestion.anonName })}`,
								)
							: null,
						m('p', suggestion.statement),
						suggestion.suggestionStatus === AgoraSuggestionStatus.open
							? [
									// Two doors, not three: take the idea or let it go. A
									// middle "thanks" button only bought the student a way
									// to answer without deciding.
									m('.delib__actions.delib__actions--tight', [
										m(
											'button.btn.btn--ghost.btn--sm',
											{
												onclick: () => {
													void resolveSuggestion(
														live.sessionId,
														suggestion.statementId,
														AgoraSuggestionStatus.declined,
													);
												},
											},
											t('delib.no_thanks'),
										),
										m(
											'button.btn.btn--primary.btn--sm',
											{
												onclick: () => {
													// The edit box is right above — accepting means:
													// now weave the idea into your text. Open the
													// accepted-ideas drawer so the idea is in sight
													// while editing, not hidden one click away.
													pendingAcceptText = suggestion.statement;
													acceptedDrawerOpen = true;
													if (!sessionStorage.getItem(weaveCoachKey)) {
														sessionStorage.setItem(weaveCoachKey, '1');
														showWeaveCoach = true;
													}
													// Arm the flight BEFORE the redraw: this very
													// click removes the card, and the exit hook
													// checks the set to tell acceptance from a fold
													flyingAccepted.add(suggestion.statementId);
													resolveSuggestion(
														live.sessionId,
														suggestion.statementId,
														AgoraSuggestionStatus.accepted,
													).catch((error: unknown) => {
														// The accept never landed — un-arm, so the
														// card comes back instead of vanishing
														flyingAccepted.delete(suggestion.statementId);
														if (pendingAcceptText === suggestion.statement) {
															pendingAcceptText = undefined;
														}
														console.error('[Delib] Accept suggestion failed:', error);
														m.redraw();
													});
												},
											},
											t('delib.will_implement'),
										),
									]),
									m('p.square-says__meaning', t('delib.accept_hint')),
								]
							: m(
									'span.values__score',
									// "Woven in" outranks "accepted" — it's the later mark
									// of the same lifecycle, so it must be tested first
									suggestion.suggestionStatus === AgoraSuggestionStatus.implemented
										? `✓ ${t('delib.implemented')}`
										: suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
											? t('delib.accepted')
											: suggestion.suggestionStatus === AgoraSuggestionStatus.declined
												? t('delib.declined')
												: t('delib.thanked'),
								),
					],
				),
			),
		]);
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
			openCharacter
				? characterReviewCard(
						live,
						openCharacter,
						myProposal,
						getDeliberationState().characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, openCharacter.characterId)
						],
					)
				: null,
		]);
	}

	// ---------- The collaboration loop: "proposals I helped" ----------

	/** sessionStorage map: helped proposalId → lastUpdate already SEEN in the section */
	const helpedSeenKey = `agora_${session.sessionId}_helped_seen`;

	function readHelpedSeen(): Record<string, number> {
		try {
			return JSON.parse(sessionStorage.getItem(helpedSeenKey) ?? '{}') as Record<string, number>;
		} catch {
			return {};
		}
	}

	/** Helped proposals that moved since I last looked — feeds the Others badge */
	function helpedChangedCount(): number {
		const seen = readHelpedSeen();

		return getHelpedProposals(userId).filter(({ proposal, mySuggestions }) => {
			// Never-seen baseline = my latest input there, so the badge only
			// lights for REAL changes after my suggestion, not for the
			// suggestion itself
			const baseline =
				seen[proposal.statementId] ??
				Math.max(...mySuggestions.map((suggestion) => suggestion.createdAt));

			return proposal.lastUpdate > baseline;
		}).length;
	}

	/** Rendering the section counts as seeing it (equality-guarded — no storage thrash) */
	function markHelpedSeen(entries: readonly HelpedProposal[]): void {
		const seen = readHelpedSeen();
		let changed = false;
		for (const { proposal } of entries) {
			if (seen[proposal.statementId] !== proposal.lastUpdate) {
				seen[proposal.statementId] = proposal.lastUpdate;
				changed = true;
			}
		}
		if (changed) sessionStorage.setItem(helpedSeenKey, JSON.stringify(seen));
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

	/** Compact five-level scale for CHANGING my vote — never touches cycle state */
	function reRateScale(live: AgoraSession, proposal: AgoraProposal): m.Children {
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
							void rateProposal(live, proposal.statementId, option.value);
							ackReRate(proposal.statementId);
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
	function helpedImprovedSince(entry: HelpedProposal): boolean {
		const { proposal, mySuggestions } = entry;
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
	function helpedItem(
		live: AgoraSession,
		entry: HelpedProposal,
		opts?: { bare?: boolean },
	): m.Children {
		const { proposal, mySuggestions } = entry;
		const improvedSince = helpedImprovedSince(entry);
		const acked = reRateAcked[proposal.statementId] === true;
		const atSuggestionCap =
			openSuggestionsBy(proposal.statementId, userId) >=
			AGORA_ANTI_GAMING.MAX_OPEN_SUGGESTIONS_PER_HELPER;
		const draft = followUpDrafts[proposal.statementId] ?? '';
		// "Woven in" is the strongest acknowledgment — check it before accepted
		const statusKey = (suggestion: AgoraProposal): string =>
			suggestion.suggestionStatus === AgoraSuggestionStatus.implemented
				? 'delib.implemented'
				: suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
					? 'delib.accepted'
					: suggestion.suggestionStatus === AgoraSuggestionStatus.thanked
						? 'delib.thanked'
						: suggestion.suggestionStatus === AgoraSuggestionStatus.declined
							? 'delib.declined'
							: 'delib.helped_status_open';

		return m(
			'.card.stack.helped__item',
			{
				key: proposal.statementId,
				oncreate: (cardVnode: m.VnodeDOM) => spotlightHelped(cardVnode.dom, proposal.statementId),
				onupdate: (cardVnode: m.VnodeDOM) => spotlightHelped(cardVnode.dom, proposal.statementId),
			},
			[
				// The proposal itself comes first — that's what I'm evaluating
				opts?.bare === true
					? null
					: m('.owner-row', [
							m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
							m(
								'span.owner-row__number',
								t('delib.proposal_number', { n: proposalNumber(proposal) }),
							),
						]),
				opts?.bare === true ? null : m('p.helped__current', proposal.statement),
				improvedSince ? m('p.helped__improved', `✨ ${t('delib.helped_improved_marker')}`) : null,
				// The cycle's final beat: the press is answered in words, once,
				// then the prompt returns
				acked
					? m('p.helped__rerate-ack', { role: 'status' }, `✓ ${t('delib.rerate_ack')}`)
					: m('p.square-says__meaning', t('delib.helped_rerate_prompt')),
				reRateScale(live, proposal),
				// My improvement ideas + live status chips — the acknowledgment —
				// sit beneath the evaluation, with the follow-up box continuing them.
				// Nested array (own fragment): keyed children must not be spread
				// among unkeyed siblings (Mithril mixed-keys crash)
				m('p.teacher__section-title', t('delib.helped_your_ideas')),
				mySuggestions.map((suggestion) =>
					m('.helped__suggestion', { key: suggestion.statementId }, [
						m('p.helped__suggestion-text', suggestion.statement),
						m(
							'span.helped__chip',
							{ class: `helped__chip--${suggestion.suggestionStatus ?? 'open'}` },
							t(statusKey(suggestion)),
						),
					]),
				),
				m('textarea.text-input.helped__followup', {
					value: draft,
					rows: 2,
					placeholder: t('delib.helped_followup_placeholder'),
					oninput: (event: InputEvent) => {
						followUpDrafts[proposal.statementId] = (event.target as HTMLTextAreaElement).value;
					},
				}),
				// The spam guard, stated plainly rather than enforced silently:
				// two unresolved ideas at a time on one proposal. Resolving any
				// of them frees the slot immediately.
				atSuggestionCap ? m('p.action-hint', t('delib.open_ideas_cap')) : null,
				m(
					'button.btn.btn--secondary',
					{
						disabled:
							followUpBusy[proposal.statementId] === true ||
							atSuggestionCap ||
							draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
						onclick: () => {
							const text = draft.trim();
							followUpBusy[proposal.statementId] = true;
							followUpDrafts[proposal.statementId] = '';
							// A free follow-up: continues the conversation, no lap advance
							submitSuggestion(live, proposal, initialVnode.attrs.myParticipant.anonName, text)
								.catch((error: unknown) => {
									console.error('[Delib] Follow-up failed:', error);
								})
								.finally(() => {
									followUpBusy[proposal.statementId] = false;
									m.redraw();
								});
						},
					},
					t('delib.send_suggestion'),
				),
			],
		);
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

		return stallOrder
			.map((id) => byId.get(id))
			.filter((proposal): proposal is AgoraProposal => proposal !== undefined);
	}

	/**
	 * One stall. Folded, the classmate's proposal IS the handle — no chip, no
	 * label, no title competing with it. Unfolded, it is either the box for my
	 * idea or, if I already left one, the whole collaboration loop.
	 */
	function stallRow(
		live: AgoraSession,
		proposal: AgoraProposal,
		helped: HelpedProposal | undefined,
	): m.Children {
		const open = openStallId === proposal.statementId;
		const draft = helpDrafts[proposal.statementId] ?? '';
		const justSent = sentAckId === proposal.statementId;
		const number = proposalNumber(proposal);
		const chip = justSent
			? m(
					'span.help-stall__chip.help-stall__chip--sent',
					{ role: 'status' },
					`✓ ${t('delib.sent_ack')}`,
				)
			: helped && helpedImprovedSince(helped)
				? m(
						'span.help-stall__chip.help-stall__chip--improved',
						{ 'aria-label': t('delib.helped_improved_marker') },
						`✨ ${t('delib.improved_chip')}`,
					)
				: helped
					? m('span.help-stall__chip', `🤝 ${t('delib.helped_chip')}`)
					: null;

		return m(
			'.help-stall',
			{ key: proposal.statementId, class: open ? 'help-stall--open' : undefined },
			[
				m(
					'button.help-stall__head',
					{
						'aria-expanded': String(open),
						onclick: () => {
							openStallId = open ? '' : proposal.statementId;
						},
					},
					[
						m(
							'span.help-stall__num',
							{ 'aria-label': t('delib.proposal_number', { n: number }) },
							String(number),
						),
						m('span.help-stall__preview', proposal.statement),
						chip,
						m('span.help-stall__chevron', {
							class: open ? 'help-stall__chevron--open' : undefined,
							'aria-hidden': 'true',
						}),
					],
				),
				open
					? m('.help-stall__body', [
							m('p.help-stall__text', proposal.statement),
							helped
								? // Keyed child (helpedItem) in its own container: Mithril
									// refuses keyed and unkeyed siblings in one list
									m('.help-stall__helped', [helpedItem(live, helped, { bare: true })])
								: m('.help-stall__compose', [
										m('textarea.text-input.help-stall__input', {
											value: draft,
											rows: 3,
											placeholder: t('delib.help_placeholder'),
											oninput: (event: InputEvent) => {
												helpDrafts[proposal.statementId] = (
													event.target as HTMLTextAreaElement
												).value;
											},
										}),
										m(
											'button.btn.btn--primary.btn--full',
											{
												disabled:
													sentAckId !== '' || draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
												onclick: () => {
													if (sentAckId !== '') return;
													const text = draft.trim();
													helpDrafts[proposal.statementId] = '';
													helpedThisLap.add(proposal.statementId);
													void submitSuggestion(
														live,
														proposal,
														initialVnode.attrs.myParticipant.anonName,
														text,
													);
													// The beat: the stall folds with a "sent" mark on it,
													// and the row stays — helping one classmate is not a
													// reason to be thrown out of the market
													sentAckId = proposal.statementId;
													openStallId = '';
													window.clearTimeout(sentAckTimer);
													sentAckTimer = window.setTimeout(() => {
														sentAckId = '';
														m.redraw();
													}, SENT_ACK_MS);
												},
											},
											t('delib.send_suggestion'),
										),
										// Only once they've started writing: on an empty box the
										// placeholder is already saying it
										draft.length > 0 && draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH
											? m('p.action-hint', t('delib.suggest_hint'))
											: null,
									]),
						])
					: null,
			],
		);
	}

	/** "Proposals I helped" — hidden until I've actually helped something */
	function helpedSection(live: AgoraSession): m.Children {
		const entries = getHelpedProposals(userId);
		if (entries.length === 0) return null;
		markHelpedSeen(entries);

		return m('.stack', [
			m('p.teacher__section-title', t('delib.helped_title')),
			entries.map((entry) => helpedItem(live, entry)),
		]);
	}

	return {
		onremove() {
			window.clearTimeout(splashTimer);
			window.clearTimeout(rateAckTimer);
			window.clearTimeout(sentAckTimer);
			window.clearTimeout(dockIntroTimer);
			Object.values(reRateAckTimers).forEach((timer) => window.clearTimeout(timer));
			stopDeliberationListeners();
			unregisterHelpedNavigator(goToHelped);
			unregisterMineNavigator(goToMine);
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, scores } = getDeliberationState();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			const anonName = myParticipant.anonName;

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

				// The edit panel: textarea + needs board + AI coach + actions
				const editPanel = [
					m('textarea.text-input.values__textarea', {
						value: draft,
						rows: 6,
						maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
						placeholder: t('delib.placeholder'),
						oninput: (event: InputEvent) => {
							draft = (event.target as HTMLTextAreaElement).value;
						},
					}),
					m(NeedsPeek, { topic }),
					m('.delib__actions', [
						m(
							'button.btn.btn--primary',
							{
								disabled: submitting || draft.trim().length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH,
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
							t('delib.submit_proposal'),
						),
					]),
				];

				// Lap 1: nothing exists yet — plain write screen
				if (writeMode) {
					return m('.shell.shell--mode-mine.shell--place-mine', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							placeBanner('mine'),
							m('p.home-explanation', t('delib.propose_hint')),
							...editPanel,
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
				// Fair attention: least-rated proposals first; deterministic
				// per-student tiebreak fans classmates out over different lanterns
				const candidates = proposals
					.filter(
						(proposal) =>
							proposal.creatorId !== userId && myRatings[proposal.statementId] === undefined,
					)
					.sort(
						(a, b) =>
							totalRaters(scores[a.statementId]) - totalRaters(scores[b.statementId]) ||
							studentOrder(a.statementId) - studentOrder(b.statementId),
					);
				// During the acknowledgment beat the just-rated proposal stays
				// pinned on screen — the snapshot already dropped it from
				// candidates, and an instant swap would eat the feedback
				const pinned = justRated;
				const current = pinned
					? proposals.find((proposal) => proposal.statementId === pinned.statementId)
					: candidates[0];
				const quotaDone = cycle.rated >= AGORA_CYCLE.RATINGS_PER_ROUND;

				return m(`.shell.shell--delib.shell--mode-peer.shell--place-square${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						placeBanner('rate'),
						m(
							'p.home-explanation',
							`${t('delib.rate_hint')} (${Math.min(cycle.rated + 1, AGORA_CYCLE.RATINGS_PER_ROUND)}/${AGORA_CYCLE.RATINGS_PER_ROUND})`,
						),
						m(NeedsPeek, { topic }),
						current && !quotaDone
							? m('.card.stack.delib__rate-card', [
									// Whose proposal am I rating? A classmate's — say so
									m('.owner-row', [
										m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
										m(
											'span.owner-row__number',
											t('delib.proposal_number', { n: proposalNumber(current) }),
										),
									]),
									m('p.scene__text', current.statement),
									m(
										'.rate-scale',
										{
											class: pinned ? 'rate-scale--has-selection' : undefined,
											role: 'radiogroup',
										},
										RATE_OPTIONS.map((option) => {
											const active = pinned?.value === option.value;

											return m(
												`button.rate-scale__option.rate-scale__option--${option.variant}`,
												{
													class: active ? 'rate-scale__option--selected' : undefined,
													role: 'radio',
													'aria-checked': String(active),
													disabled: pinned !== null ? true : undefined,
													onclick: () => {
														if (justRated) return;
														// The beat: show the press (ring, ✓, receding
														// siblings), THEN move the square along
														justRated = {
															statementId: current.statementId,
															value: option.value,
														};
														void rateProposal(live, current.statementId, option.value);
														rateAckTimer = window.setTimeout(() => {
															justRated = null;
															setCycle({ rated: cycle.rated + 1 });
															m.redraw();
														}, RATE_ACK_MS);
													},
												},
												[
													m('span.rate-scale__emoji', option.emoji),
													m('span.rate-scale__label', t(option.labelKey)),
													active
														? m('span.rate-scale__check', { 'aria-hidden': 'true' }, '✓')
														: null,
												],
											);
										}),
									),
								])
							: m('.text-center.stack', [
									m('.scene__waiting-glow'),
									m('h3', quotaDone ? t('delib.rate_done') : t('delib.nothing_to_rate')),
								]),
						current && !quotaDone
							? null
							: m(
									'button.btn.btn--primary.btn--full',
									{
										onclick: () => {
											setCycle({ step: 'help' });
										},
									},
									t('delib.to_helping'),
								),
						// The collaboration loop stays in reach on the whole Others
						// side — one tap on the Others tab and it's visible
						helpedSection(live),
					]),
					scrim,
					dock,
				]);
			}

			// ---------- STEP: HELP SOMEONE ----------
			if (cycle.step === 'help') {
				const stalls = orderedStalls(proposals, suggestions);
				const helpedEntries = getHelpedProposals(userId);
				const helpedById = new Map(
					helpedEntries.map((entry) => [entry.proposal.statementId, entry]),
				);
				// The stalls I visited live IN the row now, so this screen is where
				// their news is read — and the "come and look" badge clears here
				if (helpedEntries.length > 0) markHelpedSeen(helpedEntries);
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
										'.help-stall-list',
										stalls.map((proposal) =>
											stallRow(live, proposal, helpedById.get(proposal.statementId)),
										),
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
					helpedSection(live),
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
