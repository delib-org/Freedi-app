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

/** Leading section-number pattern, e.g. "1.", "1.1", "2)" */
const NUMBER_PREFIX = /^\s*(\d+(?:\.\d+)*)[.)]?\s+\S/;

/**
 * Detect a section title that was authored as bold (and/or numbered) text rather
 * than with a Google Docs "Heading" style, so it still becomes a real heading.
 *
 * Google Docs only reports `namedStyleType: HEADING_n` when the author applied a
 * heading style. Titles that are merely bold arrive as NORMAL_TEXT and would stay
 * `ParagraphType.paragraph` — which means the app never treats them as headings
 * (and, e.g., the "Allow Header Reactions" setting can't suppress interactions on
 * them). This inspects the source text runs and promotes such lines.
 *
 * Returns the heading ParagraphType (h2..h6) or null when it is not a title.
 * Heading level follows the numbering depth ("1." -> h2, "1.1" -> h3, ...).
 */
function detectHeadingFromRuns(
  elements: docs_v1.Schema$ParagraphElement[] | undefined
): ParagraphType | null {
  if (!elements || elements.length === 0) return null;

  const runs = elements
    .map((el) => el.textRun)
    .filter((r): r is docs_v1.Schema$TextRun => Boolean(r?.content))
    .map((r) => ({ text: (r.content || '').replace(/\n$/, ''), bold: Boolean(r.textStyle?.bold) }));

  const text = runs.map((r) => r.text).join('').trim();
  if (!text) return null;

  const firstNonEmpty = runs.find((r) => r.text.trim().length > 0);
  const leadingBold = Boolean(firstNonEmpty?.bold);

  const boldChars = runs.filter((r) => r.bold).reduce((n, r) => n + r.text.trim().length, 0);
  const visibleChars = runs.reduce((n, r) => n + r.text.trim().length, 0);
  const fullyBold = visibleChars > 0 && boldChars >= Math.floor(visibleChars * 0.9);

  const numMatch = text.match(NUMBER_PREFIX);
  if (numMatch) {
    // A numbered line whose number/title is bold is a section heading.
    if (!fullyBold && !leadingBold) return null;
    const depth = numMatch[1].split('.').length; // "1" -> 1, "1.1" -> 2
    const level = Math.min(depth + 1, 6); // 1 -> h2, 2 -> h3, ...

    return `h${level}` as ParagraphType;
  }

  // Non-numbered: only a fully-bold, short, standalone line counts as a title.
  const wordCount = text.split(/\s+/).length;
  if (fullyBold && text.length <= 60 && wordCount <= 12 && !/[.!?]$/.test(text)) {
    return ParagraphType.h2;
  }

  return null;
}

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

  // Fallback: promote bold / numbered section titles that were authored without a
  // Google Docs heading style (they arrive as NORMAL_TEXT) to real headings.
  if (type === ParagraphType.paragraph && !paragraph.bullet) {
    const detected = detectHeadingFromRuns(paragraph.elements);
    if (detected) {
      type = detected;
    }
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

  // Preserve paragraph-level alignment and shading (e.g., callout blocks)
  const styledContent = applyParagraphStyling(content.trim(), paragraph.paragraphStyle);

  const para: Paragraph = {
    paragraphId: generateParagraphId(),
    type,
    content: styledContent,
    order,
  };

  if (listType) {
    para.listType = listType;
  }

  return para;
}

/**
 * Convert a Google Docs OptionalColor to a CSS hex color.
 * Returns null for unset/transparent colors.
 */
