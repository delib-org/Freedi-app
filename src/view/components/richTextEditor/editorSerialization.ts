import DOMPurifyDefault from 'dompurify';
import * as DOMPurifyModule from 'dompurify';
import { Paragraph, ParagraphType } from '@freedi/shared-types';

// dompurify ships CJS without a runtime `default` export; Vite adds the
// interop but ts-jest does not — fall back to the module object itself.
const DOMPurify = DOMPurifyDefault ?? (DOMPurifyModule as unknown as typeof DOMPurifyDefault);
import { generateParagraphId, sortParagraphs } from '@/utils/paragraphUtils';

/**
 * Conversion between the app's `Paragraph[]` model and TipTap's JSON document.
 *
 * The Paragraph model stores plain text in `content` (the cross-app source of
 * truth) and, only when inline formatting exists, a sanitized HTML rendition
 * in `contentHtml` limited to <strong>/<em>. Hard breaks (Shift+Enter) are
 * treated as paragraph separators so soft-wrapped text is never silently
 * merged into one line.
 */

/** TipTap node shape (subset used here). */
export interface TipTapNode {
	type: string;
	content?: TipTapNode[];
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string }>;
}

const INLINE_ALLOWED_TAGS = ['strong', 'em', 'b', 'i', 'br'];

/** Sanitize inline paragraph HTML down to the marks the model supports. */
export function sanitizeInlineHtml(html: string): string {
	return DOMPurify.sanitize(html, { ALLOWED_TAGS: INLINE_ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface InlineLine {
	text: string;
	html: string;
	hasMarks: boolean;
}

/**
 * Flatten a block node's inline content into lines, splitting on hardBreak.
 * Each line carries plain text plus an HTML rendition with <strong>/<em>.
 */
function nodeToLines(node: TipTapNode): InlineLine[] {
	const lines: InlineLine[] = [{ text: '', html: '', hasMarks: false }];

	const visit = (children: TipTapNode[] | undefined): void => {
		if (!children) return;
		for (const child of children) {
			if (child.type === 'hardBreak') {
				lines.push({ text: '', html: '', hasMarks: false });
			} else if (child.type === 'text') {
				const text = child.text ?? '';
				const markTypes = (child.marks ?? []).map((m) => m.type);
				let html = escapeHtml(text);
				if (markTypes.includes('italic')) html = `<em>${html}</em>`;
				if (markTypes.includes('bold')) html = `<strong>${html}</strong>`;
				const line = lines[lines.length - 1];
				line.text += text;
				line.html += html;
				if (markTypes.includes('bold') || markTypes.includes('italic')) {
					line.hasMarks = true;
				}
			} else if (child.type === 'paragraph') {
				// Nested paragraph (e.g. inside a listItem): its own line(s).
				if (lines[lines.length - 1].text !== '') {
					lines.push({ text: '', html: '', hasMarks: false });
				}
				visit(child.content);
			} else {
				visit(child.content);
			}
		}
	};

	visit(node.content);

	return lines.filter((line) => line.text.trim() !== '');
}

function headingLevelToType(level: number): ParagraphType {
	switch (level) {
		case 1:
			return ParagraphType.h1;
		case 2:
			return ParagraphType.h2;
		case 3:
			return ParagraphType.h3;
		case 4:
			return ParagraphType.h4;
		case 5:
			return ParagraphType.h5;
		case 6:
			return ParagraphType.h6;
		default:
			return ParagraphType.h1;
	}
}

interface ParagraphSeed {
	type: ParagraphType;
	listType?: 'ul' | 'ol';
}

/** Convert TipTap JSON to a Paragraph array. */
export function editorToParagraphs(json: Record<string, unknown>): Paragraph[] {
	const content = json.content as TipTapNode[];
	if (!content) return [];

	const paragraphs: Paragraph[] = [];
	let order = 0;

	const pushLines = (node: TipTapNode, seed: ParagraphSeed): void => {
		for (const line of nodeToLines(node)) {
			paragraphs.push({
				paragraphId: generateParagraphId(),
				type: seed.type,
				content: line.text,
				order: order++,
				...(seed.listType ? { listType: seed.listType } : {}),
				...(line.hasMarks ? { contentHtml: line.html } : {}),
			});
		}
	};

	for (const node of content) {
		if (node.type === 'bulletList' || node.type === 'orderedList') {
			const listType = node.type === 'orderedList' ? 'ol' : 'ul';
			for (const item of node.content ?? []) {
				if (item.type === 'listItem') {
					pushLines(item, { type: ParagraphType.li, listType });
				}
			}
		} else if (node.type === 'heading') {
			const level = (node.attrs?.level as number) ?? 1;
			pushLines(node, { type: headingLevelToType(level) });
		} else {
			pushLines(node, { type: ParagraphType.paragraph });
		}
	}

	return paragraphs;
}

/**
 * Parse a paragraph's inline HTML (<strong>/<em>/<b>/<i>/<br>) into TipTap
 * text nodes with marks. Any other markup is stripped by sanitization.
 */
export function inlineHtmlToNodes(html: string): TipTapNode[] {
	const container = document.createElement('div');
	container.innerHTML = sanitizeInlineHtml(html);

	const nodes: TipTapNode[] = [];

	const walk = (parent: Node, marks: string[]): void => {
		parent.childNodes.forEach((child) => {
			if (child.nodeType === Node.TEXT_NODE) {
				const text = child.textContent ?? '';
				if (!text) return;
				nodes.push({
					type: 'text',
					text,
					...(marks.length > 0 && { marks: marks.map((type) => ({ type })) }),
				});
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const tag = (child as Element).tagName.toLowerCase();
				if (tag === 'br') {
					nodes.push({ type: 'hardBreak' });

					return;
				}
				const mark =
					tag === 'strong' || tag === 'b' ? 'bold' : tag === 'em' || tag === 'i' ? 'italic' : null;
				const nextMarks = mark && !marks.includes(mark) ? [...marks, mark] : marks;
				walk(child, nextMarks);
			}
		});
	};

	walk(container, []);

	return nodes;
}

/** Inline TipTap nodes for a paragraph: marked-up if contentHtml exists. */
function paragraphInlineContent(para: Paragraph): TipTapNode[] {
	if (para.contentHtml) {
		const nodes = inlineHtmlToNodes(para.contentHtml);
		if (nodes.length > 0) return nodes;
	}

	return para.content ? [{ type: 'text', text: para.content }] : [];
}

function paragraphTypeToNode(para: Paragraph): TipTapNode {
	const textContent = paragraphInlineContent(para);

	switch (para.type) {
		case ParagraphType.h1:
		case ParagraphType.h2:
		case ParagraphType.h3:
		case ParagraphType.h4:
		case ParagraphType.h5:
		case ParagraphType.h6:
			return {
				type: 'heading',
				attrs: { level: Number(para.type.slice(1)) },
				content: textContent,
			};
		default:
			return { type: 'paragraph', content: textContent };
	}
}

/** Convert a Paragraph array to a TipTap JSON document. */
export function paragraphsToEditor(paragraphs: Paragraph[]): Record<string, unknown> {
	const sorted = sortParagraphs(paragraphs);
	const content: TipTapNode[] = [];
	let currentList: TipTapNode | null = null;
	let currentListType: 'ul' | 'ol' | undefined;

	for (const para of sorted) {
		if (para.type === ParagraphType.li) {
			const listType = para.listType || 'ul';
			const tipTapListType = listType === 'ol' ? 'orderedList' : 'bulletList';

			if (!currentList || currentListType !== listType) {
				if (currentList) content.push(currentList);
				currentList = { type: tipTapListType, content: [] };
				currentListType = listType;
			}

			currentList.content?.push({
				type: 'listItem',
				content: [{ type: 'paragraph', content: paragraphInlineContent(para) }],
			});
		} else {
			if (currentList) {
				content.push(currentList);
				currentList = null;
				currentListType = undefined;
			}
			content.push(paragraphTypeToNode(para));
		}
	}

	if (currentList) content.push(currentList);

	if (content.length === 0) {
		content.push({ type: 'paragraph', content: [] });
	}

	return { type: 'doc', content };
}
