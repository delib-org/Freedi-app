/**
 * Tests for googleDocsConverter
 *
 * Tests conversion of Google Docs API response to Paragraph format.
 */

jest.mock('@freedi/shared-types', () => {
	enum ParagraphType {
		paragraph = 'paragraph',
		h1 = 'h1',
		h2 = 'h2',
		h3 = 'h3',
		h4 = 'h4',
		h5 = 'h5',
		h6 = 'h6',
		li = 'li',
		table = 'table',
	}

	return { ParagraphType };
});

// Mock crypto.randomUUID
const mockRandomUUID = jest.fn().mockReturnValue('test-uuid-1234-5678-abcdefgh');
Object.defineProperty(global, 'crypto', {
	value: { randomUUID: mockRandomUUID },
	writable: true,
});

import {
	convertGoogleDocsToParagraphs,
	getDocumentTitle,
	isValidGoogleDocsResponse,
} from '../googleDocsConverter';
import type { GoogleDocsDocument, GoogleDocsLists } from '../googleDocsConverter';

describe('googleDocsConverter', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRandomUUID.mockReturnValue('test-uuid-1234-5678-abcdefgh');
	});

	describe('convertGoogleDocsToParagraphs', () => {
		it('should return empty array for document with no body', () => {
			const doc: GoogleDocsDocument = {};
			expect(convertGoogleDocsToParagraphs(doc)).toEqual([]);
		});

		it('should return empty array for document with no content', () => {
			const doc: GoogleDocsDocument = { body: {} };
			expect(convertGoogleDocsToParagraphs(doc)).toEqual([]);
		});

		it('should convert a normal text paragraph', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Hello World' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(1);
			expect(result[0].content).toBe('Hello World');
			expect(result[0].type).toBe('paragraph');
			expect(result[0].order).toBe(0);
		});

		it('should convert heading styles correctly', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Heading 1' } }],
								paragraphStyle: { namedStyleType: 'HEADING_1' },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Heading 2' } }],
								paragraphStyle: { namedStyleType: 'HEADING_2' },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Title' } }],
								paragraphStyle: { namedStyleType: 'TITLE' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(3);
			expect(result[0].type).toBe('h1');
			expect(result[1].type).toBe('h2');
			expect(result[2].type).toBe('h1'); // TITLE maps to h1
		});

		it('should skip empty paragraphs', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Content' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: '   \n' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'More content' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(2);
			expect(result[0].content).toBe('Content');
			expect(result[1].content).toBe('More content');
			expect(result[1].order).toBe(1);
		});

		it('should handle bullet list items as unordered by default', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Item 1' } }],
								bullet: { listId: 'list-1' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('li');
			expect(result[0].listType).toBe('ul');
		});

		it('should detect ordered lists from glyph type', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Numbered item' } }],
								bullet: { listId: 'list-1', nestingLevel: 0 },
							},
						},
					],
				},
			};
			const lists: GoogleDocsLists = {
				'list-1': {
					listProperties: {
						nestingLevels: [{ glyphType: 'DECIMAL' }],
					},
				},
			};
			const result = convertGoogleDocsToParagraphs(doc, lists);
			expect(result).toHaveLength(1);
			expect(result[0].listType).toBe('ol');
		});

		it('should concatenate multiple text runs in a paragraph', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Hello ' } }, { textRun: { content: 'World' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result[0].content).toBe('Hello World');
		});

		it('should convert table elements to HTML', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							table: {
								rows: 2,
								columns: 2,
								tableRows: [
									{
										tableCells: [
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: 'Header 1' } }],
														},
													},
												],
											},
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: 'Header 2' } }],
														},
													},
												],
											},
										],
									},
									{
										tableCells: [
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: 'Cell 1' } }],
														},
													},
												],
											},
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: 'Cell 2' } }],
														},
													},
												],
											},
										],
									},
								],
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('table');
			expect(result[0].content).toContain('<table>');
			expect(result[0].content).toContain('<th>Header 1</th>');
			expect(result[0].content).toContain('<td>Cell 1</td>');
		});

		it('should skip section breaks', () => {
			const doc: GoogleDocsDocument = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Before break' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
						{ sectionBreak: {} },
						{
							paragraph: {
								elements: [{ textRun: { content: 'After break' } }],
								paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
							},
						},
					],
				},
			};
			const result = convertGoogleDocsToParagraphs(doc);
			expect(result).toHaveLength(2);
		});
	});

	describe('getDocumentTitle', () => {
		it('should return the document title', () => {
			const doc: GoogleDocsDocument = { title: 'My Document' };
			expect(getDocumentTitle(doc)).toBe('My Document');
		});

		it('should return "Untitled Document" if no title', () => {
			const doc: GoogleDocsDocument = {};
			expect(getDocumentTitle(doc)).toBe('Untitled Document');
		});

		it('should return "Untitled Document" for empty title', () => {
			const doc: GoogleDocsDocument = { title: '' };
			expect(getDocumentTitle(doc)).toBe('Untitled Document');
		});
	});

	describe('isValidGoogleDocsResponse', () => {
		it('should return true for valid document structure', () => {
			const doc = { body: { content: [] } };
			expect(isValidGoogleDocsResponse(doc)).toBe(true);
		});

		it('should return false for null', () => {
			expect(isValidGoogleDocsResponse(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isValidGoogleDocsResponse(undefined)).toBe(false);
		});

		it('should return false for non-object', () => {
			expect(isValidGoogleDocsResponse('string')).toBe(false);
		});

		it('should return false for missing body', () => {
			expect(isValidGoogleDocsResponse({})).toBe(false);
		});

		it('should return false for missing content array', () => {
			expect(isValidGoogleDocsResponse({ body: {} })).toBe(false);
		});

		it('should return false for non-array content', () => {
			expect(isValidGoogleDocsResponse({ body: { content: 'not an array' } })).toBe(false);
		});
	});
});
