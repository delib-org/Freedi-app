import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';

vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));
vi.mock('../consoleActions', () => ({ moveStudent: vi.fn(), requestNewName: vi.fn() }));
vi.mock('@/lib/firebase', () => ({}));
vi.mock('../dragController', () => ({
	dropAttrs: vi.fn(() => ({})),
	pressChip: vi.fn(),
	keyChip: vi.fn(),
	blurChip: vi.fn(),
	targetName: vi.fn(() => ''),
}));

import { MemberChip } from '../MemberChip';
import { TablesBoard } from '../TablesBoard';
import { consoleState, resetConsoleState } from '../consoleState';

/**
 * Trello 3sq65nGv: nothing on the teacher's side stops moving a student once the
 * tables are chosen, while the lesson runs or is paused. Only an ended lesson does, and the server agrees.
 */

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

function chipButton(): m.Vnode | undefined {
	const tree = (MemberChip.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { uid: 'u1', name: 'Dana', camp: null, from: 1, tableNumbers: [1, 2] },
	} as unknown as m.Vnode);

	return flatten(tree).find(
		(v) => (v.attrs as { 'data-uid'?: string } | null)?.['data-uid'] === 'u1',
	);
}

function boardHint(state: { held: boolean; ended: boolean }): m.Vnode | undefined {
	consoleState.held = state.held;
	consoleState.ended = state.ended;
	const table = {
		tableId: 'x--1',
		mainId: 'x',
		n: 1,
		memberUids: ['u1'],
		noDeviceMembers: [],
		spokenUids: [],
	} as unknown as ClassTable;
	const tree = (TablesBoard.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: {
			mainId: 'x',
			tables: [table],
			students: [{ uid: 'u1', name: 'Dana', camp: null, tableId: 'x--1' }],
			plenum: false,
			tableTalk: false,
			showSides: false,
		},
	} as unknown as m.Vnode);

	return flatten(tree).find(
		(v) => (v.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === 'console-drag-hint',
	);
}

describe('moving students after the tables are chosen', () => {
	beforeEach(() => {
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('a seated chip can be dragged and has the move menu while the lesson runs', () => {
		const attrs = chipButton()?.attrs as { onpointerdown?: unknown; onkeydown?: unknown };
		expect(attrs.onpointerdown).toBeTypeOf('function');
		expect(attrs.onkeydown).toBeTypeOf('function');
	});

	it('a paused lesson still allows the drag and the move menu', () => {
		consoleState.held = true;
		consoleState.ended = false;
		const attrs = chipButton()?.attrs as { onpointerdown?: unknown; onkeydown?: unknown };
		expect(attrs.onpointerdown).toBeTypeOf('function');
		expect(attrs.onkeydown).toBeTypeOf('function');
	});

	it('an ended lesson stands still: no drag', () => {
		consoleState.held = true;
		consoleState.ended = true;
		const attrs = chipButton()?.attrs as { onpointerdown?: unknown };
		expect(attrs.onpointerdown).toBeUndefined();
	});

	it('the board tells the teacher she can drag a name, while running and paused, not once ended', () => {
		expect(boardHint({ held: false, ended: false })).toBeDefined();
		expect(boardHint({ held: true, ended: false })).toBeDefined();
		expect(boardHint({ held: true, ended: true })).toBeUndefined();
	});
});
