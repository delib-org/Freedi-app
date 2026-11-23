import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatementSubscription } from '@freedi/shared-types';

type SubHandler = (sub: StatementSubscription | null) => void;
type ErrorHandler = (error: Error) => void;

const captured = vi.hoisted(() => ({
	sub: null as SubHandler | null,
	tableErrors: [] as ErrorHandler[],
	confirms: [] as Array<(() => Promise<boolean>) | undefined>,
	serverSub: null as StatementSubscription | null,
	stops: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('../listeners', () => ({
	listenTables: () => () => undefined,
	listenRoster: () => () => undefined,
	readMySubscriptionFromServer: () => Promise.resolve(captured.serverSub),
	listenTable: (
		_id: string,
		_onData: unknown,
		onError: ErrorHandler,
		confirmDenied?: () => Promise<boolean>,
	) => {
		captured.tableErrors.push(onError);
		captured.confirms.push(confirmDenied);
		const stop = vi.fn();
		captured.stops.push(stop);

		return stop;
	},
	// The student's private side doc and the lesson's side lock (Trello btMVQMM5).
	listenMySide: () => () => undefined,
	listenSideLock: () => () => undefined,
	listenMySubscription: (_mainId: string, onData: SubHandler) => {
		captured.sub = onData;

		return () => undefined;
	},
}));
vi.mock('../studentWrites', () => ({ ensureMemberSubscription: () => Promise.resolve() }));
vi.mock('../serverClock', () => ({ initServerClock: () => Promise.resolve() }));
vi.mock('../studentNotices', () => ({ startStudentNotices: () => () => undefined }));
vi.mock('../../store', () => ({ getMainStatement: () => null, getSubQuestions: () => [] }));
vi.mock('../../lessonCore', () => ({
	getChallengeQuestion: () => null,
	lessonStepOf: () => ({ index: 0, key: 'opening' }),
}));
vi.mock('../../sentry', () => ({ captureException: vi.fn() }));

import { MOVE_CONFIRM_WAIT_MS, isPermissionDenied, watchClass } from '../classState';

const inTable = (tableId: string): StatementSubscription =>
	({ tableId }) as unknown as StatementSubscription;

describe('a student moved to another table', () => {
	beforeEach(() => {
		captured.sub = null;
		captured.tableErrors = [];
		captured.confirms = [];
		captured.serverSub = null;
		captured.stops = [];
	});

	afterEach(() => vi.restoreAllMocks());

	it('confirms a denial as expected when the server subscription names another table', async () => {
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.serverSub = inTable('m--2');
		await expect(captured.confirms[0]?.()).resolves.toBe(true);
		stop();
	});

	it('confirms a denial as expected when the student left every table', async () => {
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.serverSub = null;
		await expect(captured.confirms[0]?.()).resolves.toBe(true);
		stop();
	});

	it('waits for the next subscription snapshot when the server still names the table', async () => {
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.serverSub = inTable('m--1');
		const answer = captured.confirms[0]?.();
		await Promise.resolve();
		await Promise.resolve();
		captured.sub?.(inTable('m--2'));
		await expect(answer).resolves.toBe(true);
		stop();
	});

	it('does not confirm a denial when the subscription still names the table after the wait', async () => {
		vi.useFakeTimers();
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.serverSub = inTable('m--1');
		const answer = captured.confirms[0]?.();
		await vi.advanceTimersByTimeAsync(MOVE_CONFIRM_WAIT_MS);
		await expect(answer).resolves.toBe(false);
		vi.useRealTimers();
		stop();
	});

	it('confirms at once, without a server read, once the move already landed', async () => {
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.sub?.(inTable('m--2'));
		captured.serverSub = inTable('m--1');
		await expect(captured.confirms[0]?.()).resolves.toBe(true);
		stop();
	});

	it('reports real table errors through the normal error path', () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.tableErrors[0](new Error('boom'));
		expect(errors).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops the old table listener when the new table arrives', () => {
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		captured.sub?.(inTable('m--2'));
		expect(captured.stops[0]).toHaveBeenCalledTimes(1);
		expect(captured.stops).toHaveLength(2);
		stop();
	});
});

describe('isPermissionDenied', () => {
	it('reads the Firestore code', () => {
		expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
		expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
		expect(isPermissionDenied(null)).toBe(false);
		expect(isPermissionDenied('permission-denied')).toBe(false);
	});
});
