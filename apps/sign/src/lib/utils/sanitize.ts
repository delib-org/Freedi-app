import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Allows common formatting tags used in Google Docs imports.
 *
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHTML(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return as-is (content should be sanitized on client)
    // In production, consider using a server-safe sanitizer like isomorphic-dompurify
    return html;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      // Text formatting
      'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
      'sub', 'sup', 'mark', 'small',
      // Structure
      'p', 'br', 'span', 'div',
      // Lists (for table content)
      'ul', 'ol', 'li',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      // Links
      'a',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'class', 'style',
      'colspan', 'rowspan', 'scope',
    ],
    // Force all links to open in new tab with security attributes
    FORCE_BODY: true,
    ADD_ATTR: ['target'],
  });
}

/**
 * Sanitizes HTML and adds security attributes to links
 */
export function sanitizeHTMLWithSecureLinks(html: string): string {
  const sanitized = sanitizeHTML(html);

  if (typeof window === 'undefined') {
    return sanitized;
  }

  // Add rel="noopener noreferrer" to all links
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitized;

  const links = tempDiv.querySelectorAll('a');
  links.forEach((link) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  return tempDiv.innerHTML;
}
