import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetMainSetting = vi.fn();
const mockGetMain = vi.fn();
const mockSetFollowMe = vi.fn();
const mockRunTransaction = vi.fn();
const mockGetDocs = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
	getDoc: vi.fn(),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	collection: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
	writeBatch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
	runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}));

vi.mock('../i18n', () => ({ t: (key: string) => key }));

vi.mock('../store', () => ({
	getMainStatement: () => mockGetMain(),
	setMainStatementSetting: (...args: unknown[]) => mockSetMainSetting(...args),
	setPowerFollowMe: (...args: unknown[]) => mockSetFollowMe(...args),
	setQuestionSetting: vi.fn(),
}));

import {
	ensureClassCode,
	setChallengeQuestion,
	setLessonStep,
	stepLabel,
	CLASS_CODE_MAX_ATTEMPTS,
} from '../lesson';

function mainWith(status?: string): unknown {
	return { statementSettings: { lessonPlan: { steps: [], stepIndex: 0, status } } };
}

describe('setLessonStep', () => {
	beforeEach(() => {
		mockSetMainSetting.mockReset();
		mockSetFollowMe.mockReset();
		mockGetMain.mockReset();
		mockGetMain.mockReturnValue(null);
	});

	it('refuses to move a step while the lesson is paused or ended', async () => {
		for (const status of ['paused', 'ended']) {
			mockGetMain.mockReturnValue(mainWith(status));
			await expect(setLessonStep('m1', 2)).rejects.toThrow(status);
		}
		expect(mockSetMainSetting).not.toHaveBeenCalled();
		expect(mockSetFollowMe).not.toHaveBeenCalled();
	});

	it('makes an open lesson live again when a step moves', async () => {
		mockGetMain.mockReturnValue(mainWith('open'));
		await setLessonStep('m1', 5);
		expect(mockSetMainSetting).toHaveBeenCalledWith('m1', {
			statementSettings: {
				lessonPlan: expect.objectContaining({
					stepIndex: 5,
					status: 'live',
					statusAt: expect.any(Number),
				}),
			},
		});
	});

	it('leaves the status alone when a live lesson moves', async () => {
		mockGetMain.mockReturnValue(mainWith('live'));
		await setLessonStep('m1', 4);
		const plan = mockSetMainSetting.mock.calls[0][1].statementSettings.lessonPlan;
		expect(plan.status).toBeUndefined();
	});

	it('writes stepIndex and then the step follow-me path', async () => {
		await setLessonStep('m1', 3);
		expect(mockSetMainSetting).toHaveBeenCalledWith('m1', {
			statementSettings: { lessonPlan: expect.objectContaining({ stepIndex: 3 }) },
		});
		expect(mockSetFollowMe).toHaveBeenCalledWith('m1', '/statement/m1?step=tables');
	});

	it('allows jumping backward', async () => {
		await setLessonStep('m1', 1);
		expect(mockSetFollowMe).toHaveBeenCalledWith('m1', '/statement/m1?step=opening');
	});

	it('rejects an out-of-range index without writing', async () => {
		await expect(setLessonStep('m1', 9)).rejects.toThrow(RangeError);
		expect(mockSetMainSetting).not.toHaveBeenCalled();
		expect(mockSetFollowMe).not.toHaveBeenCalled();
	});

	it('a new lesson moves from Proposals to All proposals (index 6)', async () => {
		await setLessonStep('m1', 6);
		const plan = mockSetMainSetting.mock.calls[0][1].statementSettings.lessonPlan;
		expect(plan.steps).toHaveLength(9);
		expect(mockSetFollowMe).toHaveBeenCalledWith('m1', '/statement/m1?step=allProposals');
	});
});

describe('setLessonStep on an old 8-step lesson (IA 19.8)', () => {
	const OLD_STEPS = [
		'waiting',
		'opening',
		'side',
		'tables',
		'tableTalk',
		'proposals',
		'vote',
		'summary',
	];
	const oldMain = (stepIndex: number): unknown => ({
		statementSettings: { lessonPlan: { steps: OLD_STEPS, stepIndex, status: 'live' } },
	});

	beforeEach(() => {
		mockSetMainSetting.mockReset();
		mockSetFollowMe.mockReset();
		mockGetMain.mockReset();
	});

	it('keeps the stored 8 steps when it moves, so index 6 stays Vote', async () => {
		mockGetMain.mockReturnValue(oldMain(5));
		await setLessonStep('m1', 6);
		const plan = mockSetMainSetting.mock.calls[0][1].statementSettings.lessonPlan;
		expect(plan.steps).toEqual(OLD_STEPS);
		expect(plan.stepIndex).toBe(6);
		expect(mockSetFollowMe).toHaveBeenCalledWith('m1', '/statement/m1?step=vote');
	});

	it('reaches Summary at index 7 and refuses index 8', async () => {
		mockGetMain.mockReturnValue(oldMain(6));
		await setLessonStep('m1', 7);
		expect(mockSetFollowMe).toHaveBeenCalledWith('m1', '/statement/m1?step=summary');
		await expect(setLessonStep('m1', 8)).rejects.toThrow(RangeError);
	});
});

describe('stepLabel', () => {
	it('translates the step key', () => {
		expect(stepLabel('summary')).toBe('step.summary');
	});
});

describe('ensureClassCode', () => {
	beforeEach(() => mockRunTransaction.mockReset());

	it('returns the code the transaction settles on', async () => {
		mockRunTransaction.mockResolvedValueOnce('482913');
		await expect(ensureClassCode('m1')).resolves.toBe('482913');
		expect(mockRunTransaction).toHaveBeenCalledTimes(1);
	});

	it('retries after a collision (transaction returns null)', async () => {
		mockRunTransaction.mockResolvedValueOnce(null).mockResolvedValueOnce('111222');
		await expect(ensureClassCode('m1')).resolves.toBe('111222');
		expect(mockRunTransaction).toHaveBeenCalledTimes(2);
	});

	it('gives up after the attempt limit', async () => {
		mockRunTransaction.mockResolvedValue(null);
		await expect(ensureClassCode('m1')).rejects.toThrow();
		expect(mockRunTransaction).toHaveBeenCalledTimes(CLASS_CODE_MAX_ATTEMPTS);
	});
});

describe('setChallengeQuestion', () => {
	beforeEach(() => {
		mockGetDocs.mockReset();
		mockBatchSet.mockReset();
		mockBatchCommit.mockReset();
	});

	it('promotes one question and demotes the previous challenge in one batch', async () => {
		const mk = (id: string, classRole?: string) => ({
			data: () => ({ statementId: id, statementSettings: classRole ? { classRole } : {} }),
		});
		mockGetDocs.mockResolvedValue({ docs: [mk('a', 'challenge'), mk('b'), mk('c')] });
		await setChallengeQuestion('m1', 'b');
		const written = mockBatchSet.mock.calls.map((c) => [
			(c[0] as { id: string }).id,
			(c[1] as { statementSettings: { classRole: string } }).statementSettings.classRole,
		]);
		expect(written).toEqual([
			['b', 'challenge'],
			['a', 'guiding'],
		]);
		expect(mockBatchCommit).toHaveBeenCalledTimes(1);
	});
});
