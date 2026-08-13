import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	AgoraMessageKind,
	AgoraSuggestionStatus,
	agoraRatingBucket,
	emptyDist,
	type AgoraRatingDist,
} from '@freedi/shared-types';

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
		{
			bridgingScore: number;
			bridgingAtLastEdit?: number;
			supportAtLastEdit?: number;
			lastEditAt?: number;
			perCamp?: {
				left: { sum: number; n: number; positiveN: number; studentDist?: AgoraRatingDist };
				right: { sum: number; n: number; positiveN: number; studentDist?: AgoraRatingDist };
				center: { sum: number; n: number; positiveN: number; studentDist?: AgoraRatingDist };
			};
		}
	>;
} = { proposals: [], suggestions: {}, myRatings: {}, studentEvalTimes: {}, scores: {} };

/**
 * A score doc carrying real student ratings, because the class average is
 * counted from the histogram and a doc without one cannot be asked the
 * question. Camp doesn't matter here — the average is over the whole class —
 * so everybody stands in the centre.
 */
function scoreWithRatings(
	ratings: number[],
	rest: {
		bridgingScore?: number;
		bridgingAtLastEdit?: number;
		supportAtLastEdit?: number;
		lastEditAt?: number;
	} = {},
): (typeof delibState)['scores'][string] {
	const studentDist = emptyDist();
	for (const value of ratings) studentDist[agoraRatingBucket(value)] += 1;
	const empty = (): {
		sum: number;
		n: number;
		positiveN: number;
		studentDist: AgoraRatingDist;
	} => ({
		sum: 0,
		n: 0,
		positiveN: 0,
		studentDist: emptyDist(),
	});

	return {
		bridgingScore: 0,
		...rest,
		perCamp: {
			left: empty(),
			right: empty(),
			center: {
				sum: ratings.reduce((total, value) => total + value, 0),
				n: ratings.length,
				positiveN: ratings.filter((value) => value > 0).length,
				studentDist,
			},
		},
	};
}

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
	roundTripAt,
	scoreMovedMoment,
	supportSinceEdit,
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
	it('reads lastEditAt when the score doc has one', () => {
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 9000 };
		expect(editClock(PID)).toBe(9000);
	});

	it('knows of no edit when there is no score doc', () => {
		expect(editClock(PID)).toBe(0);
	});

	it('knows of no edit on a legacy score doc with no lastEditAt', () => {
		delibState.scores[PID] = { bridgingScore: 50 };
		expect(editClock(PID)).toBe(0);
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

	it('stays silent when the statement clock moved but nobody edited', () => {
		// The proposal doc's own lastUpdate is bumped by aggregate writes and by
		// child writes — including the reader's OWN suggestion. Trusting it
		// announced a revision to a helper the moment they finished writing.
		delete delibState.scores[PID];
		expect(reWeighMoment(PID, HELPER, proposal(99999))).toBeNull();
	});

	it('stays silent on a legacy score doc that never stamped an edit', () => {
		delibState.scores[PID] = { bridgingScore: 50 };
		expect(reWeighMoment(PID, HELPER, proposal(99999))).toBeNull();
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
		// Two classmates at +0.5 → mean 0.5 → 75 on the support scale
		delibState.scores[PID] = scoreWithRatings([0.5, 0.5], {
			bridgingScore: 62,
			bridgingAtLastEdit: 50,
			supportAtLastEdit: 60,
			lastEditAt: 2000,
		});
		delibState.studentEvalTimes[PID] = [
			{ evaluatorId: HELPER, updatedAt: 3000 },
			{ evaluatorId: OTHER, updatedAt: 3000 },
		];
	});

	it('reports the class answer, credited to one helper', () => {
		const moment = scoreMovedMoment(PID, OWNER, HELPER, proposal());
		expect(moment).toEqual({
			reRaters: 2,
			support: { now: 75, delta: 15 },
			bridgeNow: 62,
			bridgeDelta: 12,
			editedAt: 2000,
		});
	});

	/**
	 * The bug this whole pair of baselines exists for: bridging is blended and
	 * damped, so a real change of mind can leave it exactly where it was — and
	 * the author used to be told "it has not moved yet".
	 */
	it('reports the average moving even when bridge power sits still', () => {
		delibState.scores[PID] = scoreWithRatings([1, 1], {
			bridgingScore: 62,
			bridgingAtLastEdit: 62,
			supportAtLastEdit: 75,
			lastEditAt: 2000,
		});
		const moment = scoreMovedMoment(PID, OWNER, HELPER, proposal());
		expect(moment?.bridgeDelta).toBe(0);
		expect(moment?.support).toEqual({ now: 100, delta: 25 });
	});

	it('says where the class stands when there was nothing to move from', () => {
		delibState.scores[PID] = scoreWithRatings([0.5, 0.5], {
			bridgingScore: 62,
			bridgingAtLastEdit: 50,
			lastEditAt: 2000,
		});
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())?.support).toEqual({
			now: 75,
			delta: undefined,
		});
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
		delibState.scores[PID] = scoreWithRatings([-0.5], {
			bridgingScore: 55,
			bridgingAtLastEdit: 62,
			supportAtLastEdit: 60,
			lastEditAt: 2000,
		});
		const moment = scoreMovedMoment(PID, OWNER, HELPER, proposal());
		expect(moment?.bridgeDelta).toBe(-7);
		expect(moment?.support).toEqual({ now: 25, delta: -35 });
	});

	it('shows no delta when the pre-edit baseline is unknown', () => {
		delibState.scores[PID] = scoreWithRatings([0], { bridgingScore: 55, lastEditAt: 2000 });
		expect(scoreMovedMoment(PID, OWNER, HELPER, proposal())?.bridgeDelta).toBe(0);
	});

	it('never shows to anyone but the owner', () => {
		expect(scoreMovedMoment(PID, HELPER, OTHER, proposal())).toBeNull();
	});
});

