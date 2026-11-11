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
	isQuestionResultsOff,
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
	['author', 0, false, false],
	['author', 0, true, true],
	['author', 1, false, false],
	['author', 1, true, true],
	['author', 2, false, false],
	['author', 2, true, true],
	['author', 3, false, true],
	['author', 3, true, true],
	['host', 0, false, false],
	['host', 0, true, true],
	['host', 1, false, false],
	['host', 1, true, true],
	['host', 2, false, false],
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

	it.each(['author', 'host', 'rated', 'unrated'] as const)(
		'opens for %s when the deadline passed, whatever the switch says',
		(viewer) => {
			expect(canSeeScore({ ...input(viewer, 1, false), isDeadlinePassed: true })).toBe(true);
		},
	);

	it('lets nothing open results that are off, not even a closed rating', () => {
		expect(canSeeScore({ ...input('host', 1, false), ratingClosed: true })).toBe(false);
		expect(canSeeScore({ ...input('author', 1, false), ratingClosed: true })).toBe(false);
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

	it('reports results off to hosts and authors the same way', () => {
		expect(getScoreAccess(input('host', 1, false))).toBe('hidden-by-host');
		expect(getScoreAccess(input('author', 1, false))).toBe('hidden-by-host');
	});

	it('keeps a settled question readable with the switch off', () => {
		expect(getScoreAccess(input('host', 3, false))).toBe('visible');
		expect(getScoreAccess({ ...input('unrated', 1, false), isDeadlinePassed: true })).toBe(
			'visible',
		);
	});

	it('is visible once the viewer may see scores', () => {
		expect(getScoreAccess(input('rated', 1, true))).toBe('visible');
		expect(getScoreAccess(input('host', 1, true))).toBe('visible');
	});
});

describe('shouldHintScoreReveal', () => {
	it('promises a reveal only when rating would give one', () => {
		expect(shouldHintScoreReveal(input('unrated', 1, true))).toBe(true);
		expect(shouldHintScoreReveal(input('unrated', 1, false))).toBe(false);
		expect(shouldHintScoreReveal(input('rated', 1, true))).toBe(false);
		expect(shouldHintScoreReveal(input('host', 1, true))).toBe(false);
		expect(shouldHintScoreReveal(input('host', 1, false))).toBe(false);
		expect(shouldHintScoreReveal(input('author', 1, false))).toBe(false);
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

	it('opens at Decided and after the deadline, with the switch off', () => {
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
	});

	it('opens for a host only while results are on', () => {
		const step = { currentStep: QuestionStep.randomEvaluation };
		const off = question(step);
		const on = {
			questionSettings: step,
			statementSettings: { showEvaluation: true },
		} as unknown as Statement;

		expect(canSeeSettledResults(off, true, NOW)).toBe(false);
		expect(canSeeSettledResults(on, true, NOW)).toBe(true);
	});
});

describe('isQuestionResultsOff', () => {
	const NOW = 1000;
	const build = (showEvaluation: boolean, questionSettings: object) =>
		({ questionSettings, statementSettings: { showEvaluation } }) as unknown as Statement;
	const step = QuestionStep.randomEvaluation;

	it('is true with the switch off on an open question, and on an unknown one', () => {
		expect(isQuestionResultsOff(build(false, { currentStep: step }), NOW)).toBe(true);
		expect(isQuestionResultsOff(undefined, NOW)).toBe(true);
	});

	it('is false with the switch on', () => {
		expect(isQuestionResultsOff(build(true, { currentStep: step }), NOW)).toBe(false);
	});

	it('is false once the question is settled', () => {
		const finished = build(false, { currentStep: QuestionStep.finished });
		const expired = build(false, { currentStep: step, deadline: NOW - 1 });

		expect(isQuestionResultsOff(finished, NOW)).toBe(false);
		expect(isQuestionResultsOff(expired, NOW)).toBe(false);
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

	it('hides tallies from a host and a voter while results are off', () => {
		const off = { ...facts, showLiveResults: false };

		expect(canSeeVoteTallies({ ...off, isHost: true }, false)).toBe(false);
		expect(canSeeVoteTallies({ ...off, isHost: true }, true)).toBe(false);
		expect(canSeeVoteTallies(off, true)).toBe(false);
	});

	it('shows tallies to anyone once the question is settled, with the switch off', () => {
		const off = { ...facts, showLiveResults: false };

		expect(canSeeVoteTallies({ ...off, stage: 3 }, false)).toBe(true);
		expect(canSeeVoteTallies({ ...off, isDeadlinePassed: true }, false)).toBe(true);
	});

	it('keeps showing tallies to a host while results are on', () => {
		expect(canSeeVoteTallies({ ...facts, isHost: true }, false)).toBe(true);
	});
});

describe('guardScoreSort', () => {
	it.each(['author', 'host', 'rated', 'unrated'] as const)(
		'falls back for %s when results are off, and keeps the order once settled',
		(viewer) => {
			const off = canSeeScore(input(viewer, 1, false));
			const settled = canSeeScore(input(viewer, 3, false));

			expect(guardScoreSort(SortType.accepted, off)).toBe(SortType.newest);
			expect(guardScoreSort(SortType.accepted, settled)).toBe(SortType.accepted);
		},
	);

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
