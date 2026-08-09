import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgoraMessageKind, AgoraSuggestionStatus, StatementType } from '@freedi/shared-types';

/**
 * The thread selectors read the deliberation module's internal state, which
 * only the statements listener writes — so the test feeds that listener a
 * fake snapshot through a captured onSnapshot callback.
 */

type SnapshotCallback = (snapshot: {
	forEach: (fn: (docSnap: { data: () => Record<string, unknown> }) => void) => void;
}) => void;

const snapshotCallbacks: SnapshotCallback[] = [];

vi.mock('mithril', () => ({ default: { redraw: () => {} } }));
vi.mock('../firebase', () => ({
	db: {},
	doc: () => ({}),
	collection: () => ({}),
	query: () => ({}),
	where: () => ({}),
	setDoc: async () => {},
	updateDoc: async () => {},
	onSnapshot: (_query: unknown, onNext: SnapshotCallback) => {
		snapshotCallbacks.push(onNext);

		return () => {};
	},
	functions: {},
	httpsCallable: () => async () => ({ data: { ok: true } }),
}));
vi.mock('../user', () => ({ getUserState: () => ({ user: { uid: 'me' } }) }));
vi.mock('../session', () => ({ getSessionState: () => ({ myParticipant: null }) }));
vi.mock('../notifications', () => ({
	detectClassBridgeRecord: () => {},
	detectHelpedImprovements: () => {},
	detectThreadMessages: () => {},
}));

import {
	getHelpedProposals,
	getOwnerThreads,
	getThreadMessages,
	isSuggestionKind,
	listenToDeliberation,
	openSuggestionsBy,
	stopDeliberationListeners,
	threadUserIdOf,
	AgoraProposal,
} from '../proposals';

function feedStatements(docs: Array<Record<string, unknown>>): void {
	// The first captured callback is the statements listener
	snapshotCallbacks[0]({
		forEach: (fn) => docs.forEach((data) => fn({ data: () => data })),
	});
}

const proposalDoc = {
	statementId: 'p1',
	statement: 'Split the water rights by season',
	statementType: StatementType.option,
	parentId: 'challenge-1',
	creatorId: 'owner',
	anonName: 'wise-crane',
	createdAt: 10,
	lastUpdate: 10,
};

/** A pre-thread suggestion: no kind, no threadUserId — the legacy shape */
const legacySuggestion = {
	statementId: 's-legacy',
	statement: 'Name an arbitrator',
	statementType: StatementType.suggestion,
	parentId: 'p1',
	creatorId: 'h1',
	anonName: 'brave-fox',
	createdAt: 20,
	lastUpdate: 20,
	suggestionStatus: AgoraSuggestionStatus.open,
};

/** The owner's reply INTO h1's thread — chat kind, keyed by the helper */
const ownerReply = {
	statementId: 's-reply',
	statement: 'Can you make it more concrete?',
	statementType: StatementType.suggestion,
	parentId: 'p1',
	creatorId: 'owner',
	anonName: 'wise-crane',
	createdAt: 30,
	lastUpdate: 30,
	agoraMessageKind: AgoraMessageKind.chat,
	agoraThreadUserId: 'h1',
};

const h2Suggestion = {
	statementId: 's-h2',
	statement: 'Add a drought clause',
	statementType: StatementType.suggestion,
	parentId: 'p1',
	creatorId: 'h2',
	anonName: 'quiet-elk',
	createdAt: 40,
	lastUpdate: 40,
	suggestionStatus: AgoraSuggestionStatus.open,
	agoraMessageKind: AgoraMessageKind.suggestion,
	agoraThreadUserId: 'h2',
};

const h2Chat = {
	statementId: 's-h2-chat',
	statement: 'Happy to explain what I meant',
	statementType: StatementType.suggestion,
	parentId: 'p1',
	creatorId: 'h2',
	anonName: 'quiet-elk',
	createdAt: 50,
	lastUpdate: 50,
	agoraMessageKind: AgoraMessageKind.chat,
	agoraThreadUserId: 'h2',
};

beforeEach(() => {
	stopDeliberationListeners();
	snapshotCallbacks.length = 0;
	listenToDeliberation('session-1', 'me');
	feedStatements([proposalDoc, legacySuggestion, ownerReply, h2Suggestion, h2Chat]);
});

describe('thread selectors', () => {
	it('a legacy doc without a discriminator IS a suggestion, keyed by its author', () => {
		const legacy = { creatorId: 'h1' } as AgoraProposal;
		expect(isSuggestionKind(legacy)).toBe(true);
		expect(threadUserIdOf(legacy)).toBe('h1');
	});

	it('getThreadMessages returns one helper conversation, both directions, in order', () => {
		const thread = getThreadMessages('p1', 'h1');
		expect(thread.map((message) => message.statementId)).toEqual(['s-legacy', 's-reply']);
	});

	it('getOwnerThreads groups every message by its helper', () => {
		const threads = getOwnerThreads('p1');
		expect([...threads.keys()].sort()).toEqual(['h1', 'h2']);
		expect(threads.get('h1')?.map((message) => message.statementId)).toEqual([
			's-legacy',
			's-reply',
		]);
		expect(threads.get('h2')?.map((message) => message.statementId)).toEqual(['s-h2', 's-h2-chat']);
	});

	it('chat messages never occupy an open-idea slot', () => {
		// h2 has one open suggestion and one chat message — the cap sees ONE
		expect(openSuggestionsBy('p1', 'h2')).toBe(1);
		// legacy docs still count (they are suggestions by construction)
		expect(openSuggestionsBy('p1', 'h1')).toBe(1);
	});

	it('chatting alone does not make a proposal "helped"', () => {
		// h2 helped via the suggestion; the chat message is not what qualifies
		const helped = getHelpedProposals('h2');
		expect(helped).toHaveLength(1);
		expect(helped[0].mySuggestions.map((suggestion) => suggestion.statementId)).toEqual(['s-h2']);
	});
});
