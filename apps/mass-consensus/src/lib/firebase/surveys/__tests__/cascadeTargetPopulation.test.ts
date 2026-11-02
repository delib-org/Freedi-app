type Doc = Record<string, unknown>;

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
/** "collection/id" -> document data; a missing key is a missing document. */
const store = new Map<string, Doc>();
const reads: string[] = [];

function snapOf(key: string): { exists: boolean; data: () => Doc | undefined } {
	reads.push(key);

	return { exists: store.has(key), data: () => store.get(key) };
}

jest.mock('@/lib/firebase/admin', () => ({
	getFirestoreAdmin: () => ({
		collection: (name: string) => ({
			doc: (id: string) => ({ id, get: async () => snapOf(`${name}/${id}`) }),
			where: (_field: string, _op: string, surveyId: string) => ({
				limit: () => ({
					get: async () => {
						reads.push(`${name}?surveyId=${surveyId}`);

						return {
							docs: [...store.entries()]
								.filter(([key, d]) => key.startsWith(`${name}/`) && d.surveyId === surveyId)
								.map(([, d]) => ({ data: () => d })),
						};
					},
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
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@/lib/utils/logger';
import {
	cascadeTargetPopulation,
	decideForQuestion,
	decideForSurvey,
} from '../cascadeTargetPopulation';

const FIELD = 'evaluationSettings.targetPopulation';
const SURVEY = { surveyId: 's1', creatorId: 'owner' };

/** A question the survey owner created, so the owner administers it. */
function question(id: string, extra: Doc = {}, creatorId = 'owner'): void {
	store.set(`statements/${id}`, { statementId: id, creatorId, topParentId: 'top', ...extra });
}

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
		store.clear();
		reads.length = 0;
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
			question('a');
			question('b', { evaluationSettings: { targetPopulation: 50 } });
			question('c', { evaluationSettings: { targetPopulation: 300 } });

			const result = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['a', 'b', 'c'],
				change: { previous: 100, next: 300 },
			});

			expect(updatesById()).toEqual({ a: 300, b: 300 });
			expect(result).toEqual({ updated: 2, skipped: 1, refused: 0 });
		});

		it('row 2: cleared deletes the field only where it equals the previous survey value', async () => {
			question('a', { evaluationSettings: { targetPopulation: 100 } });
			question('b', { evaluationSettings: { targetPopulation: 50 } });
			question('c');

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['a', 'b', 'c'],
				change: { previous: 100, next: undefined },
			});

			expect(updatesById()).toEqual({ a: 'FIELD_DELETE' });
		});

		it('row 3: an added question gets N only if it declares none', async () => {
			question('old', { evaluationSettings: { targetPopulation: 100 } });
			question('fresh');
			question('declared', { evaluationSettings: { targetPopulation: 7 } });

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['old', 'fresh', 'declared'],
				change: { previous: 100, next: 100 },
				addedQuestionIds: ['fresh', 'declared'],
			});

			expect(updatesById()).toEqual({ fresh: 100 });
		});

		it('row 4: any other save writes nothing, so a per-question change survives', async () => {
			question('a', { evaluationSettings: { targetPopulation: 42 } });
			question('b');

			const result = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['a', 'b'],
				change: { previous: 100, next: 100 },
			});

			expect(mockBatchUpdate).not.toHaveBeenCalled();
			expect(result).toEqual({ updated: 0, skipped: 2, refused: 0 });
		});
	});

	describe('only questions the people running the survey administer', () => {
		it('a question nobody on the roster administers is left untouched by set, clear and add', async () => {
			question('mine');
			question('theirs', { evaluationSettings: { targetPopulation: 100 } }, 'stranger');

			const set = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['mine', 'theirs'],
				change: { previous: undefined, next: 300 },
			});
			expect(updatesById()).toEqual({ mine: 300 });
			expect(set.refused).toBe(1);

			mockBatchUpdate.mockClear();
			const clear = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['mine', 'theirs'],
				change: { previous: 100, next: undefined },
			});
			expect(Object.keys(updatesById())).not.toContain('theirs');
			expect(clear.refused).toBe(1);

			mockBatchUpdate.mockClear();
			store.set('statements/theirs', { statementId: 'theirs', creatorId: 'stranger', topParentId: 'top' });
			const add = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['theirs'],
				change: { previous: 100, next: 100 },
				addedQuestionIds: ['theirs'],
			});
			expect(mockBatchUpdate).not.toHaveBeenCalled();
			expect(add.refused).toBe(1);
		});

		it('logs each refusal with context and never throws for it', async () => {
			question('theirs', {}, 'stranger');

			await expect(
				cascadeTargetPopulation({
					survey: SURVEY,
					questionIds: ['theirs'],
					change: { previous: undefined, next: 5 },
				}),
			).resolves.toMatchObject({ refused: 1 });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ surveyId: 's1', statementId: 'theirs' }),
			);
		});

		it('the owner writes to a question they administer by an admin subscription on its group', async () => {
			question('q', {}, 'someone-else');
			store.set('statements/q', { statementId: 'q', creatorId: 'someone-else', topParentId: 'group' });
			store.set('statementsSubscribe/owner--group', { role: 'admin' });

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['q'],
				change: { previous: undefined, next: 9 },
			});

			expect(updatesById()).toEqual({ q: 9 });
		});

		it("an editor co-admin's edit works when the owner (or the editor) really administers the question", async () => {
			// the question belongs to the editor, not the owner: the roster covers both
			question('q', {}, 'editor');
			store.set('surveyAdmins/s1--editor', { surveyId: 's1', userId: 'editor', role: 'admin-edit' });

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['q'],
				change: { previous: undefined, next: 12 },
			});

			expect(updatesById()).toEqual({ q: 12 });
		});

		it('a viewer co-admin does not count as part of the roster', async () => {
			question('q', {}, 'viewer');
			store.set('surveyAdmins/s1--viewer', { surveyId: 's1', userId: 'viewer', role: 'admin-viewer' });

			const result = await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['q'],
				change: { previous: undefined, next: 12 },
			});

			expect(mockBatchUpdate).not.toHaveBeenCalled();
			expect(result.refused).toBe(1);
		});

		it('an organization admin of the question counts, like the functions check', async () => {
			question('q', { organizationId: 'org1' }, 'someone-else');
			store.set('organizationMembers/org1--owner', { role: 'admin' });

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['q'],
				change: { previous: undefined, next: 4 },
			});

			expect(updatesById()).toEqual({ q: 4 });
		});

		it('reads nothing about the roster when nothing would be written', async () => {
			question('a', { evaluationSettings: { targetPopulation: 42 } });

			await cascadeTargetPopulation({
				survey: SURVEY,
				questionIds: ['a'],
				change: { previous: 100, next: 100 },
			});

			expect(reads.filter((r) => !r.startsWith('statements/'))).toEqual([]);
		});
	});

	it('adds evaluationUI where the map lacks it, so the Statement schema still parses', async () => {
		question('bare');
		question('withUi', { evaluationSettings: { evaluationUI: 'voting' } });

		await cascadeTargetPopulation({
			survey: SURVEY,
			questionIds: ['bare', 'withUi'],
			change: { previous: undefined, next: 50 },
		});

		const updates = Object.fromEntries(
			(mockBatchUpdate.mock.calls as [{ id: string }, Record<string, unknown>][]).map(([ref, d]) => [ref.id, d]),
		);
		expect(updates.bare['evaluationSettings.evaluationUI']).toBe('suggestions');
		expect(updates.withUi).not.toHaveProperty('evaluationSettings.evaluationUI');
	});

	it('skips questions that no longer exist', async () => {
		const result = await cascadeTargetPopulation({
			survey: SURVEY,
			questionIds: ['gone'],
			change: { previous: undefined, next: 10 },
		});

		expect(result).toEqual({ updated: 0, skipped: 1, refused: 0 });
	});

	it('an added question in a save that also changes N is overwritten (row 1 wins)', () => {
		const surveyAction = decideForSurvey({ previous: 100, next: 300 });

		expect(decideForQuestion(surveyAction, { previous: 100, next: 300 }, 7, true)).toEqual({
			kind: 'write',
			value: 300,
		});
	});
});
