/**
 * Tests for paragraphUtils
 *
 * Tests paragraph CRUD operations, reordering, and conversion utilities.
 */

// Mock @freedi/shared-types
jest.mock('@freedi/shared-types', () => {
	enum ParagraphType {
		paragraph = 'paragraph',
		h1 = 'h1',
		h2 = 'h2',
		h3 = 'h3',
		li = 'li',
		table = 'table',
	}

	interface Paragraph {
		paragraphId: string;
		type: ParagraphType;
		content: string;
		order: number;
		listType?: 'ul' | 'ol';
	}

	return { ParagraphType, Paragraph: {} as Paragraph };
});

// We need to mock crypto.randomUUID for consistent IDs
const mockRandomUUID = jest.fn();
Object.defineProperty(global, 'crypto', {
	value: { randomUUID: mockRandomUUID },
});

import {
	generateParagraphId,
	descriptionToParagraphs,
	paragraphsToDescription,
	createParagraph,
	sortParagraphs,
	reorderParagraphs,
	findParagraphById,
	updateParagraph,
	deleteParagraph,
	insertParagraph,
	extractTitleAndParagraphs,
	combineTitleAndParagraphs,
	getParagraphsText,
	hasParagraphsContent,
} from '../paragraphUtils';

import { ParagraphType } from '@freedi/shared-types';

interface TestParagraph {
	paragraphId: string;
	type: ParagraphType;
	content: string;
	order: number;
	listType?: 'ul' | 'ol';
}

