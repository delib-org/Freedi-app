// Paragraph types for rich text editor
// TODO: Remove this file once delib-npm is updated with Paragraph types

export enum ParagraphType {
	h1 = 'h1',
	h2 = 'h2',
	h3 = 'h3',
	h4 = 'h4',
	h5 = 'h5',
	h6 = 'h6',
	paragraph = 'paragraph',
	li = 'li',
}

export interface Paragraph {
	paragraphId: string;
	type: ParagraphType;
	content: string;
	order: number;
	listType?: 'ul' | 'ol';
}

// Extended Statement type with paragraphs
// Use this interface to extend the Statement type from delib-npm
export interface StatementWithParagraphs {
	paragraphs?: Paragraph[];
}
