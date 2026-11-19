import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';

type TablesHandler = (tables: ClassTable[]) => void;

const handlers: { tables: TablesHandler | null } = { tables: null };

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('../listeners', () => ({
	listenTables: (_mainId: string, onData: TablesHandler) => {
		handlers.tables = onData;

		return () => undefined;
	},
	listenRoster: () => () => undefined,
	listenTable: () => () => undefined,
	listenMySubscription: () => () => undefined,
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

import { classState, trackTableChange, watchClass } from '../classState';
import { OPTIMISTIC_SETTLE_MS } from '../optimisticOverlay';
import { predictMoveStudent } from '../tableOptimism';

const table = (n: number, memberUids: string[]): ClassTable =>
	({ tableId: `m--${n}`, mainId: 'm', n, memberUids, spokenUids: [] }) as unknown as ClassTable;

const seated = (): number[][] =>
	classState.tables.map((x) => x.memberUids.map((uid) => (uid === 'u1' ? x.n : 0)).filter(Boolean));

describe('classState with the optimistic overlay', () => {
	let stop: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		stop = watchClass('m', 'teacher');
		handlers.tables?.([table(1, ['u1']), table(2, [])]);
	});
	afterEach(() => {
		stop();
		vi.useRealTimers();
	});

	it('shows the move at once, before the call answers', () => {
		void trackTableChange(predictMoveStudent('u1', 2), () => new Promise(() => undefined));
		expect(seated()).toEqual([[], [2]]);
	});

	it('puts the chip back when the call fails', async () => {
		const failing = trackTableChange(predictMoveStudent('u1', 2), () =>
			Promise.reject(new Error('refused')),
		);
		await expect(failing).rejects.toThrow('refused');
		expect(seated()).toEqual([[1], []]);
	});

	it('drops the guess when the server snapshot shows the move', async () => {
		await trackTableChange(predictMoveStudent('u1', 2), () => Promise.resolve());
		expect(seated()).toEqual([[], [2]]);
		handlers.tables?.([table(1, []), table(2, ['u1'])]);
		expect(seated()).toEqual([[], [2]]);
		// A later snapshot is the server's alone: nothing of the guess is left to apply.
		handlers.tables?.([table(1, ['u1']), table(2, [])]);
		expect(seated()).toEqual([[1], []]);
	});

	it('goes back to the server data when the server says ok but shows something else', async () => {
		await trackTableChange(predictMoveStudent('u1', 2), () => Promise.resolve());
		vi.advanceTimersByTime(OPTIMISTIC_SETTLE_MS);
		expect(seated()).toEqual([[1], []]);
	});
});
