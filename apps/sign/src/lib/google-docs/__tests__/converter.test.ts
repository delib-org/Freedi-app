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
			expect(result.paragraphs[0].content).toContain('<th scope="col">Header 1</th>');
			expect(result.paragraphs[0].content).toContain('<td>Cell 1</td>');
		});

		it('should preserve text colors as inline styles', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Green text',
											textStyle: {
												foregroundColor: {
													color: { rgbColor: { red: 0.1, green: 0.4, blue: 0.2 } },
												},
											},
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
				'<span style="color:#1a6633">Green text</span>'
			);
		});

		it('should skip default black text color', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Black text',
											textStyle: {
												foregroundColor: {
													color: { rgbColor: {} },
												},
											},
										},
									},
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe('Black text');
		});

		it('should preserve text highlight (background) colors', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Highlighted',
											textStyle: {
												backgroundColor: {
													color: { rgbColor: { red: 1, green: 1, blue: 0 } },
												},
											},
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
				'<span style="background-color:#ffff00">Highlighted</span>'
			);
		});

		it('should convert links to anchor tags', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Visit us',
											textStyle: {
												underline: true,
												link: { url: 'https://example.com/page' },
											},
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
				'<a href="https://example.com/page">Visit us</a>'
			);
		});

		it('should not create anchors for unsafe link protocols', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Click',
											// eslint-disable-next-line no-script-url
											textStyle: { link: { url: 'javascript:alert(1)' } },
										},
									},
								],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).not.toContain('<a ');
		});

		it('should preserve paragraph alignment and shading (callouts)', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								paragraphStyle: {
									alignment: 'CENTER',
									shading: {
										backgroundColor: {
											color: { rgbColor: { red: 0.91, green: 0.96, blue: 0.93 } },
										},
									},
								},
								elements: [{ textRun: { content: 'Callout text' } }],
							},
						},
					],
				},
			};

			const result = convertGoogleDocsToParagraphs(doc);

			expect(result.paragraphs[0].content).toBe(
				'<span style="display:block;text-align:center;background-color:#e8f5ed">Callout text</span>'
			);
		});

		it('should preserve table cell backgrounds, spans, and column widths', () => {
			const doc = {
				body: {
					content: [
						{
							table: {
								tableStyle: {
									tableColumnProperties: [
										{ widthType: 'FIXED_WIDTH', width: { magnitude: 300 } },
										{ widthType: 'FIXED_WIDTH', width: { magnitude: 100 } },
									],
								},
								tableRows: [
									{
										tableCells: [
											{
												tableCellStyle: {
													backgroundColor: {
														color: { rgbColor: { red: 0.1, green: 0.36, blue: 0.22 } },
													},
													columnSpan: 2,
												},
												content: [
													{
														paragraph: {
															paragraphStyle: { alignment: 'CENTER' },
															elements: [{ textRun: { content: 'Header' } }],
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
															elements: [{ textRun: { content: 'A' } }],
														},
													},
												],
											},
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: 'B' } }],
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
			const content = result.paragraphs[0].content;

			expect(content).toContain('<colgroup><col style="width:75.0%"><col style="width:25.0%"></colgroup>');
			expect(content).toContain('colspan="2"');
			expect(content).toContain('background-color:#1a5c38');
			expect(content).toContain('text-align:center');
		});

		it('should join multi-paragraph cells with <br> and keep bullets', () => {
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
															elements: [{ textRun: { content: 'Line one\n' } }],
														},
													},
													{
														paragraph: {
															bullet: { listId: 'list1' },
															elements: [{ textRun: { content: 'Bullet line\n' } }],
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

			expect(result.paragraphs[0].content).toContain('Line one<br>• Bullet line');
			// Single-row tables are callouts: cells stay td, not th
			expect(result.paragraphs[0].content).not.toContain('<th');
		});

		it('should keep paragraph-terminating newlines out of formatting tags', () => {
			const doc = {
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: 'Bold text\n',
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
