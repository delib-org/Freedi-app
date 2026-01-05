import {
	object,
	string,
	number,
	optional,
	enum_,
	picklist,
	InferOutput,
} from 'valibot';

/**
 * ParagraphType enum defines the types of paragraphs supported in rich text content.
 * Used for structured document content across all Freedi apps.
 */
export enum ParagraphType {
	h1 = 'h1',
	h2 = 'h2',
	h3 = 'h3',
	h4 = 'h4',
	h5 = 'h5',
	h6 = 'h6',
	paragraph = 'paragraph',
	li = 'li',
	table = 'table',
	image = 'image',
}

/**
 * ListType for list items - either unordered (ul) or ordered (ol)
 */
export const ListTypeSchema = picklist(['ul', 'ol']);
export type ListType = 'ul' | 'ol';

/**
 * ParagraphSchema defines the structure of a paragraph in rich text content.
 * Paragraphs are ordered and typed for proper rendering (headings, lists, etc.)
 */
export const ParagraphSchema = object({
	paragraphId: string(), // Unique identifier for the paragraph
	type: enum_(ParagraphType), // The type of paragraph (h1-h6, paragraph, li, table, image)
	content: string(), // The text content of the paragraph (empty for images)
	order: number(), // Position in the document (0-based)
	listType: optional(ListTypeSchema), // For list items: 'ul' (unordered) or 'ol' (ordered)
	sourceStatementId: optional(string()), // ID of the original statement this paragraph came from (for merged proposals)
	imageUrl: optional(string()), // Firebase Storage URL for image paragraphs
	imageAlt: optional(string()), // Alt text for accessibility (images)
	imageCaption: optional(string()), // Optional caption displayed below the image
});

export type Paragraph = InferOutput<typeof ParagraphSchema>;
