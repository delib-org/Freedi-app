/**
 * Tests for googleDocsUtils
 *
 * Tests URL validation, document ID extraction, and URL building.
 */

import {
	parseGoogleDocsUrl,
	isValidGoogleDocsUrl,
	extractDocumentId,
	buildGoogleDocsUrl,
	GoogleDocsErrorCode,
	GOOGLE_DOCS_ERROR_MESSAGES,
} from '../googleDocsUtils';

describe('googleDocsUtils', () => {
	describe('parseGoogleDocsUrl', () => {
		it('should parse a standard Google Docs edit URL', () => {
			const result = parseGoogleDocsUrl(
				'https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit',
			);
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
			expect(result.error).toBeUndefined();
		});

		it('should parse a Google Docs view URL', () => {
			const result = parseGoogleDocsUrl('https://docs.google.com/document/d/abc123_-xyz/view');
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('abc123_-xyz');
		});

		it('should parse a Google Docs URL without suffix', () => {
			const result = parseGoogleDocsUrl('https://docs.google.com/document/d/myDocId123');
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('myDocId123');
		});

		it('should parse a Google Drive open URL', () => {
			const result = parseGoogleDocsUrl('https://drive.google.com/open?id=docId456');
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('docId456');
		});

		it('should handle http:// prefix', () => {
			const result = parseGoogleDocsUrl('http://docs.google.com/document/d/docId789/edit');
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('docId789');
		});

		it('should return error for empty string', () => {
			const result = parseGoogleDocsUrl('');
			expect(result.isValid).toBe(false);
			expect(result.documentId).toBeNull();
			expect(result.error).toBe('Please enter a Google Docs URL');
		});

		it('should return error for whitespace-only string', () => {
			const result = parseGoogleDocsUrl('   ');
			expect(result.isValid).toBe(false);
			expect(result.documentId).toBeNull();
		});

		it('should return error for non-URL string', () => {
			const result = parseGoogleDocsUrl('not a url');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('valid URL');
		});

		it('should return specific error for non-document Google URL', () => {
			const result = parseGoogleDocsUrl('https://sheets.google.com/spreadsheet/123');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('Google Docs document');
		});

		it('should return generic error for non-Google URL', () => {
			const result = parseGoogleDocsUrl('https://example.com/document');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('valid Google Docs URL');
		});

		it('should trim whitespace before parsing', () => {
			const result = parseGoogleDocsUrl('  https://docs.google.com/document/d/trimmedDoc/edit  ');
			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('trimmedDoc');
		});
	});

	describe('isValidGoogleDocsUrl', () => {
		it('should return true for valid URLs', () => {
			expect(isValidGoogleDocsUrl('https://docs.google.com/document/d/abc123/edit')).toBe(true);
		});

		it('should return false for invalid URLs', () => {
			expect(isValidGoogleDocsUrl('')).toBe(false);
			expect(isValidGoogleDocsUrl('https://example.com')).toBe(false);
		});
	});

	describe('extractDocumentId', () => {
		it('should return document ID for valid URL', () => {
			expect(extractDocumentId('https://docs.google.com/document/d/myDoc/edit')).toBe('myDoc');
		});

		it('should return null for invalid URL', () => {
			expect(extractDocumentId('invalid')).toBeNull();
		});
	});

	describe('buildGoogleDocsUrl', () => {
		it('should build a view URL from document ID', () => {
			expect(buildGoogleDocsUrl('abc123')).toBe('https://docs.google.com/document/d/abc123/view');
		});
	});

	describe('GoogleDocsErrorCode and messages', () => {
		it('should have error messages for all error codes', () => {
			const errorCodes = Object.values(GoogleDocsErrorCode);
			errorCodes.forEach((code) => {
				expect(GOOGLE_DOCS_ERROR_MESSAGES[code]).toBeDefined();
				expect(typeof GOOGLE_DOCS_ERROR_MESSAGES[code]).toBe('string');
			});
		});

		it('should have all expected error codes', () => {
			expect(GoogleDocsErrorCode.INVALID_URL).toBe('INVALID_URL');
			expect(GoogleDocsErrorCode.ACCESS_DENIED).toBe('ACCESS_DENIED');
			expect(GoogleDocsErrorCode.NOT_FOUND).toBe('NOT_FOUND');
			expect(GoogleDocsErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
			expect(GoogleDocsErrorCode.CONVERSION_ERROR).toBe('CONVERSION_ERROR');
			expect(GoogleDocsErrorCode.SERVER_ERROR).toBe('SERVER_ERROR');
		});
	});
});
