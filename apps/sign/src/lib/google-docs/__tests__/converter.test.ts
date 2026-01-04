/**
 * Tests for converter - Google Docs to Paragraph conversion
 */

import { ParagraphType } from '@/types';

// Mock crypto.randomUUID
const mockRandomUUID = jest.fn(() => 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
Object.defineProperty(global.crypto, 'randomUUID', {
	value: mockRandomUUID,
	writable: true,
});

import {
	convertGoogleDocsToParagraphs,
	getDocumentTitle,
	hasHtmlFormatting,
	ConversionResult,
} from '../converter';

describe('converter', () => {
	beforeEach(() => {
		mockRandomUUID.mockClear();
		mockRandomUUID.mockReturnValue('abcd1234-5678-9012-3456-789012345678');
	});

	describe('convertGoogleDocsToParagraphs', () => {
		it('should return empty arrays for document with no body', () => {
			const doc = {};
			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs).toEqual([]);
			expect(result.images).toEqual([]);
		});

		it('should return empty arrays for document with empty content', () => {
			const doc = { body: { content: [] } };
			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs).toEqual([]);
			expect(result.images).toEqual([]);
		});

		it('should convert simple paragraph', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{ textRun: { content: 'Hello World' } },
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs).toHaveLength(1);
			expect(result.paragraphs[0].content).toBe('Hello World');
			expect(result.paragraphs[0].type).toBe(ParagraphType.paragraph);
			expect(result.paragraphs[0].order).toBe(0);
		});

		it('should skip empty paragraphs', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: '' } }],
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: '   ' } }],
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Content' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs).toHaveLength(1);
			expect(result.paragraphs[0].content).toBe('Content');
		});

		it('should convert heading styles', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								paragraphStyle: { namedStyleType: 'HEADING_1' },
								elements: [{ textRun: { content: 'H1 Title' } }],
							},
						},
						{
							paragraph: {
								paragraphStyle: { namedStyleType: 'HEADING_2' },
								elements: [{ textRun: { content: 'H2 Subtitle' } }],
							},
						},
						{
							paragraph: {
								paragraphStyle: { namedStyleType: 'HEADING_3' },
								elements: [{ textRun: { content: 'H3 Section' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].type).toBe(ParagraphType.h1);
			expect(result.paragraphs[1].type).toBe(ParagraphType.h2);
			expect(result.paragraphs[2].type).toBe(ParagraphType.h3);
		});

		it('should convert TITLE style to h1', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								paragraphStyle: { namedStyleType: 'TITLE' },
								elements: [{ textRun: { content: 'Document Title' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].type).toBe(ParagraphType.h1);
		});

		it('should convert bullet list items', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								bullet: { listId: 'list1' },
								elements: [{ textRun: { content: 'List item 1' } }],
							},
						},
					],
				},
				lists: {
					list1: {
						listProperties: {
							nestingLevels: [{ glyphType: 'BULLET' }],
						},
					},
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].type).toBe(ParagraphType.li);
			expect(result.paragraphs[0].listType).toBe('ul');
		});

		it('should convert numbered list items', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								bullet: { listId: 'list1', nestingLevel: 0 },
								elements: [{ textRun: { content: 'Numbered item' } }],
							},
						},
					],
				},
				lists: {
					list1: {
						listProperties: {
							nestingLevels: [{ glyphType: 'DECIMAL' }],
						},
					},
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].type).toBe(ParagraphType.li);
			expect(result.paragraphs[0].listType).toBe('ol');
		});

		it('should apply bold formatting', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Bold text',
											textStyle: { bold: true },
										},
									},
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe('<strong>Bold text</strong>');
		});

		it('should apply italic formatting', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Italic text',
											textStyle: { italic: true },
										},
									},
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe('<em>Italic text</em>');
		});

		it('should apply multiple formatting styles', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Bold and italic',
											textStyle: { bold: true, italic: true },
										},
									},
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe(
				'<strong><em>Bold and italic</em></strong>'
			);
		});

		it('should escape HTML entities in content', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{ textRun: { content: '<script>alert("xss")</script>' } },
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe(
				'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
			);
		});

		it('should convert tables', () => {
			const doc = {
				body: {
					content: [
						{
							table: {
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

			expect(result.paragraphs).toHaveLength(1);
			expect(result.paragraphs[0].type).toBe(ParagraphType.table);
			expect(result.paragraphs[0].content).toContain('<table>');
			expect(result.paragraphs[0].content).toContain('<th>Header 1</th>');
			expect(result.paragraphs[0].content).toContain('<td>Cell 1</td>');
		});

		it('should extract images from document', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										inlineObjectElement: {
											inlineObjectId: 'img1',
										},
									},
								],
							},
						},
					],
				},
				inlineObjects: {
					img1: {
						inlineObjectProperties: {
							embeddedObject: {
								imageProperties: {
									contentUri: 'https://example.com/image.png',
								},
								title: 'Test Image',
							},
						},
					},
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.images).toHaveLength(1);
			expect(result.images[0].sourceUrl).toBe('https://example.com/image.png');
			expect(result.images[0].altText).toBe('Test Image');
		});

		it('should maintain order across multiple elements', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'First' } }],
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Second' } }],
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Third' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].order).toBe(0);
			expect(result.paragraphs[1].order).toBe(1);
			expect(result.paragraphs[2].order).toBe(2);
		});

		it('should generate unique paragraph IDs', () => {
			mockRandomUUID
				.mockReturnValueOnce('aaaa1111-0000-0000-0000-000000000000')
				.mockReturnValueOnce('bbbb2222-0000-0000-0000-000000000000');

			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: 'Para 1' } }],
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: 'Para 2' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].paragraphId).toBe('p_aaaa1111');
			expect(result.paragraphs[1].paragraphId).toBe('p_bbbb2222');
		});
	});

	describe('getDocumentTitle', () => {
		it('should return document title', () => {
			const doc = { title: 'My Document' };
			expect(getDocumentTitle(doc)).toBe('My Document');
		});

		it('should return default title for undefined title', () => {
			const doc = {};
			expect(getDocumentTitle(doc)).toBe('Untitled Document');
		});

		it('should return default title for empty title', () => {
			const doc = { title: '' };
			expect(getDocumentTitle(doc)).toBe('Untitled Document');
		});
	});

	describe('hasHtmlFormatting', () => {
		it('should detect strong tags', () => {
			expect(hasHtmlFormatting('<strong>bold</strong>')).toBe(true);
		});

		it('should detect em tags', () => {
			expect(hasHtmlFormatting('<em>italic</em>')).toBe(true);
		});

		it('should detect u tags', () => {
			expect(hasHtmlFormatting('<u>underline</u>')).toBe(true);
		});

		it('should detect s tags', () => {
			expect(hasHtmlFormatting('<s>strikethrough</s>')).toBe(true);
		});

		it('should detect table tags', () => {
			expect(hasHtmlFormatting('<table><tr><td>cell</td></tr></table>')).toBe(
				true
			);
		});

		it('should return false for plain text', () => {
			expect(hasHtmlFormatting('Plain text without formatting')).toBe(false);
		});

		it('should return false for escaped HTML', () => {
			expect(hasHtmlFormatting('&lt;strong&gt;not bold&lt;/strong&gt;')).toBe(
				false
			);
		});

		it('should be case insensitive', () => {
			expect(hasHtmlFormatting('<STRONG>bold</STRONG>')).toBe(true);
			expect(hasHtmlFormatting('<Strong>bold</Strong>')).toBe(true);
		});
	});
});
