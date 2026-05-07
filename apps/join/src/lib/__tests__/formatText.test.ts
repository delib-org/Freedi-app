import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every `m()` invocation. The mocked `m` returns a plain object so
// nested children show up in the assertions exactly the way the production
// pipeline assembles them.
interface Vnode {
	selector: string;
	attrs: Record<string, unknown>;
	children: unknown;
}

const mCalls: Vnode[] = [];
vi.mock('mithril', () => ({
	default: (selector: string, attrsOrChildren: unknown, maybeChildren?: unknown) => {
		// Mirror Mithril's signature: `m(sel, attrs, children)` OR `m(sel, children)`.
		const hasAttrs =
			attrsOrChildren !== null &&
			typeof attrsOrChildren === 'object' &&
			!Array.isArray(attrsOrChildren);
		const attrs = hasAttrs ? (attrsOrChildren as Record<string, unknown>) : {};
		const children = hasAttrs ? maybeChildren : attrsOrChildren;
		const node: Vnode = { selector, attrs, children };
		mCalls.push(node);

		return node;
	},
}));

import { formatText, matchNumberedItem } from '../formatText';

beforeEach(() => {
	mCalls.length = 0;
});

describe('formatText', () => {
	it('returns the original string when no markers and no URLs are present', () => {
		expect(formatText('hello world')).toBe('hello world');
		expect(mCalls).toHaveLength(0);
	});

	it('returns empty string unchanged', () => {
		expect(formatText('')).toBe('');
	});

	it('renders *foo* as a strong element', () => {
		const result = formatText('hello *world*') as unknown[];
		expect(Array.isArray(result)).toBe(true);
		const strong = mCalls.find((c) => c.selector === 'strong');
		expect(strong).toBeDefined();
		// Recursive formatter wraps the inner text in an array.
		expect(strong?.children).toEqual(['world']);
	});

	it('renders _foo_ as an em element', () => {
		formatText('an _italic_ word');
		const em = mCalls.find((c) => c.selector === 'em');
		expect(em).toBeDefined();
		expect(em?.children).toEqual(['italic']);
	});

	it('renders ~foo~ as an s element', () => {
		formatText('a ~strike~ word');
		const s = mCalls.find((c) => c.selector === 's');
		expect(s).toBeDefined();
		expect(s?.children).toEqual(['strike']);
	});

	it('does not match a marker when the inner content is whitespace-padded', () => {
		// `* foo *` has spaces hugging the asterisks — WhatsApp ignores it,
		// so we should pass it through untouched.
		expect(formatText('* foo *')).toBe('* foo *');
		expect(mCalls.find((c) => c.selector === 'strong')).toBeUndefined();
	});

	it('does not match an unclosed marker', () => {
		expect(formatText('*hello world')).toBe('*hello world');
	});

	it('handles nested formatting: *hello _world_*', () => {
		formatText('*hello _world_*');
		const strong = mCalls.find((c) => c.selector === 'strong');
		expect(strong).toBeDefined();
		// The strong's children should be a flat list containing the leading
		// text and a nested em vnode.
		const inner = strong?.children as unknown[];
		expect(inner[0]).toBe('hello ');
		expect((inner[1] as Vnode).selector).toBe('em');
	});

	it('handles single-character markers like *a*', () => {
		formatText('grade *A* please');
		const strong = mCalls.find((c) => c.selector === 'strong');
		expect(strong).toBeDefined();
		expect(strong?.children).toEqual(['A']);
	});

	it('linkifies URLs alongside formatting', () => {
		formatText('see *important* https://example.com today');
		const anchor = mCalls.find((c) => c.selector === 'a.linkified');
		const strong = mCalls.find((c) => c.selector === 'strong');
		expect(anchor?.attrs.href).toBe('https://example.com');
		expect(strong?.children).toEqual(['important']);
	});

	it('does not let a URL underscore trigger italic', () => {
		// `https://x.com/foo_bar_baz` would mis-parse as italic if URL
		// extraction didn't run first. Assert no <em> is emitted.
		formatText('go https://example.com/foo_bar_baz now');
		expect(mCalls.find((c) => c.selector === 'em')).toBeUndefined();
		expect(mCalls.find((c) => c.selector === 'a.linkified')).toBeDefined();
	});

	it('handles multiple markers in one string', () => {
		formatText('one *bold* and _italic_ and ~strike~');
		expect(mCalls.find((c) => c.selector === 'strong')).toBeDefined();
		expect(mCalls.find((c) => c.selector === 'em')).toBeDefined();
		expect(mCalls.find((c) => c.selector === 's')).toBeDefined();
	});

	it('does not span markers across newlines', () => {
		// Newline cancels the marker — protects against pathological input
		// where a stray `*` near the top of a body line would otherwise
		// "swallow" the rest of the message.
		const result = formatText('*not\nmatched*');
		expect(result).toBe('*not\nmatched*');
		expect(mCalls.find((c) => c.selector === 'strong')).toBeUndefined();
	});
});

describe('matchNumberedItem', () => {
	it('matches "1. text"', () => {
		expect(matchNumberedItem('1. first thing')).toEqual({
			num: 1,
			content: 'first thing',
		});
	});

	it('matches "12) text"', () => {
		expect(matchNumberedItem('12) twelfth thing')).toEqual({
			num: 12,
			content: 'twelfth thing',
		});
	});

	it('tolerates leading whitespace', () => {
		expect(matchNumberedItem('  3. indented')).toEqual({
			num: 3,
			content: 'indented',
		});
	});

	it('does not match without the trailing space', () => {
		expect(matchNumberedItem('1.text')).toBeNull();
	});

	it('does not match plain text', () => {
		expect(matchNumberedItem('hello')).toBeNull();
	});

	it('does not match a bare number', () => {
		expect(matchNumberedItem('1.')).toBeNull();
	});
});
