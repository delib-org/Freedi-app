import { describe, it, expect, vi } from 'vitest';

// Capture how `m()` was called so we can assert the produced anchor structure
// without rendering. Mithril is imported by linkify.ts at module load.
const mCalls: Array<{ selector: string; attrs: Record<string, unknown>; child: unknown }> = [];
vi.mock('mithril', () => ({
	default: (selector: string, attrs: Record<string, unknown>, child: unknown) => {
		mCalls.push({ selector, attrs, child });

		return { selector, attrs, child };
	},
}));

import { linkify } from '../linkify';

describe('linkify', () => {
	it('returns the original string when no URL is present', () => {
		expect(linkify('hello world')).toBe('hello world');
	});

	it('returns empty string unchanged', () => {
		expect(linkify('')).toBe('');
	});

	it('wraps a single https URL in an anchor with target=_blank', () => {
		mCalls.length = 0;
		const result = linkify('see https://example.com for more') as unknown[];
		expect(Array.isArray(result)).toBe(true);
		expect(result[0]).toBe('see ');
		expect(result[2]).toBe(' for more');

		const anchor = mCalls[0];
		expect(anchor.selector).toBe('a.linkified');
		expect(anchor.attrs.href).toBe('https://example.com');
		expect(anchor.attrs.target).toBe('_blank');
		expect(anchor.attrs.rel).toBe('noopener noreferrer');
		expect(anchor.child).toBe('https://example.com');
	});

	it('strips trailing punctuation from URL but keeps it as text', () => {
		mCalls.length = 0;
		const result = linkify('check https://example.com.') as unknown[];
		expect(mCalls[0].attrs.href).toBe('https://example.com');
		expect(mCalls[0].child).toBe('https://example.com');
		expect(result[result.length - 1]).toBe('.');
	});

	it('prefixes bare www. URLs with https://', () => {
		mCalls.length = 0;
		linkify('visit www.example.com today');
		expect(mCalls[0].attrs.href).toBe('https://www.example.com');
		expect(mCalls[0].child).toBe('www.example.com');
	});

	it('handles multiple URLs in one string', () => {
		mCalls.length = 0;
		linkify('a https://one.com and b http://two.com end');
		expect(mCalls).toHaveLength(2);
		expect(mCalls[0].attrs.href).toBe('https://one.com');
		expect(mCalls[1].attrs.href).toBe('http://two.com');
	});

	it('falls back to a regular anchor over the trimmed URL when truncated with "..." and no handler', () => {
		// Without a resolver, treat trailing dots as sentence punctuation —
		// emit an anchor over the trimmed host so the URL stays clickable.
		mCalls.length = 0;
		linkify('see https://goo... for more');
		expect(mCalls).toHaveLength(1);
		expect(mCalls[0].selector).toBe('a.linkified');
		expect(mCalls[0].attrs.href).toBe('https://goo');
		expect(mCalls[0].child).toBe('https://goo');
	});

	it('falls back to a regular anchor when truncated with a Unicode ellipsis and no handler', () => {
		mCalls.length = 0;
		linkify('see https://goo… for more');
		expect(mCalls).toHaveLength(1);
		expect(mCalls[0].selector).toBe('a.linkified');
		expect(mCalls[0].attrs.href).toBe('https://goo');
	});

	it('still strips a single trailing dot (sentence punctuation, not truncation)', () => {
		mCalls.length = 0;
		linkify('see https://example.com.');
		expect(mCalls).toHaveLength(1);
		expect(mCalls[0].attrs.href).toBe('https://example.com');
	});

	it('renders a truncated URL as a clickable anchor when onTruncatedUrlClick is provided', () => {
		mCalls.length = 0;
		const handler = vi.fn();
		linkify('see https://goo... for more', { onTruncatedUrlClick: handler });
		expect(mCalls).toHaveLength(1);
		expect(mCalls[0].selector).toBe('a.linkified.linkified--truncated');
		expect(mCalls[0].attrs.href).toBe('#');
		expect(mCalls[0].child).toBe('https://goo...');

		// Simulating a click should invoke the handler with the truncated text.
		const fakeEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event;
		(mCalls[0].attrs.onclick as (e: Event) => void)(fakeEvent);
		expect(handler).toHaveBeenCalledWith('https://goo...', fakeEvent);
	});
});
