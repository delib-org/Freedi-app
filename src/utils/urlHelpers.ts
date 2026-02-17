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

/**
 * Sign App URL Helpers
 */

// Sign app base URL (configured via environment variable, defaults to production)
const SIGN_APP_BASE_URL = import.meta.env.VITE_SIGN_APP_URL || 'https://sign.wizcol.com';

/**
 * Get the Sign app URL for a document
 * @param statementId - The ID of the statement/document to sign
 * @returns Full URL to the Sign app document page
 */
export function getSignDocumentUrl(statementId: string): string {
	return `${SIGN_APP_BASE_URL}/doc/${statementId}`;
}

/**
 * Get the Sign app admin URL for a document
 * @param statementId - The ID of the statement/document
 * @returns Full URL to the Sign app admin panel
 */
export function getSignAdminUrl(statementId: string): string {
	return `${SIGN_APP_BASE_URL}/doc/${statementId}/admin`;
}

/**
 * Check if a statement can be opened in the Sign app
 * Options and documents can be signed
 */
export function canOpenInSignApp(statementType: string): boolean {
	return ['option', 'document', 'question'].includes(statementType);
}
