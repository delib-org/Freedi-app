import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgoraMessageKind, AgoraSuggestionStatus } from '@freedi/shared-types';

/**
 * The signals are pure over the deliberation state, so the whole suite drives a
 * mutable mock of that singleton — the pattern seenState.test.ts established.
 */

interface MockMessage {
	statementId: string;
	statement: string;
	creatorId: string;
	anonName: string;
	statementType: string;
	parentId: string;
	createdAt: number;
	lastUpdate: number;
	suggestionStatus?: AgoraSuggestionStatus;
	statusChangedAt?: number;
	agoraMessageKind?: AgoraMessageKind;
	agoraThreadUserId?: string;
}

const delibState: {
	proposals: MockMessage[];
	suggestions: Record<string, MockMessage[]>;
	myRatings: Record<string, { value: number; updatedAt: number }>;
	studentEvalTimes: Record<string, Array<{ evaluatorId: string; updatedAt: number }>>;
	scores: Record<
		string,
		{ bridgingScore: number; bridgingAtLastEdit?: number; lastEditAt?: number }
	>;
} = { proposals: [], suggestions: {}, myRatings: {}, studentEvalTimes: {}, scores: {} };

vi.mock('../proposals', () => ({
	getDeliberationState: () => delibState,
	isSuggestionKind: (message: MockMessage) =>
		message.agoraMessageKind === undefined ||
		message.agoraMessageKind === AgoraMessageKind.suggestion,
	getOwnerThreads: (proposalId: string) => {
		const threads = new Map<string, MockMessage[]>();
		for (const message of delibState.suggestions[proposalId] ?? []) {
			if (message.agoraMessageKind === AgoraMessageKind.edit) continue;
			const uid = message.agoraThreadUserId ?? message.creatorId;
			threads.set(uid, [...(threads.get(uid) ?? []), message]);
		}

		return threads;
	},
}));

import {
	clearReWeighMemory,
	creditedHelperFor,
	editClock,
	ideaLandedAt,
	latestSuggestionAt,
	noteReWeighed,
	ratingsMovedSince,
	reWeighMoment,
	roundTripClosed,
	scoreMovedMoment,
} from '../improvementSignals';
import type { AgoraProposal } from '../proposals';

const OWNER = 'owner-uid';
const HELPER = 'helper-uid';
const OTHER = 'other-uid';
const PID = 'p1';

function message(overrides: Partial<MockMessage> & { statementId: string }): MockMessage {
	return {
		statement: 'text',
		creatorId: HELPER,
		anonName: 'Swift Fox',
		statementType: 'suggestion',
		parentId: PID,
		createdAt: 1000,
		lastUpdate: 1000,
		...overrides,
	};
}

/** The proposal under discussion, owned by OWNER */
function proposal(lastUpdate = 500): AgoraProposal {
	return {
		statementId: PID,
		statement: 'the proposal',
		creatorId: OWNER,
		anonName: 'Curious Tiger',
		statementType: 'option',
		parentId: 'root',
		createdAt: 100,
		lastUpdate,
	} as AgoraProposal;
}

beforeEach(() => {
	delibState.proposals = [];
	delibState.suggestions = {};
	delibState.myRatings = {};
	delibState.studentEvalTimes = {};
	delibState.scores = {};
	clearReWeighMemory();
});

describe('editClock', () => {
	it('falls back to the statement clock only when there is no score doc', () => {
		expect(editClock(PID, 777)).toBe(777);
	});

	it('reads lastEditAt when the score doc has one', () => {
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 9000 };
		expect(editClock(PID, 777)).toBe(9000);
	});

	it('fails closed on a legacy score doc with no lastEditAt', () => {
		// Falling back to the statement clock here would light every moment on
		// every rating, since the evaluation pipeline bumps lastUpdate
		delibState.scores[PID] = { bridgingScore: 50 };
		expect(editClock(PID, 777)).toBe(0);
	});
});

