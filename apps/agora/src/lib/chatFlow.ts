import type { IconName } from '../components/Icon';
import type { AgoraProposal } from './proposals';
import type { AgoraProposalScore } from '@freedi/shared-types';
import { AGORA_CYCLE } from '@freedi/shared-types';

/**
 * The deliberation chat engine: a deterministic conversation between a
 * scripted guide and the student. The guide asks for a proposal, deals
 * classmates' proposals one at a time for rating, prompts for an
 * improvement when the rating is below the top mark, and then hands the
 * student a menu of activities.
 *
 * Pure logic — no Mithril, no Firebase. The view supplies live data
 * through ChatFlowDeps and calls the Firestore verbs itself; an event is
 * dispatched only after a verb succeeds, so the transcript never claims
 * something the database doesn't know yet.
 */

export type AgoraRatingValue = -1 | -0.5 | 0 | 0.5 | 1;

/** The five-level rating scale, ordered strongest-against → strongest-for */
export const RATE_OPTIONS: ReadonlyArray<{
	value: AgoraRatingValue;
	variant: string;
	icon: IconName;
	labelKey: string;
}> = [
	{
		value: -1,
		variant: 'strong-against',
		icon: 'face-strong-against',
		labelKey: 'rate.strong_against',
	},
	{ value: -0.5, variant: 'against', icon: 'face-against', labelKey: 'rate.against' },
	{ value: 0, variant: 'abstain', icon: 'face-neutral', labelKey: 'rate.abstain' },
	{ value: 0.5, variant: 'for', icon: 'face-for', labelKey: 'rate.for' },
	{ value: 1, variant: 'strong-for', icon: 'face-strong-for', labelKey: 'rate.strong_for' },
];

export type ChatPhase =
	| 'intro'
	| 'rate_present'
	| 'improve_prompt'
	| 'improve_compose'
	| 'menu'
	| 'my_feedback'
	| 'improve_mine'
	| 'ask_characters'
	| 'helped';

export interface ChatFlowState {
	phase: ChatPhase;
	/** Proposal pinned when the rate card was dealt — never swaps underneath */
	currentProposalId?: string;
	/** Ratings given through this chat (drives the guided opening) */
	ratedCount: number;
	suggestionsSent: number;
	visited: {
		myFeedback: boolean;
		improveMine: boolean;
		askCharacters: boolean;
		helped: boolean;
	};
	/** Monotonic counter → deterministic phrasing rotation */
	variantSeed: number;
	/** Transcript id of the one card that accepts input right now */
	activeCardId?: number;
	/**
	 * Proposals already dealt in this chat. The evaluations snapshot lags
	 * the rating write, so "not yet in myRatings" alone would deal the same
	 * proposal twice — this list is the synchronous guard.
	 */
	dealtIds: string[];
}

/**
 * Cards persist only REFS — they re-render from the live deliberation
 * state, so an old card in the log always shows current data.
 */
export type CardRef =
	| { type: 'composer'; composer: 'proposal' | 'improvement'; proposalId?: string; done: boolean }
	| { type: 'rate'; proposalId: string }
	| { type: 'improve_choice'; proposalId: string; done: boolean }
	| { type: 'menu' }
	/**
	 * acceptedText: the improvement suggestion the student just accepted —
	 * rendered as a quoted reminder above the editor so they don't have to
	 * remember it. Optional: refs persisted before the field existed (and
	 * plain menu → improve-mine visits) simply render no reminder.
	 */
	| { type: 'my_proposal'; acceptedText?: string }
	| { type: 'my_feedback' }
	| { type: 'characters' }
	| { type: 'helped' };

/**
 * Transcript entries store i18n KEYS + params, never rendered strings —
 * a mid-session language switch re-renders the whole log translated.
 */
export type TranscriptEntry =
	| { id: number; kind: 'bot'; key: string; params?: Record<string, string | number> }
	| { id: number; kind: 'user'; key: string; params?: Record<string, string | number> }
	| { id: number; kind: 'user_text'; text: string }
	| { id: number; kind: 'user_rating'; proposalId: string; value: AgoraRatingValue }
	| { id: number; kind: 'card'; card: CardRef };

