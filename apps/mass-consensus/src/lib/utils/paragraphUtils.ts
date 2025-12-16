/**
 * Paragraph utility functions for Mass Consensus app
 */

import { Paragraph, ParagraphType } from '@freedi/shared-types';

/**
 * Generate a unique paragraph ID
 */
export function generateParagraphId(): string {
  return `p_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Get plain text from paragraphs array
 */
export function getParagraphsText(paragraphs: Paragraph[] | undefined): string {
  if (!paragraphs || paragraphs.length === 0) return '';

  return [...paragraphs]
    .sort((a, b) => a.order - b.order)
    .map((p) => p.content)
    .join('\n');
}

/**
 * Check if paragraphs have content
 */
export function hasParagraphsContent(paragraphs: Paragraph[] | undefined): boolean {
  if (!paragraphs || paragraphs.length === 0) return false;

  return paragraphs.some((p) => p.content && p.content.trim().length > 0);
}

/**
 * Convert text to paragraphs array
 */
export function textToParagraphs(text: string): Paragraph[] | undefined {
  if (!text || !text.trim()) return undefined;

  const lines = text.split('\n').filter((line) => line.trim());

  return lines.map((line, index) => ({
    paragraphId: generateParagraphId(),
    type: ParagraphType.paragraph,
    content: line,
    order: index,
  }));
}

/**
 * Sort paragraphs by order
 */
export function sortParagraphs(paragraphs: Paragraph[]): Paragraph[] {
  return [...paragraphs].sort((a, b) => a.order - b.order);
}