describe('ratingsMovedSince', () => {
	beforeEach(() => {
		delibState.studentEvalTimes[PID] = [
			{ evaluatorId: OWNER, updatedAt: 5000 },
			{ evaluatorId: HELPER, updatedAt: 5000 },
			{ evaluatorId: OTHER, updatedAt: 1000 },
		];
	});

	it('counts only raters who acted after the mark', () => {
		expect(ratingsMovedSince(PID, 2000, OWNER)).toBe(1);
	});

	it('never counts the excluded student', () => {
		expect(ratingsMovedSince(PID, 0, OWNER)).toBe(2);
	});

	it('is zero for a proposal nobody rated', () => {
		expect(ratingsMovedSince('nothing', 0, OWNER)).toBe(0);
	});
});

describe('latestSuggestionAt / ideaLandedAt', () => {
	it('takes the newest suggestion by createdAt, ignoring other kinds', () => {
		delibState.suggestions[PID] = [
			message({ statementId: 's1', createdAt: 1000 }),
			message({ statementId: 's2', createdAt: 3000 }),
			message({ statementId: 'chat', createdAt: 9000, agoraMessageKind: AgoraMessageKind.chat }),
			message({ statementId: 'theirs', createdAt: 9000, creatorId: OTHER }),
		];
		expect(latestSuggestionAt(PID, HELPER)).toBe(3000);
	});

	it('is zero when this helper never offered anything', () => {
		expect(latestSuggestionAt(PID, HELPER)).toBe(0);
	});

	it('reads the acknowledgment stamp of a thanked idea', () => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 4000,
			}),
		];
		expect(ideaLandedAt(PID, HELPER)).toBe(4000);
	});

	it('ignores an idea the owner has not answered', () => {
		delibState.suggestions[PID] = [message({ statementId: 's1' })];
		expect(ideaLandedAt(PID, HELPER)).toBe(0);
	});
});

describe('reWeighMoment', () => {
	beforeEach(() => {
		delibState.suggestions[PID] = [message({ statementId: 's1', createdAt: 1000 })];
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 2000 };
		delibState.myRatings[PID] = { value: 0.5, updatedAt: 900 };
	});

	it('shows when the owner revised after my idea', () => {
		const moment = reWeighMoment(PID, HELPER, proposal());
		expect(moment).not.toBeNull();
		expect(moment?.editedAt).toBe(2000);
		expect(moment?.neverRated).toBe(false);
		expect(moment?.credited).toBe(false);
	});

	it('stays silent when I never offered anything', () => {
		delibState.suggestions[PID] = [];
		expect(reWeighMoment(PID, HELPER, proposal())).toBeNull();
	});

	it('stays silent when the edit came before my idea', () => {
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 500 };
		expect(reWeighMoment(PID, HELPER, proposal())).toBeNull();
	});

	it('clears once I weigh the new version', () => {
		delibState.myRatings[PID] = { value: 1, updatedAt: 2500 };
		expect(reWeighMoment(PID, HELPER, proposal())).toBeNull();
	});

	it('clears optimistically even when my clock lags the server', () => {
		// The genuine re-rate, stamped by a slow device, lands BEFORE the edit
		noteReWeighed(PID);
		delibState.myRatings[PID] = { value: 1, updatedAt: 1500 };
		expect(reWeighMoment(PID, HELPER, proposal())).toBeNull();
	});

	it('returns when the owner revises again after I answered', () => {
		noteReWeighed(PID);
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 6000 };
		expect(reWeighMoment(PID, HELPER, proposal())).not.toBeNull();
	});

	it('marks neverRated when I have no rating at all', () => {
		delete delibState.myRatings[PID];
		expect(reWeighMoment(PID, HELPER, proposal())?.neverRated).toBe(true);
	});

	it('marks credited only when the acknowledgment preceded the edit', () => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				createdAt: 1000,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1500,
			}),
		];
		expect(reWeighMoment(PID, HELPER, proposal())?.credited).toBe(true);

		delibState.suggestions[PID][0].statusChangedAt = 9000;
		expect(reWeighMoment(PID, HELPER, proposal())?.credited).toBe(false);
	});

	it('never shows in the owner’s own thread', () => {
		expect(reWeighMoment(PID, OWNER, proposal())).toBeNull();
	});
});

