import { Collections, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../progress/__tests__/fakeDb';

let fake: FakeDb;

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { increment: (n: number) => ({ _increment: n }) },
	FieldPath: { documentId: () => '__name__' },
}));

import {
	BackfillRun,
	COUNTERS_BEGAN_AT,
	QuestionBackfillResult,
	runQuestionProgressBackfill,
} from '../questionProgressBackfill';
import { clearProgressCache } from '../../progress/questionProgressWriter';

const OLD = COUNTERS_BEGAN_AT - 1000;
const NEW = COUNTERS_BEGAN_AT + 1000;

function seedQuestion(statementId: string, createdAt = OLD, fields: object = {}): void {
	fake.seed(Collections.statements, statementId, {
		statementId,
		statementType: StatementType.question,
		topParentId: statementId,
		createdAt,
		lastUpdate: createdAt,
		...fields,
	});
}

function seedAnswer(statementId: string, parentId: string, creatorId: string): void {
	fake.seed(Collections.statements, statementId, {
		statementId,
		parentId,
		creatorId,
		statementType: StatementType.option,
	});
}

function seedRating(parentId: string, uid: string): void {
	fake.seed(Collections.evaluations, `${uid}--${parentId}`, {
		parentId,
		evaluatorId: uid,
		evaluator: { uid },
	});
}

function seedView(statementId: string, userId: string): void {
	fake.seed(Collections.statementViews, `${userId}--${statementId}`, { statementId, userId });
}

/** q1: two answers by a, rated by b and c, opened by d. */
function seedOldActivity(): void {
	seedQuestion('q1');
	seedAnswer('a1', 'q1', 'a');
	seedAnswer('a2', 'q1', 'a');
	seedRating('q1', 'b');
	seedRating('q1', 'c');
	seedView('q1', 'd');
}

function runOf(overrides: Partial<BackfillRun> = {}): BackfillRun & {
	results: QuestionBackfillResult[];
	done: string[];
} {
	const results: QuestionBackfillResult[] = [];
	const done: string[] = [];

	return {
		before: COUNTERS_BEGAN_AT,
		execute: true,
		isDone: (id) => done.includes(id),
		markDone: (id) => done.push(id),
		report: (result) => results.push(result),
		results,
		done,
		...overrides,
	};
}

const progressOf = (id: string) => fake.read(Collections.questionProgress, id);
const docCount = (collection: string) => fake.store.get(collection)?.size ?? 0;

