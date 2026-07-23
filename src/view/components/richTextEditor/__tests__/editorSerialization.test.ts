import { ParagraphType } from '@freedi/shared-types';
import {
	editorToParagraphs,
	paragraphsToEditor,
	inlineHtmlToNodes,
	sanitizeInlineHtml,
	TipTapNode,
} from '../editorSerialization';

const doc = (...content: TipTapNode[]): Record<string, unknown> => ({ type: 'doc', content });
const text = (t: string, marks?: string[]): TipTapNode => ({
	type: 'text',
	text: t,
	...(marks && { marks: marks.map((type) => ({ type })) }),
});
const para = (...content: TipTapNode[]): TipTapNode => ({ type: 'paragraph', content });

describe('editorSerialization', () => {
	describe('editorToParagraphs', () => {
		it('converts multiple paragraphs with order preserved', () => {
			const result = editorToParagraphs(
				doc(para(text('Line one')), para(text('Line two')), para(text('Line three'))),
			);

			expect(result.map((p) => p.content)).toEqual(['Line one', 'Line two', 'Line three']);
			expect(result.map((p) => p.order)).toEqual([0, 1, 2]);
			expect(result.every((p) => p.type === ParagraphType.paragraph)).toBe(true);
		});

		it('splits hard breaks (Shift+Enter) into separate paragraphs', () => {
			const result = editorToParagraphs(
				doc(para(text('Line one'), { type: 'hardBreak' }, text('Line two'))),
			);

			expect(result.map((p) => p.content)).toEqual(['Line one', 'Line two']);
		});

		it('maps heading levels', () => {
			const result = editorToParagraphs(
				doc({ type: 'heading', attrs: { level: 2 }, content: [text('Title')] }),
			);

			expect(result[0].type).toBe(ParagraphType.h2);
			expect(result[0].content).toBe('Title');
		});

		it('maps list items with listType', () => {
			const result = editorToParagraphs(
				doc({
					type: 'orderedList',
					content: [
						{ type: 'listItem', content: [para(text('First'))] },
						{ type: 'listItem', content: [para(text('Second'))] },
					],
				}),
			);

			expect(result.map((p) => p.content)).toEqual(['First', 'Second']);
			expect(result.every((p) => p.type === ParagraphType.li && p.listType === 'ol')).toBe(true);
		});

		it('captures bold and italic marks as contentHtml', () => {
			const result = editorToParagraphs(
				doc(
					para(text('plain '), text('bold', ['bold']), text(' and '), text('slanted', ['italic'])),
				),
			);

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe('plain bold and slanted');
			expect(result[0].contentHtml).toBe('plain <strong>bold</strong> and <em>slanted</em>');
		});

		it('omits contentHtml when no marks are present', () => {
			const result = editorToParagraphs(doc(para(text('just text'))));

			expect(result[0].contentHtml).toBeUndefined();
		});

		it('escapes HTML in marked content', () => {
			const result = editorToParagraphs(doc(para(text('<script>alert(1)</script>', ['bold']))));

			expect(result[0].contentHtml).toBe('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
		});

		it('drops empty lines', () => {
			const result = editorToParagraphs(doc(para(text('   ')), para(), para(text('kept'))));

			expect(result.map((p) => p.content)).toEqual(['kept']);
		});
	});

	describe('paragraphsToEditor', () => {
		it('rebuilds marks from contentHtml', () => {
			const json = paragraphsToEditor([
				{
					paragraphId: 'p1',
					type: ParagraphType.paragraph,
					content: 'plain bold',
					contentHtml: 'plain <strong>bold</strong>',
					order: 0,
				},
			]);

			const nodes = (json.content as TipTapNode[])[0].content as TipTapNode[];
			expect(nodes[0]).toEqual({ type: 'text', text: 'plain ' });
			expect(nodes[1]).toEqual({ type: 'text', text: 'bold', marks: [{ type: 'bold' }] });
		});

		it('groups consecutive list items into one list', () => {
			const json = paragraphsToEditor([
				{ paragraphId: 'a', type: ParagraphType.li, content: 'one', order: 0, listType: 'ul' },
				{ paragraphId: 'b', type: ParagraphType.li, content: 'two', order: 1, listType: 'ul' },
			]);

			const content = json.content as TipTapNode[];
			expect(content).toHaveLength(1);
			expect(content[0].type).toBe('bulletList');
			expect(content[0].content).toHaveLength(2);
		});

		it('round-trips text, marks and structure', () => {
			const original = editorToParagraphs(
				doc(
					{ type: 'heading', attrs: { level: 2 }, content: [text('Head')] },
					para(text('a '), text('b', ['bold', 'italic'])),
				),
			);

			const roundTripped = editorToParagraphs(paragraphsToEditor(original));

			expect(roundTripped.map((p) => ({ ...p, paragraphId: 'x' }))).toEqual(
				original.map((p) => ({ ...p, paragraphId: 'x' })),
			);
		});
	});

	describe('inlineHtmlToNodes', () => {
		it('parses legacy b/i tags as bold/italic', () => {
			expect(inlineHtmlToNodes('<b>x</b><i>y</i>')).toEqual([
				{ type: 'text', text: 'x', marks: [{ type: 'bold' }] },
				{ type: 'text', text: 'y', marks: [{ type: 'italic' }] },
			]);
		});

		it('strips disallowed markup', () => {
			expect(inlineHtmlToNodes('<img src=x onerror=alert(1)>safe')).toEqual([
				{ type: 'text', text: 'safe' },
			]);
		});
	});

	describe('sanitizeInlineHtml', () => {
		it('keeps only inline formatting tags', () => {
			expect(sanitizeInlineHtml('<strong>a</strong><script>bad()</script><a href="x">b</a>')).toBe(
				'<strong>a</strong>b',
			);
		});
	});
});
