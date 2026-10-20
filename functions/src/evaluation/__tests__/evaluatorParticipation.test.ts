import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { FakeFirestore } from './helpers/fakeFirestore';

const mockFake = new FakeFirestore();
jest.mock('../../index', () => ({
	get db() {
		return mockFake;
	},
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { recordEvaluatorParticipation, reconcileParentEvaluators } from '../evaluatorParticipation';
import {
	backfillParticipantsPage,
	syncParentCountsPage,
} from '../../migrations/backfillEvaluationParticipants';

const QUESTION = 'q1';
const fsAny = mockFake as unknown as Parameters<typeof recordEvaluatorParticipation>[2];

function seedQuestion(withEvaluation = true): void {
	mockFake.seed(`statements/${QUESTION}`, {
		statementId: QUESTION,
		lastUpdate: 111,
		...(withEvaluation
			? { evaluation: { agreement: 0, numberOfEvaluators: 0 }, totalEvaluators: 0 }
			: {}),
	});
}

function seedEvaluation(id: string, userId: string, value = 1, parentId = QUESTION): void {
	mockFake.seed(`evaluations/${id}`, {
		parentId,
		statementId: `opt-${id}`,
		evaluation: value,
		evaluator: { uid: userId },
	});
}

const countOf = (): unknown =>
	(mockFake.peek(`statements/${QUESTION}`)?.evaluation as Record<string, unknown> | undefined)
		?.asParentTotalEvaluators;

describe('recordEvaluatorParticipation', () => {
	beforeEach(() => {
		mockFake.clear();
		mockFake.resetCounts();
		seedQuestion();
	});

	it('counts a first evaluation: creates the marker and increments both counters', async () => {
		await expect(recordEvaluatorParticipation(QUESTION, 'alice', fsAny)).resolves.toBe(true);

		expect(countOf()).toBe(1);
		expect(mockFake.peek(`statements/${QUESTION}`)?.totalEvaluators).toBe(1);
		expect(mockFake.peek(`evaluationParticipants/${QUESTION}--alice`)).toMatchObject({
			parentId: QUESTION,
			userId: 'alice',
		});
	});

	it('does not bump the question lastUpdate (no statement-update fan-out for a counter)', async () => {
		await recordEvaluatorParticipation(QUESTION, 'alice', fsAny);

		expect(mockFake.peek(`statements/${QUESTION}`)?.lastUpdate).toBe(111);
	});

	it('counts a user once however many times the event repeats (duplicate / out-of-order)', async () => {
		await recordEvaluatorParticipation(QUESTION, 'alice', fsAny);
		mockFake.resetCounts();

		await recordEvaluatorParticipation(QUESTION, 'alice', fsAny);
		await recordEvaluatorParticipation(QUESTION, 'alice', fsAny);

		expect(countOf()).toBe(1);
		expect(mockFake.counts.writes).toBe(0); // no parent write, no marker write
		expect(mockFake.counts.reads).toBe(2); // one marker read per repeat
	});

	it('counts exactly once per user under concurrent first evaluations', async () => {
		const users = Array.from({ length: 25 }, (_, i) => `user-${i}`);
		// every user fires twice at once: 50 concurrent events, 25 distinct users
		await Promise.all(
			[...users, ...users].map((u) => recordEvaluatorParticipation(QUESTION, u, fsAny)),
		);

		expect(countOf()).toBe(25);
		expect(mockFake.peek(`statements/${QUESTION}`)?.totalEvaluators).toBe(25);
		expect(mockFake.list('evaluationParticipants')).toHaveLength(25);
	});

	it('creates a complete evaluation map when the question has none', async () => {
		mockFake.clear();
		seedQuestion(false);

		await recordEvaluatorParticipation(QUESTION, 'alice', fsAny);

		const evaluation = mockFake.peek(`statements/${QUESTION}`)?.evaluation as Record<
			string,
			unknown
		>;
		expect(evaluation.asParentTotalEvaluators).toBe(1);
		expect(evaluation).toHaveProperty('numberOfEvaluators', 0);
		expect(evaluation).toHaveProperty('agreement', 0);
	});

	it('writes nothing when the question does not exist', async () => {
		await expect(recordEvaluatorParticipation('missing', 'alice', fsAny)).resolves.toBe(false);

		expect(mockFake.counts.writes).toBe(0);
	});

	it('ignores events without a user or question', async () => {
		await expect(recordEvaluatorParticipation(QUESTION, undefined, fsAny)).resolves.toBe(false);
		await expect(recordEvaluatorParticipation(undefined, 'alice', fsAny)).resolves.toBe(false);
		expect(mockFake.counts.reads).toBe(0);
	});
});

describe('reconcileParentEvaluators', () => {
	beforeEach(() => {
		mockFake.clear();
		mockFake.resetCounts();
		seedQuestion();
	});

	it('recomputes the exact count from scratch across pages, neutral evaluations included', async () => {
		// 1200 evaluations, 700 distinct users (spans three 500-doc pages); one is neutral (0)
		for (let i = 0; i < 1200; i++)
			seedEvaluation(`e${String(i).padStart(5, '0')}`, `u${i % 700}`, i === 0 ? 0 : 1);
		seedEvaluation('other', 'outsider', 1, 'another-question');
		// a stale count and a stale marker for a user who has no evaluation any more
		mockFake.seed(`statements/${QUESTION}`, {
			statementId: QUESTION,
			evaluation: { numberOfEvaluators: 0, asParentTotalEvaluators: 9999 },
			totalEvaluators: 9999,
		});
		mockFake.seed(`evaluationParticipants/${QUESTION}--ghost`, {
			parentId: QUESTION,
			userId: 'ghost',
			createdAt: 1,
		});

		const result = await reconcileParentEvaluators(QUESTION, fsAny);

		expect(result).toMatchObject({ count: 700, previousCount: 9999, created: 700, removed: 1 });
		expect(countOf()).toBe(700);
		expect(mockFake.peek(`statements/${QUESTION}`)?.totalEvaluators).toBe(700);
		expect(mockFake.list('evaluationParticipants')).toHaveLength(700);
		expect(mockFake.peek(`evaluationParticipants/${QUESTION}--ghost`)).toBeUndefined();
	});

	it('does not write the question when it is already right', async () => {
		seedEvaluation('e1', 'alice');
		await reconcileParentEvaluators(QUESTION, fsAny);
		mockFake.resetCounts();

		await reconcileParentEvaluators(QUESTION, fsAny);

		expect(mockFake.writeLog).toEqual([]);
	});

	it('throws for an unknown question', async () => {
		await expect(reconcileParentEvaluators('missing', fsAny)).rejects.toThrow('not found');
	});
});

describe('backfill', () => {
	beforeEach(() => {
		mockFake.clear();
		mockFake.resetCounts();
		seedQuestion();
		mockFake.seed('statements/q2', {
			statementId: 'q2',
			evaluation: { numberOfEvaluators: 0 },
			totalEvaluators: 0,
		});
		// q1: 7 evaluations by 5 users; q2: 3 evaluations by 3 users
		['a', 'b', 'c', 'd', 'e', 'a', 'b'].forEach((u, i) => seedEvaluation(`q1-${i}`, u));
		['a', 'x', 'y'].forEach((u, i) => seedEvaluation(`q2-${i}`, u, 0, 'q2'));
	});

	async function runAll(execute: boolean, pageSize: number): Promise<void> {
		let cursor: string | null = null;
		do {
			const page = await backfillParticipantsPage(fsAny as never, cursor, execute, pageSize);
			cursor = page.nextCursor;
		} while (cursor);
		do {
			const page = await syncParentCountsPage(fsAny as never, cursor, execute, pageSize);
			cursor = page.nextCursor;
		} while (cursor);
	}

	it('dry run writes nothing', async () => {
		await runAll(false, 3);

		expect(mockFake.writeLog).toEqual([]);
	});

	it('creates the markers and sets exact counts, in small pages', async () => {
		await runAll(true, 3);

		expect(mockFake.list('evaluationParticipants')).toHaveLength(8);
		expect(countOf()).toBe(5);
		expect(
			(mockFake.peek('statements/q2')?.evaluation as Record<string, unknown>)
				.asParentTotalEvaluators,
		).toBe(3);
		expect(mockFake.peek('statements/q2')?.totalEvaluators).toBe(3);
	});

	it('is idempotent: a second run writes nothing', async () => {
		await runAll(true, 3);
		mockFake.resetCounts();

		await runAll(true, 3);

		expect(mockFake.writeLog).toEqual([]);
	});

	it('resumes from a cursor without losing or duplicating markers', async () => {
		const first = await backfillParticipantsPage(fsAny as never, null, true, 6);
		expect(first.nextCursor).not.toBeNull();
		// "crash" here, restart from the printed cursor
		const second = await backfillParticipantsPage(fsAny as never, first.nextCursor, true, 6);
		expect(second.nextCursor).toBeNull();

		expect(mockFake.list('evaluationParticipants')).toHaveLength(8);
	});
});