function optionalColorToHex(
  optionalColor?: docs_v1.Schema$OptionalColor | null
): string | null {
  const rgb = optionalColor?.color?.rgbColor;
  if (!rgb) return null;

  const toHexChannel = (value?: number | null): string =>
    Math.round((value ?? 0) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHexChannel(rgb.red)}${toHexChannel(rgb.green)}${toHexChannel(rgb.blue)}`;
}

/** Colors treated as "default" and therefore not emitted as inline styles */
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_BACKGROUND_COLOR = '#ffffff';

/**
 * Build an inline CSS string from a Google Docs text style (colors only).
 * Formatting handled by tags (bold/italic/etc.) is excluded.
 */
function textStyleToCss(textStyle?: docs_v1.Schema$TextStyle | null): string {
  if (!textStyle) return '';

  const rules: string[] = [];

  const foreground = optionalColorToHex(textStyle.foregroundColor);
  if (foreground && foreground !== DEFAULT_TEXT_COLOR) {
    rules.push(`color:${foreground}`);
  }

  const background = optionalColorToHex(textStyle.backgroundColor);
  if (background && background !== DEFAULT_BACKGROUND_COLOR) {
    rules.push(`background-color:${background}`);
  }

  return rules.join(';');
}

/**
 * Map a Google Docs paragraph alignment to a CSS text-align value.
 * Uses logical values (end) so RTL documents align correctly.
 */
function alignmentToCss(alignment?: string | null): string | null {
  switch (alignment) {
    case 'CENTER':
      return 'center';
    case 'END':
      return 'end';
    case 'JUSTIFIED':
      return 'justify';
    default:
      return null;
  }
}

/**
 * Build an inline CSS string for paragraph-level styling
 * (alignment and shading/callout background).
 */
function paragraphStyleToCss(
  paragraphStyle?: docs_v1.Schema$ParagraphStyle | null
): string {
  if (!paragraphStyle) return '';

  const rules: string[] = [];

  const textAlign = alignmentToCss(paragraphStyle.alignment);
  if (textAlign) {
    rules.push(`text-align:${textAlign}`);
  }

  const shading = optionalColorToHex(paragraphStyle.shading?.backgroundColor);
  if (shading && shading !== DEFAULT_BACKGROUND_COLOR) {
    rules.push(`background-color:${shading}`);
  }

  return rules.join(';');
}

/**
 * Wrap paragraph content with a block-level span when the paragraph itself
 * carries visual styling (alignment, shading). Returns content unchanged when
 * there is nothing to preserve.
 */
function applyParagraphStyling(
  content: string,
  paragraphStyle?: docs_v1.Schema$ParagraphStyle | null
): string {
  const css = paragraphStyleToCss(paragraphStyle);
  if (!css) return content;

  return `<span style="display:block;${css}">${content}</span>`;
}

/**
 * Extract text content from paragraph elements with formatting
 * (bold, italic, underline, strikethrough, sub/sup, colors, links).
 * Returns HTML string with appropriate formatting tags.
 */
function extractTextContent(elements?: docs_v1.Schema$ParagraphElement[]): string {
  if (!elements) return '';

  return elements
    .map((element) => {
      if (element.textRun?.content) {
        // Strip the paragraph-terminating newline so it never lands inside
        // formatting tags (e.g., <strong>text\n</strong>)
        let text = element.textRun.content.replace(/\n$/, '');
        if (!text) return '';

        const textStyle = element.textRun.textStyle;

        // Escape HTML entities, then convert soft line breaks () to <br>
        text = escapeHtml(text).replace(//g, '<br>');

        // Apply formatting based on textStyle
        if (textStyle) {
          // Superscript / subscript
          if (textStyle.baselineOffset === 'SUPERSCRIPT') {
            text = `<sup>${text}</sup>`;
          } else if (textStyle.baselineOffset === 'SUBSCRIPT') {
            text = `<sub>${text}</sub>`;
          }
          // Wrap with italic if needed
          if (textStyle.italic) {
            text = `<em>${text}</em>`;
          }
          // Wrap with bold if needed
          if (textStyle.bold) {
            text = `<strong>${text}</strong>`;
          }
          const linkUrl = textStyle.link?.url;
          const isSafeLink =
            typeof linkUrl === 'string' && /^https?:\/\//i.test(linkUrl);

          // Underline: skip for links (browsers style them already)
          if (textStyle.underline && !isSafeLink) {
            text = `<u>${text}</u>`;
          }
          // Wrap with strikethrough if needed
          if (textStyle.strikethrough) {
            text = `<s>${text}</s>`;
          }

          if (isSafeLink) {
            // Links keep their default styling; skip color rules
            text = `<a href="${escapeHtml(linkUrl)}">${text}</a>`;
          } else {
            const css = textStyleToCss(textStyle);
            if (css) {
              text = `<span style="${css}">${text}</span>`;
            }
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
  return /<(strong|em|u|s|table|tr|td|th|span|a|sup|sub|br|col|colgroup)(\s[^>]*)?\/?>/i.test(content);
}

/**
 * Build a <colgroup> preserving relative column widths, when Google provides
 * fixed widths for every column.
 */
function buildColgroup(table: docs_v1.Schema$Table): string {
  const columns = table.tableStyle?.tableColumnProperties;
  if (!columns || columns.length === 0) return '';

  const widths = columns.map((col) =>
    col.widthType === 'FIXED_WIDTH' ? col.width?.magnitude ?? null : null
  );
  if (widths.some((w) => w === null || w <= 0)) return '';

  const total = (widths as number[]).reduce((sum, w) => sum + w, 0);
  if (total <= 0) return '';

  const cols = (widths as number[])
    .map((w) => `<col style="width:${((w / total) * 100).toFixed(1)}%">`)
    .join('');

  return `<colgroup>${cols}</colgroup>`;
}

/**
 * Build the inline CSS for a table cell (background color and alignment of
 * its first paragraph).
 */
function tableCellCss(cell: docs_v1.Schema$TableCell): string {
  const rules: string[] = [];

  const background = optionalColorToHex(cell.tableCellStyle?.backgroundColor);
  if (background && background !== DEFAULT_BACKGROUND_COLOR) {
    rules.push(`background-color:${background}`);
  }

  const firstParagraph = cell.content?.find((el) => el.paragraph)?.paragraph;
  const textAlign = alignmentToCss(firstParagraph?.paragraphStyle?.alignment);
  if (textAlign) {
    rules.push(`text-align:${textAlign}`);
  }

  return rules.join(';');
}

/**
 * Convert a table element to an HTML table paragraph, preserving cell
 * background colors, merged cells, column widths, and in-cell formatting.
 */
function convertTableElement(
  table: docs_v1.Schema$Table,
  order: number
): Paragraph | null {
  if (!table.tableRows || table.tableRows.length === 0) {
    return null;
  }

  const rowCount = table.tableRows.length;
  let html = `<table>${buildColgroup(table)}`;

  table.tableRows.forEach((row, rowIndex) => {
    html += '<tr>';

    row.tableCells?.forEach((cell) => {
      const cellContent = extractCellContent(cell);
      // Single-row tables are usually callouts/cards, not data tables
      const tag = rowIndex === 0 && rowCount > 1 ? 'th' : 'td';

      const attrs: string[] = [];
      if (tag === 'th') attrs.push('scope="col"');

      const columnSpan = cell.tableCellStyle?.columnSpan;
      if (columnSpan && columnSpan > 1) attrs.push(`colspan="${columnSpan}"`);
      const rowSpan = cell.tableCellStyle?.rowSpan;
      if (rowSpan && rowSpan > 1) attrs.push(`rowspan="${rowSpan}"`);

      const css = tableCellCss(cell);
      if (css) attrs.push(`style="${css}"`);

      const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
      // cellContent is already HTML-safe (escaping done in extractTextContent)
      html += `<${tag}${attrString}>${cellContent}</${tag}>`;
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
 * Extract content from a table cell. Each cell paragraph becomes a line
 * (joined with <br>), keeping inline formatting, alignment, and bullets.
 */
function extractCellContent(cell: docs_v1.Schema$TableCell): string {
  if (!cell.content) return '';

  const lines: string[] = [];

  for (const element of cell.content) {
    if (!element.paragraph) continue;

    let line = extractTextContent(element.paragraph.elements).trim();
    if (!line) continue;

    // Preserve bullet-list items inside cells as visible bullets
    if (element.paragraph.bullet) {
      line = `• ${line}`;
    }

    // Preserve per-paragraph alignment/shading inside the cell (only when it
    // differs from the cell-level alignment already emitted on the td/th)
    lines.push(line);
  }

  return lines.join('<br>');
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
