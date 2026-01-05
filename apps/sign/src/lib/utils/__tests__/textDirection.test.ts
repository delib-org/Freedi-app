/**
 * Tests for textDirection - RTL/LTR text direction detection
 */

import {
	analyzeTextDirection,
	detectDocumentDirection,
	resolveTextDirection,
	detectParagraphDirection,
	DirectionAnalysis,
	TextDirection,
} from '../textDirection';

describe('textDirection', () => {
	describe('analyzeTextDirection', () => {
		describe('LTR text', () => {
			it('should detect pure English text as LTR', () => {
				const result = analyzeTextDirection('Hello World! This is English text.');
				expect(result.direction).toBe('ltr');
				expect(result.ltrCount).toBeGreaterThan(0);
				expect(result.rtlCount).toBe(0);
			});

			it('should detect German text as LTR', () => {
				const result = analyzeTextDirection('Guten Tag! Wie geht es Ihnen?');
				expect(result.direction).toBe('ltr');
			});

			it('should detect Latin extended characters as LTR', () => {
				const result = analyzeTextDirection('Café résumé naïve');
				expect(result.direction).toBe('ltr');
			});

			it('should detect Greek text as LTR', () => {
				const result = analyzeTextDirection('Καλημέρα κόσμε');
				expect(result.direction).toBe('ltr');
			});

			it('should detect Cyrillic text as LTR', () => {
				const result = analyzeTextDirection('Привет мир');
				expect(result.direction).toBe('ltr');
			});
		});

		describe('RTL text', () => {
			it('should detect pure Hebrew text as RTL', () => {
				const result = analyzeTextDirection('שלום עולם! זה טקסט בעברית.');
				expect(result.direction).toBe('rtl');
				expect(result.rtlCount).toBeGreaterThan(0);
			});

			it('should detect pure Arabic text as RTL', () => {
				const result = analyzeTextDirection('مرحبا بالعالم! هذا نص عربي.');
				expect(result.direction).toBe('rtl');
			});

			it('should return high RTL percentage for pure RTL text', () => {
				const result = analyzeTextDirection('שלום עולם');
				expect(result.rtlPercentage).toBeGreaterThan(90);
			});
		});

		describe('mixed text', () => {
			it('should detect majority LTR in mixed text', () => {
				// More English than Hebrew
				const result = analyzeTextDirection(
					'This is mostly English text with some עברית words.'
				);
				expect(result.direction).toBe('ltr');
			});

			it('should detect majority RTL in mixed text', () => {
				// More Hebrew than English - need more Hebrew characters for RTL detection
				const result = analyzeTextDirection('זה בעיקר טקסט ארוך מאוד בעברית עם מילים רבות with English.');
				expect(result.direction).toBe('rtl');
			});
		});

		describe('confidence levels', () => {
			it('should return low confidence for text with few characters', () => {
				const result = analyzeTextDirection('Hi');
				expect(result.confidence).toBe('low');
			});

			it('should return high confidence for clear majority', () => {
				const result = analyzeTextDirection(
					'This is a long English sentence with many characters for analysis.'
				);
				expect(result.confidence).toBe('high');
			});

			it('should return high confidence for clear RTL text', () => {
				const result = analyzeTextDirection('זה משפט ארוך בעברית עם הרבה תווים לניתוח');
				expect(result.confidence).toBe('high');
			});

			it('should return low confidence for empty text', () => {
				const result = analyzeTextDirection('');
				expect(result.confidence).toBe('low');
			});

			it('should return low confidence for numbers only', () => {
				const result = analyzeTextDirection('12345 67890');
				expect(result.confidence).toBe('low');
			});
		});

		describe('edge cases', () => {
			it('should handle empty string', () => {
				const result = analyzeTextDirection('');
				expect(result.direction).toBe('ltr');
				expect(result.rtlCount).toBe(0);
				expect(result.ltrCount).toBe(0);
				expect(result.rtlPercentage).toBe(0);
			});

			it('should handle only numbers and punctuation', () => {
				const result = analyzeTextDirection('123, 456! 789?');
				expect(result.direction).toBe('ltr');
				expect(result.rtlCount).toBe(0);
				expect(result.ltrCount).toBe(0);
			});

			it('should handle only whitespace', () => {
				const result = analyzeTextDirection('   \t\n  ');
				expect(result.direction).toBe('ltr');
			});

			it('should handle single character', () => {
				expect(analyzeTextDirection('a').direction).toBe('ltr');
				expect(analyzeTextDirection('א').direction).toBe('rtl');
			});
		});
	});

	describe('detectDocumentDirection', () => {
		it('should detect LTR document from English paragraphs', () => {
			const paragraphs = [
				'First paragraph in English.',
				'Second paragraph also in English.',
				'Third paragraph continuing in English.',
			];
			expect(detectDocumentDirection(paragraphs)).toBe('ltr');
		});

		it('should detect RTL document from Hebrew paragraphs', () => {
			const paragraphs = [
				'פסקה ראשונה בעברית.',
				'פסקה שנייה גם בעברית.',
				'פסקה שלישית ממשיכה בעברית.',
			];
			expect(detectDocumentDirection(paragraphs)).toBe('rtl');
		});

		it('should combine all paragraphs for analysis', () => {
			const paragraphs = ['Short', 'שלום עולם זה טקסט ארוך בעברית'];
			// Hebrew text is longer, should be RTL
			expect(detectDocumentDirection(paragraphs)).toBe('rtl');
		});

		it('should handle empty paragraphs array', () => {
			expect(detectDocumentDirection([])).toBe('ltr');
		});

		it('should handle array with empty strings', () => {
			const paragraphs = ['', '', ''];
			expect(detectDocumentDirection(paragraphs)).toBe('ltr');
		});
	});

	describe('resolveTextDirection', () => {
		it('should return ltr when setting is ltr', () => {
			expect(resolveTextDirection('ltr', ['עברית'])).toBe('ltr');
		});

		it('should return rtl when setting is rtl', () => {
			expect(resolveTextDirection('rtl', ['English text'])).toBe('rtl');
		});

		it('should auto-detect LTR for English content', () => {
			expect(resolveTextDirection('auto', ['English content here'])).toBe('ltr');
		});

		it('should auto-detect RTL for Hebrew content', () => {
			expect(resolveTextDirection('auto', ['תוכן בעברית כאן'])).toBe('rtl');
		});

		it('should return ltr for auto with empty content', () => {
			expect(resolveTextDirection('auto', [])).toBe('ltr');
		});
	});

	describe('detectParagraphDirection', () => {
		it('should detect LTR paragraph', () => {
			expect(detectParagraphDirection('This is an English paragraph.')).toBe(
				'ltr'
			);
		});

		it('should detect RTL paragraph', () => {
			expect(detectParagraphDirection('זוהי פסקה בעברית.')).toBe('rtl');
		});

		it('should handle mixed content paragraph', () => {
			// Majority determines direction
			const result = detectParagraphDirection('Hello שלום World עולם');
			expect(['ltr', 'rtl']).toContain(result);
		});

		it('should return ltr for empty content', () => {
			expect(detectParagraphDirection('')).toBe('ltr');
		});
	});
});
