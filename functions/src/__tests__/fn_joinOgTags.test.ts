import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { Statement } from '@freedi/shared-types';

/**
 * Unit tests for `joinOg` — the function that serves the Join app's share
 * routes so WhatsApp/Facebook previews show the shared question and its
 * sub-questions instead of the generic app card, while humans still get the
 * untouched static app shell.
 */

const mockDocGet = jest.fn<() => Promise<{ exists: boolean; data?: () => unknown }>>();
const mockSubQuestionsGet = jest.fn<() => Promise<{ docs: { data: () => unknown }[] }>>();

const queryMock: Record<string, unknown> = {};
queryMock.where = jest.fn(() => queryMock);
queryMock.get = mockSubQuestionsGet;
queryMock.doc = jest.fn(() => ({ get: mockDocGet }));

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({ collection: () => queryMock }),
}));

jest.mock('../utils/errorHandling', () => ({
	logError: jest.fn(),
}));

import {
	extractJoinStatementId,
	buildDescription,
	handleJoinOg,
	__resetShellCacheForTests,
} from '../fn_joinOgTags';

const WHATSAPP_UA = 'WhatsApp/2.23.20.0 A';
const BROWSER_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

interface FakeResponse {
	res: Response;
	body: () => string;
	statusCode: () => number;
	headers: () => Record<string, string>;
}

function fakeResponse(): FakeResponse {
	let body = '';
	let statusCode = 200;
	const headers: Record<string, string> = {};
	const res = {
		set: (key: string, value: string) => {
			headers[key] = value;

			return res;
		},
		status: (code: number) => {
			statusCode = code;

			return res;
		},
		send: (payload: string) => {
			body = payload;

			return res;
		},
	} as unknown as Response;

	return { res, body: () => body, statusCode: () => statusCode, headers: () => headers };
}

function fakeRequest(path: string, userAgent: string): Request {
	return {
		path,
		originalUrl: path,
		headers: { host: 'join.wizcol.com', 'user-agent': userAgent, 'x-forwarded-proto': 'https' },
	} as unknown as Request;
}

function makeStatement(overrides: Partial<Statement> = {}): Statement {
	return {
		statement: 'Parent question',
		...overrides,
	} as Statement;
}

