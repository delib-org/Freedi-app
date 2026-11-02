const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockStatements = new Map<string, { evaluationSettings?: { targetPopulation?: number } } | null>();

jest.mock('@/lib/firebase/admin', () => ({
	getFirestoreAdmin: () => ({
		collection: () => ({
			doc: (id: string) => ({
				id,
				get: async () => ({
					exists: mockStatements.get(id) !== null && mockStatements.has(id),
					data: () => mockStatements.get(id),
				}),
			}),
		}),
		batch: () => ({ update: mockBatchUpdate, commit: mockBatchCommit }),
	}),
}));

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { delete: () => 'FIELD_DELETE' },
}));

jest.mock('@/lib/utils/logger', () => ({
	logger: { info: jest.fn(), error: jest.fn() },
}));

import {
	cascadeTargetPopulation,
	decideForQuestion,
	decideForSurvey,
} from '../cascadeTargetPopulation';

const FIELD = 'evaluationSettings.targetPopulation';

function updatesById(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [ref, data] of mockBatchUpdate.mock.calls as [{ id: string }, Record<string, unknown>][]) {
		out[ref.id] = data[FIELD];
	}

	return out;
}

describe('cascadeTargetPopulation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStatements.clear();
	});

	describe('decideForSurvey', () => {
		it('writes when the survey value changes to a number', () => {
			expect(decideForSurvey({ previous: undefined, next: 300 })).toEqual({ kind: 'write', value: 300 });
			expect(decideForSurvey({ previous: 100, next: 300 })).toEqual({ kind: 'write', value: 300 });
		});

		it('deletes when the survey value is cleared', () => {
			expect(decideForSurvey({ previous: 300, next: undefined })).toEqual({ kind: 'delete' });
		});

		it('does nothing when the value is unchanged or never set', () => {
			expect(decideForSurvey({ previous: 300, next: 300 })).toEqual({ kind: 'none' });
			expect(decideForSurvey({ previous: undefined, next: undefined })).toEqual({ kind: 'none' });
		});
	});

	describe('the four rows of the table', () => {
		it('row 1: changed to a number overwrites every question, even a different value', async () => {
			mockStatements.set('a', {});
			mockStatements.set('b', { evaluationSettings: { targetPopulation: 50 } });
			mockStatements.set('c', { evaluationSettings: { targetPopulation: 300 } });

			const result = await cascadeTargetPopulation({
				questionIds: ['a', 'b', 'c'],
				change: { previous: 100, next: 300 },
			});

			expect(updatesById()).toEqual({ a: 300, b: 300 });
			expect(result).toEqual({ updated: 2, skipped: 1 });
		});

		it('row 2: cleared deletes the field only where it equals the previous survey value', async () => {
			mockStatements.set('a', { evaluationSettings: { targetPopulation: 100 } });
			mockStatements.set('b', { evaluationSettings: { targetPopulation: 50 } });
			mockStatements.set('c', {});

			await cascadeTargetPopulation({
				questionIds: ['a', 'b', 'c'],
				change: { previous: 100, next: undefined },
			});

			expect(updatesById()).toEqual({ a: 'FIELD_DELETE' });
		});

		it('row 3: an added question gets N only if it declares none', async () => {
			mockStatements.set('old', { evaluationSettings: { targetPopulation: 100 } });
			mockStatements.set('fresh', {});
			mockStatements.set('declared', { evaluationSettings: { targetPopulation: 7 } });

			await cascadeTargetPopulation({
				questionIds: ['old', 'fresh', 'declared'],
				change: { previous: 100, next: 100 },
				addedQuestionIds: ['fresh', 'declared'],
			});

			expect(updatesById()).toEqual({ fresh: 100 });
		});

		it('row 4: any other save writes nothing, so a per-question change survives', async () => {
			mockStatements.set('a', { evaluationSettings: { targetPopulation: 42 } });
			mockStatements.set('b', {});

			const result = await cascadeTargetPopulation({
				questionIds: ['a', 'b'],
				change: { previous: 100, next: 100 },
			});

			expect(mockBatchUpdate).not.toHaveBeenCalled();
			expect(result).toEqual({ updated: 0, skipped: 2 });
		});
	});

	it('skips questions that no longer exist', async () => {
		mockStatements.set('a', null);

		const result = await cascadeTargetPopulation({
			questionIds: ['a'],
			change: { previous: undefined, next: 10 },
		});

		expect(result).toEqual({ updated: 0, skipped: 1 });
	});

	it('an added question in a save that also changes N is overwritten (row 1 wins)', () => {
		const surveyAction = decideForSurvey({ previous: 100, next: 300 });

		expect(
			decideForQuestion(surveyAction, { previous: 100, next: 300 }, 7, true),
		).toEqual({ kind: 'write', value: 300 });
	});
});
