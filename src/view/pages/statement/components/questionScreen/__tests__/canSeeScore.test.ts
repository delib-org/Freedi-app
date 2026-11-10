import { QuestionStep, SortType, Statement } from '@freedi/shared-types';
import { QuestionStageIndex } from '@/helpers/questionStage';
import {
	canSeeQuestionScores,
	canSeeScore,
	CanSeeScoreInput,
	canSeeSettledResults,
	canSeeVoteTallies,
	getScoreAccess,
	guardScoreSort,
	hasRatedForScore,
	isOwnAnswerOf,
	QuestionScoreData,
	questionScoreFacts,
	shouldHintScoreReveal,
} from '../canSeeScore';

type Viewer = 'author' | 'host' | 'rated' | 'unrated';

const VIEWERS: Readonly<Record<Viewer, Partial<CanSeeScoreInput>>> = {
	author: { isOwnAnswer: true },
	host: { isHost: true },
	rated: { hasRated: true },
	unrated: {},
};

function input(
	viewer: Viewer,
	stage: QuestionStageIndex,
	showLiveResults: boolean,
): CanSeeScoreInput {
	return {
		isHost: false,
		isOwnAnswer: false,
		hasRated: false,
		ratingClosed: false,
		isDeadlinePassed: false,
		stage,
		showLiveResults,
		...VIEWERS[viewer],
	};
}

/** Viewer × stage × live results, with the answer the owner's rule requires. */
const MATRIX: ReadonlyArray<readonly [Viewer, QuestionStageIndex, boolean, boolean]> = [
	['author', 0, false, true],
	['author', 0, true, true],
	['author', 1, false, true],
	['author', 1, true, true],
	['author', 2, false, true],
	['author', 2, true, true],
	['author', 3, false, true],
	['author', 3, true, true],
	['host', 0, false, true],
	['host', 0, true, true],
	['host', 1, false, true],
	['host', 1, true, true],
	['host', 2, false, true],
	['host', 2, true, true],
	['host', 3, false, true],
	['host', 3, true, true],
	['rated', 0, false, false],
	['rated', 0, true, true],
	['rated', 1, false, false],
	['rated', 1, true, true],
	['rated', 2, false, false],
	['rated', 2, true, true],
	['rated', 3, false, true],
	['rated', 3, true, true],
	['unrated', 0, false, false],
	['unrated', 0, true, false],
	['unrated', 1, false, false],
	['unrated', 1, true, false],
	['unrated', 2, false, false],
	['unrated', 2, true, false],
	['unrated', 3, false, true],
	['unrated', 3, true, true],
];

describe('canSeeScore', () => {
	it.each(MATRIX)('%s at stage %i, live results %s: %s', (viewer, stage, live, expected) => {
		expect(canSeeScore(input(viewer, stage, live))).toBe(expected);
	});

	it('opens for a participant who cannot rate, while results are on', () => {
		expect(canSeeScore({ ...input('unrated', 1, true), ratingClosed: true })).toBe(true);
	});

	it('keeps results off for a participant who cannot rate, when the host hid them', () => {
		expect(canSeeScore({ ...input('unrated', 1, false), ratingClosed: true })).toBe(false);
	});

	it('opens when the deadline passed, whatever the switch says', () => {
		expect(canSeeScore({ ...input('unrated', 1, false), isDeadlinePassed: true })).toBe(true);
	});
});

describe('getScoreAccess', () => {
	it('asks an unrated viewer to rate first while results are on, in every open stage', () => {
		expect(getScoreAccess(input('unrated', 0, true))).toBe('rate-first');
		expect(getScoreAccess(input('unrated', 1, true))).toBe('rate-first');
		expect(getScoreAccess(input('unrated', 2, true))).toBe('rate-first');
	});

	it('says hidden by the host when the switch is off', () => {
		expect(getScoreAccess(input('rated', 1, false))).toBe('hidden-by-host');
	});

	it('is visible once the viewer may see scores', () => {
		expect(getScoreAccess(input('rated', 1, true))).toBe('visible');
		expect(getScoreAccess(input('host', 1, false))).toBe('visible');
	});
});

describe('shouldHintScoreReveal', () => {
	it('promises a reveal only when rating would give one', () => {
		expect(shouldHintScoreReveal(input('unrated', 1, true))).toBe(true);
		expect(shouldHintScoreReveal(input('unrated', 1, false))).toBe(false);
		expect(shouldHintScoreReveal(input('rated', 1, true))).toBe(false);
		expect(shouldHintScoreReveal(input('host', 1, true))).toBe(false);
	});
});

