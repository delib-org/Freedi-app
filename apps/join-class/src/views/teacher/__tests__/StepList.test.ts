import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';

vi.mock('../consoleState', () => ({ isBusy: (): boolean => false }));

vi.stubGlobal('document', { getElementById: () => null });

import { StepList, closeStepList, toggleStepList } from '../StepList';
import type { StepListAttrs } from '../StepList';

const KEYS: readonly LessonStepKey[] = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'allProposals',
	'vote',
	'summary',
];

function draw(currentIndex: number, held = false): m.Vnode {
	const attrs: StepListAttrs = {
		keys: KEYS,
		currentIndex,
		held,
		toggleId: 'toggle',
		onBack: vi.fn(),
	};

	return (StepList.view as unknown as (v: { attrs: StepListAttrs }) => m.Vnode)({ attrs });
}

function walk(node: m.Children, visit: (vnode: m.Vnode) => void): void {
	if (Array.isArray(node)) {
		node.forEach((child) => walk(child, visit));

		return;
	}
	if (node && typeof node === 'object') {
		const vnode = node as m.Vnode;
		visit(vnode);
		walk(vnode.children as m.Children, visit);
	}
}

function tags(vnode: m.Vnode, tag: string): m.Vnode[] {
	const found: m.Vnode[] = [];
	walk(vnode, (v) => {
		if (v.tag === tag) found.push(v);
	});

	return found;
}

describe('StepList: later steps are visible but not tappable', () => {
	beforeEach(() => closeStepList());

	it('is closed (hidden, empty) until it is opened', () => {
		const vnode = draw(4);
		expect((vnode.attrs as Record<string, unknown>).hidden).toBe(true);
		expect(tags(vnode, 'button')).toHaveLength(0);
	});

	it('during Investigation questions only the four earlier steps are buttons', () => {
		toggleStepList();
		const vnode = draw(4);
		const buttons = tags(vnode, 'button');
		expect(buttons).toHaveLength(4);
		expect(buttons.map((b) => (b.attrs as Record<string, unknown>)['data-step'])).toEqual([
			0, 1, 2, 3,
		]);
	});

	it('the current step and the later ones are list items marked in words, not buttons', () => {
		toggleStepList();
		const vnode = draw(4);
		const items = tags(vnode, 'li').filter(
			(li) => (li.attrs as Record<string, unknown>)['data-step'] !== undefined,
		);
		expect(items.map((li) => (li.attrs as Record<string, unknown>)['data-step'])).toEqual([
			4, 5, 6, 7, 8,
		]);
		expect((items[0].attrs as Record<string, unknown>)['aria-current']).toBe('step');
		expect((items[1].attrs as Record<string, unknown>)['aria-current']).toBeUndefined();
	});

	it('going back runs the caller (which asks first), and a held lesson cannot', () => {
		toggleStepList();
		const attrs: StepListAttrs = {
			keys: KEYS,
			currentIndex: 3,
			held: false,
			toggleId: 'toggle',
			onBack: vi.fn(),
		};
		const view = StepList.view as unknown as (v: { attrs: StepListAttrs }) => m.Vnode;
		const first = tags(view({ attrs }), 'button')[0];
		(first.attrs as { onclick: () => void }).onclick();
		expect(attrs.onBack).toHaveBeenCalledWith(0);
		toggleStepList();
		const heldButtons = tags(draw(3, true), 'button');
		expect(heldButtons.every((b) => (b.attrs as Record<string, unknown>).disabled === true)).toBe(
			true,
		);
	});

	it('at the first step nothing is a button', () => {
		toggleStepList();
		expect(tags(draw(0), 'button')).toHaveLength(0);
	});
});