describe('supportSinceEdit', () => {
	it('reads the class average and how far it travelled', () => {
		delibState.scores[PID] = scoreWithRatings([1, 0, 0.5], { supportAtLastEdit: 50 });
		// mean = 0.5 → 75
		expect(supportSinceEdit(PID)).toEqual({ now: 75, delta: 25 });
	});

	it('counts a fall as a fall', () => {
		delibState.scores[PID] = scoreWithRatings([-1, -1], { supportAtLastEdit: 50 });
		expect(supportSinceEdit(PID)).toEqual({ now: 0, delta: -50 });
	});

	/**
	 * Zero on this scale is "unanimously against", so an absent baseline can
	 * never be reported as a move of zero — the two would be indistinguishable.
	 */
	it('separates "did not move" from "nothing to move from"', () => {
		delibState.scores[PID] = scoreWithRatings([0.5, 0.5], { supportAtLastEdit: 75 });
		expect(supportSinceEdit(PID)).toEqual({ now: 75, delta: 0 });

		delibState.scores[PID] = scoreWithRatings([0.5, 0.5]);
		expect(supportSinceEdit(PID)).toEqual({ now: 75, delta: undefined });
	});

	it('says nothing at all before the class has rated', () => {
		delibState.scores[PID] = scoreWithRatings([], { supportAtLastEdit: 60 });
		expect(supportSinceEdit(PID)).toEqual({ now: undefined, delta: undefined });
	});

	it('survives a proposal with no score doc yet', () => {
		expect(supportSinceEdit('nobody')).toEqual({ now: undefined, delta: undefined });
	});
});

describe('roundTripAt', () => {
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

	it('dates the circle by when the helper weighed the revision', () => {
		delibState.studentEvalTimes[PID] = [{ evaluatorId: HELPER, updatedAt: 2500 }];
		expect(roundTripAt(PID, HELPER)).toBe(2500);
	});

	it('closes in any direction — a down-vote closes it too', () => {
		delibState.studentEvalTimes[PID] = [{ evaluatorId: HELPER, updatedAt: 2500 }];
		delibState.myRatings[PID] = { value: -1, updatedAt: 2500 };
		expect(roundTripAt(PID, HELPER)).toBe(2500);
	});

	it('reads the helper, never some other classmate', () => {
		delibState.studentEvalTimes[PID] = [{ evaluatorId: OTHER, updatedAt: 2500 }];
		expect(roundTripAt(PID, HELPER)).toBe(0);
	});

	it('stays open until the new version is weighed', () => {
		delibState.studentEvalTimes[PID] = [{ evaluatorId: HELPER, updatedAt: 1200 }];
		expect(roundTripAt(PID, HELPER)).toBe(0);
	});

	it('stays open when the owner never acknowledged the idea', () => {
		delibState.suggestions[PID][0].suggestionStatus = undefined;
		delibState.studentEvalTimes[PID] = [{ evaluatorId: HELPER, updatedAt: 2500 }];
		expect(roundTripAt(PID, HELPER)).toBe(0);
	});

	it('stays open when the revision predates the acknowledgment', () => {
		delibState.scores[PID] = { bridgingScore: 50, lastEditAt: 1200 };
		delibState.studentEvalTimes[PID] = [{ evaluatorId: HELPER, updatedAt: 2500 }];
		expect(roundTripAt(PID, HELPER)).toBe(0);
	});

	it('dates it optimistically for the beat before the snapshot returns', () => {
		noteReWeighed(PID, 4242);
		expect(roundTripAt(PID, HELPER)).toBe(4242);
	});
});
