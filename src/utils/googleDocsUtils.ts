/**
 * Utilities for Google Docs URL validation and document ID extraction
 */

/**
 * Google Docs URL patterns:
 * - https://docs.google.com/document/d/{documentId}/edit
 * - https://docs.google.com/document/d/{documentId}/view
 * - https://docs.google.com/document/d/{documentId}/preview
 * - https://docs.google.com/document/d/{documentId}
 */
const GOOGLE_DOCS_PATTERNS = [
	// Standard Google Docs URL
	/^https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
	// Short link that redirects (less common)
	/^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
];

export interface GoogleDocsUrlResult {
	isValid: boolean;
	documentId: string | null;
	error?: string;
}

/**
 * Validate a Google Docs URL and extract the document ID
 * @param url - The URL to validate
 * @returns Result with validity, document ID, and optional error message
 */
export function parseGoogleDocsUrl(url: string): GoogleDocsUrlResult {
	if (!url?.trim()) {
		return {
			isValid: false,
			documentId: null,
			error: 'Please enter a Google Docs URL',
		};
	}

	const trimmedUrl = url.trim();

	// Check if it looks like a URL
	if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
		return {
			isValid: false,
			documentId: null,
			error: 'Please enter a valid URL starting with https://',
		};
	}

	// Check against known Google Docs patterns
	for (const pattern of GOOGLE_DOCS_PATTERNS) {
		const match = trimmedUrl.match(pattern);
		if (match && match[1]) {
			return {
				isValid: true,
				documentId: match[1],
			};
		}
	}

	// Check if it's a Google domain but not a valid document URL
	if (trimmedUrl.includes('google.com')) {
		return {
			isValid: false,
			documentId: null,
			error:
				'This URL does not appear to be a Google Docs document. Make sure you are using the full document URL.',
		};
	}

	return {
		isValid: false,
		documentId: null,
		error: 'Please enter a valid Google Docs URL (e.g., https://docs.google.com/document/d/...)',
	};
}

/**
 * Check if a URL is a valid Google Docs URL
 * @param url - The URL to check
 * @returns True if the URL is a valid Google Docs URL
 */
export function isValidGoogleDocsUrl(url: string): boolean {
	return parseGoogleDocsUrl(url).isValid;
}

/**
 * Extract document ID from a Google Docs URL
 * @param url - The Google Docs URL
 * @returns The document ID or null if invalid
 */
export function extractDocumentId(url: string): string | null {
	return parseGoogleDocsUrl(url).documentId;
}

/**
 * Build a Google Docs view URL from a document ID
 * @param documentId - The document ID
 * @returns The full Google Docs URL
 */
export function buildGoogleDocsUrl(documentId: string): string {
	return `https://docs.google.com/document/d/${documentId}/view`;
}

/**
 * Error codes for Google Docs import operations
 */
export enum GoogleDocsErrorCode {
	INVALID_URL = 'INVALID_URL',
	ACCESS_DENIED = 'ACCESS_DENIED',
	NOT_FOUND = 'NOT_FOUND',
	RATE_LIMITED = 'RATE_LIMITED',
	CONVERSION_ERROR = 'CONVERSION_ERROR',
	SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * User-friendly error messages for each error code
 */
export const GOOGLE_DOCS_ERROR_MESSAGES: Record<GoogleDocsErrorCode, string> = {
	[GoogleDocsErrorCode.INVALID_URL]: 'Please enter a valid Google Docs URL',
	[GoogleDocsErrorCode.ACCESS_DENIED]:
		'Cannot access this document. Please make it public or share it with the import service.',
	[GoogleDocsErrorCode.NOT_FOUND]: 'Document not found. Please check the URL.',
	[GoogleDocsErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
	[GoogleDocsErrorCode.CONVERSION_ERROR]: 'Failed to process document content.',
	[GoogleDocsErrorCode.SERVER_ERROR]: 'Failed to import document. Please try again.',
};
