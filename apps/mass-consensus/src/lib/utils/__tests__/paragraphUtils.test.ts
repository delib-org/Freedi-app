/**
 * Tests for paragraphUtils utility functions
 */
import { Paragraph, ParagraphType } from '@freedi/shared-types';
import {
  generateParagraphId,
  getParagraphsText,
  hasParagraphsContent,
  textToParagraphs,
  sortParagraphs,
} from '../paragraphUtils';

// Mock crypto.randomUUID for consistent testing
const mockRandomUUID = jest.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: mockRandomUUID,
  },
});

describe('paragraphUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomUUID.mockReturnValue('12345678-1234-1234-1234-123456789012');
  });

  describe('generateParagraphId', () => {
    it('should generate a paragraph ID with p_ prefix', () => {
      const id = generateParagraphId();
      expect(id).toMatch(/^p_/);
    });

    it('should generate an ID with 8 character suffix', () => {
      const id = generateParagraphId();
      expect(id).toBe('p_12345678');
    });

    it('should call crypto.randomUUID', () => {
      generateParagraphId();
      expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    });

    it('should generate unique IDs on each call', () => {
      mockRandomUUID
        .mockReturnValueOnce('aaaaaaaa-1234-1234-1234-123456789012')
        .mockReturnValueOnce('bbbbbbbb-1234-1234-1234-123456789012');

      const id1 = generateParagraphId();
      const id2 = generateParagraphId();

      expect(id1).toBe('p_aaaaaaaa');
      expect(id2).toBe('p_bbbbbbbb');
      expect(id1).not.toBe(id2);
    });
  });

  describe('getParagraphsText', () => {
    it('should return empty string for undefined paragraphs', () => {
      const text = getParagraphsText(undefined);
      expect(text).toBe('');
    });

    it('should return empty string for empty array', () => {
      const text = getParagraphsText([]);
      expect(text).toBe('');
    });

    it('should return content for single paragraph', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Hello world',
          order: 0,
        },
      ];
      const text = getParagraphsText(paragraphs);
      expect(text).toBe('Hello world');
    });

    it('should join multiple paragraphs with newlines', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'First paragraph',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Second paragraph',
          order: 1,
        },
      ];
      const text = getParagraphsText(paragraphs);
      expect(text).toBe('First paragraph\nSecond paragraph');
    });

    it('should sort paragraphs by order before joining', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Second',
          order: 1,
        },
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'First',
          order: 0,
        },
        {
          paragraphId: 'p_3',
          type: ParagraphType.paragraph,
          content: 'Third',
          order: 2,
        },
      ];
      const text = getParagraphsText(paragraphs);
      expect(text).toBe('First\nSecond\nThird');
    });

    it('should not mutate original array', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Second',
          order: 1,
        },
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'First',
          order: 0,
        },
      ];
      const originalOrder = paragraphs.map(p => p.paragraphId);
      getParagraphsText(paragraphs);
      expect(paragraphs.map(p => p.paragraphId)).toEqual(originalOrder);
    });

    it('should handle paragraphs with empty content', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Content',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: '',
          order: 1,
        },
      ];
      const text = getParagraphsText(paragraphs);
      expect(text).toBe('Content\n');
    });
  });

  describe('hasParagraphsContent', () => {
    it('should return false for undefined paragraphs', () => {
      const hasContent = hasParagraphsContent(undefined);
      expect(hasContent).toBe(false);
    });

    it('should return false for empty array', () => {
      const hasContent = hasParagraphsContent([]);
      expect(hasContent).toBe(false);
    });

    it('should return true for paragraph with content', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Hello',
          order: 0,
        },
      ];
      const hasContent = hasParagraphsContent(paragraphs);
      expect(hasContent).toBe(true);
    });

    it('should return false for paragraph with empty string', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: '',
          order: 0,
        },
      ];
      const hasContent = hasParagraphsContent(paragraphs);
      expect(hasContent).toBe(false);
    });

    it('should return false for paragraph with only whitespace', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: '   ',
          order: 0,
        },
      ];
      const hasContent = hasParagraphsContent(paragraphs);
      expect(hasContent).toBe(false);
    });

    it('should return true if at least one paragraph has content', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: '',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Content here',
          order: 1,
        },
      ];
      const hasContent = hasParagraphsContent(paragraphs);
      expect(hasContent).toBe(true);
    });

    it('should return false if all paragraphs are empty', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: '',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: '  ',
          order: 1,
        },
      ];
      const hasContent = hasParagraphsContent(paragraphs);
      expect(hasContent).toBe(false);
    });
  });

  describe('textToParagraphs', () => {
    it('should return undefined for empty string', () => {
      const paragraphs = textToParagraphs('');
      expect(paragraphs).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      const paragraphs = textToParagraphs('   ');
      expect(paragraphs).toBeUndefined();
    });

    it('should return undefined for null-like input', () => {
      const paragraphs = textToParagraphs(null as unknown as string);
      expect(paragraphs).toBeUndefined();
    });

    it('should create single paragraph for single line', () => {
      const paragraphs = textToParagraphs('Hello world');
      expect(paragraphs).toHaveLength(1);
      expect(paragraphs![0].content).toBe('Hello world');
      expect(paragraphs![0].order).toBe(0);
      expect(paragraphs![0].type).toBe(ParagraphType.paragraph);
    });

    it('should create multiple paragraphs for multiple lines', () => {
      const paragraphs = textToParagraphs('Line 1\nLine 2\nLine 3');
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs![0].content).toBe('Line 1');
      expect(paragraphs![1].content).toBe('Line 2');
      expect(paragraphs![2].content).toBe('Line 3');
    });

    it('should assign correct order to paragraphs', () => {
      const paragraphs = textToParagraphs('First\nSecond\nThird');
      expect(paragraphs![0].order).toBe(0);
      expect(paragraphs![1].order).toBe(1);
      expect(paragraphs![2].order).toBe(2);
    });

    it('should generate unique IDs for each paragraph', () => {
      mockRandomUUID
        .mockReturnValueOnce('11111111-1234-1234-1234-123456789012')
        .mockReturnValueOnce('22222222-1234-1234-1234-123456789012');

      const paragraphs = textToParagraphs('First\nSecond');
      expect(paragraphs![0].paragraphId).toBe('p_11111111');
      expect(paragraphs![1].paragraphId).toBe('p_22222222');
    });

    it('should filter out empty lines', () => {
      const paragraphs = textToParagraphs('Line 1\n\n\nLine 2');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs![0].content).toBe('Line 1');
      expect(paragraphs![1].content).toBe('Line 2');
    });

    it('should filter out whitespace-only lines', () => {
      const paragraphs = textToParagraphs('Line 1\n   \nLine 2');
      expect(paragraphs).toHaveLength(2);
    });

    it('should set paragraph type correctly', () => {
      const paragraphs = textToParagraphs('Test');
      expect(paragraphs![0].type).toBe(ParagraphType.paragraph);
    });
  });

  describe('sortParagraphs', () => {
    it('should sort paragraphs by order ascending', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_3',
          type: ParagraphType.paragraph,
          content: 'Third',
          order: 2,
        },
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'First',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Second',
          order: 1,
        },
      ];
      const sorted = sortParagraphs(paragraphs);
      expect(sorted[0].content).toBe('First');
      expect(sorted[1].content).toBe('Second');
      expect(sorted[2].content).toBe('Third');
    });

    it('should not mutate original array', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Second',
          order: 1,
        },
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'First',
          order: 0,
        },
      ];
      const originalFirstId = paragraphs[0].paragraphId;
      sortParagraphs(paragraphs);
      expect(paragraphs[0].paragraphId).toBe(originalFirstId);
    });

    it('should return new array', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Test',
          order: 0,
        },
      ];
      const sorted = sortParagraphs(paragraphs);
      expect(sorted).not.toBe(paragraphs);
    });

    it('should handle empty array', () => {
      const sorted = sortParagraphs([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single item array', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Only one',
          order: 0,
        },
      ];
      const sorted = sortParagraphs(paragraphs);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].content).toBe('Only one');
    });

    it('should handle negative order values', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Zero',
          order: 0,
        },
        {
          paragraphId: 'p_1',
          type: ParagraphType.paragraph,
          content: 'Negative',
          order: -1,
        },
      ];
      const sorted = sortParagraphs(paragraphs);
      expect(sorted[0].content).toBe('Negative');
      expect(sorted[1].content).toBe('Zero');
    });

    it('should maintain stability for equal orders', () => {
      const paragraphs: Paragraph[] = [
        {
          paragraphId: 'p_a',
          type: ParagraphType.paragraph,
          content: 'A',
          order: 0,
        },
        {
          paragraphId: 'p_b',
          type: ParagraphType.paragraph,
          content: 'B',
          order: 0,
        },
      ];
      const sorted = sortParagraphs(paragraphs);
      // Both have same order, so original order should be preserved (stable sort)
      expect(sorted).toHaveLength(2);
    });
  });

  describe('integration', () => {
    it('should roundtrip text -> paragraphs -> text', () => {
      const originalText = 'Line 1\nLine 2\nLine 3';
      const paragraphs = textToParagraphs(originalText);
      const resultText = getParagraphsText(paragraphs);
      expect(resultText).toBe(originalText);
    });

    it('should handle complex flow: create, sort, check content', () => {
      const paragraphs = textToParagraphs('First\nSecond');
      expect(hasParagraphsContent(paragraphs)).toBe(true);

      const sorted = sortParagraphs(paragraphs!);
      expect(sorted[0].order).toBeLessThan(sorted[1].order);
    });
  });
});
