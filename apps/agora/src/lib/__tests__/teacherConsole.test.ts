import { beforeEach, describe, expect, it, vi } from 'vitest';

const onSnapshot = vi.fn((..._args: unknown[]) => () => {});
const where = vi.fn((field: string, _op: string, value: unknown) => ({ field, value }));
vi.mock('../firebase', () => ({
	db: {},
	collection: (_db: unknown, name: string) => ({ name }),
	query: (col: { name: string }, ...clauses: unknown[]) => ({ col, clauses }),
	where: (field: string, op: string, value: unknown) => where(field, op, value),
	onSnapshot: (...args: unknown[]) => onSnapshot(...args),
}));
vi.mock('../callables', () => ({ moderateStatement: vi.fn(), teacherMessage: vi.fn() }));
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

import {
	getTeacherConsoleState,
	identitiesSubscribed,
	listenToTeacherConsole,
	stopTeacherConsole,
} from '../teacherConsole';

/** The collections the listeners were opened on, in order */
const subscribedTo = (): string[] =>
	onSnapshot.mock.calls.map((call) => (call[0] as { col: { name: string } }).col.name);

describe('listenToTeacherConsole and the device role', () => {
	beforeEach(() => {
		stopTeacherConsole();
		onSnapshot.mockClear();
		where.mockClear();
	});

	it('a private device holds the names and the threads', () => {
		listenToTeacherConsole('s1', 'teacher');
		expect(subscribedTo()).toEqual(['agoraIdentities', 'agoraTeacherMessages']);
		expect(identitiesSubscribed()).toBe(true);
	});

	it('a wall subscribes to neither — a name never fetched cannot leak', () => {
		listenToTeacherConsole('s1', 'teacher', { identities: false, threads: false });
		expect(subscribedTo()).toEqual([]);
		expect(identitiesSubscribed()).toBe(false);
		expect(getTeacherConsoleState().identitiesLoaded).toBe(false);
	});

	it('re-subscribes when the device turns private, and only then', () => {
		listenToTeacherConsole('s1', 'teacher', { identities: false, threads: false });
		listenToTeacherConsole('s1', 'teacher', { identities: false, threads: false });
		expect(subscribedTo()).toEqual([]);
		listenToTeacherConsole('s1', 'teacher', { identities: true, threads: true });
		expect(subscribedTo()).toEqual(['agoraIdentities', 'agoraTeacherMessages']);
		// idempotent per key: a redraw does not open a second pair
		listenToTeacherConsole('s1', 'teacher', { identities: true, threads: true });
		expect(onSnapshot).toHaveBeenCalledTimes(2);
	});

	it('pins every query on the teacher uid, the equality the rules prove', () => {
		listenToTeacherConsole('s1', 'teacher');
		const teacherClauses = where.mock.calls.filter(([field]) => field === 'teacherId');
		expect(teacherClauses).toHaveLength(2);
		expect(teacherClauses.every(([, , value]) => value === 'teacher')).toBe(true);
	});
});
