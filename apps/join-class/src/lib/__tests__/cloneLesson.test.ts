import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStart = vi.fn();
const mockLoadQuestion = vi.fn();
const mockGetQuestion = vi.fn();
const mockWait = vi.fn();
const mockMark = vi.fn();
const mockUser = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
	getDoc: vi.fn(),
	getDocs: vi.fn(),
	collection: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
	writeBatch: vi.fn(),
	runTransaction: vi.fn(),
}));
vi.mock('../i18n', () => ({ t: (key: string) => key, getLang: () => 'he' }));
vi.mock('../store', () => ({
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
	classStartLesson: (...args: unknown[]) => mockStart(...args),
}));

import { settleNewLesson, startLesson } from '../lesson';

const TEACHER = { uid: 't1', displayName: 'Tal' };
const STATEMENT = { statementId: 'new1' };

describe('startLesson / settleNewLesson', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', { setTimeout: globalThis.setTimeout.bind(globalThis) });
		for (const m of [mockStart, mockLoadQuestion, mockGetQuestion, mockWait, mockMark, mockUser]) {
			m.mockReset();
		}
		mockUser.mockReturnValue(TEACHER);
		mockGetQuestion.mockReturnValue(STATEMENT);
		mockWait.mockResolvedValue(true);
		mockMark.mockResolvedValue(undefined);
		mockStart.mockResolvedValue({
			mainId: 'new1',
			classCode: '123456',
			homeId: 'jcTeacher_t1',
			reused: false,
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('calls the callable with the plan, game, class and id, then settles the new lesson', async () => {
		mockStart.mockResolvedValue({
			mainId: 'new1',
			classCode: '123456',
			homeId: 'jcClass_c1',
			reused: false,
		});
		const id = await startLesson({ planId: 'p1', gameId: 'g1', classId: 'c1', newMainId: 'new1' });
		expect(id).toBe('new1');
		expect(mockStart).toHaveBeenCalledWith({
			planId: 'p1',
			gameId: 'g1',
			classId: 'c1',
			newMainId: 'new1',
		});
		expect(mockLoadQuestion).toHaveBeenCalledWith('new1');
		expect(mockWait).toHaveBeenCalledWith('new1', 't1', expect.any(Number), expect.any(Number));
		expect(mockMark).toHaveBeenCalledWith(STATEMENT, 't1', 'Tal');
	});

	it('passes "no class" as null', async () => {
		await startLesson({ planId: 'p1', gameId: 'g1', classId: null, newMainId: 'new1' });
		expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ classId: null }));
	});

	it('makes its own id when none is given, and a different one each call', async () => {
		await startLesson({ planId: 'p1', gameId: 'g1', classId: null });
		await startLesson({ planId: 'p1', gameId: 'g1', classId: null });
		const ids = mockStart.mock.calls.map((c) => (c[0] as { newMainId: string }).newMainId);
		expect(ids[0]).toMatch(/\S{8,}/);
		expect(ids[0]).not.toBe(ids[1]);
	});

	it('a refused callable throws and settles nothing', async () => {
		mockStart.mockRejectedValue({ code: 'functions/permission-denied' });
		await expect(
			startLesson({ planId: 'p1', gameId: 'g1', classId: 'c1', newMainId: 'n' }),
		).rejects.toMatchObject({ code: 'functions/permission-denied' });
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
});
