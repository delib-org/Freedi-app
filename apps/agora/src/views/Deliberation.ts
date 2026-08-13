import m from 'mithril';
import { Icon, iconLabel, IconName } from '../components/Icon';
import { HeroIcon } from '../components/HeroIcon';
import { t, tCount } from '../lib/i18n';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
	createProposal,
	submitProposal,
	submitSuggestion,
	askCharacterReview,
	getHelpedProposals,
	getOwnerThreads,
	getThreadMessages,
	isSuggestionKind,
	isProposalConfirmed,
	openSuggestionsBy,
	AgoraProposal,
	HelpedProposal,
} from '../lib/proposals';
import { orderSquare, studentOrder as studentOrderFor } from '../lib/squareOrder';
import { DelibHud } from '../components/DelibHud';
import { Collapsible } from '../components/Collapsible';
import { ThreadChat, threadEntry } from './ThreadChat';
import {
	registerHelpedNavigator,
	unregisterHelpedNavigator,
	registerMineNavigator,
	unregisterMineNavigator,
	registerMarketNavigator,
	unregisterMarketNavigator,
	registerThreadNavigator,
	unregisterThreadNavigator,
	emphasise,
} from '../lib/helpedFocus';
import { initInbox } from '../lib/inbox';
import { EraMapLantern } from '../components/EraMap';
import { ResultsBoard } from '../components/ResultsBoard';
import { HelpersBoard } from '../components/HelpersBoard';
import { countThanks, ResultsSwitch, type ResultsTab } from '../components/ResultsSwitch';
import { RateScale, rateOptionFor } from '../components/RateScale';
import { getCampCensus, getSessionState } from '../lib/session';
import {
	answerBaseline,
	editClock,
	ideaLandedAt,
	ratingsMovedSince,
	reWeighMoment,
	scoreMovedMoment,
	supportSinceEdit,
	type SupportSinceEdit,
} from '../lib/improvementSignals';
import { NeedsPeek } from '../components/NeedsBoard';
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
	AGORA_BRIDGING,
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
	{ icon: IconName; titleKey: string; subKey: string; shellClass: string }