export type MenuChoice = 'rate_more' | 'my_feedback' | 'improve_mine' | 'ask_characters' | 'helped';

export type ChatEvent =
	| { type: 'PROPOSAL_SUBMITTED'; text: string }
	| { type: 'RATED'; proposalId: string; value: AgoraRatingValue }
	| { type: 'IMPROVE_ACCEPTED' }
	| { type: 'IMPROVEMENT_SENT'; proposalId: string; text: string }
	| { type: 'IMPROVEMENT_SKIPPED' }
	| { type: 'MENU_CHOICE'; choice: MenuChoice }
	| { type: 'BACK_TO_MENU' }
	| { type: 'CANDIDATE_GONE' }
	/**
	 * The student saved an edit to their own proposal. hasMoreFeedback: OPEN
	 * suggestions still wait on their proposal (the view counts them at save
	 * time) — the guide's reply then points back to the menu.
	 */
	| { type: 'PROPOSAL_UPDATED'; hasMoreFeedback?: boolean }
	/**
	 * The owner accepted an improvement suggestion ("I'll implement") — the
	 * guide takes them straight to their own proposal to weave the idea in,
	 * carrying the accepted text so the editor can quote it.
	 */
	| { type: 'SUGGESTION_ACCEPTED'; text: string };

export interface ChatFlowDeps {
	/** Unrated classmate proposals in fair-attention order (live snapshot) */
	candidateIds(): string[];
	/** Publish rating progress to the participant doc (teacher signal) */
	reportProgress(ratedCount: number): void;
}

// ---------------------------------------------------------------------------
// Pure selection helpers (shared with the view; unit-tested directly)
// ---------------------------------------------------------------------------

export function totalRaters(score: AgoraProposalScore | undefined): number {
	if (!score) return 0;

	return score.perCamp.left.n + score.perCamp.right.n + score.perCamp.center.n;
}

/** Deterministic per-student ordering so classmates fan out over different proposals */
export function studentOrder(userId: string, id: string): number {
	const seed = `${userId}--${id}`;
	let hash = 0;
	for (let index = 0; index < seed.length; index++) {
		hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	}

	return hash;
}

/**
 * The rating queue: classmates' proposals I haven't rated, least-rated
 * first (fair attention), per-student hash as tiebreak.
 */
export function selectCandidates(
	proposals: readonly AgoraProposal[],
	myRatings: Readonly<Record<string, { value: number }>>,
	scores: Readonly<Record<string, AgoraProposalScore>>,
	userId: string,
): AgoraProposal[] {
	return proposals
		.filter(
			(proposal) => proposal.creatorId !== userId && myRatings[proposal.statementId] === undefined,
		)
		.sort(
			(a, b) =>
				totalRaters(scores[a.statementId]) - totalRaters(scores[b.statementId]) ||
				studentOrder(userId, a.statementId) - studentOrder(userId, b.statementId),
		);
}

// ---------------------------------------------------------------------------
// Menu options + nudge (pure — the view feeds live numbers in)
// ---------------------------------------------------------------------------

export interface MenuInput {
	candidatesLeft: number;
	/** OPEN improvement suggestions waiting on MY proposal */
	openSuggestionsOnMine: number;
	/** Classmates who (re)rated after my latest improvement */
	ratingsMoved: number;
	/** Proposals I helped with at least one suggestion */
	helpedCount: number;
	/** Helped proposals that changed since I last looked */
	helpedChanged: number;
	/** Any character review exists for my proposal */
	hasCharacterReview: boolean;
	/** Any existing review is about an older text than my current proposal */
	hasStaleReview: boolean;
	ratedCount: number;
	visited: ChatFlowState['visited'];
}

export interface MenuOption {
	choice: MenuChoice;
	labelKey: string;
	params?: Record<string, string | number>;
	badge?: number;
	/** Show the "fresh" dot without a number (e.g. stale character review) */
	dot?: boolean;
}

