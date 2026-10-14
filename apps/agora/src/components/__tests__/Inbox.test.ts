vi.mock('../../views/ThreadChat', () => ({ formatMessageTime: () => '10:00' }));
vi.mock('../../lib/digestPrefs', () => ({
	DIGEST_TIMEZONE_DEFAULT: 'Asia/Jerusalem',
	ODYSSEY_DIGEST_MAX_HOURS: 3,
	loadDigestSettings: vi.fn(),
	saveDigestSettings: vi.fn(),
}));
vi.mock('../../lib/helpedFocus', () => ({ requestFocus: vi.fn() }));
vi.mock('../../lib/notificationCopy', () => ({
	triggerLook: (trigger: string) => ({ icon: 'mail', line: `line:${trigger}` }),
}));
const box = vi.hoisted(() => ({
	items: [] as { id: string; trigger: string; at: number; read: boolean }[],
}));
vi.mock('../../lib/inbox', () => ({
	getInboxItems: () => box.items,
	inboxUnreadCount: () => box.items.filter((i) => !i.read).length,
	markAllInboxRead: vi.fn(),
	markInboxRead: vi.fn(),
	clearInbox: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import m from 'mithril';
import { Inbox, inboxListRows, type InboxAttrs } from '../Inbox';
import type { InboxItem } from '../../lib/inbox';

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

function classesOf(node: m.Vnode): string {
	const attrs = (node.attrs ?? {}) as { className?: string; class?: string };

	return `${attrs.className ?? ''} ${attrs.class ?? ''}`;
}

const news = (n: number): InboxItem[] =>
	Array.from({ length: n }, (_unused, i) => ({
		id: `n${i}`,
		trigger: 'reply',
		at: i,
		read: false,
	}));

const pinned = { label: 'The teacher', unread: 1, onOpen: vi.fn() };

/** Open the sheet the way a student does: press the envelope, then redraw */
function openSheet(attrs: InboxAttrs): m.Vnode[] {
	const component = Inbox();
	const view = (): Child => component.view({ attrs } as m.Vnode<InboxAttrs>) as Child;
	const button = walk(view()).find((node) => classesOf(node).includes('inbox-button'));
	(button?.attrs as { onclick: () => void }).onclick();

	return walk(view());
}

describe('Inbox', () => {
	beforeEach(() => {
		box.items = [];
	});

	describe('inboxListRows', () => {
		const row = (item: InboxItem): m.Vnode => m('button.inbox__row', { key: item.id }, item.id);

		it('keys every row so Mithril accepts the list', () => {
			const rows = inboxListRows(news(3), pinned, row, vi.fn());

			expect(rows).toHaveLength(4);
			expect(rows.every((r) => r.key != null)).toBe(true);
			// The same check Mithril makes, which used to throw
			expect(() => m('.inbox__list', rows)).not.toThrow();
		});

		it('has no hole in front of the news when there is no pinned row', () => {
			const rows = inboxListRows(news(2), undefined, row, vi.fn());

			expect(rows).toHaveLength(2);
			expect(() => m('.inbox__list', rows)).not.toThrow();
		});

		it('says the box is empty only when nothing at all is in it', () => {
			expect(inboxListRows([], undefined, row, vi.fn())).toHaveLength(1);
			expect(inboxListRows([], pinned, row, vi.fn())).toHaveLength(1);
		});

		it('the pinned row closes the sheet and opens the teacher thread', () => {
			const close = vi.fn();
			const onOpen = vi.fn();
			const [first] = inboxListRows([], { ...pinned, onOpen }, row, close);
			(first.attrs as { onclick: () => void }).onclick();

			expect(close).toHaveBeenCalled();
			expect(onOpen).toHaveBeenCalled();
		});
	});

	describe('the open sheet', () => {
		it('opens with news AND the teacher pinned (it used to throw)', () => {
			box.items = news(4);
			const tree = openSheet({ pinned });
			const rows = tree.filter((node) => classesOf(node).includes('inbox__row'));

			expect(tree.some((node) => classesOf(node).includes('inbox__scrim'))).toBe(true);
			expect(rows).toHaveLength(5);
		});

		it('opens with news and no teacher thread (it used to throw too)', () => {
			box.items = news(2);
			const rows = openSheet({}).filter((node) => classesOf(node).includes('inbox__row'));

			// Each piece of news once — no repeated rows
			expect(rows.map((r) => r.key)).toEqual(['n0', 'n1']);
		});

		it('shows the empty line when there is nothing', () => {
			const tree = openSheet({});

			expect(tree.some((node) => classesOf(node).includes('inbox__empty'))).toBe(true);
		});
	});
});