describe('fn_joinOgTags', () => {
	describe('extractJoinStatementId', () => {
		it('reads the question id from a plain share link', () => {
			expect(extractJoinStatementId('/q/QID123')).toBe('QID123');
		});

		it('prefers the deepest id — the screen the sharer was on', () => {
			expect(extractJoinStatementId('/q/QID/s/SID')).toBe('SID');
			expect(extractJoinStatementId('/m/MID/q/QID')).toBe('QID');
			expect(extractJoinStatementId('/m/MID/q/QID/s/SID')).toBe('SID');
		});

		it('reads the main (hub) id', () => {
			expect(extractJoinStatementId('/m/MID')).toBe('MID');
		});

		it('ignores query strings and trailing slashes', () => {
			expect(extractJoinStatementId('/q/QID/')).toBe('QID');
			expect(extractJoinStatementId('/m/MID?lang=he')).toBe('MID');
		});

		it('returns null for non-share routes', () => {
			expect(extractJoinStatementId('/')).toBeNull();
			expect(extractJoinStatementId('/login')).toBeNull();
			expect(extractJoinStatementId('/invite')).toBeNull();
		});

		it('falls back to the last valid id when the path has unexpected tail segments', () => {
			expect(extractJoinStatementId('/q/QID/x/BAD')).toBe('QID');
			expect(extractJoinStatementId('/q/QID/s/not a valid id')).toBe('QID');
		});
	});

	describe('buildDescription', () => {
		it('lists the sub-questions as bullets', () => {
			const description = buildDescription(makeStatement(), [
				makeStatement({ statement: 'Where should the park go?' }),
				makeStatement({ statement: 'How do we fund it?' }),
			]);

			expect(description).toBe('• Where should the park go?\n• How do we fund it?');
		});

		it('collapses the tail into "+N more" past the listed cap', () => {
			const subs = Array.from({ length: 8 }, (_unused, i) =>
				makeStatement({ statement: `Question ${i + 1}` }),
			);

			const description = buildDescription(makeStatement(), subs);

			expect(description).toBe(
				'• Question 1\n• Question 2\n• Question 3\n• Question 4\n• Question 5\n• +3 more',
			);
		});

		it('stays within the preview budget by dropping whole items', () => {
			const subs = Array.from({ length: 5 }, (_unused, i) =>
				makeStatement({ statement: `${'x'.repeat(70)} ${i}` }),
			);

			const description = buildDescription(makeStatement(), subs);

			expect(description.length).toBeLessThanOrEqual(300);
			expect(description).toContain('more');
			expect(description.split('\n').every((line) => line.startsWith('• '))).toBe(true);
		});

		it('falls back to the cached body preview when there are no sub-questions', () => {
			expect(buildDescription(makeStatement({ description: 'A short body.' }), [])).toBe(
				'A short body.',
			);
		});

		it('falls back to the admin tagline before the generic default', () => {
			expect(buildDescription(makeStatement({ brief: 'Our neighbourhood plan' }), [])).toBe(
				'Our neighbourhood plan',
			);
			expect(buildDescription(makeStatement(), [])).toBe(
				'Propose, evaluate and choose solutions together.',
			);
		});

		it('flattens newlines in statement text so meta attributes stay well-formed', () => {
			const description = buildDescription(makeStatement(), [
				makeStatement({ statement: 'Line one\n\nline two' }),
			]);

			expect(description).toBe('• Line one line two');
		});
	});

	describe('handleJoinOg', () => {
		const originalFetch = global.fetch;
		const shellHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>';

		beforeEach(() => {
			jest.clearAllMocks();
			__resetShellCacheForTests();
			global.fetch = jest.fn(async () => ({
				ok: true,
				status: 200,
				text: async () => shellHtml,
			})) as unknown as typeof global.fetch;
		});

		afterEach(() => {
			global.fetch = originalFetch;
		});

		it('serves the static app shell to real browsers without touching Firestore', async () => {
			const { res, body, statusCode } = fakeResponse();

			await handleJoinOg(fakeRequest('/m/MID', BROWSER_UA), res);

			expect(statusCode()).toBe(200);
			expect(body()).toBe(shellHtml);
			expect(mockDocGet).not.toHaveBeenCalled();
		});

		it('caches the shell so a burst of clicks costs one origin fetch', async () => {
			await handleJoinOg(fakeRequest('/m/MID', BROWSER_UA), fakeResponse().res);
			await handleJoinOg(fakeRequest('/m/MID', BROWSER_UA), fakeResponse().res);

			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it('answers with a retry page when the shell cannot be fetched', async () => {
			global.fetch = jest.fn(async () => ({
				ok: false,
				status: 500,
				text: async () => '',
			})) as unknown as typeof global.fetch;
			const { res, body, statusCode } = fakeResponse();

			await handleJoinOg(fakeRequest('/q/QID', BROWSER_UA), res);

			expect(statusCode()).toBe(503);
			expect(body()).toContain('http-equiv="refresh"');
		});

		it('gives WhatsApp the question title and its sub-questions', async () => {
			mockDocGet.mockResolvedValue({
				exists: true,
				data: () => ({ statement: 'Neighbourhood budget 2027', defaultLanguage: 'he' }),
			});
			mockSubQuestionsGet.mockResolvedValue({
				docs: [
					{ data: () => ({ statement: 'Where should the park go?', order: 1 }) },
					{ data: () => ({ statement: 'Hidden one', order: 0, hide: true }) },
					{ data: () => ({ statement: 'How do we fund it?', order: 2 }) },
				],
			});
			const { res, body, headers } = fakeResponse();

			await handleJoinOg(fakeRequest('/m/MID', WHATSAPP_UA), res);

			expect(body()).toContain('<meta property="og:title" content="Neighbourhood budget 2027">');
			expect(body()).toContain(
				'<meta property="og:description" content="• Where should the park go?&#10;• How do we fund it?">',
			);
			expect(body()).toContain('<meta property="og:url" content="https://join.wizcol.com/m/MID">');
			expect(body()).toContain(
				'<meta property="og:image" content="https://join.wizcol.com/icons/icon-512.png">',
			);
			expect(body()).toContain('<html lang="he">');
			// Hidden sub-questions stay out of a public preview.
			expect(body()).not.toContain('Hidden one');
			expect(headers()['Cache-Control']).toBe('no-store');
			expect(headers()['Vary']).toBe('User-Agent');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('escapes statement text so it cannot break out of the meta attribute', async () => {
			mockDocGet.mockResolvedValue({
				exists: true,
				data: () => ({ statement: 'Ban "bots" & <script>alert(1)</script>' }),
			});
			mockSubQuestionsGet.mockResolvedValue({ docs: [] });
			const { res, body } = fakeResponse();

			await handleJoinOg(fakeRequest('/q/QID', WHATSAPP_UA), res);

			expect(body()).not.toContain('<script>');
			expect(body()).toContain('Ban &quot;bots&quot; &amp; &lt;script&gt;');
		});

		it('falls back to the app card for a missing statement', async () => {
			mockDocGet.mockResolvedValue({ exists: false });
			const { res, body } = fakeResponse();

			await handleJoinOg(fakeRequest('/q/GONE', WHATSAPP_UA), res);

			expect(body()).toContain('<meta property="og:title" content="WizCol-Join">');
			expect(mockSubQuestionsGet).not.toHaveBeenCalled();
		});

		it('falls back to the app card when Firestore fails', async () => {
			mockDocGet.mockRejectedValue(new Error('firestore down'));
			const { res, body } = fakeResponse();

			await handleJoinOg(fakeRequest('/q/QID', WHATSAPP_UA), res);

			expect(body()).toContain('<meta property="og:title" content="WizCol-Join">');
			expect(body()).toContain('Propose, evaluate and choose solutions together.');
		});
	});
});
