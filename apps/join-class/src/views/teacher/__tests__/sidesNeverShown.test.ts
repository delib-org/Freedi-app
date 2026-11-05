import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));
vi.mock('../consoleActions', () => ({ moveStudent: vi.fn() }));
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
import { resetConsoleState } from '../consoleState';

/**
 * Tal, 2026-11-05 (Trello leeIKf0U): the teacher sees that a student chose a side,
 * never which. The console may be mirrored to the room, so nothing in the markup,
 * the class names or the accessible names may carry the side of a named student.
 */

type Camp = 'a' | 'b' | 'center';
const CAMPS: readonly Camp[] = ['a', 'b', 'center'];

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

function chipTree(chosen: boolean | undefined): m.Vnode {
	return (MemberChip.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { uid: 'u1', name: 'Dana', chosen, from: null, tableNumbers: [] },
	} as unknown as m.Vnode);
}

function chipButtonAttrs(chosen: boolean | undefined): { 'aria-label': string; title: string } {
	const button = flatten(chipTree(chosen)).find(
		(v) => (v.attrs as { 'data-uid'?: string } | null)?.['data-uid'] === 'u1',
	);

	return button?.attrs as { 'aria-label': string; title: string };
}

function boardTree(camp: Camp | null): m.Vnode {
	return (TablesBoard.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: {
			mainId: 'x',
			tables: [],
			students: [{ uid: 'u1', name: 'Dana', camp, tableId: null }],
			plenum: false,
			tableTalk: false,
			showSides: true,
		},
	} as unknown as m.Vnode);
}

function testIds(tree: m.Vnode): string[] {
	return flatten(tree)
		.map((v) => (v.attrs as { 'data-testid'?: string } | null)?.['data-testid'])
		.filter((id): id is string => typeof id === 'string');
}

describe('no teacher surface reveals the side of a named student', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('a chip that chose carries no side class, word or label: only the name is spoken', () => {
		const markup = JSON.stringify(chipTree(true));

		expect(markup).not.toContain('member-chip--a');
		expect(markup).not.toContain('member-chip--b');
		expect(markup).not.toContain('member-chip--center');
		expect(markup).not.toContain('console.side_a');
		expect(markup).not.toContain('console.side_b');
		expect(markup).not.toContain('console.side_center');
		expect(chipButtonAttrs(true)['aria-label']).toBe('Dana');
		expect(chipButtonAttrs(true).title).toBe('Dana');
	});

	it('a student with no side says so, and the label names no side', () => {
		expect(chipButtonAttrs(false)['aria-label']).toBe('Dana, console.side_none');
	});

	it('the board passes the same attrs to a chip whatever the side', () => {
		const chips = CAMPS.map(
			(camp) => flatten(boardTree(camp)).find((v) => (v.tag as unknown) === MemberChip)?.attrs,
		);

		expect(chips[0]).toBeDefined();
		expect(chips[1]).toEqual(chips[0]);
		expect(chips[2]).toEqual(chips[0]);
		expect(chips[0]).not.toHaveProperty('camp');
		expect(chips[0]).toMatchObject({ chosen: true });
	});

	it('the board shows the count of who chose and has no control to reveal sides', () => {
		const ids = testIds(boardTree('a'));

		expect(ids).toContain('console-sides-count');
		expect(ids).not.toContain('console-sides-toggle');
		expect(JSON.stringify(boardTree('a'))).not.toContain('sides_show');
	});

	it('two boards that differ only in a student side are identical', () => {
		expect(JSON.stringify(boardTree('a'))).toBe(JSON.stringify(boardTree('b')));
	});
});
