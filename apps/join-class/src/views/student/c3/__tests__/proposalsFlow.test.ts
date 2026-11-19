import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('@/lib/firebase', () => ({}));

import { SubStepStrip } from '../SubStepStrip';
import { PenClaim, PenWatch } from '../PenScreen';
import { nextLineText, nextLineView } from '../ProposalsNext';
import { WriteBox } from '../WriteBox';

/** The Proposals screens (Trello 6KEXvzXK): a read-only marker, one control per state, a next line in words. */

function render<A>(component: m.Component<A>, attrs: A): m.Vnode {
	return (component.view as unknown as (v: m.Vnode) => m.Vnode)({ attrs } as unknown as m.Vnode);
}

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

const tagOf = (v: m.Vnode): string => (typeof v.tag === 'string' ? v.tag : 'component');
const classOf = (v: m.Vnode): string => (v.attrs as { className?: string } | null)?.className ?? '';
const buttonsOf = (node: m.Children): m.Vnode[] =>
	flatten(node).filter((v) => tagOf(v) === 'button');
const testIdOf = (v: m.Vnode): string => (v.attrs as { 'data-testid': string })['data-testid'];

describe('the Talk, Write, Rate marker', () => {
	it('has no buttons: nothing in it can be tapped', () => {
		const tree = render(SubStepStrip, { current: 'write' as const });
		const pills = flatten(tree).filter((v) => classOf(v).includes('substeps__pill'));

		expect(buttonsOf(tree)).toHaveLength(0);
		expect(pills).toHaveLength(3);
		expect(JSON.stringify(tree)).not.toContain('onclick');
	});

	it("marks the table's part and only that one", () => {
		const pills = flatten(render(SubStepStrip, { current: 'rate' as const })).filter((v) =>
			classOf(v).includes('substeps__pill'),
		);
		const marked = pills.filter((v) => (v.attrs as { 'aria-current'?: string })['aria-current']);

		expect(marked).toHaveLength(1);
		expect((marked[0].attrs as { 'data-step': string })['data-step']).toBe('rate');
	});
});

describe('W1: the pen is free', () => {
	const attrs = {
		statusText: 'who writes first',
		nextText: 'next',
		busy: false,
		onClaim: vi.fn(),
		onPass: vi.fn(),
	};

	it('offers exactly two things: take the pen, and a quiet pass', () => {
		expect(buttonsOf(render(PenClaim, attrs)).map(testIdOf)).toEqual(['pen-claim', 'pen-pass']);
	});

	it('is disabled while a tap is in flight, and the pass is left out when not offered', () => {
		const busy = buttonsOf(render(PenClaim, { ...attrs, busy: true }));

		expect(busy.every((v) => (v.attrs as { disabled: boolean }).disabled)).toBe(true);
		expect(buttonsOf(render(PenClaim, { ...attrs, onPass: undefined }))).toHaveLength(1);
	});
});

describe('W3: a tablemate holds the pen', () => {
	it('is her text, read only, and has no button at all', () => {
		const tree = render(PenWatch, {
			name: 'Noa',
			text: 'Plant trees',
			nextText: null,
			testId: 'pen-watch',
		});
		const box = flatten(tree).find((v) => (v.tag as unknown) === WriteBox);
		const boxAttrs = box?.attrs as { readOnly: boolean; value: string; testId: string };

		expect(buttonsOf(tree)).toHaveLength(0);
		expect(boxAttrs.readOnly).toBe(true);
		expect(boxAttrs.value).toBe('Plant trees');
		expect(boxAttrs.testId).toBe('pen-watch');
	});
});

describe('the next line', () => {
	it('asks the language for the sentence, with the names joined', () => {
		const names: Record<string, string> = { a: 'Noa', b: 'Avi' };
		const text = nextLineText(
			{ key: 'proposals.next.waiting_for', uids: ['a', 'b'] },
			(id) => names[id],
			'en',
		);

		expect(text).toBe('proposals.next.waiting_for');
	});

	it('is nothing when there is nothing to say', () => {
		expect(nextLineText(null, () => 'x', 'en')).toBeNull();
		expect(nextLineView(null)).toBeNull();
		expect(nextLineView('')).toBeNull();
	});

	it('is one visible line with a test id', () => {
		const line = nextLineView('Waiting for Avi') as m.Vnode;

		expect(classOf(line)).toContain('proposals-next');
		expect(testIdOf(line)).toBe('proposals-next');
	});
});