export function computeMenuOptions(input: MenuInput): MenuOption[] {
	const options: MenuOption[] = [];
	if (input.candidatesLeft > 0) {
		// Count as a badge, not a label param — the label doubles as the
		// student's echoed reply bubble, where a count would read oddly
		options.push({
			choice: 'rate_more',
			labelKey: 'chat.menu_rate_more',
			badge: input.candidatesLeft,
		});
	}
	if (input.openSuggestionsOnMine > 0 || input.ratingsMoved > 0) {
		options.push({
			choice: 'my_feedback',
			labelKey: 'chat.menu_my_feedback',
			badge: input.openSuggestionsOnMine > 0 ? input.openSuggestionsOnMine : undefined,
		});
	}
	options.push({ choice: 'improve_mine', labelKey: 'chat.menu_improve_mine' });
	options.push({
		choice: 'ask_characters',
		labelKey: 'chat.menu_ask_characters',
		dot: input.hasStaleReview || undefined,
	});
	if (input.helpedCount > 0) {
		options.push({
			choice: 'helped',
			labelKey: 'chat.menu_helped',
			badge: input.helpedChanged > 0 ? input.helpedChanged : undefined,
		});
	}

	return options;
}

/** One soft-goal line the guide says above the menu — the most useful next move */
export function computeNudge(
	input: MenuInput,
): { key: string; params?: Record<string, string | number> } | null {
	if (input.candidatesLeft > 0 && input.ratedCount < AGORA_CYCLE.RATINGS_PER_ROUND) {
		return { key: 'chat.nudge_rate' };
	}
	if (input.openSuggestionsOnMine > 0) {
		return { key: 'chat.nudge_feedback', params: { n: input.openSuggestionsOnMine } };
	}
	if (input.helpedChanged > 0) {
		// A proposal this student helped just changed — invite them to see
		// their influence and reconsider their rating (the loop closes here)
		return { key: 'chat.nudge_helped_changed' };
	}
	if (!input.hasCharacterReview && !input.visited.askCharacters) {
		return { key: 'chat.nudge_characters' };
	}
	if (input.candidatesLeft > 0) {
		return { key: 'chat.nudge_rate_under' };
	}

	return { key: 'chat.nudge_generic' };
}

// ---------------------------------------------------------------------------
// Engine state (module singleton, keyed per session+user like session.ts)
// ---------------------------------------------------------------------------

/** How many phrasings exist for each rotated bot line (must match i18n) */
const VARIANTS: Record<string, number> = {
	'chat.intro': 2,
	'chat.proposal_thanks': 3,
	'chat.next_proposal': 3,
	'chat.top_rating_reply': 2,
	'chat.improve_prompt': 2,
	'chat.improve_thanks': 2,
	'chat.accepted_go_improve': 2,
};

const TRANSCRIPT_CAP = 300;

let flowKey = '';
let deps: ChatFlowDeps | null = null;
let stateKey = '';
let logKey = '';
let bootstrapped = false;
let nextEntryId = 1;

let state: ChatFlowState = freshState();
let transcript: TranscriptEntry[] = [];

function freshState(): ChatFlowState {
	return {
		phase: 'intro',
		ratedCount: 0,
		suggestionsSent: 0,
		visited: { myFeedback: false, improveMine: false, askCharacters: false, helped: false },
		variantSeed: 0,
		dealtIds: [],
	};
}

function storage(): Storage | null {
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
	} catch {
		return null;
	}
}

function persist(): void {
	const store = storage();
	if (!store) return;
	try {
		if (transcript.length > TRANSCRIPT_CAP) {
			transcript = transcript.slice(transcript.length - TRANSCRIPT_CAP);
		}
		store.setItem(stateKey, JSON.stringify(state));
		store.setItem(logKey, JSON.stringify(transcript));
	} catch {
		// Quota / private-mode failures — the chat still works, it just
		// won't survive a refresh
	}
}

function restore(): boolean {
	const store = storage();
	if (!store) return false;
	try {
		const rawState = store.getItem(stateKey);
		const rawLog = store.getItem(logKey);
		if (!rawState || !rawLog) return false;
		const parsedState = JSON.parse(rawState) as ChatFlowState;
		const parsedLog = JSON.parse(rawLog) as TranscriptEntry[];
		if (!parsedState.phase || !Array.isArray(parsedLog) || parsedLog.length === 0) return false;
		state = { ...freshState(), ...parsedState };
		transcript = parsedLog;
		nextEntryId = Math.max(...parsedLog.map((entry) => entry.id)) + 1;

		return true;
	} catch {
		return false;
	}
}

