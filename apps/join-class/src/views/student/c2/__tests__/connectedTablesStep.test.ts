import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { draw, textOf } from '../../../__tests__/vnodeText';

const state = vi.hoisted(() => ({
	table: null as unknown,
	sub: null as unknown,
	deferred: false,
}));

vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock('@/styles/student-c2.scss', () => ({}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: { view: (vnode: { children: m.Children }) => vnode.children },
}));
vi.mock('@/lib/classroom/classState', () => ({
	get classState() {
		return { table: state.table, mySubscription: state.sub };
	},
}));
vi.mock('@/lib/user', () => ({ getUserState: () => ({ user: { uid: 'me' } }) }));
vi.mock('../rosterWatch', () => ({ watchRoster: () => ({ subs: [], stop: vi.fn() }) }));
vi.mock('@/lib/classroom/arrivalActions', () => ({
	gateMemory: { reenter: false },
	hasDeferredPick: () => state.deferred,
}));

const { TablesView } = await import('../TablesView');

function main(connected: boolean, copied = false): Statement {
	return {
		statementId: 'm1',
		statementSettings: connected
			? {
					classRegistration: {
						tableAssignmentId: 'r1',
						connectedAt: 1,
						...(copied ? { seatingCopiedAt: 2 } : {}),
					},
				}
			: {},
	} as unknown as Statement;
}

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm1--4',
		mainId: 'm1',
		n: 4,
		memberUids: ['me', 'u2'],
		noDeviceMembers: [],
		...overrides,
	} as ClassTable;
}

function render(connected: boolean, copied = false): string {
	return textOf(m(TablesView, { main: main(connected, copied) }));
}

beforeEach(() => {
	state.table = null;
	state.sub = null;
	state.deferred = false;
});

describe('the student Tables step of a connected lesson', () => {
	it('shows the table number and the topic', () => {
		state.sub = { tableId: 'm1--4' };
		state.table = table({ topic: 'Transport' });
		const shown = render(true);
		expect(shown).toContain('table.number {"n":4}');
		expect(shown).toContain('table.topic {"topic":"Transport"}');
	});

	it('shows no topic line in a one-topic event', () => {
		state.sub = { tableId: 'm1--4' };
		state.table = table();
		expect(render(true)).not.toContain('table.topic');
	});

	it('lists the registered tablemates who have not arrived, apart from the people present', () => {
		state.sub = { tableId: 'm1--4' };
		state.table = table({ reservedSeats: [{ seatId: 's1', name: 'Noa Katz' }] });
		const shown = render(true);
		expect(shown).toContain('table.not_arrived');
		expect(shown).toContain('Noa Katz');
	});

	it('says the student is alone when only they are present', () => {
		state.sub = { tableId: 'm1--4' };
		state.table = table({ memberUids: ['me'] });
		expect(render(true)).toContain('table.alone');
		expect(render(false)).not.toContain('table.alone');
	});

	it('says "no table yet" in plain words before a seat exists', () => {
		expect(render(true)).toContain('table.no_seat_yet');
		expect(render(false)).toContain('table.not_placed');
	});

	it('offers "pick my table" only once the tables arrived and two registrations share the name', () => {
		state.deferred = true;
		expect(render(true, false)).not.toContain('table.pick_mine');
		expect(render(true, true)).toContain('table.pick_mine');
		state.deferred = false;
		expect(render(true, true)).not.toContain('table.pick_mine');
	});

	it('lays out 20 members at one table', () => {
		state.sub = { tableId: 'm1--4' };
		state.table = table({
			memberUids: Array.from({ length: 20 }, (_, i) => (i === 0 ? 'me' : `u${i}`)),
		});
		const chips = draw(m(TablesView, { main: main(true) })).classes.filter((name) =>
			name.startsWith('table-chip--'),
		);
		expect(chips.length).toBeGreaterThanOrEqual(20);
	});
});
