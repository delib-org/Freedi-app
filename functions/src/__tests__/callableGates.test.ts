import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Callables that spend money or act on someone else's data. Each must require
 * sign-in and spend a rate-limit slot before doing any work.
 */

jest.mock('firebase-functions/v2/https', () => {
	class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}

	return { HttpsError, onCall: (_opts: unknown, handler: unknown) => handler };
});
jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: jest.fn() }));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockEnforce = jest.fn<() => Promise<void>>();
jest.mock('../utils/rateLimit', () => ({
	enforceCallableRateLimit: () => mockEnforce(),
}));

const mockGenerate = jest.fn<() => Promise<unknown>>();
jest.mock('../config/gemini', () => ({
	GEMINI_MODEL: 'test',
	getGenAI: () => ({ getGenerativeModel: () => ({ generateContent: mockGenerate }) }),
	getGeminiModel: () => ({ generateContent: mockGenerate }),
}));

const mockFetchLinkText = jest.fn<(url: string, max: number) => Promise<unknown>>();
jest.mock('../agora/materialsExtract', () => ({
	fetchLinkText: (url: string, max: number) => mockFetchLinkText(url, max),
}));

const mockDocGet = jest.fn<() => Promise<unknown>>();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({
			doc: () => ({ get: mockDocGet, collection: () => ({ doc: jest.fn() }) }),
		}),
	}),
	FieldValue: { serverTimestamp: () => 0 },
}));
jest.mock('../db', () => ({
	db: { collection: () => ({ doc: () => ({ get: mockDocGet }) }) },
}));
jest.mock('../condensation/pipeline', () => ({ runCondensationPipeline: jest.fn() }));
jest.mock('../condensation/authorNotifications', () => ({ notifyAuthorsOfGrouping: jest.fn() }));
jest.mock('../condensation/recomputeAffectedClusters', () => ({
	recomputeAffectedClusters: jest.fn(),
}));

const mockAssertAdmin = jest.fn<() => Promise<unknown>>();
jest.mock('../progress/assertStatementAdmin', () => ({
	assertStatementAdmin: () => mockAssertAdmin(),
	findStatementAdminSource: jest.fn(),
}));
jest.mock('../engagement/joinForm/getGoogleSheetsClient', () => ({
	extractSheetId: () => 'sheet',
	getGoogleSheetsClient: () => null,
}));
jest.mock('../config/cors', () => ({ ALLOWED_ORIGINS: [] }));

import { checkProfanity } from '../fn_profanityChecker';
import { analyzeFalsifiability } from '../fn_popperHebbian_analyzeFalsifiability';
import { refineIdea } from '../fn_popperHebbian_refineIdea';
import { summarizeLink } from '../fn_popperHebbian_summarizeLink';
import { runCondensation } from '../condensation/fn_runCondensation';
import { fn_removeUserFromSheet } from '../engagement/joinForm/fn_removeUserFromSheet';

type Callable = (request: {
	auth?: { uid: string };
	data: unknown;
	rawRequest?: unknown;
}) => Promise<unknown>;

const signedOut = (data: unknown) => ({ data });
const signedIn = (uid: string, data: unknown) => ({
	auth: { uid },
	data,
	rawRequest: { headers: {} },
});

beforeEach(() => {
	jest.clearAllMocks();
	mockEnforce.mockResolvedValue(undefined);
	mockGenerate.mockResolvedValue({
		response: {
			text: () => '{}',
			candidates: [{}],
		},
	});
});

describe.each<[string, unknown, unknown]>([
	['checkProfanity', checkProfanity, { text: 'hello' }],
	['analyzeFalsifiability', analyzeFalsifiability, { ideaText: 'an idea' }],
	['refineIdea', refineIdea, { userResponse: 'x', conversationHistory: [], originalIdea: 'y' }],
])('%s', (_name, callable, data) => {
	const call = callable as Callable;

	it('rejects a caller who is not signed in, and does not call the model', async () => {
		await expect(call(signedOut(data))).rejects.toMatchObject({ code: 'unauthenticated' });
		expect(mockGenerate).not.toHaveBeenCalled();
	});

	it('does not call the model once the rate limit trips', async () => {
		mockEnforce.mockRejectedValue(
			Object.assign(new Error('limit'), { code: 'resource-exhausted' }),
		);

		await expect(call(signedIn('anon', data))).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
		expect(mockGenerate).not.toHaveBeenCalled();
	});
});

describe('summarizeLink', () => {
	const call = summarizeLink as unknown as Callable;

	it('goes through the guarded fetcher and refuses what it refuses', async () => {
		mockFetchLinkText.mockResolvedValue({ ok: false, reason: 'link_unreachable' });

		await expect(
			call(signedIn('u1', { url: 'http://169.254.169.254/computeMetadata/v1/' })),
		).rejects.toMatchObject({ code: 'internal' });
		expect(mockFetchLinkText).toHaveBeenCalledWith(
			'http://169.254.169.254/computeMetadata/v1/',
			expect.any(Number),
		);
		expect(mockGenerate).not.toHaveBeenCalled();
	});

	it('does not fetch once the rate limit trips', async () => {
		mockEnforce.mockRejectedValue(
			Object.assign(new Error('limit'), { code: 'resource-exhausted' }),
		);

		await expect(call(signedIn('u1', { url: 'https://example.com' }))).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
		expect(mockFetchLinkText).not.toHaveBeenCalled();
	});
});

describe('runCondensation', () => {
	const call = runCondensation as unknown as Callable;

	it('no longer lets mode: "scheduled" stand in for being the creator', async () => {
		mockDocGet.mockResolvedValue({
			exists: true,
			data: () => ({ creatorId: 'owner', statementSettings: { condensation: { enabled: true } } }),
		});

		await expect(
			call(signedIn('attacker', { parentId: 'q1', mode: 'scheduled' })),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});
});

describe('fn_removeUserFromSheet', () => {
	const call = fn_removeUserFromSheet as unknown as Callable;

	it('requires sign-in', async () => {
		await expect(call(signedOut({ questionId: 'q1', userId: 'u1' }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('lets a person remove their own row without an admin check', async () => {
		mockDocGet.mockResolvedValue({ exists: false });
		await call(signedIn('u1', { questionId: 'q1', userId: 'u1' }));

		expect(mockAssertAdmin).not.toHaveBeenCalled();
	});

	it('requires admin rights to remove someone else', async () => {
		mockAssertAdmin.mockRejectedValue(
			Object.assign(new Error('no'), { code: 'permission-denied' }),
		);

		await expect(
			call(signedIn('attacker', { questionId: 'q1', userId: 'victim' })),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});
});