/**
 * Attach the engine to a session+student (idempotent per key). Restores a
 * stored conversation if one exists; otherwise waits for bootstrap().
 */
export function initChatFlow(sessionId: string, userId: string, flowDeps: ChatFlowDeps): void {
	const key = `${sessionId}--${userId}`;
	deps = flowDeps;
	if (flowKey === key) return;
	flowKey = key;
	stateKey = `agora_${sessionId}_chatflow`;
	logKey = `agora_${sessionId}_chatlog`;
	state = freshState();
	transcript = [];
	nextEntryId = 1;
	bootstrapped = restore();
}

export function isBootstrapped(): boolean {
	return bootstrapped;
}

/**
 * Start the conversation from live Firestore state — called once the first
 * statements snapshot has arrived (so "do they have a proposal?" is known).
 */
export function bootstrap(hasProposal: boolean, initialRatedCount: number): void {
	if (bootstrapped) return;
	bootstrapped = true;
	if (!hasProposal) {
		appendBot('chat.intro');
		appendBot('chat.ask_proposal');
		appendActiveCard({ type: 'composer', composer: 'proposal', done: false });
		state.phase = 'intro';
	} else {
		// Returning student (cleared storage / second device): don't make
		// them re-live the opening — straight to the menu
		state.ratedCount = initialRatedCount;
		appendBot('chat.welcome_back');
		openMenu();
	}
	persist();
}

export function getChatFlow(): Readonly<{
	state: Readonly<ChatFlowState>;
	transcript: readonly TranscriptEntry[];
}> {
	return { state, transcript };
}

export function stopChatFlow(): void {
	flowKey = '';
	deps = null;
	bootstrapped = false;
	state = freshState();
	transcript = [];
	nextEntryId = 1;
}

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

/** Omit that distributes over a union (plain Omit collapses it) */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function append(entry: DistributiveOmit<TranscriptEntry, 'id'>): TranscriptEntry {
	const withId = { ...entry, id: nextEntryId++ } as TranscriptEntry;
	transcript.push(withId);

	return withId;
}

/**
 * Append a guide line. Rotated lines resolve their variant NOW and store
 * the resolved key, so a reload replays the same phrasing.
 */
function appendBot(baseKey: string, params?: Record<string, string | number>): void {
	const variants = VARIANTS[baseKey];
	const key = variants ? `${baseKey}_${(state.variantSeed++ % variants) + 1}` : baseKey;
	append({ kind: 'bot', key, params });
}

function appendActiveCard(card: CardRef): void {
	const entry = append({ kind: 'card', card });
	state.activeCardId = entry.id;
}

