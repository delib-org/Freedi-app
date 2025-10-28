/**
 * URL detection and processing utilities
 */

/**
 * Detect URLs in text
 */
export function detectUrls(text: string): string[] {
	const urlRegex = /(https?:\/\/[^\s]+)/g;
	const matches = text.match(urlRegex);

	return matches || [];
}

/**
 * Check if text contains URLs
 */
export function containsUrl(text: string): boolean {
	return detectUrls(text).length > 0;
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url);

		return urlObj.hostname;
	} catch {
		return '';
	}
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);

		return true;
	} catch {
		return false;
	}
}
