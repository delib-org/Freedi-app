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
  return isHeading(type) || type === ParagraphType.paragraph || type === ParagraphType.li;
}

/**
 * Calculates hierarchical numbering for document headings and paragraphs.
 * All items (headings and paragraphs) share a single sequential counter
 * at each depth level. A sub-heading opens a new depth level.
 *
 * @param paragraphs - Array of paragraphs sorted by order
 * @returns Map of paragraphId -> number string (e.g., "1.2.1")
 *
 * Examples:
 * - h1, p, p, h2, p → "1", "1.1", "1.2", "1.3", "1.3.1"
 * - h1, h2, p, p, h2 → "1", "1.1", "1.1.1", "1.1.2", "1.2"
 * - h1, p, p, h1, p → "1", "1.1", "1.2", "2", "2.1"
 */
export function calculateHeadingNumbers(paragraphs: Paragraph[]): Map<string, string> {
  const numbers = new Map<string, string>();

  // Stack tracks [headingLevel, childCounter] at each nesting depth
  // headingLevel: the ParagraphType heading level (0-5) that opened this depth
  // childCounter: sequential counter for all children at this depth
  const stack: Array<{ headingLevel: number; counter: number }> = [];
  let topCounter = 0; // Counter for top-level items (before or at h1 level)

  for (const para of paragraphs) {
    if (!isNumberable(para.type)) continue;

    if (isHeading(para.type)) {
      const level = getHeadingLevel(para.type);
      if (level === null) continue;

      if (level === 0) {
        // Top-level heading (h1): reset stack, increment top counter
        stack.length = 0;
        topCounter++;
        numbers.set(para.paragraphId, String(topCounter));
        // Push this h1 onto stack so children nest under it
        stack.push({ headingLevel: 0, counter: 0 });
      } else {
        // Sub-heading: it's a child item at the current depth
        // Pop stack back to the appropriate depth for this heading level
        while (stack.length > 0 && stack[stack.length - 1].headingLevel >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          // No parent heading — treat as top-level
          topCounter++;
          numbers.set(para.paragraphId, String(topCounter));
          stack.push({ headingLevel: level, counter: 0 });
        } else {
          // Increment parent's child counter (this heading is a sibling of paragraphs)
          stack[stack.length - 1].counter++;
          const parentNumber = buildNumber(topCounter, stack);
          numbers.set(para.paragraphId, parentNumber);
          // Push this heading so deeper items nest under it
          stack.push({ headingLevel: level, counter: 0 });
        }
      }
    } else {
      // Regular paragraph or list item: child at current depth
      if (stack.length === 0) {
        // Before any heading
        topCounter++;
        numbers.set(para.paragraphId, String(topCounter));
      } else {
        stack[stack.length - 1].counter++;
        const numberString = buildNumber(topCounter, stack);
        numbers.set(para.paragraphId, numberString);
      }
    }
  }

  return numbers;
}

/**
 * Builds the number string from the top counter and stack state.
 */
function buildNumber(
  topCounter: number,
  stack: Array<{ headingLevel: number; counter: number }>
): string {
  const parts = [String(topCounter)];
  for (const frame of stack) {
    if (frame.counter > 0) {
      parts.push(String(frame.counter));
    }
  }

  return parts.join('.');
}