/** Flip a done-flag on the card the student just used */
function completeActiveCard(): void {
	const entry = transcript.find((candidate) => candidate.id === state.activeCardId);
	if (entry && entry.kind === 'card' && 'done' in entry.card) {
		entry.card.done = true;
	}
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function openMenu(): void {
	state.phase = 'menu';
	state.currentProposalId = undefined;
	appendActiveCard({ type: 'menu' });
}

/** Deal the next classmate proposal, or fall back to the menu */
function dealOrMenu(introKey: 'chat.first_rate_intro' | 'chat.next_proposal' | null): void {
	const candidateId = deps?.candidateIds().find((id) => !state.dealtIds.includes(id));
	if (candidateId) {
		state.dealtIds.push(candidateId);
		if (introKey === 'chat.first_rate_intro') {
			appendBot('chat.first_rate_intro');
		} else if (introKey === 'chat.next_proposal') {
			appendBot('chat.next_proposal');
		}
		state.phase = 'rate_present';
		state.currentProposalId = candidateId;
		appendActiveCard({ type: 'rate', proposalId: candidateId });
	} else {
		appendBot(state.ratedCount > 0 ? 'chat.all_rated' : 'chat.no_candidates');
		openMenu();
	}
}

function continueAfterRating(): void {
	state.ratedCount++;
	deps?.reportProgress(state.ratedCount);
	if (state.ratedCount < AGORA_CYCLE.RATINGS_PER_ROUND) {
		// The guided opening: keep dealing until the soft goal is met
		dealOrMenu('chat.next_proposal');
	} else if (state.ratedCount === AGORA_CYCLE.RATINGS_PER_ROUND) {
		// Soft goal reached — hand over the wheel
		appendBot('chat.opening_done');
		openMenu();
	} else {
		// Free-choice rating (via the menu): deal again while there's content
		dealOrMenu('chat.next_proposal');
	}
}

export function dispatch(event: ChatEvent): void {
	switch (event.type) {
		case 'PROPOSAL_SUBMITTED': {
			completeActiveCard();
			append({ kind: 'user_text', text: event.text });
			appendBot('chat.proposal_thanks');
			dealOrMenu('chat.first_rate_intro');
			break;
		}

		case 'RATED': {
			append({ kind: 'user_rating', proposalId: event.proposalId, value: event.value });
			if (event.value < 1) {
				appendBot('chat.improve_prompt');
				state.phase = 'improve_prompt';
				appendActiveCard({ type: 'improve_choice', proposalId: event.proposalId, done: false });
			} else {
				appendBot('chat.top_rating_reply');
				continueAfterRating();
			}
			break;
		}

		case 'IMPROVE_ACCEPTED': {
			completeActiveCard();
			append({ kind: 'user', key: 'chat.improve_yes' });
			state.phase = 'improve_compose';
			appendActiveCard({
				type: 'composer',
				composer: 'improvement',
				proposalId: state.currentProposalId,
				done: false,
			});
			break;
		}

		case 'IMPROVEMENT_SKIPPED': {
			completeActiveCard();
			append({ kind: 'user', key: 'chat.improve_skip' });
			continueAfterRating();
			break;
		}

		case 'IMPROVEMENT_SENT': {
			completeActiveCard();
			append({ kind: 'user_text', text: event.text });
			appendBot('chat.improve_thanks');
			state.suggestionsSent++;
			continueAfterRating();
			break;
		}

		case 'MENU_CHOICE': {
			append({ kind: 'user', key: `chat.menu_${event.choice}` });
			switch (event.choice) {
				case 'rate_more':
					dealOrMenu('chat.next_proposal');
					break;
				case 'my_feedback':
					state.visited.myFeedback = true;
					appendBot('chat.branch_feedback_intro');
					state.phase = 'my_feedback';
					appendActiveCard({ type: 'my_feedback' });
					break;
				case 'improve_mine':
					state.visited.improveMine = true;
					appendBot('chat.branch_improve_intro');
					state.phase = 'improve_mine';
					appendActiveCard({ type: 'my_proposal' });
					break;
				case 'ask_characters':
					state.visited.askCharacters = true;
					appendBot('chat.branch_characters_intro');
					state.phase = 'ask_characters';
					appendActiveCard({ type: 'characters' });
					break;
				case 'helped':
					state.visited.helped = true;
					appendBot('chat.branch_helped_intro');
					state.phase = 'helped';
					appendActiveCard({ type: 'helped' });
					break;
			}
			break;
		}

		case 'BACK_TO_MENU': {
			openMenu();
			break;
		}

		case 'CANDIDATE_GONE': {
			// The pinned proposal vanished from the snapshot (deleted/hidden)
			appendBot('chat.candidate_gone');
			openMenu();
			break;
		}

		case 'PROPOSAL_UPDATED': {
			appendBot(
				event.hasMoreFeedback
					? 'chat.proposal_updated_more_feedback'
					: 'chat.proposal_updated_reply',
			);
			break;
		}

		case 'SUGGESTION_ACCEPTED': {
			// Accepting = adopting: the guide walks the owner to their own
			// proposal right away, quoting the accepted idea next to the editor
			append({ kind: 'user', key: 'chat.accept_echo' });
			appendBot('chat.accepted_go_improve');
			state.phase = 'improve_mine';
			state.visited.improveMine = true;
			appendActiveCard({ type: 'my_proposal', acceptedText: event.text });
			break;
		}
	}
	persist();
}
