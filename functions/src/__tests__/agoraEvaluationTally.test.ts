import { describe, it, expect, jest } from '@jest/globals';
import { AgoraCamp } from '@freedi/shared-types';

// The trigger module imports ../db, which calls getFirestore on an
// uninitialized app. tallyEvaluations is pure — it never touches the database.
jest.mock('../db', () => ({ db: {} }));

import { tallyEvaluations } from '../agora/fn_onAgoraEvaluation';

const ROYALIST_AI = 'agora-ai--char-royalist--1';

const camps = (entries: Record<string, AgoraCamp>): Map<string, AgoraCamp> =>
	new Map(Object.entries(entries));

describe('agora tallyEvaluations', () => {
	it('files a positioned rater into their own camp, twice over', () => {
		const perCamp = tallyEvaluations(
			[{ evaluatorId: 'rina', value: 1 }],
			camps({ rina: AgoraCamp.right }),
		);

		// The bridging half...
		expect(perCamp.right).toMatchObject({ sum: 1, n: 1, positiveN: 1 });
		// ...and the histogram half the class consensus reads
		expect(perCamp.right.studentDist).toEqual([0, 0, 0, 0, 1]);
		expect(perCamp.left).toMatchObject({ sum: 0, n: 0, positiveN: 0 });
	});

	it('hears a rater with no camp, without letting them speak for one', () => {
		const perCamp = tallyEvaluations([{ evaluatorId: 'nobody', value: 1 }], camps({}));

		// Counted, so the class consensus is not silently missing a classmate
		expect(perCamp.center.studentDist).toEqual([0, 0, 0, 0, 1]);
		// ...but never as support that reached across camps nobody can locate
		expect(perCamp.center).toMatchObject({ sum: 0, n: 0, positiveN: 0 });
	});

	/**
	 * The bug this whole recount exists for: a student who rated before placing
	 * themselves on the scale was dropped from the bridging half, and the running
	 * delta could never take them back (an edit carries n = 0). The author read
	 * "bridge power still 0 — it hasn't moved yet" while the class was voting
	 * them up. Counting from the evaluations means the camp arriving late is
	 * enough — the rating does not have to happen again.
	 */
	it('takes back a rating the moment the rater has a camp — no re-rate needed', () => {
		const rated = [{ evaluatorId: 'late', value: 1 }];

		expect(tallyEvaluations(rated, camps({})).right.n).toBe(0);
		expect(tallyEvaluations(rated, camps({ late: AgoraCamp.right }))).toMatchObject({
			right: { sum: 1, n: 1, positiveN: 1 },
		});
	});

	it('lets the characters weigh in on bridging but never on the class histogram', () => {
		const perCamp = tallyEvaluations(
			[{ evaluatorId: ROYALIST_AI, value: -0.34 }],
			camps({ [ROYALIST_AI]: AgoraCamp.left }),
		);

		expect(perCamp.left).toMatchObject({ sum: -0.34, n: 1, positiveN: 0 });
		// Off-grid values from raters who are not in the class
		expect(perCamp.left.studentDist).toEqual([0, 0, 0, 0, 0]);
	});

	it('counts an against vote as a rater, never as support', () => {
		const perCamp = tallyEvaluations(
			[
				{ evaluatorId: 'amir', value: -1 },
				{ evaluatorId: 'dana', value: 0 },
			],
			camps({ amir: AgoraCamp.left, dana: AgoraCamp.left }),
		);

		expect(perCamp.left).toMatchObject({ sum: -1, n: 2, positiveN: 0 });
		expect(perCamp.left.studentDist).toEqual([1, 0, 1, 0, 0]);
	});

	it('is the same tally however many times the trigger is delivered', () => {
		const rated = [{ evaluatorId: 'rina', value: 0.5 }];
		const campOf = camps({ rina: AgoraCamp.center });

		expect(tallyEvaluations(rated, campOf)).toEqual(tallyEvaluations(rated, campOf));
	});
});
