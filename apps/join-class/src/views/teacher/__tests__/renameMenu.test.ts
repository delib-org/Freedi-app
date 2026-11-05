import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('../consoleActions', () => ({ moveStudent: vi.fn(), requestNewName: vi.fn() }));
vi.mock('@/lib/firebase', () => ({}));
vi.mock('../dragController', () => ({
	dropAttrs: vi.fn(() => ({})),
	pressChip: vi.fn(),
	keyChip: vi.fn(),
	blurChip: vi.fn(),
	targetName: (n: number | null) => (n === null ? 'No table' : `Table ${n}`),
}));

import { MemberChip } from '../MemberChip';
import { consoleState, resetConsoleState } from '../consoleState';
import { moveStudent, requestNewName } from '../consoleActions';

/** Trello 0afoikKD: the teacher taps a student and chooses "ask for a new name". */

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

function chip(uid: string | null = 'u1'): m.Vnode[] {
	const tree = (MemberChip.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { uid: uid ?? undefined, name: 'Dana', from: 1, tableNumbers: [1, 2, 3] },
	} as unknown as m.Vnode);

	return flatten(tree);
}

function optionValues(nodes: m.Vnode[]): string[] {
	return nodes
		.filter((v) => v.tag === 'option')
		.map((v) => String((v.attrs as { value: string }).value));
}

function menuButtons(nodes: m.Vnode[]): m.Vnode[] {
	return nodes.filter(
		(v) =>
			v.tag === 'button' && (v.attrs as { 'aria-expanded'?: string } | null)?.['aria-expanded'],
	);
}

function select(nodes: m.Vnode[]): { onchange: (e: Event) => void } {
	return nodes.find((v) => v.tag === 'select')?.attrs as { onchange: (e: Event) => void };
}

function choose(nodes: m.Vnode[], value: string): void {
	select(nodes).onchange({ target: { value } } as unknown as Event);
}

describe('the student menu offers "ask for a new name"', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('every student with a phone has the menu button, even before the tables exist', () => {
		const buttons = menuButtons(chip());
		expect(buttons).toHaveLength(1);
	});

	it('a no-device member has no menu: there is no phone to ask', () => {
		const buttons = menuButtons(chip(null));
		expect(buttons).toHaveLength(0);
	});

	it('the open menu lists the moves and the rename; choosing rename asks that student', () => {
		consoleState.menuUid = 'u1';
		const nodes = chip();
		expect(optionValues(nodes)).toEqual(['', 'none', '2', '3', 'rename']);
		choose(nodes, 'rename');
		expect(requestNewName).toHaveBeenCalledWith('x', 'u1', 'Dana');
		expect(moveStudent).not.toHaveBeenCalled();
		expect(consoleState.menuUid).toBeNull();
	});

	it('choosing a table still moves the student', () => {
		consoleState.menuUid = 'u1';
		choose(chip(), '3');
		expect(moveStudent).toHaveBeenCalledWith('x', 'u1', 3);
		expect(requestNewName).not.toHaveBeenCalled();
	});

	it('a paused lesson still offers the moves (Trello 3sq65nGv)', () => {
		consoleState.menuUid = 'u1';
		consoleState.held = true;
		expect(optionValues(chip())).toEqual(['', 'none', '2', '3', 'rename']);
	});

	it('an ended lesson keeps the rename but offers no move', () => {
		consoleState.menuUid = 'u1';
		consoleState.held = true;
		consoleState.ended = true;
		expect(optionValues(chip())).toEqual(['', 'rename']);
	});
});