describe('canSeeQuestionScores', () => {
	const data: QuestionScoreData = {
		isHost: false,
		stage: 1,
		showLiveResults: true,
		isDeadlinePassed: false,
		canRate: true,
		ratedCount: 0,
		rateableCount: 3,
		answersComplete: true,
		hasVoted: false,
	};

	it('stays closed until the viewer has rated something', () => {
		expect(canSeeQuestionScores(data)).toBe(false);
		expect(canSeeQuestionScores({ ...data, ratedCount: 1 })).toBe(true);
	});

	it('counts a vote as taking part', () => {
		expect(canSeeQuestionScores({ ...data, hasVoted: true })).toBe(true);
	});

	it('does not lock a viewer out when there is nothing for them to rate', () => {
		expect(canSeeQuestionScores({ ...data, rateableCount: 0 })).toBe(true);
		expect(canSeeQuestionScores({ ...data, canRate: false })).toBe(true);
	});

	it('does not treat a partly loaded list as nothing to rate', () => {
		expect(
			questionScoreFacts({ ...data, rateableCount: 0, answersComplete: false }).ratingClosed,
		).toBe(false);
	});
});

describe('canSeeSettledResults', () => {
	const question = (questionSettings: object) => ({ questionSettings }) as unknown as Statement;
	const NOW = 1000;

	it('stays closed while the question is open, even with live results on', () => {
		const live = {
			questionSettings: { currentStep: QuestionStep.randomEvaluation },
			statementSettings: { showEvaluation: true },
		} as unknown as Statement;

		expect(canSeeSettledResults(live, false, NOW)).toBe(false);
	});

	it('opens at Decided, after the deadline, and for a host', () => {
		const open = question({ currentStep: QuestionStep.randomEvaluation });

		expect(canSeeSettledResults(question({ currentStep: QuestionStep.finished }), false, NOW)).toBe(
			true,
		);
		expect(
			canSeeSettledResults(
				question({ currentStep: QuestionStep.randomEvaluation, deadline: NOW - 1 }),
				false,
				NOW,
			),
		).toBe(true);
		expect(canSeeSettledResults(open, true, NOW)).toBe(true);
	});
});

describe('canSeeVoteTallies', () => {
	const facts = {
		isHost: false,
		stage: 2 as QuestionStageIndex,
		showLiveResults: true,
		isDeadlinePassed: false,
		ratingClosed: false,
	};

	it('hides tallies until the person has voted', () => {
		expect(canSeeVoteTallies(facts, false)).toBe(false);
		expect(canSeeVoteTallies(facts, true)).toBe(true);
	});

	it('respects the live results switch, even after voting', () => {
		expect(canSeeVoteTallies({ ...facts, showLiveResults: false }, true)).toBe(false);
	});

	it('keeps showing tallies to a host', () => {
		expect(canSeeVoteTallies({ ...facts, isHost: true, showLiveResults: false }, false)).toBe(true);
	});
});

describe('guardScoreSort', () => {
	it('falls back to newest for a viewer who may not see the score order', () => {
		expect(guardScoreSort(SortType.accepted, false)).toBe(SortType.newest);
		expect(guardScoreSort(SortType.averageEvaluation, false)).toBe(SortType.newest);
	});

	it('keeps a score order for a viewer who may see it, and other orders for anyone', () => {
		expect(guardScoreSort(SortType.accepted, true)).toBe(SortType.accepted);
		expect(guardScoreSort(SortType.random, false)).toBe(SortType.random);
	});
});

describe('hasRatedForScore', () => {
	const base = {
		evaluationType: undefined,
		enhancedEvaluation: undefined,
		myEvaluation: undefined,
		likesInQuestion: 0,
	};

	it('counts a neutral face as a rating on the range scale', () => {
		expect(hasRatedForScore({ ...base, evaluationType: 'range', myEvaluation: 0 })).toBe(true);
		expect(hasRatedForScore({ ...base, enhancedEvaluation: true, myEvaluation: 0 })).toBe(true);
	});

	it('does not count a cleared rating on the two-face card', () => {
		expect(hasRatedForScore({ ...base, evaluationType: 'like-dislike', myEvaluation: 0 })).toBe(
			false,
		);
		expect(hasRatedForScore({ ...base, evaluationType: 'like-dislike', myEvaluation: 1 })).toBe(
			true,
		);
	});

	it('opens single-like counts after any like in the question', () => {
		expect(hasRatedForScore({ ...base, evaluationType: 'single-like', likesInQuestion: 1 })).toBe(
			true,
		);
		expect(hasRatedForScore({ ...base, evaluationType: 'single-like', myEvaluation: 1 })).toBe(
			false,
		);
	});
});

describe('isOwnAnswerOf', () => {
	it('matches the creator by id or by the creator object', () => {
		expect(isOwnAnswerOf({ creatorId: 'u1', creator: undefined }, 'u1')).toBe(true);
		expect(isOwnAnswerOf({ creatorId: 'x', creator: { uid: 'u1' } } as never, 'u1')).toBe(true);
		expect(isOwnAnswerOf({ creatorId: 'x', creator: undefined }, 'u1')).toBe(false);
		expect(isOwnAnswerOf({ creatorId: 'x', creator: undefined }, undefined)).toBe(false);
	});
});
