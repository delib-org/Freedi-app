import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetMainSetting = vi.fn();
const mockSetFollowMe = vi.fn();
const mockRunTransaction = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
	getDoc: vi.fn(),
	getDocs: vi.fn(),
	collection: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
	writeBatch: vi.fn(),
	runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}));

vi.mock('../i18n', () => ({ t: (key: string) => key }));

vi.mock('../store', () => ({
	getMainStatement: vi.fn(() => null),
	setMainStatementSetting: (...args: unknown[]) => mockSetMainSetting(...args),
	setPowerFollowMe: (...args: unknown[]) => mockSetFollowMe(...args),
	setQuestionSetting: vi.fn(),
}));

import { ensureClassCode, setLessonStep, stepLabel, CLASS_CODE_MAX_ATTEMPTS } from '../lesson';

describe('setLessonStep', () => {
	beforeEach(() => {
		mockSetMainSetting.mockReset();
		mockSetFollowMe.mockReset();
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
		await expect(setLessonStep('m1', 8)).rejects.toThrow(RangeError);
		expect(mockSetMainSetting).not.toHaveBeenCalled();
		expect(mockSetFollowMe).not.toHaveBeenCalled();
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
