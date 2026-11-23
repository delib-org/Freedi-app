import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassStatusInput } from '@/lib/classroom/classStatus';
import { textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

import { ClassStatusLine } from '../ClassStatusLine';
import type { ClassStatusLineAttrs } from '../ClassStatusLine';

const INPUT: ClassStatusInput = {
	status: 'live',
	stepKey: 'side',
	joined: 26,
	classSize: 26,
	projectorWhat: '',
	chose: 26,
	sideTotal: 26,
	tableCount: 0,
	unseated: 0,
	tablesDone: 0,
	tablesRating: 0,
	allRated: null,
	ballotFrozen: false,
	ballotPaused: false,
	ballotClosed: false,
	voted: 0,
	present: 26,
	resultsShown: false,
	stuckTables: [],
};

const WORDS = { stepName: 'Side', primaryLabel: 'Next' };

function draw(patch: Partial<ClassStatusInput>): m.Vnode {
	const attrs: ClassStatusLineAttrs = { input: { ...INPUT, ...patch }, words: WORDS };
	const state: Record<string, unknown> = {};
	const component = ClassStatusLine as unknown as {
		oninit: (v: unknown) => void;
		view: (v: unknown) => m.Vnode;
	};
	const vnode = { attrs, state };
	component.oninit(vnode);

	return component.view(vnode);
}

function find(node: m.Children, pick: (v: m.Vnode) => boolean, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => find(c, pick, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		if (pick(v)) out.push(v);
		find(v.children as m.Children, pick, out);
	}

	return out;
}

describe('ClassStatusLine', () => {
	it('says the step line and "ready to move on" with words (not colour alone) when the class is ready', () => {
		const text = textOf(draw({}));
		expect(text).toContain('console.sides_count');
		expect(text).toContain('console.ready');
	});

	it('does not say ready while students are still choosing', () => {
		expect(textOf(draw({ chose: 10 }))).not.toContain('console.ready');
	});

	it('draws no line while paused (the banner says it), but keeps the live region', () => {
		const tree = draw({ status: 'paused' });
		expect(textOf(tree)).not.toContain('console.sides_count');
		expect(
			find(tree, (v) => (v.attrs as { role?: string } | null)?.role === 'status'),
		).toHaveLength(1);
	});

	it('the visible line is not a live region (it changes with every student)', () => {
		const lines = find(
			draw({}),
			(v) => (v.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === 'class-status',
		);
		expect(lines).toHaveLength(1);
		expect((lines[0].attrs as Record<string, unknown>)['aria-live']).toBeUndefined();
		expect((lines[0].attrs as Record<string, unknown>).role).toBeUndefined();
	});

	it('a stuck table is named in words with a "Show" button', () => {
		const text = textOf(draw({ stepKey: 'tableTalk', tableCount: 6, stuckTables: [4] }));
		expect(text).toContain('console.status.stuck_one');
		expect(text).toContain('console.status.show');
	});

	it('students without a table get a "Show" button', () => {
		const text = textOf(draw({ stepKey: 'tables', tableCount: 6, unseated: 2 }));
		expect(text).toContain('console.unplaced_live');
		expect(text).toContain('console.status.show');
	});

	it('at the vote, students without a table are noted beside the count and still counted', () => {
		const open = {
			stepKey: 'vote' as const,
			ballotFrozen: true,
			voted: 6,
			present: 7,
			unseated: 1,
		};
		const text = textOf(draw(open));
		expect(text).toContain('console.vote_progress');
		expect(text).toContain('console.status.vote_unseated_one');
		expect(text).not.toContain('console.status.show');
		expect(textOf(draw({ ...open, unseated: 3 }))).toContain('console.status.vote_unseated_many');
		expect(textOf(draw({ ...open, unseated: 0 }))).not.toContain('vote_unseated');
	});
});
