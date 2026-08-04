import { describe, it, expect, beforeEach } from 'vitest';
import {
	initChatFlow,
	bootstrap,
	isBootstrapped,
	dispatch,
	getChatFlow,
	stopChatFlow,
	selectCandidates,
	computeMenuOptions,
	computeNudge,
	studentOrder,
	totalRaters,
	RATE_OPTIONS,
	type ChatFlowDeps,
	type MenuInput,
	type TranscriptEntry,
} from '../chatFlow';
import type { AgoraProposal } from '../proposals';
import type { AgoraProposalScore } from '@freedi/shared-types';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

/** In-memory sessionStorage for the node test environment */
class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	get length(): number {
		return this.map.size;
	}
	clear(): void {
		this.map.clear();
	}
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	key(index: number): string | null {
		return [...this.map.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

const store = new MemoryStorage();
(globalThis as { sessionStorage?: Storage }).sessionStorage = store;

function makeDeps(queue: string[]): ChatFlowDeps & { progressCalls: number[] } {
	const progressCalls: number[] = [];

	return {
		candidateIds: () => [...queue],
		reportProgress: (n: number) => {
			progressCalls.push(n);
		},
		progressCalls,
	};
}

function proposal(id: string, creatorId: string, createdAt = 0): AgoraProposal {
	return {
		statementId: id,
		statement: `text of ${id}`,
		creatorId,
		anonName: `anon-${creatorId}`,
		statementType: 'option',
		parentId: 'q1',
		createdAt,
		lastUpdate: createdAt,
	};
}

function score(left: number, right: number, center = 0): AgoraProposalScore {
	return {
		statementId: 'x',
		sessionId: 's',
		authorCamp: 'left',
		perCamp: {
			left: { sum: 0, n: left, positiveN: 0 },
			right: { sum: 0, n: right, positiveN: 0 },
			center: { sum: 0, n: center, positiveN: 0 },
		},
		bridgingScore: 0,
		lastUpdate: 0,
	} as unknown as AgoraProposalScore;
}

function kinds(): string[] {
	return getChatFlow().transcript.map((entry) =>
		entry.kind === 'card' ? `card:${entry.card.type}` : entry.kind,
	);
}

function lastBotKey(): string | undefined {
	const bots = getChatFlow().transcript.filter(
		(entry): entry is Extract<TranscriptEntry, { kind: 'bot' }> => entry.kind === 'bot',
	);

	return bots[bots.length - 1]?.key;
}

function activeCard(): Extract<TranscriptEntry, { kind: 'card' }> | undefined {
	const { state, transcript } = getChatFlow();

	return transcript.find(
		(entry): entry is Extract<TranscriptEntry, { kind: 'card' }> =>
			entry.kind === 'card' && entry.id === state.activeCardId,
	);
}

beforeEach(() => {
	stopChatFlow();
	store.clear();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('selectCandidates', () => {
	const me = 'user-me';
	const proposals = [
		proposal('p-mine', me, 1),
		proposal('p-a', 'user-a', 2),
		proposal('p-b', 'user-b', 3),
		proposal('p-c', 'user-c', 4),
	];

	it('excludes my own proposal and already-rated ones', () => {
		const result = selectCandidates(proposals, { 'p-a': { value: 1 } }, {}, me);
		expect(result.map((entry) => entry.statementId).sort()).toEqual(['p-b', 'p-c']);
	});

	it('orders least-rated first', () => {
		const scores = { 'p-b': score(3, 3), 'p-c': score(0, 1) };
		const result = selectCandidates(proposals, { 'p-a': { value: 0 } }, scores, me);
		expect(result[0].statementId).toBe('p-c');
	});

	it('breaks ties with the deterministic per-student hash', () => {
		const result1 = selectCandidates(proposals, {}, {}, me);
		const result2 = selectCandidates(proposals, {}, {}, me);
		expect(result1.map((entry) => entry.statementId)).toEqual(
			result2.map((entry) => entry.statementId),
		);
		const expected = ['p-a', 'p-b', 'p-c'].sort(
			(a, b) => studentOrder(me, a) - studentOrder(me, b),
		);
		expect(result1.map((entry) => entry.statementId)).toEqual(expected);
	});
});

describe('totalRaters', () => {
	it('sums all camps and handles missing scores', () => {
		expect(totalRaters(undefined)).toBe(0);
		expect(totalRaters(score(2, 3, 1))).toBe(6);
	});
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

describe('bootstrap', () => {
	it('opens with greeting + proposal composer when no proposal exists', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		expect(isBootstrapped()).toBe(false);
		bootstrap(false, 0);
		expect(isBootstrapped()).toBe(true);
		expect(kinds()).toEqual(['bot', 'bot', 'card:composer']);
		expect(getChatFlow().state.phase).toBe('intro');
	});

	it('welcomes back straight to the menu when a proposal exists', () => {
		initChatFlow('s1', 'me', makeDeps(['p-a']));
		bootstrap(true, 2);
		expect(getChatFlow().state.phase).toBe('menu');
		expect(getChatFlow().state.ratedCount).toBe(2);
		expect(kinds()).toEqual(['bot', 'card:menu']);
	});

	it('is a no-op when already bootstrapped', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(false, 0);
		const length = getChatFlow().transcript.length;
		bootstrap(true, 5);
		expect(getChatFlow().transcript.length).toBe(length);
	});
});

// ---------------------------------------------------------------------------
// The guided opening
// ---------------------------------------------------------------------------

describe('guided opening', () => {
	it('thanks and deals the first candidate after the proposal', () => {
		const queue = ['p-a', 'p-b'];
		initChatFlow('s1', 'me', makeDeps(queue));
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });
		const { state, transcript } = getChatFlow();
		expect(state.phase).toBe('rate_present');
		expect(state.currentProposalId).toBe('p-a');
		expect(transcript.some((entry) => entry.kind === 'user_text')).toBe(true);
		expect(activeCard()?.card).toEqual({ type: 'rate', proposalId: 'p-a' });
	});

	it('falls to the menu with no_candidates when the class is empty', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });
		expect(getChatFlow().state.phase).toBe('menu');
		expect(
			getChatFlow().transcript.some(
				(entry) => entry.kind === 'bot' && entry.key === 'chat.no_candidates',
			),
		).toBe(true);
	});

	it('auto-deals until the soft goal of 3 ratings, then opens the menu', () => {
		const queue = ['p-a', 'p-b', 'p-c', 'p-d'];
		const deps = makeDeps(queue);
		initChatFlow('s1', 'me', deps);
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });

		// Three top ratings in a row — no improvement prompts. The queue is
		// never mutated: the engine's dealtIds guard must skip rated ones
		// even though the (simulated) evaluations snapshot hasn't caught up.
		for (const id of ['p-a', 'p-b', 'p-c']) {
			expect(getChatFlow().state.currentProposalId).toBe(id);
			dispatch({ type: 'RATED', proposalId: id, value: 1 });
		}
		expect(deps.progressCalls).toEqual([1, 2, 3]);
		expect(getChatFlow().state.phase).toBe('menu');
		expect(
			getChatFlow().transcript.some(
				(entry) => entry.kind === 'bot' && entry.key === 'chat.opening_done',
			),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The improvement prompt threshold
// ---------------------------------------------------------------------------

describe('improvement prompt', () => {
	function setupRating(): void {
		initChatFlow('s1', 'me', makeDeps(['p-a', 'p-b']));
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });
	}

	it.each(RATE_OPTIONS.filter((option) => option.value < 1).map((option) => option.value))(
		'asks for an improvement on rating %s',
		(value) => {
			setupRating();
			dispatch({ type: 'RATED', proposalId: 'p-a', value });
			expect(getChatFlow().state.phase).toBe('improve_prompt');
			expect(activeCard()?.card.type).toBe('improve_choice');
		},
	);

	it('skips the prompt only on the top rating (+1)', () => {
		setupRating();
		dispatch({ type: 'RATED', proposalId: 'p-a', value: 1 });
		expect(getChatFlow().state.phase).toBe('rate_present');
		expect(getChatFlow().state.currentProposalId).toBe('p-b');
	});

	it('IMPROVE_ACCEPTED opens the improvement composer for the pinned proposal', () => {
		setupRating();
		dispatch({ type: 'RATED', proposalId: 'p-a', value: 0 });
		dispatch({ type: 'IMPROVE_ACCEPTED' });
		expect(getChatFlow().state.phase).toBe('improve_compose');
		expect(activeCard()?.card).toEqual({
			type: 'composer',
			composer: 'improvement',
			proposalId: 'p-a',
			done: false,
		});
	});

	it('IMPROVEMENT_SENT thanks, counts, and continues the loop', () => {
		setupRating();
		dispatch({ type: 'RATED', proposalId: 'p-a', value: -0.5 });
		dispatch({ type: 'IMPROVE_ACCEPTED' });
		dispatch({ type: 'IMPROVEMENT_SENT', proposalId: 'p-a', text: 'try adding X' });
		expect(getChatFlow().state.suggestionsSent).toBe(1);
		expect(getChatFlow().state.ratedCount).toBe(1);
		expect(getChatFlow().state.phase).toBe('rate_present');
	});

	it('IMPROVEMENT_SKIPPED continues without a suggestion', () => {
		setupRating();
		dispatch({ type: 'RATED', proposalId: 'p-a', value: 0.5 });
		dispatch({ type: 'IMPROVEMENT_SKIPPED' });
		expect(getChatFlow().state.suggestionsSent).toBe(0);
		expect(getChatFlow().state.ratedCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Menu + branches
// ---------------------------------------------------------------------------

describe('menu', () => {
	function reachMenu(): void {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(true, 3);
	}

	it.each([
		['my_feedback', 'my_feedback'],
		['improve_mine', 'my_proposal'],
		['ask_characters', 'characters'],
		['helped', 'helped'],
	] as const)('branch %s shows its card and marks visited', (choice, cardType) => {
		reachMenu();
		dispatch({ type: 'MENU_CHOICE', choice });
		expect(getChatFlow().state.phase).toBe(choice === 'improve_mine' ? 'improve_mine' : choice);
		expect(activeCard()?.card.type).toBe(cardType);
	});

	it('rate_more with no candidates reports all_rated and reopens the menu', () => {
		reachMenu();
		dispatch({ type: 'MENU_CHOICE', choice: 'rate_more' });
		expect(getChatFlow().state.phase).toBe('menu');
		expect(lastBotKey()).toBe('chat.all_rated');
		expect(
			getChatFlow().transcript.some(
				(entry) => entry.kind === 'bot' && entry.key === 'chat.all_rated',
			),
		).toBe(true);
	});

	it('BACK_TO_MENU always lands on a fresh active menu card', () => {
		reachMenu();
		dispatch({ type: 'MENU_CHOICE', choice: 'improve_mine' });
		dispatch({ type: 'BACK_TO_MENU' });
		expect(getChatFlow().state.phase).toBe('menu');
		expect(activeCard()?.card.type).toBe('menu');
	});

	it('empty-class opening: menu grows rate_more later, top rating reopens a fresh active menu', () => {
		// S1's real path in the walkthrough: propose with no candidates →
		// menu1; a classmate's proposal arrives; rate_more; top rating.
		const candidates: string[] = [];
		initChatFlow('s1', 'me', {
			candidateIds: () => [...candidates],
			reportProgress: () => {},
		});
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });
		expect(getChatFlow().state.phase).toBe('menu');
		candidates.push('p-a');
		dispatch({ type: 'MENU_CHOICE', choice: 'rate_more' });
		expect(getChatFlow().state.phase).toBe('rate_present');
		dispatch({ type: 'RATED', proposalId: 'p-a', value: 1 });
		expect(getChatFlow().state.phase).toBe('menu');
		// The ACTIVE card must be the new menu — not the stale first one
		expect(activeCard()?.card.type).toBe('menu');
		const menus = getChatFlow().transcript.filter(
			(entry) => entry.kind === 'card' && entry.card.type === 'menu',
		);
		expect(menus.length).toBe(2);
		expect(menus[menus.length - 1].id).toBe(getChatFlow().state.activeCardId);
	});

	it('CANDIDATE_GONE recovers to the menu', () => {
		initChatFlow('s1', 'me', makeDeps(['p-a']));
		bootstrap(true, 0);
		dispatch({ type: 'MENU_CHOICE', choice: 'rate_more' });
		expect(getChatFlow().state.phase).toBe('rate_present');
		dispatch({ type: 'CANDIDATE_GONE' });
		expect(getChatFlow().state.phase).toBe('menu');
	});

	it('PROPOSAL_UPDATED replies without leaving the branch', () => {
		reachMenu();
		dispatch({ type: 'MENU_CHOICE', choice: 'improve_mine' });
		dispatch({ type: 'PROPOSAL_UPDATED' });
		expect(getChatFlow().state.phase).toBe('improve_mine');
		expect(lastBotKey()).toBe('chat.proposal_updated_reply');
	});
});

// ---------------------------------------------------------------------------
// The accept → improve-mine flow
// ---------------------------------------------------------------------------

describe('SUGGESTION_ACCEPTED', () => {
	function acceptFromFeedback(text = 'add a timeline'): void {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(true, 3);
		dispatch({ type: 'MENU_CHOICE', choice: 'my_feedback' });
		dispatch({ type: 'SUGGESTION_ACCEPTED', text });
	}

	it('echoes the accept, moves to improve_mine, and opens my_proposal with the accepted text', () => {
		acceptFromFeedback('add a clear timeline');
		const { state } = getChatFlow();
		expect(state.phase).toBe('improve_mine');
		expect(state.visited.improveMine).toBe(true);
		expect(activeCard()?.card).toEqual({
			type: 'my_proposal',
			acceptedText: 'add a clear timeline',
		});
		// The student's own echo bubble, then the guide's walk-over line
		const entries = getChatFlow().transcript;
		const echo = entries.find((entry) => entry.kind === 'user' && entry.key === 'chat.accept_echo');
		expect(echo).toBeDefined();
		expect(lastBotKey()).toMatch(/^chat\.accepted_go_improve_[12]$/);
	});

	it('rotates the guide phrasing across accepts', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(true, 3);
		dispatch({ type: 'MENU_CHOICE', choice: 'my_feedback' });
		dispatch({ type: 'SUGGESTION_ACCEPTED', text: 'first' });
		const first = lastBotKey();
		dispatch({ type: 'BACK_TO_MENU' });
		dispatch({ type: 'MENU_CHOICE', choice: 'my_feedback' });
		dispatch({ type: 'SUGGESTION_ACCEPTED', text: 'second' });
		expect(lastBotKey()).not.toBe(first);
	});

	it('PROPOSAL_UPDATED after an accept points back to remaining feedback', () => {
		acceptFromFeedback();
		dispatch({ type: 'PROPOSAL_UPDATED', hasMoreFeedback: true });
		expect(lastBotKey()).toBe('chat.proposal_updated_more_feedback');
		// Still in the improve-mine branch — the menu remains one tap away
		expect(getChatFlow().state.phase).toBe('improve_mine');
	});

	it('PROPOSAL_UPDATED without remaining feedback keeps the plain reply', () => {
		acceptFromFeedback();
		dispatch({ type: 'PROPOSAL_UPDATED', hasMoreFeedback: false });
		expect(lastBotKey()).toBe('chat.proposal_updated_reply');
	});

	it('persists the acceptedText on the card ref across a reload', () => {
		const deps = makeDeps([]);
		initChatFlow('s1', 'me', deps);
		bootstrap(true, 3);
		dispatch({ type: 'MENU_CHOICE', choice: 'my_feedback' });
		dispatch({ type: 'SUGGESTION_ACCEPTED', text: 'quoted reminder text' });

		// Simulate a full page reload
		stopChatFlow();
		initChatFlow('s1', 'me', deps);
		expect(isBootstrapped()).toBe(true);
		expect(getChatFlow().state.phase).toBe('improve_mine');
		expect(activeCard()?.card).toEqual({
			type: 'my_proposal',
			acceptedText: 'quoted reminder text',
		});
	});

	it('tolerates old persisted my_proposal refs without acceptedText', () => {
		// A pre-upgrade transcript: menu → improve_mine stored a bare ref
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(true, 3);
		dispatch({ type: 'MENU_CHOICE', choice: 'improve_mine' });
		stopChatFlow();
		initChatFlow('s1', 'me', makeDeps([]));
		expect(isBootstrapped()).toBe(true);
		expect(activeCard()?.card).toEqual({ type: 'my_proposal' });
		// The flow keeps working on top of the old ref
		dispatch({ type: 'PROPOSAL_UPDATED', hasMoreFeedback: true });
		expect(lastBotKey()).toBe('chat.proposal_updated_more_feedback');
	});
});

describe('computeMenuOptions', () => {
	const base: MenuInput = {
		candidatesLeft: 0,
		openSuggestionsOnMine: 0,
		ratingsMoved: 0,
		helpedCount: 0,
		helpedChanged: 0,
		hasCharacterReview: false,
		hasStaleReview: false,
		ratedCount: 3,
		visited: { myFeedback: false, improveMine: false, askCharacters: false, helped: false },
	};

	it('always offers improve_mine and ask_characters, hides the rest when empty', () => {
		const choices = computeMenuOptions(base).map((option) => option.choice);
		expect(choices).toEqual(['improve_mine', 'ask_characters']);
	});

	it('shows every option with badges when there is content everywhere', () => {
		const options = computeMenuOptions({
			...base,
			candidatesLeft: 4,
			openSuggestionsOnMine: 2,
			helpedCount: 3,
			helpedChanged: 1,
			hasStaleReview: true,
		});
		expect(options.map((option) => option.choice)).toEqual([
			'rate_more',
			'my_feedback',
			'improve_mine',
			'ask_characters',
			'helped',
		]);
		expect(options.find((option) => option.choice === 'my_feedback')?.badge).toBe(2);
		expect(options.find((option) => option.choice === 'helped')?.badge).toBe(1);
		expect(options.find((option) => option.choice === 'ask_characters')?.dot).toBe(true);
	});

	it('shows my_feedback when only ratings moved (no open suggestions)', () => {
		const options = computeMenuOptions({ ...base, ratingsMoved: 2 });
		const feedback = options.find((option) => option.choice === 'my_feedback');
		expect(feedback).toBeDefined();
		expect(feedback?.badge).toBeUndefined();
	});
});

describe('computeNudge', () => {
	const base: MenuInput = {
		candidatesLeft: 0,
		openSuggestionsOnMine: 0,
		ratingsMoved: 0,
		helpedCount: 0,
		helpedChanged: 0,
		hasCharacterReview: false,
		hasStaleReview: false,
		ratedCount: 3,
		visited: { myFeedback: false, improveMine: false, askCharacters: true, helped: false },
	};

	it('prioritizes rating during the opening', () => {
		expect(computeNudge({ ...base, candidatesLeft: 2, ratedCount: 1 })?.key).toBe(
			'chat.nudge_rate',
		);
	});

	it('then fresh feedback on my proposal', () => {
		expect(computeNudge({ ...base, openSuggestionsOnMine: 2 })?.key).toBe('chat.nudge_feedback');
	});

	it('then a helped proposal that changed (the loop-closing invite)', () => {
		expect(computeNudge({ ...base, helpedChanged: 1 })?.key).toBe('chat.nudge_helped_changed');
		// Fresh feedback on my own proposal still outranks it
		expect(computeNudge({ ...base, helpedChanged: 1, openSuggestionsOnMine: 1 })?.key).toBe(
			'chat.nudge_feedback',
		);
	});

	it('then unvisited characters', () => {
		expect(computeNudge({ ...base, visited: { ...base.visited, askCharacters: false } })?.key).toBe(
			'chat.nudge_characters',
		);
	});

	it('then under-rated proposals, else generic', () => {
		expect(computeNudge({ ...base, candidatesLeft: 1 })?.key).toBe('chat.nudge_rate_under');
		expect(computeNudge(base)?.key).toBe('chat.nudge_generic');
	});
});

// ---------------------------------------------------------------------------
// Variants & persistence
// ---------------------------------------------------------------------------

describe('phrasing variants', () => {
	it('rotates deterministically and stores the resolved key', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(false, 0);
		const intro = getChatFlow().transcript[0];
		expect(intro.kind).toBe('bot');
		if (intro.kind === 'bot') expect(intro.key).toBe('chat.intro_1');
	});
});

describe('persistence', () => {
	it('restores state, transcript, and phrasing after a reload', () => {
		const deps = makeDeps(['p-a', 'p-b']);
		initChatFlow('s1', 'me', deps);
		bootstrap(false, 0);
		dispatch({ type: 'PROPOSAL_SUBMITTED', text: 'my idea' });
		const before = getChatFlow();
		const savedTranscript = JSON.stringify(before.transcript);
		const savedPhase = before.state.phase;

		// Simulate a full page reload
		stopChatFlow();
		initChatFlow('s1', 'me', deps);
		expect(isBootstrapped()).toBe(true);
		expect(getChatFlow().state.phase).toBe(savedPhase);
		expect(JSON.stringify(getChatFlow().transcript)).toBe(savedTranscript);

		// New entries continue with unique ids
		dispatch({ type: 'RATED', proposalId: 'p-a', value: 1 });
		const ids = getChatFlow().transcript.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('recovers from corrupt storage by requiring a fresh bootstrap', () => {
		store.setItem('agora_s1_chatflow', '{not json');
		store.setItem('agora_s1_chatlog', '[]');
		initChatFlow('s1', 'me', makeDeps([]));
		expect(isBootstrapped()).toBe(false);
		bootstrap(false, 0);
		expect(getChatFlow().state.phase).toBe('intro');
	});

	it('keeps different sessions in different storage keys', () => {
		initChatFlow('s1', 'me', makeDeps([]));
		bootstrap(false, 0);
		stopChatFlow();
		initChatFlow('s2', 'me', makeDeps([]));
		expect(isBootstrapped()).toBe(false);
	});
});
