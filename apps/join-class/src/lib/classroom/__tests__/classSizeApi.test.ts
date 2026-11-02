import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockGetDocs = vi.fn();
const mockCallable = vi.fn();

vi.mock('../../firebase', () => ({
	db: {},
	functions: {},
	doc: (_db: unknown, col: string, id: string) => ({ col, id }),
	collection: (_db: unknown, col: string) => col,
	query: (...args: unknown[]) => args,
	where: (...args: unknown[]) => args,
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	writeBatch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
	httpsCallable: () => (data: unknown) => mockCallable(data),
}));
vi.mock('../../sentry', () => ({ captureException: vi.fn() }));

import {
	ClassSizeRecalcError,
	ClassSizeSaveError,
	saveClassSize,
	writeClassSize,
	writeClassSizeOnNewLesson,
} from '../classSizeApi';

/** getDocs answers by the queried parent: options of a question, or the lesson's questions. */
function answerWith(byParent: Record<string, unknown[]>): void {
	mockGetDocs.mockImplementation(async (q: unknown[]) => {
		const clauses = q.slice(1) as unknown[][];
		const parent = clauses.find((c) => c[0] === 'parentId')?.[2] as string;

		return { docs: (byParent[parent] ?? []).map((data) => ({ data: () => data })) };
	});
}

const rated = { evaluation: { numberOfEvaluators: 3 } };
const unrated = { evaluation: { numberOfEvaluators: 0 } };

describe('class size writes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatchCommit.mockResolvedValue(undefined);
		mockCallable.mockResolvedValue({ data: { success: true } });
	});

	it('writes N on the lesson and on each question in one batch', async () => {
		await writeClassSize('m1', ['q1', 'q2'], 28);

		expect(mockBatchSet).toHaveBeenCalledTimes(3);
		expect(mockBatchSet.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual([
			'm1',
			'q1',
			'q2',
		]);
		for (const call of mockBatchSet.mock.calls) {
			expect(call[1]).toMatchObject({ evaluationSettings: { targetPopulation: 28 } });
			expect(call[2]).toEqual({ merge: true });
		}
		expect(mockBatchCommit).toHaveBeenCalledTimes(1);
	});

	it('a new lesson: empty input writes 40 on the lesson and its questions', async () => {
		answerWith({ m1: [{ statementId: 'q1' }, { statementId: 'q2' }] });

		const size = await writeClassSizeOnNewLesson('m1', '');

		expect(size).toBe(40);
		expect(mockBatchSet).toHaveBeenCalledTimes(3);
		expect(mockBatchSet.mock.calls[1][1]).toMatchObject({
			evaluationSettings: { targetPopulation: 40 },
		});
	});

	it('a new lesson: a failed write is a save error', async () => {
		answerWith({ m1: [] });
		mockBatchCommit.mockRejectedValue(new Error('permission-denied'));

		await expect(writeClassSizeOnNewLesson('m1', '30')).rejects.toBeInstanceOf(ClassSizeSaveError);
	});
});

describe('saveClassSize (the console settings save path)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatchCommit.mockResolvedValue(undefined);
		mockCallable.mockResolvedValue({ data: { success: true } });
	});

	it('saves, then recalculates once per question that has ratings', async () => {
		answerWith({ q1: [rated, unrated], q2: [unrated], q3: [rated] });

		const size = await saveClassSize('m1', ['q1', 'q2', 'q3'], '25');

		expect(size).toBe(25);
		expect(mockCallable).toHaveBeenCalledTimes(2);
		expect(mockCallable).toHaveBeenCalledWith({ statementId: 'q1' });
		expect(mockCallable).toHaveBeenCalledWith({ statementId: 'q3' });
	});

	it('emptying the row means 40 and still recalculates', async () => {
		answerWith({ q1: [rated] });

		expect(await saveClassSize('m1', ['q1'], '')).toBe(40);
		expect(mockBatchSet.mock.calls[0][1]).toMatchObject({
			evaluationSettings: { targetPopulation: 40 },
		});
		expect(mockCallable).toHaveBeenCalledTimes(1);
	});

	it('recalculates nothing when no question has ratings', async () => {
		answerWith({ q1: [unrated] });

		await saveClassSize('m1', ['q1'], '30');

		expect(mockCallable).not.toHaveBeenCalled();
	});

	it('a failed save is a save error and nothing is recalculated', async () => {
		mockBatchCommit.mockRejectedValue(new Error('permission-denied'));
		answerWith({ q1: [rated] });

		await expect(saveClassSize('m1', ['q1'], '30')).rejects.toBeInstanceOf(ClassSizeSaveError);
		expect(mockCallable).not.toHaveBeenCalled();
	});

	it('a refused recalculation is reported, the other questions still run', async () => {
		answerWith({ q1: [rated], q2: [rated] });
		mockCallable.mockRejectedValueOnce({ code: 'functions/permission-denied' });

		const failure = await saveClassSize('m1', ['q1', 'q2'], '30').catch((e: unknown) => e);

		expect(failure).toBeInstanceOf(ClassSizeRecalcError);
		expect((failure as ClassSizeRecalcError).failedQuestionIds).toEqual(['q1']);
		expect(mockCallable).toHaveBeenCalledTimes(2);
	});
});
