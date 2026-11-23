import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatementSubscription } from '@freedi/shared-types';

type SubHandler = (sub: StatementSubscription | null) => void;
type ErrorHandler = (error: Error) => void;

const captured = vi.hoisted(() => ({
	sub: null as SubHandler | null,
	tableErrors: [] as ErrorHandler[],
	stops: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('../listeners', () => ({
	listenTables: () => () => undefined,
	listenRoster: () => () => undefined,
	listenTable: (_id: string, _onData: unknown, onError: ErrorHandler) => {
		captured.tableErrors.push(onError);
		const stop = vi.fn();
		captured.stops.push(stop);

		return stop;
	},
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

import { isPermissionDenied, watchClass } from '../classState';

const inTable = (tableId: string): StatementSubscription =>
	({ tableId }) as unknown as StatementSubscription;

describe('a student moved to another table', () => {
	beforeEach(() => {
		captured.sub = null;
		captured.tableErrors = [];
		captured.stops = [];
	});

	afterEach(() => vi.restoreAllMocks());

	it('does not log the old table refusing them as a listener error', () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const stop = watchClass('m', 'student');
		captured.sub?.(inTable('m--1'));
		const denied = Object.assign(new Error('Missing or insufficient permissions'), {
			code: 'permission-denied',
		});
		captured.tableErrors[0](denied);
		expect(errors).not.toHaveBeenCalled();
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
