/**
 * Paragraph utility functions for Sign app
 */

import { Paragraph, ParagraphType } from '@/types';

/**
 * Generate a unique paragraph ID
 * @returns A string like "p_abc12345"
 */
export function generateParagraphId(): string {
  return `p_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Convert a description string to a paragraphs array
 * Creates a single paragraph from the description content
 * @param description - The description text to convert
 * @param statementId - Optional statement ID to use as prefix for paragraph ID
 * @returns Array with single paragraph, or empty array if no content
 */
export function descriptionToParagraphs(
  description: string,
  statementId?: string
): Paragraph[] {
  if (!description?.trim()) return [];

  return [
    {
      paragraphId: statementId ? `${statementId}-description` : generateParagraphId(),
      type: ParagraphType.paragraph,
      content: description.trim(),
      order: 0,
    },
  ];
}

/**
 * Sort paragraphs by order
 * @param paragraphs - Array of paragraphs to sort
 * @returns Sorted array (new array, does not mutate original)
 */
export function sortParagraphs(paragraphs: Paragraph[]): Paragraph[] {
  return [...paragraphs].sort((a, b) => a.order - b.order);
}
