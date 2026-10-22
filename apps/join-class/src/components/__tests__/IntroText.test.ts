import { describe, expect, it } from 'vitest';
import m from 'mithril';
import { ParagraphType } from '@freedi/shared-types';
import { IntroText, blocksFromPlainText, groupIntroBlocks, introRuns } from '../IntroText';
import type { IntroBlock } from '@/lib/classroom/introText';

const para = (content: string, contentHtml?: string): IntroBlock => ({
	type: ParagraphType.paragraph,
	content,
	...(contentHtml ? { contentHtml } : {}),
});
const item = (content: string, listType: 'ul' | 'ol'): IntroBlock => ({
	type: ParagraphType.li,
	listType,
	content,
});

/** Every element tag the rendered tree contains. */
function tagsOf(node: m.Children, found: Set<string> = new Set()): Set<string> {
	if (Array.isArray(node)) {
		for (const child of node) tagsOf(child, found);
	} else if (node && typeof node === 'object') {
		const vnode = node as m.Vnode;
		if (typeof vnode.tag === 'string') found.add(vnode.tag);
		tagsOf(vnode.children as m.Children, found);
	}

	return found;
}

describe('introRuns', () => {
	it('splits on <strong> only and keeps Hebrew intact', () => {
		expect(introRuns(para('אבג דהו', 'אבג <strong>דהו</strong>'))).toEqual([
			{ text: 'אבג ', bold: false },
			{ text: 'דהו', bold: true },
		]);
	});

	it('drops every other tag to plain text (nothing can become markup)', () => {
		const runs = introRuns(
			para(
				'x',
				'<img src=x onerror=alert(1)>hi <script>alert(1)</script><em>e</em><strong>b</strong>',
			),
		);
		expect(runs.map((r) => r.text).join('')).toBe('hi alert(1)eb');
		expect(runs.filter((r) => r.bold).map((r) => r.text)).toEqual(['b']);
	});

	it('decodes the five entities as text, so "&lt;b&gt;" stays the characters <b>', () => {
		const runs = introRuns(para('x', '&lt;b&gt; &amp; &quot;q&quot; &#39;s&#39;'));
		expect(runs[0].text).toBe('<b> & "q" \'s\'');
	});

	it('falls back to the plain content without contentHtml, or when the html has no text', () => {
		expect(introRuns(para('plain'))).toEqual([{ text: 'plain', bold: false }]);
		expect(introRuns(para('fallback', '<br>'))).toEqual([{ text: 'fallback', bold: false }]);
	});
});

describe('groupIntroBlocks', () => {
	it('shares one list between neighbours of the same kind and splits on another kind or paragraph', () => {
		const groups = groupIntroBlocks([
			para('a'),
			item('1', 'ul'),
			item('2', 'ul'),
			item('3', 'ol'),
			para('b'),
			item('4', 'ul'),
		]);
		expect(groups.map((g) => g.kind)).toEqual(['p', 'ul', 'ol', 'p', 'ul']);
		const first = groups[1];
		expect(first.kind === 'ul' && first.blocks).toHaveLength(2);
	});
});

describe('IntroText view', () => {
	it('renders only p, ul, ol, li and strong, never raw HTML', () => {
		const vnode = IntroText.view({
			attrs: {
				size: 'phone',
				blocks: [para('t', 'a <strong>b</strong> <img src=x>'), item('x', 'ul'), item('y', 'ol')],
			},
		} as never);
		const tags = [...tagsOf(vnode as m.Children)].filter((tag) => tag !== '[' && tag !== '#');
		for (const tag of tags) expect(['div', 'p', 'ul', 'ol', 'li', 'strong']).toContain(tag);
		expect(JSON.stringify(vnode)).not.toContain('"tag":"<');
		expect(JSON.stringify(vnode)).not.toContain('trust');
	});

	it('renders nothing for no blocks and sets the projector fit step', () => {
		expect(IntroText.view({ attrs: { size: 'phone', blocks: [] } } as never)).toBeNull();
		const vnode = IntroText.view({
			attrs: { size: 'projector', fit: 40, blocks: [para('a')] },
		} as never) as m.Vnode;
		expect((vnode.attrs as Record<string, unknown>)['data-fit']).toBe('40');
	});
});

describe('blocksFromPlainText', () => {
	it('splits the description preview into paragraph blocks and drops empty lines', () => {
		expect(blocksFromPlainText('א\n\n ב \r\nג').map((b) => b.content)).toEqual(['א', 'ב', 'ג']);
		expect(blocksFromPlainText('   ')).toEqual([]);
	});
});
