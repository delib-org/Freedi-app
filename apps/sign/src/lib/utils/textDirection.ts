/**
 * Text direction detection and management utilities
 */

export type TextDirection = 'auto' | 'ltr' | 'rtl';

/**
 * Unicode ranges for RTL scripts
 * Includes: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, and more
 */
const RTL_CHAR_RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0800, 0x083f], // Samaritan
  [0x0840, 0x085f], // Mandaic
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb00, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic presentation forms A
  [0xfe70, 0xfeff], // Arabic presentation forms B
];

/**
 * Check if a character code is in the RTL range
 */
function isRtlChar(charCode: number): boolean {
  return RTL_CHAR_RANGES.some(
    ([start, end]) => charCode >= start && charCode <= end
  );
}

/**
 * Check if a character code is a letter (LTR scripts)
 * Basic Latin, Latin Extended, Greek, Cyrillic, etc.
 */
function isLtrChar(charCode: number): boolean {
  return (
    (charCode >= 0x0041 && charCode <= 0x005a) || // A-Z
    (charCode >= 0x0061 && charCode <= 0x007a) || // a-z
    (charCode >= 0x00c0 && charCode <= 0x024f) || // Latin Extended
    (charCode >= 0x0370 && charCode <= 0x03ff) || // Greek
    (charCode >= 0x0400 && charCode <= 0x04ff) || // Cyrillic
    (charCode >= 0x1e00 && charCode <= 0x1eff)    // Latin Extended Additional
  );
}

export interface DirectionAnalysis {
  direction: 'ltr' | 'rtl';
  rtlCount: number;
  ltrCount: number;
  rtlPercentage: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze text content and determine the predominant text direction
 * @param text - The text to analyze
 * @returns Analysis result with direction and confidence
 */
export function analyzeTextDirection(text: string): DirectionAnalysis {
  let rtlCount = 0;
  let ltrCount = 0;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);

    if (isRtlChar(charCode)) {
      rtlCount++;
    } else if (isLtrChar(charCode)) {
      ltrCount++;
    }
    // Skip neutral characters (numbers, punctuation, spaces)
  }

  const totalDirectional = rtlCount + ltrCount;
  const rtlPercentage = totalDirectional > 0
    ? (rtlCount / totalDirectional) * 100
    : 0;

  // Determine direction based on majority
  const direction: 'ltr' | 'rtl' = rtlCount > ltrCount ? 'rtl' : 'ltr';

  // Determine confidence based on the margin
  let confidence: 'high' | 'medium' | 'low';
  if (totalDirectional < 10) {
    confidence = 'low'; // Too few characters to be confident
  } else if (rtlPercentage > 80 || rtlPercentage < 20) {
    confidence = 'high'; // Clear majority
  } else if (rtlPercentage > 65 || rtlPercentage < 35) {
    confidence = 'medium'; // Moderate majority
  } else {
    confidence = 'low'; // Mixed content
  }

  return {
    direction,
    rtlCount,
    ltrCount,
    rtlPercentage,
    confidence,
  };
}

/**
 * Detect the text direction for a document based on all its paragraphs
 * @param paragraphs - Array of paragraph content strings
 * @returns The detected direction ('ltr' or 'rtl')
 */
export function detectDocumentDirection(paragraphs: string[]): 'ltr' | 'rtl' {
  // Combine all paragraph content
  const allText = paragraphs.join(' ');
  const analysis = analyzeTextDirection(allText);

  return analysis.direction;
}

/**
 * Resolve the effective direction based on setting and auto-detection
 * @param setting - The admin setting ('auto', 'ltr', 'rtl')
 * @param paragraphContents - Array of paragraph content for auto-detection
 * @returns The resolved direction ('ltr' or 'rtl')
 */
export function resolveTextDirection(
  setting: TextDirection,
  paragraphContents: string[]
): 'ltr' | 'rtl' {
  if (setting === 'ltr' || setting === 'rtl') {
    return setting;
  }

  // Auto mode - detect from content
  return detectDocumentDirection(paragraphContents);
}

/**
 * Detect direction for a single paragraph
 * Useful for per-paragraph direction handling if needed
 * @param content - The paragraph content
 * @returns The detected direction
 */
export function detectParagraphDirection(content: string): 'ltr' | 'rtl' {
  const analysis = analyzeTextDirection(content);
  return analysis.direction;
}
