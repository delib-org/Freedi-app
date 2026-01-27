/**
 * Convert HTML to Markdown
 * Handles common formatting: bold, italic, paragraphs, line breaks
 */

export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  let markdown = html;

  // Remove wrapping <p> tags and replace with newlines
  markdown = markdown.replace(/<p>/gi, '');
  markdown = markdown.replace(/<\/p>/gi, '\n');

  // Convert <strong> and <b> to **bold**
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');

  // Convert <em> and <i> to *italic*
  markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');

  // Convert <u> to markdown (no standard, use HTML)
  markdown = markdown.replace(/<u>(.*?)<\/u>/gi, '_$1_');

  // Convert <br> and <br/> to newlines
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

  // Convert headers
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
  markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n');
  markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n');
  markdown = markdown.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n');

  // Convert <ul> and <li> to markdown lists
  markdown = markdown.replace(/<ul>/gi, '');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<li>(.*?)<\/li>/gi, '- $1\n');

  // Convert <ol> and <li> to numbered lists
  let olCounter = 0;
  markdown = markdown.replace(/<ol>/gi, () => {
    olCounter = 0;
    return '';
  });
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  markdown = markdown.replace(/<li>(.*?)<\/li>/gi, () => {
    olCounter++;
    return `${olCounter}. $1\n`;
  });

  // Remove any remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&#39;/g, "'");

  // Clean up extra newlines (max 2 consecutive)
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  markdown = markdown.trim();

  return markdown;
}

/**
 * Strip all HTML tags and return plain text
 */
export function stripHTML(html: string): string {
  if (!html) return '';

  let text = html;

  // Replace <br> with space
  text = text.replace(/<br\s*\/?>/gi, ' ');

  // Replace </p> with newline
  text = text.replace(/<\/p>/gi, '\n');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.trim();

  return text;
}
