// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import type { VoteSummary } from '@/lib/classroom/voteSummary';
import { textOf } from '../../__tests__/vnodeText';

/**
 * Trello sN881XCU: a phone may read only its own table's subscriptions. The
 * class size comes from the server's count on the lesson, the table chips
 * from a listener on the student's own table that follows their seat.
 */

const listened = vi.hoisted(() => ({
	calls: [] as Array<{ mainId: string; tableId: string; stopped: boolean }>,
	onError: null as ((error: Error) => void) | null,
	captured: [] as unknown[],
}));

vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock('@/styles/student-c2.scss', () => ({}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: { view: (vnode: { children: m.Children }) => vnode.children },
}));
vi.mock('@/lib/lesson', () => ({ stepLabel: (key: string) => key }));
vi.mock('@/lib/sentry', () => ({
	captureException: (error: unknown) => listened.captured.push(error),
}));
vi.mock('@/lib/classroom/classState', () => ({
	isPermissionDenied: (error: { code?: string }) => error.code === 'permission-denied',
}));
vi.mock('../replies/ReplyEntry', () => ({ ReplyEntry: { view: () => null } }));
vi.mock('@/lib/classroom/c3Data', () => ({
	listenMates: (
		mainId: string,
		tableId: string,
		_onData: unknown,
		onError: (error: Error) => void,
	) => {
		const call = { mainId, tableId, stopped: false };
		listened.calls.push(call);
		listened.onError = onError;

		return () => {
			call.stopped = true;
		};
	},
}));

const { WaitingView } = await import('../c2/WaitingView');
const { VoteResults } = await import('../c3/VoteResults');
const { watchTableRoster } = await import('../c2/rosterWatch');

const lesson = (settings: Record<string, unknown>): Statement =>
	({ statementId: 'm1', statementSettings: settings }) as unknown as Statement;

beforeEach(() => {
	listened.calls = [];
	listened.onError = null;
	listened.captured = [];
});

describe('the waiting screen counts the class from the server', () => {
	it('shows the number the server stored on the lesson', () => {
		const shown = textOf(m(WaitingView, { main: lesson({ studentCount: 12 }) }));
		expect(shown).toContain('opening.waiting_count {"n":12}');
	});

	it('shows no number before anyone joined or before the server counted', () => {
		expect(textOf(m(WaitingView, { main: lesson({ studentCount: 0 }) }))).not.toContain(
			'waiting_count',
		);
		expect(textOf(m(WaitingView, { main: lesson({}) }))).not.toContain('waiting_count');
	});
});

describe('the turnout line under the vote', () => {
	const summary = {
		kind: 'closed',
		rows: [],
		voted: 4,
		present: 9,
		resultsHidden: false,
		tie: false,
	} as unknown as VoteSummary;

	it('says "n of m voted" when the class size is known', () => {
		expect(textOf(m(VoteResults, { summary }))).toContain('summary.turnout {"n":4,"m":9}');
	});

	it('is left out while the class size is not known', () => {
		expect(textOf(m(VoteResults, { summary, turnoutShown: false }))).not.toContain(
			'summary.turnout',
		);
	});
});

describe('watchTableRoster follows the student seat', () => {
	it('listens to no table before a seat, then only to the current one', () => {
		const watch = watchTableRoster('m1');
		watch.sync(undefined);
		expect(listened.calls).toHaveLength(0);

		watch.sync('m1--1');
		watch.sync('m1--1');
		expect(listened.calls).toEqual([{ mainId: 'm1', tableId: 'm1--1', stopped: false }]);

		watch.sync('m1--2');
		expect(listened.calls[0].stopped).toBe(true);
		expect(listened.calls[1]).toEqual({ mainId: 'm1', tableId: 'm1--2', stopped: false });

		watch.sync(undefined);
		expect(listened.calls[1].stopped).toBe(true);
		expect(listened.calls).toHaveLength(2);
		expect(watch.subs).toEqual([]);
	});

	it('stop ends the current listener', () => {
		const watch = watchTableRoster('m1');
		watch.sync('m1--3');
		watch.stop();
		expect(listened.calls[0].stopped).toBe(true);
	});

	it('a refusal (the old table after a move) is no report; any other failure is', () => {
		const watch = watchTableRoster('m1');
		watch.sync('m1--1');
		listened.onError?.(Object.assign(new Error('denied'), { code: 'permission-denied' }));
		expect(listened.captured).toHaveLength(0);
		expect(watch.ready).toBe(true);

		listened.onError?.(Object.assign(new Error('down'), { code: 'unavailable' }));
		expect(listened.captured).toHaveLength(1);
	});
});