describe('creditedHelperFor', () => {
	it('picks the helper acknowledged most recently before the edit', () => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				creatorId: HELPER,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1000,
			}),
			message({
				statementId: 's2',
				creatorId: OTHER,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1800,
			}),
		];
		expect(creditedHelperFor(PID, 2000)).toBe(OTHER);
	});

	it('ignores acknowledgments that came after the edit', () => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's2',
				creatorId: OTHER,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 5000,
			}),
		];
		expect(creditedHelperFor(PID, 2000)).toBeNull();
	});

	it('is deterministic under a tie', () => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				creatorId: 'zeta',
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1000,
			}),
			message({
				statementId: 's2',
				creatorId: 'alpha',
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1000,
			}),
		];
		expect(creditedHelperFor(PID, 2000)).toBe('alpha');
	});
});

describe('scoreMovedMoment', () => {
	beforeEach(() => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1500,
			}),
		];
		delibState.scores[PID] = { bridgingScore: 62, bridgingAtLastEdit: 50, lastEditAt: 2000 };
		delibState.studentEvalTimes[PID] = [
			{ evaluatorId: HELPER, updatedAt: 3000 },
			{ evaluatorId: OTHER, updatedAt: 3000 },
		];
	});

	it('reports the class answer, credited to one helper', () => {
		const moment = scoreMovedMoment(PID, OWNER, HELPER, proposal());
		expect(moment).toEqual({ reRaters: 2, bridgeNow: 62, bridgeDelta: 12, editedAt: 2000 });
	});

	it('stays silent until somebody answers', () => {
		delibState.studentEvalTimes[PID] = [{ evaluatorId: OTHER, updatedAt: 100 }];
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())).toBeNull();
	});

	it('claims the movement in exactly one thread', () => {
		delibState.suggestions[PID].push(
			message({
				statementId: 's2',
				creatorId: OTHER,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1800,
			}),
		);
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())).toBeNull();
		expect(scoreMovedMoment(PID, OWNER, OTHER, proposal())).not.toBeNull();
	});

	it('reports a fall without turning the delta into NaN', () => {
		delibState.scores[PID] = { bridgingScore: 55, bridgingAtLastEdit: 62, lastEditAt: 2000 };
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())?.bridgeDelta).toBe(-7);
	});

	it('shows no delta when the pre-edit baseline is unknown', () => {
		delibState.scores[PID] = { bridgingScore: 55, lastEditAt: 2000 };
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())?.bridgeDelta).toBe(0);
	});

	it('never shows to anyone but the owner', () => {
		expect(scoreMovedMoment(PID, HELPER, OTHER, proposal())).toBeNull();
	});
});

describe('roundTripClosed', () => {
	beforeEach(() => {
		delibState.suggestions[PID] = [
			message({
				statementId: 's1',
				createdAt: 1000,
				suggestionStatus: AgoraSuggestionStatus.thanked,
				statusChangedAt: 1500,
			}),
		];
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 2000 };
	});

	it('closes when the helper weighs the revision, in any direction', () => {
		delibState.myRatings[PID] = { value: -1, updatedAt: 2500 };
		expect(roundTripClosed(PID, HELPER)).toBe(true);
	});

	it('stays open until the new version is weighed', () => {
		delibState.myRatings[PID] = { value: 1, updatedAt: 1200 };
		expect(roundTripClosed(PID, HELPER)).toBe(false);
	});

	it('stays open when the owner never acknowledged the idea', () => {
		delibState.suggestions[PID][0].suggestionStatus = undefined;
		delibState.myRatings[PID] = { value: 1, updatedAt: 2500 };
		expect(roundTripClosed(PID, HELPER)).toBe(false);
	});

	it('stays open when the revision predates the acknowledgment', () => {
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 1200 };
		delibState.myRatings[PID] = { value: 1, updatedAt: 2500 };
		expect(roundTripClosed(PID, HELPER)).toBe(false);
	});
});
