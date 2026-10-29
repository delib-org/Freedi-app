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
}));

import { MemberChip } from '../MemberChip';
import { TablesBoard } from '../TablesBoard';
import { askConfirm } from '../ConfirmDialog';
import { consoleState, resetConsoleState } from '../consoleState';

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

function chipLabel(): string {
	const tree = (MemberChip.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { uid: 'u1', name: 'Dana', camp: 'a', from: null, tableNumbers: [] },
	} as unknown as m.Vnode);
	const button = flatten(tree).find(
		(v) => (v.attrs as { 'data-uid'?: string } | null)?.['data-uid'] === 'u1',
	);

	return String((button?.attrs as { 'aria-label': string })['aria-label']);
}

function toggle(): m.Vnode | undefined {
	const tree = (TablesBoard.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: {
			mainId: 'x',
			tables: [],
			students: [{ uid: 'u1', name: 'Dana', camp: 'a' }],
			plenum: false,
			tableTalk: false,
			showSides: true,
		},
	} as unknown as m.Vnode);

	return flatten(tree).find(
		(v) =>
			(v.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === 'console-sides-toggle',
	);
}

describe('teacher board hides sides by default', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('is off after a reset (reload)', () => {
		consoleState.sidesVisible = true;
		resetConsoleState('x');
		expect(consoleState.sidesVisible).toBe(false);
	});

	it('a chip speaks only the name while sides are hidden', () => {
		expect(chipLabel()).toBe('Dana');
	});

	it('a chip adds the side once shown', () => {
		consoleState.sidesVisible = true;
		expect(chipLabel()).toContain('Dana, ');
		expect(chipLabel()).not.toBe('Dana');
	});

	it('Show sides asks for a confirm and only the confirm turns them on', () => {
		const btn = toggle();
		(btn?.attrs as { onclick: () => void }).onclick();
		expect(askConfirm).toHaveBeenCalledTimes(1);
		expect(consoleState.sidesVisible).toBe(false);
		(vi.mocked(askConfirm).mock.calls[0][0] as { run: () => void }).run();
		expect(consoleState.sidesVisible).toBe(true);
	});

	it('Hide sides needs no confirm', () => {
		consoleState.sidesVisible = true;
		(toggle()?.attrs as { onclick: () => void }).onclick();
		expect(askConfirm).not.toHaveBeenCalled();
		expect(consoleState.sidesVisible).toBe(false);
	});
});
