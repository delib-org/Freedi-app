import { useMemo } from 'react';
import { Paragraph, TocItem } from '@/types';

/**
 * Strips HTML tags from a string to get plain text
 */
function stripHtml(html: string): string {
  // Create a temporary div element to parse HTML
  if (typeof window !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
  // Fallback for SSR - simple regex strip
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Extracts heading level from paragraph type (e.g., 'h2' -> 2)
 */
function getHeadingLevel(type: string): number | null {
  const match = type.match(/^h([1-6])$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Hook to extract TOC items from paragraphs
 *
 * @param paragraphs - Array of paragraphs to extract headings from
 * @param maxLevel - Maximum heading level to include (1-6)
 * @returns Array of TOC items with id, text, and level
 */
export function useTocItems(
  paragraphs: Paragraph[],
  maxLevel: number = 2
): TocItem[] {
  return useMemo(() => {
    if (!paragraphs || paragraphs.length === 0) {
      return [];
    }

    const tocItems: TocItem[] = [];

    for (const paragraph of paragraphs) {
      const level = getHeadingLevel(paragraph.type);

      // Only include headings within the max level
      if (level !== null && level <= maxLevel) {
        const text = stripHtml(paragraph.content);

        // Skip empty headings
        if (text.trim()) {
          tocItems.push({
            id: paragraph.paragraphId,
            text: text.trim(),
            level,
          });
        }
      }
    }

    return tocItems;
  }, [paragraphs, maxLevel]);
}

/**
 * Check if document should suggest enabling TOC
 * Returns true if document has 8+ h1/h2 headings
 */
export function shouldSuggestToc(paragraphs: Paragraph[]): boolean {
  if (!paragraphs || paragraphs.length === 0) {
    return false;
  }

  const headingCount = paragraphs.filter(p => {
    const level = getHeadingLevel(p.type);
    return level !== null && level <= 2;
  }).length;

  return headingCount >= 8;
}
