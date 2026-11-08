import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { AccessStatusRow } from '@freedi/shared-types';

const box = vi.hoisted(() => ({
	requests: [] as AccessStatusRow[],
}));

vi.mock('../../lib/i18n', () => ({
	t: (key: string, params?: Record<string, string>) =>
		params ? `${key}:${Object.values(params).join(',')}` : key,
}));
vi.mock('../../lib/access', () => ({
	getAccessStore: () => ({ requests: box.requests }),
	loadAccess: vi.fn(),
	withdrawAccessRequest: vi.fn(),
}));

import { AccessPanel, type AccessPanelAttrs } from '../AccessPanel';

type Child = m.Vnode | m.Vnode[] | null | undefined | string;

/** Every vnode under a tree, flattened — the hyperscript, no DOM needed */
function walk(node: Child, out: m.Vnode[] = []): m.Vnode[] {
	if (node == null || typeof node === 'string') return out;
	if (Array.isArray(node)) {
		node.forEach((child) => walk(child as Child, out));

		return out;
	}
	out.push(node);
	walk(node.children as Child, out);

	return out;
}

function render(attrs: AccessPanelAttrs): { text: string[]; buttons: string[] } {
	const component = AccessPanel() as m.Component<AccessPanelAttrs>;
	const tree = (component.view as (vnode: unknown) => m.Vnode)({ attrs });
	const nodes = walk(tree);
	const text = nodes.filter((n) => n.tag === '#').map((n) => String(n.children));
	const buttons = nodes
		.filter((n) => n.tag === 'button')
		.map((n) =>
			walk(n.children as Child)
				.filter((c) => c.tag === '#')
				.map((c) => String(c.children))
				.join(''),
		);

	return { text, buttons };
}

const row = (patch: Partial<AccessStatusRow>): AccessStatusRow => ({
	requestId: 'r1',
	role: 'teacher',
	status: 'pending',
	createdAt: 1,
	...patch,
});

describe('AccessPanel states', () => {
	beforeEach(() => {
		box.requests = [];
	});

	it('none: explains and offers the request form', () => {
		const { text, buttons } = render({ state: 'none', uid: 'u1' });
		expect(text).toContain('access.intro');
		expect(buttons).toEqual(['access.cta']);
	});

	it('pending: says waiting, names the school, offers withdraw and nothing else', () => {
		box.requests = [row({ schoolName: 'Ort Givatayim' })];
		const { text, buttons } = render({ state: 'pending', uid: 'u1' });
		expect(text).toContain('access.pending');
		expect(text).toContain('access.pending_text');
		expect(text).toContain('access.for_school:Ort Givatayim');
		expect(buttons).toEqual(['access.withdraw']);
	});

	it('declined: shows the reason and a way to ask again', () => {
		box.requests = [row({ status: 'declined', declineReason: 'Not a teacher' })];
		const { text, buttons } = render({ state: 'declined', uid: 'u1' });
		expect(text).toContain('access.declined');
		expect(text).toContain('access.declined_reason:Not a teacher');
		expect(buttons).toEqual(['access.new_request']);
	});

	it('declined without a reason shows no reason line', () => {
		box.requests = [row({ status: 'declined' })];
		const { text } = render({ state: 'declined', uid: 'u1' });
		expect(text.some((line) => line.startsWith('access.declined_reason'))).toBe(false);
	});
});
