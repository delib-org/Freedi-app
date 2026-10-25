import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockClone = vi.fn();
const mockLoadQuestion = vi.fn();
const mockGetQuestion = vi.fn();
const mockWait = vi.fn();
const mockMark = vi.fn();
const mockCreateSimple = vi.fn();
const mockUser = vi.fn();
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
vi.mock('../i18n', () => ({ t: (key: string) => key, getLang: () => 'he' }));
vi.mock('../store', () => ({
	createSimpleQuestion: (...args: unknown[]) => mockCreateSimple(...args),
	getMainStatement: vi.fn(),
	getQuestion: () => mockGetQuestion(),
	loadQuestion: (...args: unknown[]) => mockLoadQuestion(...args),
	setMainStatementSetting: vi.fn(),
	setPowerFollowMe: vi.fn(),
	setQuestionSetting: vi.fn(),
}));
vi.mock('../joinSubscriptions', () => ({
	waitForCreatorSubscription: (...args: unknown[]) => mockWait(...args),
	markOpenedInClass: (...args: unknown[]) => mockMark(...args),
}));
vi.mock('../user', () => ({ getUserState: () => ({ user: mockUser() }) }));
vi.mock('../classroom/api', () => ({
	classCloneLesson: (...args: unknown[]) => mockClone(...args),
}));

import { cloneLesson, createLesson, settleNewLesson } from '../lesson';

const TEACHER = { uid: 't1', displayName: 'Tal' };
const STATEMENT = { statementId: 'new1' };

describe('cloneLesson / settleNewLesson', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', { setTimeout: globalThis.setTimeout.bind(globalThis) });
		for (const m of [mockClone, mockLoadQuestion, mockGetQuestion, mockWait, mockMark, mockUser]) {
			m.mockReset();
		}
		mockUser.mockReturnValue(TEACHER);
		mockGetQuestion.mockReturnValue(STATEMENT);
		mockWait.mockResolvedValue(true);
		mockMark.mockResolvedValue(undefined);
		mockClone.mockResolvedValue({ mainId: 'new1', classCode: '123456', reused: false });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('calls the callable with the source, the id and the name, then settles the new lesson', async () => {
		const id = await cloneLesson('src1', 'Phones', 'new1');
		expect(id).toBe('new1');
		expect(mockClone).toHaveBeenCalledWith({
			sourceMainId: 'src1',
			newMainId: 'new1',
			title: 'Phones',
		});
		expect(mockLoadQuestion).toHaveBeenCalledWith('new1');
		expect(mockWait).toHaveBeenCalledWith('new1', 't1', expect.any(Number), expect.any(Number));
		expect(mockMark).toHaveBeenCalledWith(STATEMENT, 't1', 'Tal');
	});

	it('makes its own id when none is given, and a different one each call', async () => {
		await cloneLesson('src1', 'A');
		await cloneLesson('src1', 'A');
		const ids = mockClone.mock.calls.map((c) => (c[0] as { newMainId: string }).newMainId);
		expect(ids[0]).toMatch(/\S{8,}/);
		expect(ids[0]).not.toBe(ids[1]);
	});

	it('a refused callable throws and settles nothing', async () => {
		mockClone.mockRejectedValue({ code: 'functions/permission-denied' });
		await expect(cloneLesson('src1', 'A', 'n')).rejects.toMatchObject({
			code: 'functions/permission-denied',
		});
		expect(mockLoadQuestion).not.toHaveBeenCalled();
		expect(mockMark).not.toHaveBeenCalled();
	});

	it('re-marks the lesson later when the server subscription was slow', async () => {
		mockWait.mockResolvedValue(false);
		await settleNewLesson('new1');
		expect(mockMark).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(16_000);
		expect(mockMark).toHaveBeenCalledTimes(3);
	});

	it('does not re-mark when the server wrote the subscription', async () => {
		await settleNewLesson('new1');
		await vi.advanceTimersByTimeAsync(16_000);
		expect(mockMark).toHaveBeenCalledTimes(1);
	});

	it('runs beforeRemark after the marker', async () => {
		const order: string[] = [];
		mockMark.mockImplementation(async () => void order.push('mark'));
		await settleNewLesson('new1', async () => void order.push('code'));
		expect(order).toEqual(['mark', 'code']);
	});

	it('createLesson still creates, marks, then makes the class code', async () => {
		mockCreateSimple.mockResolvedValue('new1');
		const order: string[] = [];
		mockMark.mockImplementation(async () => void order.push('mark'));
		mockRunTransaction.mockImplementation(async () => {
			order.push('code');

			return '654321';
		});
		expect(await createLesson('Phones')).toBe('new1');
		expect(order).toEqual(['mark', 'code']);
		expect(mockClone).not.toHaveBeenCalled();
	});
});