describe('runQuestionProgressBackfill', () => {
	beforeEach(() => {
		fake = createFakeDb();
		clearProgressCache();
	});

	it('writes nothing on a dry run but reports what it would add', async () => {
		seedOldActivity();
		const run = runOf({ execute: false });

		const totals = await runQuestionProgressBackfill(run);

		expect(totals).toMatchObject({ processed: 1, changed: 1, failed: 0 });
		expect(run.results[0].added).toEqual({ entered: 1, suggested: 1, evaluated: 2 });
		expect(run.results[0].options).toEqual({ from: 0, to: 2 });
		expect(progressOf('q1')).toBeUndefined();
		expect(docCount(Collections.questionParticipation)).toBe(0);
		expect(run.done).toEqual([]);
	});

	it('builds a complete counters document for an old question', async () => {
		seedOldActivity();

		await runQuestionProgressBackfill(runOf());

		expect(progressOf('q1')).toMatchObject({
			statementId: 'q1',
			topParentId: 'q1',
			entered: 1,
			suggested: 1,
			evaluated: 2,
			options: 2,
			evaluations: 2,
			lastActivity: OLD,
		});
		expect(fake.read(Collections.questionParticipation, 'q1--b')).toEqual({
			statementId: 'q1',
			userId: 'b',
			evaluated: true,
		});
	});

	it('changes nothing on a second run', async () => {
		seedOldActivity();
		await runQuestionProgressBackfill(runOf());
		const before = { ...progressOf('q1') };

		const rerun = runOf();
		const totals = await runQuestionProgressBackfill(rerun);

		expect(totals).toMatchObject({ processed: 1, changed: 0 });
		expect(progressOf('q1')).toEqual(before);
	});

	it('adds to live counters instead of overwriting them', async () => {
		seedOldActivity();
		fake.seed(Collections.questionProgress, 'q1', {
			statementId: 'q1',
			topParentId: 'q1',
			entered: 7,
			suggested: 0,
			evaluated: 1,
			options: 9,
			evaluations: 11,
			lastActivity: NEW,
			lastUpdate: NEW,
		});
		fake.seed(Collections.questionParticipation, 'q1--b', {
			statementId: 'q1',
			userId: 'b',
			evaluated: true,
		});

		await runQuestionProgressBackfill(runOf());

		expect(progressOf('q1')).toMatchObject({
			entered: 8,
			suggested: 1,
			evaluated: 2,
			options: 9,
			evaluations: 11,
			lastActivity: NEW,
		});
	});

	it('counts each kind once for a person who did several things', async () => {
		seedQuestion('q1');
		seedAnswer('a1', 'q1', 'same');
		seedRating('q1', 'same');
		seedView('q1', 'same');

		await runQuestionProgressBackfill(runOf());

		expect(progressOf('q1')).toMatchObject({ entered: 1, suggested: 1, evaluated: 1 });
		expect(docCount(Collections.questionParticipation)).toBe(1);
	});

	it('leaves out rows with no evaluator, which are automatic self-votes', async () => {
		seedQuestion('q1');
		seedAnswer('a1', 'q1', 'a');
		fake.seed(Collections.evaluations, 'a--q1', { parentId: 'q1', evaluatorId: 'a' });

		await runQuestionProgressBackfill(runOf());

		expect(progressOf('q1')).toMatchObject({ evaluated: 0, evaluations: 0 });
	});

	it('skips questions newer than the counters', async () => {
		seedQuestion('new', NEW, { totalEvaluators: 5 });
		const run = runOf();

		const totals = await runQuestionProgressBackfill(run);

		expect(totals).toMatchObject({ scanned: 1, processed: 0 });
		expect(progressOf('new')).toBeUndefined();
	});

	it('skips old questions with no ratings and no answers', async () => {
		seedQuestion('empty');

		const totals = await runQuestionProgressBackfill(runOf());

		expect(totals.processed).toBe(0);
		expect(progressOf('empty')).toBeUndefined();
	});

	it('finds a question through the raters on its document', async () => {
		seedQuestion('rated', OLD, { totalEvaluators: 1 });
		seedRating('rated', 'b');

		const totals = await runQuestionProgressBackfill(runOf());

		expect(totals.processed).toBe(1);
	});

	it('resumes past questions finished by an earlier run', async () => {
		seedOldActivity();
		const run = runOf({ isDone: (id) => id === 'q1' });

		const totals = await runQuestionProgressBackfill(run);

		expect(totals).toMatchObject({ processed: 0, skippedDone: 1 });
		expect(progressOf('q1')).toBeUndefined();
	});

	it('stops at the limit', async () => {
		seedOldActivity();
		seedQuestion('q2', OLD, { totalEvaluators: 1 });

		const totals = await runQuestionProgressBackfill(runOf({ limit: 1 }));

		expect(totals.processed).toBe(1);
		expect(progressOf('q2')).toBeUndefined();
	});

	it('carries on after a failed question and leaves it for a rerun', async () => {
		seedOldActivity();
		seedQuestion('q2', OLD, { totalEvaluators: 1 });
		const realTransaction = fake.db.runTransaction;
		jest.spyOn(fake.db, 'runTransaction').mockRejectedValueOnce(new Error('aborted'));
		const run = runOf();

		const totals = await runQuestionProgressBackfill(run);

		expect(totals).toMatchObject({ failed: 1, processed: 1 });
		expect(run.done).toEqual(['q2']);

		fake.db.runTransaction = realTransaction;
		const rerun = runOf({ isDone: (id) => id === 'q2' });
		await runQuestionProgressBackfill(rerun);
		expect(progressOf('q1')).toMatchObject({ evaluated: 2 });
	});

	it('handles more people than one transaction holds', async () => {
		seedQuestion('big', OLD, { totalEvaluators: 450 });
		Array.from({ length: 450 }, (_, i) => `u${i}`).forEach((uid) => seedRating('big', uid));

		await runQuestionProgressBackfill(runOf());

		expect(progressOf('big')).toMatchObject({ evaluated: 450, evaluations: 450 });
	});
});
