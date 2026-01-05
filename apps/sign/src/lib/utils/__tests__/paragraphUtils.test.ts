/**
 * Tests for paragraphUtils - paragraph manipulation utilities
 */

// Mock crypto.randomUUID for Node.js environment
const mockRandomUUID = jest.fn(() => 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
Object.defineProperty(global.crypto, 'randomUUID', {
	value: mockRandomUUID,
	writable: true,
});

import {
	generateParagraphId,
	descriptionToParagraphs,
	sortParagraphs,
} from '../paragraphUtils';
import { Paragraph, ParagraphType } from '@/types';

describe('paragraphUtils', () => {
	beforeEach(() => {
		mockRandomUUID.mockClear();
		mockRandomUUID.mockReturnValue('abcd1234-5678-9012-3456-789012345678');
	});

	describe('generateParagraphId', () => {
		it('should return ID with p_ prefix', () => {
			const id = generateParagraphId();
			expect(id).toMatch(/^p_/);
		});

		it('should return ID with 10 characters total (p_ + 8 chars)', () => {
			const id = generateParagraphId();
			expect(id.length).toBe(10);
		});

		it('should use first 8 characters of UUID', () => {
			mockRandomUUID.mockReturnValue('12345678-abcd-efgh-ijkl-mnopqrstuvwx');
			const id = generateParagraphId();
			expect(id).toBe('p_12345678');
		});

		it('should generate unique IDs on multiple calls', () => {
			mockRandomUUID
				.mockReturnValueOnce('aaaaaaaa-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
				.mockReturnValueOnce('bbbbbbbb-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
				.mockReturnValueOnce('cccccccc-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

			const id1 = generateParagraphId();
			const id2 = generateParagraphId();
			const id3 = generateParagraphId();

			expect(id1).toBe('p_aaaaaaaa');
			expect(id2).toBe('p_bbbbbbbb');
			expect(id3).toBe('p_cccccccc');
		});
	});

	describe('descriptionToParagraphs', () => {
		it('should convert description to single paragraph', () => {
			const result = descriptionToParagraphs('This is a description');

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe('This is a description');
			expect(result[0].type).toBe(ParagraphType.paragraph);
			expect(result[0].order).toBe(0);
		});

		it('should use statementId as prefix when provided', () => {
			const result = descriptionToParagraphs('Content', 'stmt-123');

			expect(result[0].paragraphId).toBe('stmt-123-description');
		});

		it('should generate paragraph ID when statementId not provided', () => {
			const result = descriptionToParagraphs('Content');

			expect(result[0].paragraphId).toMatch(/^p_/);
		});

		it('should return empty array for empty string', () => {
			expect(descriptionToParagraphs('')).toEqual([]);
		});

		it('should return empty array for whitespace-only string', () => {
			expect(descriptionToParagraphs('   ')).toEqual([]);
			expect(descriptionToParagraphs('\t\n')).toEqual([]);
		});

		it('should return empty array for undefined', () => {
			expect(descriptionToParagraphs(undefined as unknown as string)).toEqual([]);
		});

		it('should return empty array for null', () => {
			expect(descriptionToParagraphs(null as unknown as string)).toEqual([]);
		});

		it('should trim whitespace from description', () => {
			const result = descriptionToParagraphs('  Content with spaces  ');

			expect(result[0].content).toBe('Content with spaces');
		});

		it('should preserve internal whitespace', () => {
			const result = descriptionToParagraphs('Line 1\nLine 2\tTabbed');

			expect(result[0].content).toBe('Line 1\nLine 2\tTabbed');
		});
	});

	describe('sortParagraphs', () => {
		const createParagraph = (order: number, id?: string): Paragraph => ({
			paragraphId: id || `p_${order}`,
			type: ParagraphType.paragraph,
			content: `Content ${order}`,
			order,
		});

		it('should sort paragraphs by order ascending', () => {
			const paragraphs = [
				createParagraph(3),
				createParagraph(1),
				createParagraph(2),
			];

			const sorted = sortParagraphs(paragraphs);

			expect(sorted[0].order).toBe(1);
			expect(sorted[1].order).toBe(2);
			expect(sorted[2].order).toBe(3);
		});

		it('should not mutate original array', () => {
			const original = [createParagraph(3), createParagraph(1)];
			const originalFirstOrder = original[0].order;

			sortParagraphs(original);

			expect(original[0].order).toBe(originalFirstOrder);
		});

		it('should return new array instance', () => {
			const original = [createParagraph(1)];
			const sorted = sortParagraphs(original);

			expect(sorted).not.toBe(original);
		});

		it('should handle empty array', () => {
			expect(sortParagraphs([])).toEqual([]);
		});

		it('should handle single paragraph', () => {
			const paragraphs = [createParagraph(5)];
			const sorted = sortParagraphs(paragraphs);

			expect(sorted).toHaveLength(1);
			expect(sorted[0].order).toBe(5);
		});

		it('should handle already sorted array', () => {
			const paragraphs = [
				createParagraph(0),
				createParagraph(1),
				createParagraph(2),
			];

			const sorted = sortParagraphs(paragraphs);

			expect(sorted[0].order).toBe(0);
			expect(sorted[1].order).toBe(1);
			expect(sorted[2].order).toBe(2);
		});

		it('should handle negative order values', () => {
			const paragraphs = [
				createParagraph(1),
				createParagraph(-1),
				createParagraph(0),
			];

			const sorted = sortParagraphs(paragraphs);

			expect(sorted[0].order).toBe(-1);
			expect(sorted[1].order).toBe(0);
			expect(sorted[2].order).toBe(1);
		});

		it('should handle duplicate order values', () => {
			const paragraphs = [
				createParagraph(1, 'a'),
				createParagraph(1, 'b'),
				createParagraph(1, 'c'),
			];

			const sorted = sortParagraphs(paragraphs);

			// All have same order, so length should be preserved
			expect(sorted).toHaveLength(3);
			sorted.forEach(p => expect(p.order).toBe(1));
		});

		it('should handle floating point order values', () => {
			const paragraphs = [
				createParagraph(1.5),
				createParagraph(1.1),
				createParagraph(1.9),
			];

			const sorted = sortParagraphs(paragraphs);

			expect(sorted[0].order).toBe(1.1);
			expect(sorted[1].order).toBe(1.5);
			expect(sorted[2].order).toBe(1.9);
		});
	});
});