> = {
	// Three objects, not three tools — see the same table in DelibHud.ts for
	// why. These two must not drift: the HUD and the arrival splash are the
	// same place said twice, and a student who arrives at a square and then
	// sees a scale in the HUD has been told about two different rooms.
	mine: {
		icon: 'proposal',
		titleKey: 'place.mine_title',
		subKey: 'place.mine_sub',
		shellClass: 'shell--place-mine',
	},
	rate: {
		icon: 'square',
		titleKey: 'place.rate_title',
		subKey: 'place.rate_sub',
		shellClass: 'shell--place-square',
	},
	help: {
		icon: 'helped',
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
	icon: IconName,
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
		// The drawn icon, not the icon's NAME: this chip printed the literal
		// string "idea" from the day the emoji set became a component
		m('span.workbench__icon', { 'aria-hidden': 'true' }, m(Icon, { name: icon, size: 20 })),
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

// The place banner retired here (2026-08-11). It was the fourth surface in a
// row to answer "where am I?", and the most expensive: scene + title + a line
// of prose, held on screen for as long as you stood in the room. The HUD
// carries the crest and the name now, and the arrival splash carries the
// scene and the sentence — each said once, where it is actually being read.

type CycleStep = 'mine' | 'rate' | 'help' | 'done';

/**
 * The three screens the tab bar switches between. Only 'others' follows the
 * lap: 'my' (my workshop — the feedback I received, the elders, the needs)
 * and 'results' (the class picture) are places you can stand on without the
 * cycle moving under you.
 */
type DelibScreen = 'my' | 'results' | 'others';

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
	 * The gap prompt: a rating is a judgment, and a judgment is the beginning
	 * of a repair. Right after a press below the top face the stall offers —
	 * never demands — a one-tap way to say what would make the text stronger.
	 * An invitation, not a gate: the next rating costs exactly the same taps
	 * whether or not it renders, so there is nothing to rate top-face to avoid.
	 */
	let gapPrompt: { proposalId: string; kind: 'gap' | 'keep' } | null = null;
	let gapDraft = '';
	let gapSending = false;
	/** Proposals already offered a prompt this lap — one ask per stall per lap */
	let gapOffered = new Set<string>();
	/** Prompts shown this lap — past the cap the square goes quiet (no nagging) */
	let gapPromptsThisLap = 0;
	/** Invitations per lap. More is nagging, and nagging buys top-face inflation. */
	const GAP_PROMPTS_PER_LAP = 2;
	/**
	 * The write desk's self-check: which character's need does my sentence
	 * serve? Purely local, no AI, no score — a thinking scaffold the student
	 * ticks for themselves (game-script delta #3: the needs are the raw
	 * material of a proposal both camps can live with).
	 */
	const selfCheck = new Set<string>();

	/**
	 * The owner already declined an idea of mine here — the invitation must not
	 * reopen a closed door; the thread stays available for whoever wants it.
	 */
	function ownerDeclinedMine(proposalId: string): boolean {
		return (getDeliberationState().suggestions[proposalId] ?? []).some(
			(entry) =>
				entry.creatorId === userId && entry.suggestionStatus === AgoraSuggestionStatus.declined,
		);
	}

	/**
	 * Decide whether this press earns the stall an invitation. Below the top
	 * face it asks "what would make it stronger"; on the top face it
	 * occasionally (deterministically, no dice) asks "say what to keep" — so
	 * the class never learns that helping is what happens to weak proposals.
	 */
	function maybeOfferGapPrompt(proposal: AgoraProposal, value: number): void {
		const proposalId = proposal.statementId;
		if (gapPromptsThisLap >= GAP_PROMPTS_PER_LAP) return;
		if (gapOffered.has(proposalId)) return;
		// The message this composer sends must actually BE an idea: the thread
		// turns a first message into suggestion-kind only when no idea of mine
		// is open here (same rule as ThreadChat's composer)
		if (openSuggestionsBy(proposalId, userId) > 0) return;
		if (ownerDeclinedMine(proposalId)) return;
		const keepInvite = value >= 1 && studentOrder(proposalId) % 3 === 0;
		if (value >= 1 && !keepInvite) return;

		gapOffered.add(proposalId);
		gapPromptsThisLap += 1;
		gapDraft = '';
		gapPrompt = { proposalId, kind: value >= 1 ? 'keep' : 'gap' };
	}

	/** The invitation's fold-out: insight framing, the both-camps question, a composer */
	function gapPromptCard(live: AgoraSession, proposal: AgoraProposal): m.Children {
		if (gapPrompt?.proposalId !== proposal.statementId) return null;
		const keep = gapPrompt.kind === 'keep';
		const ready = gapDraft.trim().length >= AGORA_LIMITS.MIN_ANSWER_LENGTH;

		return m(
			Collapsible,
			m('.gap-prompt', { 'aria-live': 'polite' }, [
				m(
					'p.gap-prompt__insight',
					iconLabel('idea', t(keep ? 'delib.gap_keep' : 'delib.gap_insight')),
				),
				keep ? null : m('p.gap-prompt__question', t('delib.help_question')),
				keep ? null : m('p.gap-prompt__hint', t('delib.help_dont_attack')),
				m('textarea.gap-prompt__textarea', {
					value: gapDraft,
					rows: 2,
					maxlength: AGORA_LIMITS.MAX_ANSWER_LENGTH,
					placeholder: t('delib.suggest_placeholder'),
					'aria-label': t('delib.suggest_placeholder'),
					oninput: (event: InputEvent) => {
						gapDraft = (event.target as HTMLTextAreaElement).value;
					},
				}),
				m('.gap-prompt__actions', [
					m(
						'button.btn.btn--primary',
						{
							disabled: !ready || gapSending,
							onclick: () => {
								gapSending = true;
								submitSuggestion(
									live,
									proposal,
									initialVnode.attrs.myParticipant.anonName,
									gapDraft.trim(),
								)
									.then(() => {
										// Same acknowledgment as an idea sent from the thread
										helpedThisLap.add(proposal.statementId);
										sentAckId = proposal.statementId;
										window.clearTimeout(sentAckTimer);
										sentAckTimer = window.setTimeout(() => {
											sentAckId = '';
											m.redraw();
										}, SENT_ACK_MS);
										gapPrompt = null;
										gapDraft = '';
									})
									.catch((error: unknown) => {
										console.error('[Delib] Gap-prompt suggestion failed:', error);
									})
									.finally(() => {
										gapSending = false;
										m.redraw();
									});
							},
						},
						t('delib.gap_send'),
					),
					m(
						'button.text-link.text-link--quiet',
						{
							onclick: () => {
								gapPrompt = null;
								gapDraft = '';
							},
						},
						t('delib.gap_skip'),
					),
				]),
			]),
		);
	}
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
	 * ...and the same protection for the FIRST draft, which had none: the
	 * opening sentence is the most expensive thing a student writes all
	 * lesson, and until now a refresh — or the reload that rescues a stuck
	 * save — took it with them.
	 */
	const firstDraftKey = `agora_${session.sessionId}_first_draft`;
	try {
		draft = sessionStorage.getItem(firstDraftKey) ?? '';
	} catch {
		// Storage unavailable — the desk simply starts empty
	}

	function rememberFirstDraft(): void {
		try {
			sessionStorage.setItem(firstDraftKey, draft);
		} catch {
			// Storage full or blocked — the in-memory draft still stands
		}
	}

	function forgetFirstDraft(): void {
		try {
			sessionStorage.removeItem(firstDraftKey);
		} catch {
			// Nothing to do
		}
	}

	/**
	 * How long a first write may stay in the air before the desk says so.
	 * Firestore answers from the cache immediately and queues the write, so a
	 * wedged connection produces no error at all — just silence, a spinner,
	 * and a proposal only its author can see.
	 */
	const SLOW_SAVE_MS = 8000;
	let firstSaveSlow = false;
	let firstSaveTimer = 0;
	/**
	 * The id the first proposal is written under — DERIVED, not minted.
	 *
	 * On a real network "stuck" and "merely slow" are indistinguishable from
	 * here, so the reload the desk offers can always turn out to have been
	 * unnecessary: the write may land while the page is reloading. A fresh id
	 * on the retry would post the proposal twice, and the square would carry a
	 * student's text under two numbers with no way to tell which is real.
	 *
	 * Derived from the session and the author, so it needs no storage to
	 * survive a reload, a cleared tab or a second device — and it turns "one
	 * proposal per student" from a thing the code hopes for into a thing the
	 * database cannot express otherwise.
	 */
	const firstProposalId = `${session.sessionId}--${userId}--proposal`;
	/**
	 * Which of the three screens I am standing on. My and Results are screens,
	 * NOT cycle steps — reading my own feedback or the class picture must not
	 * move my lap along. Deliberately in memory only: a refresh puts you back
	 * where the work is.
	 */
	let screen: DelibScreen = 'my';
	/**
	 * Which half of the Results tab is showing — the class map or the helpers
	 * board. In memory like `screen` itself: leaving the tab and coming back
	 * should land on the picture, which is the half that moves.
	 */
	let resultsTab: ResultsTab = 'class';
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
		screen = 'others';
		if (cycle.step === 'mine') setCycle({ step: 'rate', rated: 0 });
		m.redraw();
	}

	registerHelpedNavigator(goToHelped);

	/**
	 * A selector to focus once the My screen has rendered, or ''. Deep links
	 * point at what they promised; walking to the screen by hand keeps focus
	 * where the tap left it.
	 */
	let focusOnMy = '';
	/** One-shot: the next dock render puts the cursor in the textarea */
	let focusDockTextarea = false;
	/**
	 * The panel is never unmounted, so its scroll position outlives a fold.
	 * Deliberately reset on a fresh open: reopening two screens deep into
	 * the elders reads as "the sheet lost my proposal", and the edit box is
	 * what the notebook is for.
	 */
	let resetDockScroll = false;

	/**
	 * "Feedback is waiting" → walk to my own screen with the received drawer
	 * open. The lap does not move: My is a screen, not a step, so answering a
	 * classmate never costs the student their place in the cycle.
	 */
	function goToMine(): void {
		suggestionsToggle = true;
		closeDock();
		screen = 'my';
		// The toast promised feedback — land the reader on it
		focusOnMy = `#${DOCK_FEEDBACK_HEAD_ID}`;
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

	/**
	 * The My screen's edit handle: lift the dock and put the cursor straight
	 * in the box. A tap that says "edit the text" has earned the keyboard —
	 * the dock's own bar has not, so it still opens without taking focus.
	 */
	function openEditBox(): void {
		if (!dockOpen) resetDockScroll = true;
		dockOpen = true;
		focusDockTextarea = true;
	}

	/** The dock bar's own handle — the edit box folds out from here */
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

	/**
	 * "Your idea slot is free — another stall?" (the decline toast's action):
	 * walk to the market. A deliberate tap, so moving the lap's step is fine —
	 * the same jump the Others tab makes after the laps are done.
	 */
	function goToMarket(): void {
		closeDock();
		screen = 'others';
		if (cycle.step === 'done') {
			setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
		} else if (cycle.step !== 'help') {
			setCycle({ step: 'help' });
		} else {
			m.redraw();
		}
	}

	registerMarketNavigator(goToMarket);

	/**
	 * "Open THIS conversation" — where the inbox and the toasts point. The
	 * thread is the same page from both sides; which side I am on is a fact
	 * about the proposal, never something the caller has to know.
	 */
	function goToThread(proposalId: string, helperUid: string): void {
		const proposal = getDeliberationState().proposals.find(
			(candidate) => candidate.statementId === proposalId,
		);
		if (!proposal) return;
		closeDock();
		const owner = proposal.creatorId === userId;
		screen = owner ? 'my' : 'others';
		// Standing on a classmate's side without a lap there reads as being
		// dropped somewhere; walk the lap the same way the tab does
		if (!owner && cycle.step === 'mine') setCycle({ step: 'rate', rated: 0 });
		openChat(proposalId, helperUid, owner ? 'owner' : 'helper');
	}

	registerThreadNavigator(goToThread);

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

	// A refresh puts the student back where the WORK is: the lap's own step
	// decides the tab, so reloading mid-square returns to the square and not
	// to a screen they have to tap their way out of
	screen = cycle.step === 'mine' ? 'my' : 'others';

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

	/**
	 * The class-bridge pulse, captured at each lap turn: the strongest bridge
	 * on the square now vs where it stood when the previous lap began. The
	 * ONE live collective surface in the game — it lives on the lap splash (a
	 * doorway between rooms, tap-to-skip), never over anyone's pen.
	 */
	let lapPulse: { from?: number; to: number } | null = null;

	function captureLapPulse(): void {
		const classMax = Math.round(
			Math.max(
				0,
				...Object.values(getDeliberationState().scores).map((score) => score.bridgingScore ?? 0),
			),
		);
		const pulseKey = `agora_${session.sessionId}_classpulse`;
		const stored = sessionStorage.getItem(pulseKey);
		lapPulse = { from: stored !== null ? Number(stored) : undefined, to: classMax };
		try {
			sessionStorage.setItem(pulseKey, String(classMax));
		} catch {
			// Storage unavailable — the pulse just restarts next lap
		}
	}

	function showSplash(next: NonNullable<typeof splash>): void {
		splash = next;
		window.clearTimeout(splashTimer);
		// A lap-two-onward splash carries the intention beat and the class
		// pulse — reading matter, so it stands longer (still tap-to-skip)
		const roundHold =
			next.kind === 'round' && next.round >= 2
				? reducedMotion
					? 4000
					: 6000
				: reducedMotion
					? 1100
					: 2000;
		const hold = next.kind === 'round' ? roundHold : reducedMotion ? 600 : 1300;
		splashTimer = window.setTimeout(() => {
			splash = null;
			m.redraw();
		}, hold);
	}

	function dismissSplash(): void {
		window.clearTimeout(splashTimer);
		splash = null;
	}

	/**
	 * The class-bridge pulse line on the lap splash. Movement framing only —
	 * "we moved", never "we still need N" (gap framing invites hunting for
	 * whoever is costing the class). A down-lap says the bridge is being
	 * tested, with no number and no culprit; the class total is never
	 * decomposed anywhere.
	 */
	function splashPulseLine(): m.Children {
		if (!lapPulse || lapPulse.to <= 0) return null;
		const { from, to } = lapPulse;
		if (from === undefined || from <= 0 || from === to) {
			return m('p.delib-splash__pulse', iconLabel('chart', t('round.pulse_first', { n: to })));
		}
		if (to < from) {
			return m('p.delib-splash__pulse.delib-splash__pulse--steady', t('round.pulse_down'));
		}

		return m(
			'p.delib-splash__pulse',
			iconLabel('trend', t('round.pulse', { range: `⁦${from} → ${to}⁩` })),
		);
	}

	/**
	 * The lap's opening question, asked at the door: where my bridge stands,
	 * what is waiting in the workshop, and one button to the pen. Skippable
	 * like the whole splash — an implementation intention, never a toll.
	 */
	function splashIntentionBeat(): m.Children {
		const { proposals, suggestions, scores } = getDeliberationState();
		const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
		if (!myProposal) return null;
		const bridge = Math.round(scores[myProposal.statementId]?.bridgingScore ?? 0);
		const waiting = (suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		return m('.delib-splash__intent', [
			m('p.delib-splash__intent-line', [
				bridge > 0 ? t('round.intention_bridge', { n: bridge }) : null,
				waiting > 0 ? ` ${t('round.intention_ideas', { n: waiting })}` : null,
			]),
			m('p.delib-splash__ask', t('round.intention_ask')),
			m(
				'button.btn.btn--primary',
				{
					onclick: (event: Event) => {
						// The splash's own tap-anywhere dismiss must not eat this
						event.stopPropagation();
						dismissSplash();
						openEditBox();
						m.redraw();
					},
				},
				t('round.intention_cta'),
			),
		]);
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
			// The lap's own step decides which tab I land on: the mine step IS
			// the My screen, everything else happens on the classmates' side
			screen = patch.step === 'mine' ? 'my' : 'others';
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
		// A fresh lap re-arms the invitations — quietly
		gapPrompt = null;
		gapOffered = new Set();
		gapPromptsThisLap = 0;
		if (cycle.round >= AGORA_CYCLE.ROUNDS) {
			setCycle({ step: 'done' });
		} else {
			// The doorway moment: how far the class moved while this lap ran
			captureLapPulse();
			setCycle({ round: cycle.round + 1, step: 'mine', rated: 0 });
			draft = '';
		}
	}

	/**
	 * The My | Results | Others tabs. Mobile: fixed bottom bar; desktop: tab
	 * row under the HUD (CSS switches placement on one element). Hidden until
	 * the student has a proposal — lap 1 starts with writing.
	 *
	 * My is a screen again (2026-08-11): everything the workshop holds —
	 * received improvements, the elders, the two sides' needs — is far too
	 * much to live inside a dock sheet lifted over another room. What stayed
	 * in the dock is the one thing that has to be reachable from ANY place:
	 * the box I type my proposal into.
	 */
	function delibNav(myProposal: AgoraProposal | undefined): m.Children {
		if (!myProposal) return null;

		const tab = (
			id: DelibScreen,
			modifier: string,
			icon: IconName,
			label: string,
			badge: number,
			onclick: () => void,
		): m.Children =>
			m(
				`button.delib-nav__item.delib-nav__item--${modifier}`,
				{
					class: screen === id ? 'delib-nav__item--active' : undefined,
					'aria-selected': String(screen === id),
					onclick,
				},
				[
					m('span.delib-nav__icon', m(Icon, { name: icon, size: 22 })),
					m('span.delib-nav__label', label),
					// A badge is news from a screen I'm not on; on the screen
					// itself the content says it better than a number
					screen !== id && badge > 0 ? m('span.delib-nav__badge', String(badge)) : null,
				],
			);

		return m('nav.delib-nav', [
			tab('my', 'mine', 'proposal', t('delib.nav_mine'), myFeedbackCount(myProposal), () => {
				closeDock();
				screen = 'my';
				m.redraw();
			}),
			tab('results', 'results', 'chart', t('delib.nav_results'), 0, () => {
				closeDock();
				screen = 'results';
				m.redraw();
			}),
			tab(
				'others',
				'peer',
				'people',
				t('delib.nav_others'),
				// Proposals I helped moved while I was away — come see
				attentionCount(),
				() => {
					closeDock();
					screen = 'others';
					if (cycle.step === 'mine') {
						setCycle({ step: 'rate', rated: 0 });
					} else if (cycle.step === 'done') {
						// After the laps, "Others" means: keep helping
						setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
					} else {
						m.redraw();
					}
				},
			),
		]);
	}

	/**
	 * What is waiting for me on my own screen: ideas still un-decided, plus
	 * replies I haven't read. One number, because the tab has room for one.
	 */
	function myFeedbackCount(myProposal: AgoraProposal): number {
		const openCount = (getDeliberationState().suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		return openCount + ownerThreadUnread(myProposal);
	}

	/** Deterministic per-student ordering so classmates fan out over different proposals */
	function studentOrder(id: string): number {
		return studentOrderFor(userId, id);
	}

	listenToDeliberation(session.sessionId, userId);
	// The post box outlives every toast in it, and a refresh with it
	initInbox(session.sessionId);

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
		const stale = review !== undefined && editClock(myProposal.statementId) > review.lastUpdate;
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
							m('.delib__actions.delib__actions--tight', [
								// Advice must open a door to the pen, or it is a dead end.
								// On a STALE verdict revising stays primary and re-asking
								// secondary — the old order promoted re-asking over the
								// revision the staleness was announcing.
								m(
									stale ? 'button.btn.btn--primary' : 'button.btn.btn--secondary',
									{ onclick: openEditBox },
									iconLabel('edit', t('delib.advice_to_pen')),
								),
								m(
									'button.btn.btn--secondary',
									{ disabled: asksLeft === 0, onclick: ask },
									asksLeft > 0
										? `${t('delib.ask_again')} (${t('delib.asks_left', { n: asksLeft })})`
										: t('delib.no_asks_left'),
								),
							]),
						])
					: m(
							'button.btn.btn--secondary',
							{ disabled: asksLeft === 0, onclick: ask },
							t('delib.ask_character', { name: character.name }),
						),
		]);
	}

	/**
	 * The one part of the workshop that travels: the always-editable proposal
	 * text and its single save action. It rides in the dock, so a student can
	 * fix a sentence from the square or from a classmate's stall without
	 * losing the room they are standing in. Everything else that used to share
	 * this card now lives on the My screen (see myWorkshop).
	 */
	function proposalEditBox(live: AgoraSession, myProposal: AgoraProposal): m.Children {
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

		// No header: the dock's own bar already says "my proposal", and a live
		// textarea is its own invitation to type — the "you can edit anytime"
		// line was standing prose about an affordance you can see
		return m('.card.my-lantern.my-lantern--workshop', [
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
										// server on this same save (onAgoraProposalWritten).
										// QUIET on purpose: the button below flips to "✓ saved",
										// and whether this save deserved glitter is the server's
										// call — a credited revision comes back as a
										// notification and celebrates from there. The old
										// same-every-save glitter taught that saving is the
										// achievement and drowned out the real moments.
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
						changed ? t('delib.update_proposal') : iconLabel('check', t('delib.update_saved')),
					),
				]),
			]),
		]);
	}

	/**
	 * The revision journey: what each past version of my text was reading when
	 * I replaced it, ending at the live number. A MEMORY, not a chart (the
	 * text's evolution is the headline; the numbers stay small and aggregate),
	 * and a dip renders muted amber — information for the next edit, never a
	 * punishment. Lives on the My screen only: the owner's reading room, where
	 * the aggregate reception already lives.
	 */
	function revisionJourney(myProposal: AgoraProposal): m.Children {
		const score = getDeliberationState().scores[myProposal.statementId];
		const history = score?.editHistory ?? [];
		if (history.length === 0) return null;
		const live = Math.round(score?.bridgingScore ?? 0);
		// Entry i is the closing score of version i+1's predecessor — see the
		// schema note: the strip reads v1·h[0] → … → now·(live)
		const steps = [...history.map((entry) => Math.round(entry.bridgingAtEdit)), live];
		// A journey of zeros is a proposal nobody has rated yet — nothing to say
		if (steps.every((value) => value === 0)) return null;

		return m('.stack.journey-block', [
			m(
				'.journey',
				{ role: 'img', 'aria-label': t('delib.journey_label') },
				steps.map((value, index) => {
					const previous = index > 0 ? steps[index - 1] : undefined;
					const down = previous !== undefined && value < previous;
					const now = index === steps.length - 1;

					return m(
						'span.journey__step',
						{
							class:
								[down ? 'journey__step--down' : undefined, now ? 'journey__step--now' : undefined]
									.filter(Boolean)
									.join(' ') || undefined,
						},
						[
							m(
								'span.journey__version',
								now ? t('delib.journey_now') : t('delib.journey_version', { n: index + 1 }),
							),
							m('span.journey__value', String(value)),
						],
					);
				}),
			),
			tierDistanceLine(live),
		]);
	}

	/**
	 * Distance to the next rung of the bridging ladder — shown only when it is
	 * within reach, so it reads as a map and never as a demand.
	 */
	function tierDistanceLine(live: number): m.Children {
		const tier1 = AGORA_BRIDGING.CREDIT_THRESHOLD_TIER_1;
		const tier2 = AGORA_BRIDGING.CREDIT_THRESHOLD;
		const target = live < tier1 ? tier1 : live < tier2 ? tier2 : undefined;
		if (target === undefined) return null;
		const gap = target - live;
		if (gap > 20) return null;

		return m(
			'p.journey__tier',
			iconLabel(
				'trend',
				t(target === tier1 ? 'delib.tier_distance' : 'delib.tier_distance_full', { n: gap }),
			),
		);
	}

	/**
	 * What the ratings that moved actually DID to the class's reading, said in
	 * one clause after the count.
	 *
	 * Four different facts, and the old line could only say two of them: it rose
	 * by this much, it fell by this much, it held still at this reading, or the
	 * class had not spoken when I saved so there is nowhere to measure from.
	 * Collapsing the last two into a bare count — or worse, into "moved by 0" —
	 * is what made a student who had genuinely won a classmate over read their
	 * own success as nothing happening.
	 */
	function supportClause(support: SupportSinceEdit): string {
		if (support.now === undefined) return '';
		if (support.delta === undefined) return ` · ${t('delib.support_now', { n: support.now })}`;
		if (support.delta === 0) return ` · ${t('delib.support_same', { n: support.now })}`;

		return ` · ${t(support.delta > 0 ? 'delib.support_up' : 'delib.support_down', {
			n: Math.abs(support.delta),
		})}`;
	}

	/**
	 * MY screen: everything the workshop holds EXCEPT the edit box — how the
	 * class received my last save, the improvements classmates sent, the
	 * ask-the-characters helpers and the needs reminder. No AI rewriting
	 * anywhere: the AI only reacts. (The numbers-only reception forecast was
	 * removed 2026-07-28 — it duplicated the in-character reviews' scores.)
	 */
	function myWorkshop(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		// Fresh feedback count surfaces on the drawer label, not buried inside
		const openCount = (getDeliberationState().suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		// The cycle's return signal to the OWNER: classmates who (re)rated
		// after my latest improvement. Aggregate count only — never who.
		//
		// Measured against the server-stamped time of MY last edit, not the
		// statement's lastUpdate: the shared evaluation pipeline writes its
		// aggregates back onto the proposal doc, so every rating bumped
		// lastUpdate past its own timestamp and the signal raced itself out
		// of existence.
		const editedAt = answerBaseline(myProposal.statementId, myProposal.lastUpdate);
		const ratingsMoved = ratingsMovedSince(myProposal.statementId, editedAt, userId);
		// Direction rides on the AGGREGATE: the class's average support now vs
		// where it stood when I last saved. The average and not the bridging
		// score, because bridging is blended and damped enough to round a real
		// change of mind away to zero (see agoraClassSupport) — and a count with
		// "moved by 0" beside it teaches the opposite of what happened.
		// Individual rating values stay private (see docs/feedback-cycle.md);
		// the baseline is stamped SERVER-side at save time, so it survives a
		// refresh and a device switch.
		const support = supportSinceEdit(myProposal.statementId);

		// No frame around the stack: every drawer below is already a card, and
		// a box drawn around a column of boxes only spends a screen edge on
		// saying "these belong together" — which the tab I am standing on and
		// the title below already say.
		return [
			// The student's own sentence at the top, in the proposal voice — this
			// screen IS their proposal, so the words they wrote head it, not a
			// label the app supplied. The way into the text sits beside it; the
			// pen itself lives in the dock, so this is a handle and not a second
			// editor.
			m('.my-screen__head', [
				m('h3.my-screen__title', [
					// A screen reader arrives at a bare sentence otherwise, with
					// nothing saying whose it is
					m('span.sr-only', `${t('delib.my_proposal')}: `),
					myProposal.statement,
				]),
				m(
					'button.btn.btn--secondary.my-screen__edit',
					{ onclick: openEditBox },
					iconLabel('edit', t('delib.edit_text')),
				),
			]),
			ratingsMoved > 0
				? m(
						'p.my-lantern__moved',
						// Down is muted amber, not danger-red: a dip is information
						// for the next edit, never a punishment
						{ class: (support.delta ?? 0) < 0 ? 'my-lantern__moved--down' : undefined },
						iconLabel(
							(support.delta ?? 0) < 0 ? 'trend-down' : 'trend',
							`${tCount('delib.ratings_moved', ratingsMoved)}${supportClause(support)}`,
						),
					)
				: null,
			// The aggregate line above, grown a memory: where each version stood
			revisionJourney(myProposal),
			workbenchSection('idea', t('delib.suggestions_received'), suggestionsSection(myProposal), {
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
			workbenchSection('era', t('delib.ask_elders'), askSection(live, myProposal, topic), {
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
		];
	}

	/**
	 * The notebook docked at the bottom of every place: a collapsed bar that
	 * shows a line of my own text (or warns that an edit is unsaved), and the
	 * edit box sliding up over the room when it's tapped.
	 *
	 * The dock carries ONE thing now — the box I type into. Everything that
	 * needs reading rather than typing moved to the My screen: a sheet lifted
	 * over another room is the wrong place to read your classmates' ideas in,
	 * and a dock that promised feedback and opened onto a textarea was a
	 * broken promise.
	 */
	function proposalDock(live: AgoraSession, myProposal: AgoraProposal): m.Children {
		const unsaved =
			mineDraft.trim().length > 0 &&
			mineDraft.trim() !== myProposal.statement &&
			mineDraftBase === myProposal.statement;

		// ONE line: the draft I haven't saved outranks the text I have. News
		// that wants reading (ideas, replies) belongs to the My tab's badge —
		// this bar only ever opens onto the pen.
		const sub: m.Children = unsaved
			? [m('span.proposal-dock__dot', { 'aria-hidden': 'true' }), t('delib.dock_unsaved')]
			: myProposal.statement;
		const subClass = unsaved ? 'proposal-dock__sub--alert' : undefined;

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
						// The notebook on the dock is the student's own object and
						// it is on screen for the whole lap — the one small slot
						// where the rendered book earns its weight (delib-mock.html
						// had it here first). 26px is over the render floor.
						m(
							'span.proposal-dock__icon',
							{ 'aria-hidden': 'true' },
							m(HeroIcon, { name: 'proposal', owner: 'mine', size: 32 }),
						),
						m('span.proposal-dock__text', [
							m('span.proposal-dock__title', t('delib.my_proposal')),
							m('span.proposal-dock__sub', { class: subClass, role: 'status' }, sub),
						]),
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
						proposalEditBox(live, myProposal),
					),
				),
			],
		);
	}

	/**
	 * Once the sheet has actually rendered, start it at the top on a fresh
	 * open. Focus stays on the handle that opened it, as a disclosure should.
	 */
	function onDockPanelRender(vnode: m.VnodeDOM): void {
		if (!dockOpen) return;
		const inner = vnode.dom as HTMLElement;
		if (resetDockScroll) {
			resetDockScroll = false;
			inner.scrollTop = 0;
		}
		if (!focusDockTextarea) return;
		focusDockTextarea = false;
		inner.querySelector<HTMLTextAreaElement>('textarea.my-lantern__textarea')?.focus();
	}

	/**
	 * Once the My screen has rendered: if a deep link ("feedback is waiting")
	 * promised something, put the cursor on it. Walking here by tapping the
	 * tab promises nothing, so it moves no focus.
	 */
	function onMyScreenRender(vnode: m.VnodeDOM): void {
		if (!focusOnMy) return;
		const target = (vnode.dom as HTMLElement).querySelector<HTMLElement>(focusOnMy);
		if (!target) return;
		focusOnMy = '';
		target.focus();
		target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
		// ...and say WHICH row was promised. Landing on a screenful of drawers
		// with the cursor silently parked on one of them is not an answer.
		if (!reducedMotion) emphasise(target);
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
			// Not waiting copy — reciprocity copy: while the class reads yours,
			// go be the classmate you're hoping for. With the door to do it.
			return m('.stack', [
				m('p.square-says__meaning.text-center', t('delib.no_feedback_reciprocity')),
				m(
					'button.btn.btn--secondary',
					{
						onclick: () => {
							closeDock();
							screen = 'others';
							if (cycle.step === 'mine') setCycle({ step: 'rate', rated: 0 });
							m.redraw();
						},
					},
					t('delib.no_feedback_cta'),
				),
			]);
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
						scoreMoved:
							scoreMovedMoment(myProposal.statementId, userId, helperUid, myProposal) !== null,
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
					const stale =
						review !== undefined && editClock(myProposal.statementId) > review.lastUpdate;

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
		return {
			editAt: editClock(proposal.statementId),
			mineAt: ideaLandedAt(proposal.statementId, userId),
		};
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
	/**
	 * The row's news, as a glyph rather than a sentence. A folded row has one
	 * job — get read or skipped — and it decides that on a glance, so the chip
	 * spends its width on a mark that carries at arm's length instead of two
	 * words that have to be focused on. The words survive as the accessible
	 * name and the tooltip, and the unfolded body repeats them in full.
	 */
	function changeChip(proposal: AgoraProposal): m.Children {
		// The drawing, not its name: this disc printed the literal string
		// "new" until the icon set became a component (same slip as the
		// workbench chips). The words live in the label and the tooltip.
		const mark = (variant: string, glyph: IconName, key: string): m.Children =>
			m(
				`span.stall__chip.stall__chip--icon.stall__chip--${variant}`,
				{ 'aria-label': t(key), title: t(key) },
				m(Icon, { name: glyph, size: 18 }),
			);
		const { editAt, mineAt } = changeStamps(proposal);
		const watermark = seenEditWatermark(proposal.statementId);
		if (watermark !== undefined && mineAt > watermark) {
			return mark('improved-mine', 'spark', 'delib.chip_improved_mine');
		}
		if (isEditedSinceSeen(proposal.statementId, editAt)) {
			return mark('edited', 'edit', 'delib.chip_edited');
		}
		if (isNewToMe(proposal.statementId)) {
			return mark('new', 'new', 'delib.chip_new');
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
			const { mineAt } = changeStamps(proposal);
			const watermark = seenEditWatermark(proposal.statementId);
			if (watermark !== undefined && mineAt > watermark) return true;

			// The revision term is the re-weigh moment itself, REPLACING the
			// edited-since-seen test rather than joining it — counting both would
			// score one edit twice. It also clears later and more honestly: on the
			// press that closes the loop, not on the glance that opened the card.
			return reWeighMoment(proposal.statementId, userId, proposal) !== null;
		}).length;
		// ...plus stalls where the owner wrote back into my conversation
		const unreadThreads = getDeliberationState().proposals.filter(
			(proposal) => proposal.creatorId !== userId && myThreadUnread(proposal) > 0,
		).length;
		// ...plus proposals I merely RATED that were rewritten since — the
		// classic "go look again, maybe you have something to add now" moment,
		// which the badge used to be blind to. Helped proposals are excluded
		// (the reWeigh term above already scores them); self-clearing, since a
		// re-rate advances myRating.updatedAt past the edit.
		const helpedIds = new Set(
			getHelpedProposals(userId).map((entry) => entry.proposal.statementId),
		);
		const reRateDue = getDeliberationState().proposals.filter((proposal) => {
			if (proposal.creatorId === userId || helpedIds.has(proposal.statementId)) return false;
			const mine = getDeliberationState().myRatings[proposal.statementId];

			return mine !== undefined && editClock(proposal.statementId) > mine.updatedAt;
		}).length;

		return changed + unreadThreads + reRateDue;
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
		return reWeighMoment(proposal.statementId, userId, proposal) !== null;
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

		return [
			changedSinceRating
				? m(
						'p.stall__reinvite',
						{ class: mineSinceRating ? 'stall__reinvite--mine' : undefined },
						mineSinceRating
							? iconLabel('spark', t('delib.reinvite_improved'))
							: iconLabel('edit', t('delib.reinvite_prompt')),
					)
				: helpedImprovedSince(proposal)
					? m('p.helped__improved', iconLabel('spark', t('delib.helped_improved_marker')))
					: null,
			m(RateScale, {
				session: live,
				proposalId: proposal.statementId,
				// Weighing the text IS reading it — the change chips clear
				onVote: (value) => {
					ackProposalSeen(proposal);
					// The judgment just formed is the best moment to offer the
					// repair — see maybeOfferGapPrompt for every rule that keeps
					// this an invitation and not homework
					maybeOfferGapPrompt(proposal, value);
				},
				// Only a FIRST vote moves the lap along; changing my mind about a
				// proposal I already weighed is free, and must not buy a lap step.
				onFirstVote:
					opts?.countsTowardLap === true
						? () => {
								setCycle({ rated: cycle.rated + 1 });
							}
						: undefined,
			}),
			gapPromptCard(live, proposal),
			// The conversation is one line here, and a whole page one tap away
			threadEntry({
				label: t('delib.chat_with_author'),
				messages: getThreadMessages(proposal.statementId, userId),
				unread: myThreadUnread(proposal),
				reWeigh: reWeighMoment(proposal.statementId, userId, proposal) !== null,
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
		const option = rateOptionFor(mine.value);
		if (!option) return null;

		return m('span.stall__chip.stall__chip--rated', { 'aria-label': t(option.labelKey) }, [
			m(Icon, { name: option.icon, size: 18 }),
			m(Icon, { name: 'check', size: 14 }),
		]);
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
	 * The market's private nudge: I rated this one at zero or below, sent no
	 * idea, and nobody closed the door — I saw a gap, and the stall remembers.
	 * My rating, my eyes only: the chip renders from MY local rating state and
	 * nothing about it reaches the owner.
	 */
	function gapSeenChip(proposal: AgoraProposal): m.Children {
		const mine = getDeliberationState().myRatings[proposal.statementId];
		if (mine === undefined || mine.value > 0) return null;
		if (ownerDeclinedMine(proposal.statementId)) return null;
		// Any idea of mine here — open or resolved — means the chip's job is done
		const offered = (getDeliberationState().suggestions[proposal.statementId] ?? []).some(
			(entry) => entry.creatorId === userId && isSuggestionKind(entry),
		);
		if (offered) return null;

		return m(
			'span.stall__chip.stall__chip--icon.stall__chip--gap',
			{ 'aria-label': t('delib.gap_chip'), title: t('delib.gap_chip') },
			m(Icon, { name: 'idea', size: 18 }),
		);
	}

	/**
	 * The market-room chip: sent just now, an unread reply, or a stall I
	 * already helped — one story at a time, strongest first. The "improved
	 * since" news moved to changeChip, which rides alongside.
	 */
	function helpStallChip(proposal: AgoraProposal, helped: HelpedProposal | undefined): m.Children {
		// The one exception to the icon-only rule: a suggestion that just left
		// my hands is the only chip that is an ANSWER to something I did, and
		// it gets the word for the beat it is on screen
		if (sentAckId === proposal.statementId) {
			return m(
				'span.stall__chip.stall__chip--sent',
				{ role: 'status' },
				iconLabel('check', t('delib.sent_ack')),
			);
		}
		const unread = myThreadUnread(proposal);
		if (unread > 0) {
			return m(
				'span.stall__chip.stall__chip--unread',
				{ 'aria-label': tCount('delib.thread_unread', unread) },
				iconLabel('talk', String(unread)),
			);
		}

		return helped
			? m(
					'span.stall__chip.stall__chip--icon.stall__chip--helped',
					{ 'aria-label': t('delib.helped_chip'), title: t('delib.helped_chip') },
					m(Icon, { name: 'helped', size: 18 }),
				)
			: null;
	}

	return {
		onremove() {
			window.clearTimeout(splashTimer);
			window.clearTimeout(sentAckTimer);
			window.clearTimeout(dockIntroTimer);
			window.clearTimeout(firstSaveTimer);
			void flushSeenState();
			stopDeliberationListeners();
			unregisterHelpedNavigator(goToHelped);
			unregisterMineNavigator(goToMine);
			unregisterMarketNavigator(goToMarket);
			unregisterThreadNavigator(goToThread);
			window.removeEventListener('popstate', onPopState);
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, scores } = getDeliberationState();
			// Mid-session rollout guard: already-rated proposals get watermarks
			// once, so the square doesn't shout NEW at everything (no-op after)
			seedSeenBaselineIfNeeded();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			/**
			 * The proposal the SQUARE has — not merely the one my cache has.
			 * Firestore hands a write back locally before it leaves the device,
			 * so a stuck write used to open the whole game (tabs, laps, ratings)
			 * around a text no classmate could see. Every gate below reads this
			 * one; `myProposal` stays for showing the author their own words.
			 */
			const myConfirmedProposal =
				myProposal && isProposalConfirmed(myProposal.statementId) ? myProposal : undefined;
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

			// The steps of one lap — still needed by the round splash, which is the
			// one surface allowed to spell the loop out in words
			const STEPS: Array<{ id: CycleStep; labelKey: string }> = [
				{ id: 'mine', labelKey: 'delib.step_mine' },
				{ id: 'rate', labelKey: 'delib.step_rate' },
				{ id: 'help', labelKey: 'delib.step_help' },
			];

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
														m(Icon, {
															name: PLACES[entry.id as 'mine' | 'rate' | 'help'].icon,
															size: 20,
														}),
													),
													m('span', t(entry.labelKey)),
												],
											),
										),
									),
									// The doorway beats (lap 2+): shared fate first, then the
									// one personal question a lap opens with. Numbers live
									// HERE — between rooms — and nowhere over the pen.
									splash.round >= 2 ? splashPulseLine() : null,
									splash.round >= 2 ? splashIntentionBeat() : null,
								])
							: // The place's own little scene: it used to sit on a banner
								// occupying the top of every screen for the whole time you
								// stood there. On the arrival card it costs nothing and does
								// far more — the picture of the room you just walked into,
								// which is also the last surface allowed to say in words what
								// happens here.
								m('.delib-splash__card.delib-splash__card--place', [
									m('.delib-splash__scene', placeScene(splash.step)),
									m('h2.delib-splash__title', [
										m(
											'span.delib-splash__icon',
											{ 'aria-hidden': 'true' },
											m(HeroIcon, { name: PLACES[splash.step].icon, size: 28 }),
										),
										t(PLACES[splash.step].titleKey),
									]),
									m('p.delib-splash__sub', t(PLACES[splash.step].subKey)),
								]),
					)
				: null;

			// ONE header for every deliberation screen. It used to be four stacked
			// strips — the journey strip, the cycle strip, the countdown and the
			// place banner — which between them spent a quarter of a phone screen
			// answering "where am I?" four times before the work began. The HUD
			// answers it once, mostly in pictures: crest, name, lap pips, a level
			// track and a draining fuse.
			//
			// The square's artwork went with them. A 180px decorative photograph
			// above the working surface is the most expensive thing on the screen
			// and the only one that says nothing; the square still opens the stage
			// on the travel splash, where it IS the content.
			//
			// No score HUD above the work either: scores belong to the results
			// screen, not over the shoulder of a student mid-sentence.
			const header = [
				splashOverlay,
				m(DelibHud, {
					step: cycle.step,
					round: cycle.round,
					rounds: AGORA_CYCLE.ROUNDS,
					rated: cycle.rated,
					ratingQuota: AGORA_CYCLE.RATINGS_PER_ROUND,
					endsAt: live.roundEndsAt ?? undefined,
					onResults: screen === 'results',
				}),
			];

			// The notebook rides along on every place, so the dock and the
			// padding that keeps content clear of it are computed once here
			const dock = myConfirmedProposal ? proposalDock(live, myConfirmedProposal) : null;
			const scrim = myConfirmedProposal ? dockScrim() : null;
			const shellClass = myConfirmedProposal ? '.shell--docked' : '';

			// The one-shot intro peek: fires after the travel splash clears, so
			// the "here is where your text now lives" reveal isn't spent under
			// a card the student can't see through — then folds itself away
			// rather than standing between them and the square.
			if (pendingDockIntro && myConfirmedProposal && !splash) {
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
			// The class picture: where the class stands on each proposal, how
			// sure that is, and the spread behind the number. Live — it moves as
			// classmates rate. Standing here does NOT advance the lap.
			if (screen === 'results' && myConfirmedProposal) {
				return m(`.shell.shell--delib.shell--mode-mine.shell--place-mine${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myConfirmedProposal),
						m('h2.results-soon__title', t('delib.results_title')),
						// Same switch, same two halves as the recap — a student who
						// has been moving between them all lesson must not be handed
						// a different control at the ending
						m(ResultsSwitch, {
							tab: resultsTab,
							thanks: countThanks(getSessionState().participants),
							onTab: (next: ResultsTab) => {
								resultsTab = next;
							},
						}),
						resultsTab === 'helpers'
							? m(HelpersBoard, {
									participants: getSessionState().participants,
									userId,
								})
							: // The same board the ending shows, live: a student who has
								// watched their point move all lesson must not be handed a
								// different picture at the recap
								m(ResultsBoard, {
									sessionId: live.sessionId,
									topic,
									proposals: getDeliberationState().proposals,
									scores: getDeliberationState().scores,
									census: getCampCensus(),
									userId,
								}),
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								onclick: () => {
									screen = 'others';
									// Same rule as the Others tab: the square is a step, so
									// walking back into it from the picture starts the ratings
									if (cycle.step === 'mine') setCycle({ step: 'rate', rated: 0 });
								},
							},
							cycle.step === 'help' ? t('delib.back_to_stand') : t('delib.back_to_square'),
						),
					]),
					scrim,
					dock,
				]);
			}

			// ---------- STEP: THE FIRST WRITE ----------
			// Lap 1: nothing exists yet. The screen's ONE job is the first
			// write, so it is built as a single writing desk: mission brief,
			// the live textarea and the lantern CTA bound in one blue-framed
			// card — instead of a muted hint, a bare input and a button
			// floating apart. The needs board stands OPEN underneath (explicit
			// call, 2026-08-10): the raw material in view while writing, but
			// below the CTA so it never pushes the pen or the button off a
			// phone screen.
			// No confirmed proposal means the desk, whatever the stored lap says.
			// It used to also require `cycle.step === 'mine'`, which left a
			// student whose lap had moved on (a tab press, a restored session)
			// stranded on a square they had no standing in — and no way back.
			if (!myConfirmedProposal) {
				// The listeners have not spoken yet: flashing the writing desk at
				// a student who already HAS a proposal is worse than a beat of
				// waiting, because they start retyping it
				if (!getDeliberationState().statementsLoaded) {
					return m('.shell.shell--mode-mine.shell--place-mine', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							m('.text-center.stack', [
								m('.spinner'),
								m('p.lobby__status.lobby__waiting-dots', t('common.loading')),
							]),
						]),
					]);
				}
				{
					const ready = draft.trim().length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;
					// The write left this device but the square has never seen it.
					// The desk STAYS: their words are still theirs, and the game
					// must not deal them a lap around a proposal nobody has.
					const inFlight = submitting || myProposal !== undefined;

					return m('.shell.shell--mode-mine.shell--place-mine', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							m('.card.write-desk', [
								// The challenge pinned to the desk as a mission brief,
								// visually part of the writing surface it belongs to
								// The 🎯 is the label. "Your mission:" written above the
								// mission itself was the icon's job done twice — it stays
								// as the block's accessible name and nothing else.
								m('.write-desk__mission', { 'aria-label': t('delib.mission_label') }, [
									m(
										'span.write-desk__mission-icon',
										{ 'aria-hidden': 'true' },
										m(Icon, { name: 'target', size: 20 }),
									),
									m('.write-desk__mission-text', m('p', t('delib.propose_hint'))),
								]),
								m('textarea.my-lantern__textarea.write-desk__textarea', {
									value: draft,
									rows: 4,
									maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
									placeholder: t('delib.placeholder'),
									'aria-label': t('delib.my_proposal'),
									// readonly, never disabled, while the write is out: the
									// text must stay selectable — a student watching a save
									// hang should be able to copy their own sentence
									readonly: inFlight ? 'readonly' : undefined,
									oninput: (event: InputEvent) => {
										draft = (event.target as HTMLTextAreaElement).value;
										rememberFirstDraft();
									},
								}),
								// The self-check: whose need does this serve? Two toggles
								// the student answers for themselves — no AI, no score,
								// and nothing downstream reads them
								m('.write-desk__selfcheck', [
									m('p.write-desk__selfcheck-ask', t('delib.selfcheck_ask')),
									m(
										'.write-desk__selfcheck-chips',
										topic.characters.map((character) => {
											const checked = selfCheck.has(character.characterId);

											return m(
												'button.write-desk__selfcheck-chip',
												{
													type: 'button',
													class: checked ? 'write-desk__selfcheck-chip--on' : undefined,
													'aria-pressed': String(checked),
													onclick: () => {
														if (checked) selfCheck.delete(character.characterId);
														else selfCheck.add(character.characterId);
													},
												},
												[
													checked
														? m(
																'span.write-desk__selfcheck-mark',
																{ 'aria-hidden': 'true' },
																m(Icon, { name: 'check', size: 14 }),
															)
														: null,
													character.name,
												],
											);
										}),
									),
								]),
								m('.delib__actions', [
									m(
										'button.btn.btn--primary.btn--full.btn--lg.write-desk__cta',
										{
											class: ready && !inFlight ? 'write-desk__cta--ready' : undefined,
											disabled: inFlight || !ready,
											onclick: () => {
												submitting = true;
												firstSaveSlow = false;
												const text = draft.trim();
												// A write that never lands never rejects either — it
												// waits in the queue forever. Only a clock can tell
												// the student the truth about it.
												window.clearTimeout(firstSaveTimer);
												firstSaveTimer = window.setTimeout(() => {
													firstSaveSlow = true;
													m.redraw();
												}, SLOW_SAVE_MS);
												createProposal(live, anonName, text, firstProposalId)
													.then(() => {
														window.clearTimeout(firstSaveTimer);
														firstSaveSlow = false;
														forgetFirstDraft();
														// The first write moves the lap forward
														setCycle({ step: 'rate', rated: 0 });
														// ...and the notebook opens itself once on arrival, so
														// the text visibly LANDS somewhere instead of just
														// vanishing off the screen it was typed on
														pendingDockIntro = true;
													})
													.catch((error: unknown) => {
														window.clearTimeout(firstSaveTimer);
														// A rejection is the same news as a hang, and it
														// arrives sooner: say it now rather than at 8s
														firstSaveSlow = true;
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
										inFlight
											? iconLabel('watch', t('delib.saving'))
											: ready
												? iconLabel('proposal', t('delib.submit_proposal'))
												: iconLabel('edit', t('delib.write_first')),
									),
								]),
								// The stuck-write escape hatch. Reloading is the honest fix
								// and the only safe one: the queued write lives in memory,
								// so a fresh page drops it instead of racing a duplicate —
								// and the draft is mirrored, so nothing is retyped.
								firstSaveSlow
									? m('.write-desk__stuck', { role: 'alert' }, [
											m('p.write-desk__stuck-line', t('delib.save_stuck')),
											m(
												'button.btn.btn--secondary',
												{
													onclick: () => {
														rememberFirstDraft();
														window.location.reload();
													},
												},
												iconLabel('again', t('delib.save_retry')),
											),
										])
									: null,
							]),
							m(NeedsPeek, { topic, defaultOpen: true }),
						]),
					]);
				}
			}

			// ---------- SCREEN: MY (a screen, not a step) ----------
			// My workshop: what the class did with my last save, the
			// improvements classmates sent me, the elders I can ask and the two
			// sides' needs. The pen itself is in the dock below, reachable from
			// here and from every other room — so this screen is for reading and
			// deciding, and the box is for writing.
			//
			// Standing here does NOT advance the lap; the mine STEP simply lands
			// on it and adds the one way onward.
			if (myConfirmedProposal && (screen === 'my' || cycle.step === 'mine')) {
				return m(`.shell.shell--delib.shell--mode-mine.shell--place-mine${shellClass}`, [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myConfirmedProposal),
						m(
							'.my-screen',
							{ oncreate: onMyScreenRender, onupdate: onMyScreenRender },
							myWorkshop(live, myConfirmedProposal, topic),
						),
						cycle.step === 'mine'
							? m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{
										onclick: () => {
											setCycle({ step: 'rate', rated: 0 });
										},
									},
									t('delib.to_rating'),
								)
							: null,
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
						delibNav(myConfirmedProposal),
						square.length > 0
							? [
									// No counter and no banner: the HUD's level track carries
									// both the place and the pips for what this lap still owes
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
						delibNav(myConfirmedProposal),
						// The market's ASK, said where the work is: the same question
						// the improvement composer opens with, as the room's mission
						// brief — the help place used to be a bare list of stalls.
						m('.card.market-ask', [
							m('p.market-ask__question', iconLabel('target', t('delib.help_question'))),
							m('p.market-ask__hint', t('delib.help_dont_attack')),
						]),
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
												// Change news outranks the private gap memo — a
												// stall still wears at most two chips
												chips: [
													helpStallChip(proposal, helped),
													changeChip(proposal) ?? gapSeenChip(proposal),
												],
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
					delibNav(myConfirmedProposal),
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
