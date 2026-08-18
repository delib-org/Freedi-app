import { describe, it, expect } from 'vitest';
import { renderSummaryMarkdown } from '../summaryMarkdown';

interface VnodeLike {
	tag?: unknown;
	attrs?: { className?: string; href?: string; rel?: string; target?: string } | null;
	children?: unknown;
	text?: unknown;
}

function blocks(markdown: string): VnodeLike[] {
	return renderSummaryMarkdown(markdown) as unknown as VnodeLike[];
}

/** Flatten a vnode's children to their text content. */
function textOf(node: unknown): string {
	if (node == null || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(textOf).join('');
	const vnode = node as VnodeLike;
	if (vnode.tag === '#') return String(vnode.children ?? '');

	return textOf(vnode.children) + (typeof vnode.text === 'string' ? vnode.text : '');
}

describe('renderSummaryMarkdown', () => {
	it('renders ## as h3, ### as h4, #### as h5', () => {
		const [h3, h4, h5] = blocks('## Top\n### Mid\n#### Deep');
		expect(h3.tag).toBe('h3');
		expect(textOf(h3)).toBe('Top');
		expect(h4.tag).toBe('h4');
		expect(textOf(h4)).toBe('Mid');
		expect(h5.tag).toBe('h5');
		expect(textOf(h5)).toBe('Deep');
	});

	it('groups consecutive bullets into one list, blank line splits lists', () => {
		const result = blocks('- one\n- two\n\n- three');
		expect(result).toHaveLength(2);
		expect(result[0].tag).toBe('ul');
		expect(textOf(result[0])).toBe('onetwo');
		expect(result[1].tag).toBe('ul');
		expect(textOf(result[1])).toBe('three');
	});

	it('renders **bold** spans as strong vnodes', () => {
		const [p] = blocks('We agreed on **shorter meetings** now.');
		expect(p.tag).toBe('p');
		const kids = p.children as VnodeLike[];
		const strong = kids.find((child) => child?.tag === 'strong');
		expect(strong).toBeDefined();
		expect(textOf(strong)).toBe('shorter meetings');
		expect(textOf(p)).toBe('We agreed on shorter meetings now.');
	});

	it('renders plain lines as paragraph vnodes (no raw HTML injection)', () => {
		const [p] = blocks('Hello <script>alert(1)</script>');
		expect(p.tag).toBe('p');
		// The markup stays as inert text inside a vnode, never parsed as HTML
		expect(textOf(p)).toBe('Hello <script>alert(1)</script>');
	});

	it('returns no blocks for empty input', () => {
		expect(blocks('')).toHaveLength(0);
	});

	it('clamps heading levels outside ##…#### instead of printing hashes', () => {
		const [h1, h5] = blocks('# Title\n\n##### Deepest');
		expect(h1.tag).toBe('h3');
		expect(textOf(h1)).toBe('Title');
		expect(h5.tag).toBe('h5');
		expect(textOf(h5)).toBe('Deepest');
	});

	it('renders numbered lines as an ordered list', () => {
		const [list] = blocks('1. first\n2) second');
		expect(list.tag).toBe('ol');
		expect(textOf(list)).toBe('firstsecond');
	});

	it('closes the open list when the list type switches', () => {
		const result = blocks('- bullet\n1. numbered');
		expect(result.map((block) => block.tag)).toEqual(['ul', 'ol']);
	});

	it('renders http links as anchors with a safe rel', () => {
		const [p] = blocks('See [the notes](https://example.com/notes) for detail.');
		const anchor = (p.children as VnodeLike[]).find((child) => child?.tag === 'a');
		expect(anchor?.attrs?.href).toBe('https://example.com/notes');
		expect(anchor?.attrs?.rel).toBe('noopener noreferrer');
		expect(textOf(anchor)).toBe('the notes');
		expect(textOf(p)).toBe('See the notes for detail.');
	});

	it('leaves a javascript: link as inert text, never an anchor', () => {
		const [p] = blocks('[click me](javascript:alert(1))');
		const kids = p.children as VnodeLike[];
		expect(kids.find((child) => child?.tag === 'a')).toBeUndefined();
		expect(textOf(p)).toBe('[click me](javascript:alert(1))');
	});
});