describe('paragraphUtils', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRandomUUID.mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
	});

	describe('generateParagraphId', () => {
		it('should return an ID prefixed with p_', () => {
			const id = generateParagraphId();
			expect(id).toBe('p_aaaaaaaa');
		});

		it('should use first 8 characters of UUID', () => {
			mockRandomUUID.mockReturnValue('12345678-rest-does-not-matter');
			const id = generateParagraphId();
			expect(id).toBe('p_12345678');
		});
	});

	describe('descriptionToParagraphs', () => {
		it('should convert a description string to a single paragraph', () => {
			const result = descriptionToParagraphs('Hello world');
			expect(result).toHaveLength(1);
			expect(result[0].content).toBe('Hello world');
			expect(result[0].type).toBe(ParagraphType.paragraph);
			expect(result[0].order).toBe(0);
		});

		it('should return empty array for empty string', () => {
			expect(descriptionToParagraphs('')).toEqual([]);
		});

		it('should return empty array for whitespace-only string', () => {
			expect(descriptionToParagraphs('   ')).toEqual([]);
		});

		it('should trim the description content', () => {
			const result = descriptionToParagraphs('  trimmed  ');
			expect(result[0].content).toBe('trimmed');
		});
	});

	describe('paragraphsToDescription', () => {
		it('should concatenate paragraphs sorted by order', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'Second', order: 1 },
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'First', order: 0 },
			];
			const result = paragraphsToDescription(paragraphs);
			expect(result).toBe('First Second');
		});

		it('should return empty string for empty array', () => {
			expect(paragraphsToDescription([])).toBe('');
		});

		it('should truncate text longer than 200 characters with ellipsis', () => {
			const longContent = 'A'.repeat(250);
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: longContent, order: 0 },
			];
			const result = paragraphsToDescription(paragraphs);
			expect(result).toBe('A'.repeat(200) + '...');
		});

		it('should not truncate text exactly 200 characters', () => {
			const content = 'B'.repeat(200);
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: content, order: 0 },
			];
			const result = paragraphsToDescription(paragraphs);
			expect(result).toBe(content);
		});
	});

	describe('createParagraph', () => {
		it('should create a paragraph with the given parameters', () => {
			const para = createParagraph(ParagraphType.h1, 'Title', 0);
			expect(para.type).toBe(ParagraphType.h1);
			expect(para.content).toBe('Title');
			expect(para.order).toBe(0);
			expect(para.paragraphId).toBe('p_aaaaaaaa');
		});

		it('should add listType when provided', () => {
			const para = createParagraph(ParagraphType.li, 'Item', 2, 'ol');
			expect(para.listType).toBe('ol');
		});

		it('should not include listType when not provided', () => {
			const para = createParagraph(ParagraphType.paragraph, 'Text', 1);
			expect(para.listType).toBeUndefined();
		});
	});

	describe('sortParagraphs', () => {
		it('should sort paragraphs by order ascending', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_3', type: ParagraphType.paragraph, content: 'C', order: 2 },
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B', order: 1 },
			];
			const sorted = sortParagraphs(paragraphs);
			expect(sorted.map((p) => p.content)).toEqual(['A', 'B', 'C']);
		});

		it('should not mutate the original array', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B', order: 1 },
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
			];
			sortParagraphs(paragraphs);
			expect(paragraphs[0].content).toBe('B');
		});
	});

	describe('reorderParagraphs', () => {
		it('should move a paragraph from one index to another', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B', order: 1 },
				{ paragraphId: 'p_3', type: ParagraphType.paragraph, content: 'C', order: 2 },
			];
			const result = reorderParagraphs(paragraphs, 0, 2);
			expect(result.map((p) => p.content)).toEqual(['B', 'C', 'A']);
			expect(result.map((p) => p.order)).toEqual([0, 1, 2]);
		});
	});

	describe('findParagraphById', () => {
		const paragraphs: TestParagraph[] = [
			{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
			{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B', order: 1 },
		];

		it('should find a paragraph by its ID', () => {
			const found = findParagraphById(paragraphs, 'p_2');
			expect(found?.content).toBe('B');
		});

		it('should return undefined for non-existent ID', () => {
			const found = findParagraphById(paragraphs, 'p_999');
			expect(found).toBeUndefined();
		});
	});

	describe('updateParagraph', () => {
		it('should update a paragraph content', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'Old', order: 0 },
			];
			const result = updateParagraph(paragraphs, 'p_1', { content: 'New' });
			expect(result[0].content).toBe('New');
		});

		it('should not mutate original array', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'Old', order: 0 },
			];
			updateParagraph(paragraphs, 'p_1', { content: 'New' });
			expect(paragraphs[0].content).toBe('Old');
		});

		it('should leave other paragraphs unchanged', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'First', order: 0 },
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'Second', order: 1 },
			];
			const result = updateParagraph(paragraphs, 'p_1', { content: 'Updated' });
			expect(result[1].content).toBe('Second');
		});
	});

	describe('deleteParagraph', () => {
		it('should remove a paragraph and re-order remaining ones', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B', order: 1 },
				{ paragraphId: 'p_3', type: ParagraphType.paragraph, content: 'C', order: 2 },
			];
			const result = deleteParagraph(paragraphs, 'p_2');
			expect(result).toHaveLength(2);
			expect(result.map((p) => p.content)).toEqual(['A', 'C']);
			expect(result.map((p) => p.order)).toEqual([0, 1]);
		});

		it('should return same array if ID not found', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
			];
			const result = deleteParagraph(paragraphs, 'p_999');
			expect(result).toHaveLength(1);
		});
	});

	describe('insertParagraph', () => {
		it('should insert at end by default', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
			];
			const newPara = { paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B' };
			const result = insertParagraph(paragraphs, newPara);
			expect(result).toHaveLength(2);
			expect(result[1].content).toBe('B');
			expect(result[1].order).toBe(1);
		});

		it('should insert at a specific position', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
				{ paragraphId: 'p_3', type: ParagraphType.paragraph, content: 'C', order: 1 },
			];
			const newPara = { paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'B' };
			const result = insertParagraph(paragraphs, newPara, 1);
			expect(result.map((p) => p.content)).toEqual(['A', 'B', 'C']);
			expect(result.map((p) => p.order)).toEqual([0, 1, 2]);
		});
	});

	describe('extractTitleAndParagraphs', () => {
		it('should extract first paragraph as title', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.h1, content: 'Title', order: 0 },
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'Body', order: 1 },
			];
			const { title, paragraphs: body } = extractTitleAndParagraphs(paragraphs);
			expect(title).toBe('Title');
			expect(body).toHaveLength(1);
			expect(body[0].content).toBe('Body');
			expect(body[0].order).toBe(0);
		});

		it('should return empty title and paragraphs for empty array', () => {
			const { title, paragraphs: body } = extractTitleAndParagraphs([]);
			expect(title).toBe('');
			expect(body).toEqual([]);
		});
	});

	describe('combineTitleAndParagraphs', () => {
		it('should create title paragraph at order 0 and shift body', () => {
			const body: TestParagraph[] = [
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'Body', order: 0 },
			];
			const result = combineTitleAndParagraphs('My Title', body);
			expect(result).toHaveLength(2);
			expect(result[0].content).toBe('My Title');
			expect(result[0].order).toBe(0);
			expect(result[1].content).toBe('Body');
			expect(result[1].order).toBe(1);
		});
	});

	describe('getParagraphsText', () => {
		it('should join paragraph content with newlines sorted by order', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_2', type: ParagraphType.paragraph, content: 'Line 2', order: 1 },
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'Line 1', order: 0 },
			];
			expect(getParagraphsText(paragraphs)).toBe('Line 1\nLine 2');
		});

		it('should return empty string for undefined', () => {
			expect(getParagraphsText(undefined)).toBe('');
		});

		it('should return empty string for empty array', () => {
			expect(getParagraphsText([])).toBe('');
		});
	});

	describe('hasParagraphsContent', () => {
		it('should return true for non-empty array', () => {
			const paragraphs: TestParagraph[] = [
				{ paragraphId: 'p_1', type: ParagraphType.paragraph, content: 'A', order: 0 },
			];
			expect(hasParagraphsContent(paragraphs)).toBe(true);
		});

		it('should return false for empty array', () => {
			expect(hasParagraphsContent([])).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(hasParagraphsContent(undefined)).toBe(false);
		});
	});
});
