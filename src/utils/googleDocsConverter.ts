/**
 * Google Docs to Paragraph[] converter
 * Converts Google Docs API response to the app's paragraph format
 */

import { Paragraph, ParagraphType } from '@freedi/shared-types';
import { generateParagraphId } from './paragraphUtils';

/**
 * Google Docs API types (simplified for our needs)
 */
interface GoogleDocsDocument {
	title?: string;
	body?: {
		content?: GoogleDocsStructuralElement[];
	};
}

interface GoogleDocsStructuralElement {
	paragraph?: GoogleDocsParagraph;
	table?: GoogleDocsTable;
	sectionBreak?: object;
	tableOfContents?: object;
}

interface GoogleDocsParagraph {
	elements?: GoogleDocsParagraphElement[];
	paragraphStyle?: {
		namedStyleType?: string;
		headingId?: string;
	};
	bullet?: {
		listId?: string;
		nestingLevel?: number;
	};
}

interface GoogleDocsParagraphElement {
	textRun?: {
		content?: string;
		textStyle?: {
			bold?: boolean;
			italic?: boolean;
			underline?: boolean;
		};
	};
	horizontalRule?: object;
	inlineObjectElement?: object;
}

interface GoogleDocsTable {
	rows?: number;
	columns?: number;
	tableRows?: GoogleDocsTableRow[];
}

interface GoogleDocsTableRow {
	tableCells?: GoogleDocsTableCell[];
}

interface GoogleDocsTableCell {
	content?: GoogleDocsStructuralElement[];
}

interface GoogleDocsList {
	listProperties?: {
		nestingLevels?: Array<{
			bulletAlignment?: string;
			glyphType?: string;
			glyphFormat?: string;
		}>;
	};
}

interface GoogleDocsLists {
	[listId: string]: GoogleDocsList;
}

/**
 * Mapping from Google Docs named styles to ParagraphType
 */
const HEADING_STYLE_MAP: Record<string, ParagraphType> = {
	HEADING_1: ParagraphType.h1,
	HEADING_2: ParagraphType.h2,
	HEADING_3: ParagraphType.h3,
	HEADING_4: ParagraphType.h4,
	HEADING_5: ParagraphType.h5,
	HEADING_6: ParagraphType.h6,
	TITLE: ParagraphType.h1,
	SUBTITLE: ParagraphType.h2,
	NORMAL_TEXT: ParagraphType.paragraph,
};

/**
 * Convert a Google Docs API response to an array of Paragraphs
 * @param document - The Google Docs API document response
 * @param lists - Optional lists object for determining list types
 * @returns Array of Paragraph objects
 */
export function convertGoogleDocsToParagraphs(
	document: GoogleDocsDocument,
	lists?: GoogleDocsLists
): Paragraph[] {
	const paragraphs: Paragraph[] = [];
	let order = 0;

	const content = document.body?.content;
	if (!content) {
		return paragraphs;
	}

	for (const element of content) {
		if (element.paragraph) {
			const para = convertParagraphElement(element.paragraph, order, lists);
			if (para) {
				paragraphs.push(para);
				order++;
			}
		} else if (element.table) {
			const tablePara = convertTableElement(element.table, order);
			if (tablePara) {
				paragraphs.push(tablePara);
				order++;
			}
		}
		// Skip section breaks, table of contents, etc.
	}

	return paragraphs;
}

/**
 * Convert a paragraph element from Google Docs format
 */
function convertParagraphElement(
	paragraph: GoogleDocsParagraph,
	order: number,
	lists?: GoogleDocsLists
): Paragraph | null {
	// Extract text content
	const content = extractTextContent(paragraph.elements);

	// Skip empty paragraphs (just whitespace or empty)
	if (!content.trim()) {
		return null;
	}

	// Determine paragraph type
	let type: ParagraphType = ParagraphType.paragraph;
	let listType: 'ul' | 'ol' | undefined;

	// Check if it's a heading
	const namedStyle = paragraph.paragraphStyle?.namedStyleType;
	if (namedStyle && HEADING_STYLE_MAP[namedStyle]) {
		type = HEADING_STYLE_MAP[namedStyle];
	}

	// Check if it's a list item
	if (paragraph.bullet) {
		type = ParagraphType.li;

		// Determine list type from the lists object
		if (lists && paragraph.bullet.listId) {
			const list = lists[paragraph.bullet.listId];
			const nestingLevel = paragraph.bullet.nestingLevel ?? 0;
			const levelProperties = list?.listProperties?.nestingLevels?.[nestingLevel];

			// Check glyph type to determine ordered vs unordered
			const glyphType = levelProperties?.glyphType;
			if (glyphType === 'DECIMAL' || glyphType === 'ALPHA' || glyphType === 'ROMAN') {
				listType = 'ol';
			} else {
				listType = 'ul';
			}
		} else {
			listType = 'ul'; // Default to unordered
		}
	}

	const para: Paragraph = {
		paragraphId: generateParagraphId(),
		type,
		content: content.trim(),
		order,
	};

	if (listType) {
		para.listType = listType;
	}

	return para;
}

/**
 * Extract plain text content from paragraph elements
 */
function extractTextContent(elements?: GoogleDocsParagraphElement[]): string {
	if (!elements) return '';

	return elements
		.map((element) => {
			if (element.textRun?.content) {
				return element.textRun.content;
			}
			
return '';
		})
		.join('')
		.replace(/\n$/, ''); // Remove trailing newline
}

/**
 * Convert a table element to an HTML table paragraph
 */
function convertTableElement(
	table: GoogleDocsTable,
	order: number
): Paragraph | null {
	if (!table.tableRows || table.tableRows.length === 0) {
		return null;
	}

	let html = '<table>';

	table.tableRows.forEach((row, rowIndex) => {
		html += '<tr>';

		row.tableCells?.forEach((cell) => {
			const cellContent = extractCellContent(cell);
			const tag = rowIndex === 0 ? 'th' : 'td';
			html += `<${tag}>${escapeHtml(cellContent)}</${tag}>`;
		});

		html += '</tr>';
	});

	html += '</table>';

	return {
		paragraphId: generateParagraphId(),
		type: ParagraphType.table,
		content: html,
		order,
	};
}

/**
 * Extract text content from a table cell
 */
function extractCellContent(cell: GoogleDocsTableCell): string {
	if (!cell.content) return '';

	return cell.content
		.map((element) => {
			if (element.paragraph) {
				return extractTextContent(element.paragraph.elements);
			}
			
return '';
		})
		.join('\n')
		.trim();
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
	const htmlEntities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	};

	return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Get document title from Google Docs response
 */
export function getDocumentTitle(document: GoogleDocsDocument): string {
	return document.title || 'Untitled Document';
}

/**
 * Validate the Google Docs API response structure
 */
export function isValidGoogleDocsResponse(document: unknown): document is GoogleDocsDocument {
	if (!document || typeof document !== 'object') {
		return false;
	}

	const doc = document as GoogleDocsDocument;

	// Must have body with content array
	if (!doc.body || !Array.isArray(doc.body.content)) {
		return false;
	}

	return true;
}

export type { GoogleDocsDocument, GoogleDocsLists };
