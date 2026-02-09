import { Paragraph, ParagraphType } from '@/types';

/**
 * Extracts heading level from paragraph type (h1=0, h2=1, ..., h6=5)
 */
function getHeadingLevel(type: ParagraphType): number | null {
  const headingTypes: Record<string, number> = {
    [ParagraphType.h1]: 0,
    [ParagraphType.h2]: 1,
    [ParagraphType.h3]: 2,
    [ParagraphType.h4]: 3,
    [ParagraphType.h5]: 4,
    [ParagraphType.h6]: 5,
  };

  return headingTypes[type] ?? null;
}

/**
 * Checks if a paragraph type is a heading
 */
function isHeading(type: ParagraphType): boolean {
  return getHeadingLevel(type) !== null;
}

/**
 * Checks if a paragraph type should be numbered (headings and regular paragraphs)
 */
function isNumberable(type: ParagraphType): boolean {
  return isHeading(type) || type === ParagraphType.paragraph;
}

/**
 * Calculates hierarchical numbering for document headings and paragraphs
 *
 * @param paragraphs - Array of paragraphs sorted by order
 * @returns Map of paragraphId -> number string (e.g., "1.2.1")
 *
 * Examples:
 * - h1, h2, h3 → "1", "1.1", "1.1.1"
 * - h1, paragraph, paragraph → "1", "1.1", "1.2"
 * - h1, h2, paragraph, paragraph, h2 → "1", "1.1", "1.1.1", "1.1.2", "1.2"
 * - h1, h3 (skip h2) → "1", "1.0.1"
 * - h1, h2, h1, h2 → "1", "1.1", "2", "2.1"
 */
export function calculateHeadingNumbers(paragraphs: Paragraph[]): Map<string, string> {
  const numbers = new Map<string, string>();
  const counters = [0, 0, 0, 0, 0, 0]; // Counters for h1-h6
  let lastLevel = -1; // Track last heading level (-1 = no headings yet)
  let paragraphCounter = 0; // Counter for paragraphs under current heading

  for (const para of paragraphs) {
    if (!isNumberable(para.type)) continue;

    if (isHeading(para.type)) {
      const level = getHeadingLevel(para.type);
      if (level === null) continue;

      // Reset paragraph counter when encountering a new heading
      paragraphCounter = 0;

      // Reset deeper counters when returning to a higher/same level
      if (level <= lastLevel) {
        for (let i = level + 1; i < 6; i++) {
          counters[i] = 0;
        }
      }

      // Fill skipped levels with 0
      if (lastLevel >= 0 && level > lastLevel + 1) {
        for (let i = lastLevel + 1; i < level; i++) {
          counters[i] = 0;
        }
      }

      // Increment counter for current level
      counters[level]++;
      lastLevel = level;

      // Build number string: join all counters up to current level
      const numberParts = counters.slice(0, level + 1);
      const numberString = numberParts.join('.');

      numbers.set(para.paragraphId, numberString);
    } else {
      // Regular paragraph: number as sub-item under the last heading
      paragraphCounter++;

      if (lastLevel >= 0) {
        // Under a heading: e.g., "1.1" heading → "1.1.1", "1.1.2" paragraphs
        const headingParts = counters.slice(0, lastLevel + 1);
        const numberString = `${headingParts.join('.')}.${paragraphCounter}`;
        numbers.set(para.paragraphId, numberString);
      } else {
        // Before any heading: just sequential numbers
        numbers.set(para.paragraphId, String(paragraphCounter));
      }
    }
  }

  return numbers;
}
