/**
 * Google Docs to Paragraph[] converter for Sign app
 * Converts Google Docs API response to the app's paragraph format
 */

import { docs_v1 } from 'googleapis';
import { Paragraph, ParagraphType } from '@/types';

/**
 * Generate a unique paragraph ID
 */
function generateParagraphId(): string {
  return `p_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Mapping from Google Docs named styles to ParagraphType
 */
const HEADING_STYLE_MAP: Record<string, ParagraphType> = {
  HEADING_1: ParagraphType.h1,
  HEADING_2: ParagraphType.h2,
  HEADING_3: ParagraphType.h3,
  HEADING_4: ParagraphType.h4,
  HEADING_5: ParagraphType.h5,
  HEADING_6: ParagraphType.h6,
  TITLE: ParagraphType.h1,
  SUBTITLE: ParagraphType.h2,
  NORMAL_TEXT: ParagraphType.paragraph,
};

/**
 * Image info extracted from Google Docs for processing
 */
export interface ExtractedImage {
  paragraphId: string;
  sourceUrl: string;
  order: number;
  altText?: string;
}

/**
 * Result of converting a Google Doc, including text paragraphs and images to process
 */
export interface ConversionResult {
  paragraphs: Paragraph[];
  images: ExtractedImage[];
}

/**
 * Convert a Google Docs API response to an array of Paragraphs
 * @param document - The Google Docs API document response
 * @returns ConversionResult with paragraphs and images to process
 */
export function convertGoogleDocsToParagraphs(
  document: docs_v1.Schema$Document
): ConversionResult {
  const paragraphs: Paragraph[] = [];
  const images: ExtractedImage[] = [];
  let order = 0;

  const content = document.body?.content;
  if (!content) {
    return { paragraphs, images };
  }

  const lists = document.lists || {};
  const inlineObjects = document.inlineObjects || {};

  for (const element of content) {
    if (element.paragraph) {
      // Check for images in the paragraph first
      const imageResults = extractImagesFromParagraph(
        element.paragraph,
        order,
        inlineObjects
      );

      if (imageResults.length > 0) {
        // Add image paragraphs
        for (const imgResult of imageResults) {
          paragraphs.push(imgResult.paragraph);
          images.push(imgResult.extractedImage);
          order++;
        }
      }

      // Then extract text content (excluding images)
      const para = convertParagraphElement(element.paragraph, order, lists);
      if (para) {
        paragraphs.push(para);
        order++;
      }
    } else if (element.table) {
      const tablePara = convertTableElement(element.table, order);
      if (tablePara) {
        paragraphs.push(tablePara);
        order++;
      }
    }
  }

  return { paragraphs, images };
}

/**
 * Convert a paragraph element from Google Docs format
 */
function convertParagraphElement(
  paragraph: docs_v1.Schema$Paragraph,
  order: number,
  lists: { [key: string]: docs_v1.Schema$List }
): Paragraph | null {
  // Extract text content
  const content = extractTextContent(paragraph.elements);

  // Skip empty paragraphs
  if (!content.trim()) {
    return null;
  }

  // Determine paragraph type
  let type: ParagraphType = ParagraphType.paragraph;
  let listType: 'ul' | 'ol' | undefined;

  // Check if it's a heading
  const namedStyle = paragraph.paragraphStyle?.namedStyleType;
  if (namedStyle && HEADING_STYLE_MAP[namedStyle]) {
    type = HEADING_STYLE_MAP[namedStyle];
  }

  // Check if it's a list item
  if (paragraph.bullet) {
    type = ParagraphType.li;

    // Determine list type
    const listId = paragraph.bullet.listId;
    if (listId && lists[listId]) {
      const list = lists[listId];
      const nestingLevel = paragraph.bullet.nestingLevel ?? 0;
      const levelProperties = list.listProperties?.nestingLevels?.[nestingLevel];
      const glyphType = levelProperties?.glyphType;

      if (glyphType === 'DECIMAL' || glyphType === 'ALPHA' || glyphType === 'ROMAN') {
        listType = 'ol';
      } else {
        listType = 'ul';
      }
    } else {
      listType = 'ul';
    }
  }

  const para: Paragraph = {
    paragraphId: generateParagraphId(),
    type,
    content: content.trim(),
    order,
  };

  if (listType) {
    para.listType = listType;
  }

  return para;
}

/**
 * Extract text content from paragraph elements with formatting (bold, italic)
 * Returns HTML string with appropriate formatting tags
 */
function extractTextContent(elements?: docs_v1.Schema$ParagraphElement[]): string {
  if (!elements) return '';

  return elements
    .map((element) => {
      if (element.textRun?.content) {
        let text = element.textRun.content;
        const textStyle = element.textRun.textStyle;

        // Escape HTML entities in the text content first
        text = escapeHtml(text);

        // Apply formatting based on textStyle
        if (textStyle) {
          // Wrap with italic if needed
          if (textStyle.italic) {
            text = `<em>${text}</em>`;
          }
          // Wrap with bold if needed
          if (textStyle.bold) {
            text = `<strong>${text}</strong>`;
          }
          // Wrap with underline if needed
          if (textStyle.underline) {
            text = `<u>${text}</u>`;
          }
          // Wrap with strikethrough if needed
          if (textStyle.strikethrough) {
            text = `<s>${text}</s>`;
          }
        }

        return text;
      }
      return '';
    })
    .join('')
    .replace(/\n$/, '');
}

/**
 * Check if content contains HTML formatting tags
 */
export function hasHtmlFormatting(content: string): boolean {
  return /<(strong|em|u|s|table|tr|td|th)>/i.test(content);
}

/**
 * Convert a table element to an HTML table paragraph
 */
function convertTableElement(
  table: docs_v1.Schema$Table,
  order: number
): Paragraph | null {
  if (!table.tableRows || table.tableRows.length === 0) {
    return null;
  }

  let html = '<table>';

  table.tableRows.forEach((row, rowIndex) => {
    html += '<tr>';

    row.tableCells?.forEach((cell) => {
      const cellContent = extractCellContent(cell);
      const tag = rowIndex === 0 ? 'th' : 'td';
      // cellContent is already HTML-safe (escaping done in extractTextContent)
      html += `<${tag}>${cellContent}</${tag}>`;
    });

    html += '</tr>';
  });

  html += '</table>';

  return {
    paragraphId: generateParagraphId(),
    type: ParagraphType.table,
    content: html,
    order,
  };
}

/**
 * Extract text content from a table cell
 */
function extractCellContent(cell: docs_v1.Schema$TableCell): string {
  if (!cell.content) return '';

  return cell.content
    .map((element) => {
      if (element.paragraph) {
        return extractTextContent(element.paragraph.elements);
      }
      return '';
    })
    .join('\n')
    .trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Get document title from Google Docs response
 */
export function getDocumentTitle(document: docs_v1.Schema$Document): string {
  return document.title || 'Untitled Document';
}

/**
 * Result of extracting a single image from a paragraph
 */
interface ImageExtractionResult {
  paragraph: Paragraph;
  extractedImage: ExtractedImage;
}

/**
 * Extract images from a Google Docs paragraph element
 * @param paragraph - The paragraph element to extract images from
 * @param startOrder - The starting order for image paragraphs
 * @param inlineObjects - The document's inline objects map containing image data
 * @returns Array of image extraction results
 */
function extractImagesFromParagraph(
  paragraph: docs_v1.Schema$Paragraph,
  startOrder: number,
  inlineObjects: { [key: string]: docs_v1.Schema$InlineObject }
): ImageExtractionResult[] {
  const results: ImageExtractionResult[] = [];

  if (!paragraph.elements) {
    return results;
  }

  let currentOrder = startOrder;

  for (const element of paragraph.elements) {
    // Check for inline object (image)
    if (element.inlineObjectElement?.inlineObjectId) {
      const objectId = element.inlineObjectElement.inlineObjectId;
      const inlineObject = inlineObjects[objectId];

      if (inlineObject?.inlineObjectProperties?.embeddedObject) {
        const embeddedObject = inlineObject.inlineObjectProperties.embeddedObject;

        // Get image URL - can be from imageProperties or contentUri
        let sourceUrl: string | undefined;

        if (embeddedObject.imageProperties?.contentUri) {
          sourceUrl = embeddedObject.imageProperties.contentUri;
        }

        // Get alt text if available
        const altText = embeddedObject.title || embeddedObject.description;

        if (sourceUrl) {
          const paragraphId = generateParagraphId();

          const imageParagraph: Paragraph = {
            paragraphId,
            type: ParagraphType.image,
            content: '', // Images don't have text content
            order: currentOrder,
            imageUrl: sourceUrl, // Will be replaced with Firebase Storage URL after processing
            ...(altText ? { imageAlt: altText } : {}), // Only include if altText exists (Firestore doesn't accept undefined)
          };

          const extractedImage: ExtractedImage = {
            paragraphId,
            sourceUrl,
            order: currentOrder,
            ...(altText ? { altText } : {}), // Only include if altText exists
          };

          results.push({
            paragraph: imageParagraph,
            extractedImage,
          });

          currentOrder++;
        }
      }
    }
  }

  return results;
}
