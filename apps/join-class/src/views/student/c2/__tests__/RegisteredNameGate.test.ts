import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassArriveByNameResponse } from '@freedi/shared-types';
import { textOf } from '../../../__tests__/vnodeText';

const arrive = vi.hoisted(() => vi.fn());

vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock('@/styles/student-c2.scss', () => ({}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: { view: (vnode: { children: m.Children }) => vnode.children },
}));
vi.mock('@/lib/classroom/classState', () => ({ classState: { mySubscription: null } }));
vi.mock('@/lib/store', () => ({ getCustomDisplayName: () => 'Dana' }));
vi.mock('@/lib/classroom/arrivalActions', () => ({ arriveByName: arrive }));

const { RegisteredNameGate } = await import('../RegisteredNameGate');
const { stepOfResponse } = await import('@/lib/classroom/arrival');

interface Instance {
	gate: import('@/lib/classroom/arrival').GateState;
}

function mounted(): { state: Instance; vnode: m.Vnode<{ mainId: string }> } {
	const state = {} as Instance;
	const vnode = { attrs: { mainId: 'm1' }, state } as unknown as m.Vnode<{ mainId: string }>;
	(RegisteredNameGate.oninit as (v: m.Vnode<{ mainId: string }>) => void)(vnode);

	return { state, vnode };
}

function shown(vnode: m.Vnode<{ mainId: string }>): string {
	return textOf((RegisteredNameGate.view as (v: m.Vnode<{ mainId: string }>) => m.Children)(vnode));
}

function reach(state: Instance, response: ClassArriveByNameResponse): void {
	state.gate.step = stepOfResponse(response);
}

beforeEach(() => arrive.mockReset());

describe('the registered name gate', () => {
	it('starts on the field, asking for the full name as registered', () => {
		const { vnode } = mounted();
		expect(shown(vnode)).toContain('opening.name_join');
	});

	it('nameTaken: asks "is it you?" with yes and "someone else"', () => {
		const { state, vnode } = mounted();
		reach(state, { outcome: 'nameTaken' });
		const text = shown(vnode);
		expect(text).toContain('opening.name_taken');
		expect(text).toContain('opening.name_taken.yes');
		expect(text).toContain('opening.name_taken.no');
	});

	it('nameTwice: one button per table, labelled by number and topic', () => {
		const { state, vnode } = mounted();
		reach(state, {
			outcome: 'nameTwice',
			choices: [
				{ seatId: 's1', tableN: 2, topic: 'Transport' },
				{ seatId: 's2', tableN: 5 },
			],
		});
		const text = shown(vnode);
		expect(text).toContain('opening.name_twice');
		expect(text).toContain('opening.name_twice.choice {"n":2,"topic":"Transport"}');
		expect(text).toContain('opening.name_twice.choice_plain {"n":5,"topic":""}');
	});

	it('notFound: fix the name, or join without registering', () => {
		const { state, vnode } = mounted();
		reach(state, { outcome: 'notFound' });
		const text = shown(vnode);
		expect(text).toContain('opening.name_not_found');
		expect(text).toContain('opening.name_not_found.fix');
		expect(text).toContain('opening.name_not_found.join_new');
	});

	it('a finished gate shows only the short wait until the stage takes over', () => {
		const { state, vnode } = mounted();
		reach(state, { outcome: 'nameTwiceLater' });
		expect(shown(vnode)).toContain('opening.name_saving_short');
	});
});
