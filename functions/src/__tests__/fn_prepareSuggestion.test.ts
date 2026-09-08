import { Request, Response } from 'firebase-functions/v1';
import { Statement } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const checkForInappropriateContent = jest.fn();
const detectAndSplitMultipleSuggestions = jest.fn();
jest.mock('../services/ai-service', () => ({
	checkForInappropriateContent: (...args: unknown[]) => checkForInappropriateContent(...args),
	detectAndSplitMultipleSuggestions: (...args: unknown[]) =>
		detectAndSplitMultipleSuggestions(...args),
}));

const getCachedParentStatement = jest.fn();
jest.mock('../services/cached-statement-service', () => ({
	getCachedParentStatement: (...args: unknown[]) => getCachedParentStatement(...args),
}));

const searchSimilarStatements = jest.fn();
jest.mock('../services/similarity-search-service', () => ({
	searchSimilarStatements: (...args: unknown[]) => searchSimilarStatements(...args),
	thresholdFor: () => 0.8,
}));

const logModerationRejection = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/moderation-log-service', () => ({
	logModerationRejection: (...args: unknown[]) => logModerationRejection(...args),
}));

import { prepareSuggestion } from '../fn_prepareSuggestion';

const stmt = (statementId: string): Statement =>
	({ statementId, statement: `text of ${statementId}` }) as Partial<Statement> as Statement;

function makeResponse() {
	const send = jest.fn();
	const status = jest.fn(() => ({ send }));

	return { response: { status, send } as unknown as Response, status, send };
}

function makeRequest(body: Record<string, unknown>): Request {
	return { body } as Request;
}

const okSearch = (ids: string[]) => ({
	ok: true,
	similarStatements: ids.map((id) => ({ ...stmt(id), similarity: 0.9 })),
	userText: 'user text',
	method: 'embedding',
	cached: false,
});

beforeEach(() => {
	jest.clearAllMocks();
	checkForInappropriateContent.mockResolvedValue({ isInappropriate: false });
	getCachedParentStatement.mockResolvedValue({
		statementId: 'q1',
		statement: 'The question',
	} as Partial<Statement> as Statement);
	detectAndSplitMultipleSuggestions.mockResolvedValue({ isMultiple: false, suggestions: [] });
	searchSimilarStatements.mockResolvedValue(okSearch([]));
});

describe('prepareSuggestion', () => {
	it('rejects a request missing its fields', async () => {
		const { response, status } = makeResponse();
		await prepareSuggestion(makeRequest({ userInput: 'x' }), response);
		expect(status).toHaveBeenCalledWith(400);
		expect(checkForInappropriateContent).not.toHaveBeenCalled();
	});

	it('returns split detection and similar suggestions from one request', async () => {
		detectAndSplitMultipleSuggestions.mockResolvedValue({
			isMultiple: true,
			suggestions: [
				{ title: 'A', description: 'a', originalText: 'a' },
				{ title: 'B', description: 'b', originalText: 'b' },
			],
		});
		searchSimilarStatements.mockResolvedValue(okSearch(['s1']));
		const { response, status, send } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'q1', userInput: 'A and B', userId: 'u1' }),
			response,
		);

		expect(status).toHaveBeenCalledWith(200);
		const body = send.mock.calls[0][0];
		expect(body.ok).toBe(true);
		expect(body.multi).toEqual({
			isMultipleSuggestions: true,
			suggestions: expect.arrayContaining([expect.objectContaining({ title: 'A' })]),
		});
		expect(body.similar.similarStatements.map((s: Statement) => s.statementId)).toEqual(['s1']);
		expect(body.pieces).toBeUndefined();
		// One moderation call, one question read, one search for the whole text
		expect(checkForInappropriateContent).toHaveBeenCalledTimes(1);
		expect(getCachedParentStatement).toHaveBeenCalledTimes(1);
		expect(searchSimilarStatements).toHaveBeenCalledTimes(1);
	});

	it('searches each piece when asked to, aligned with the detected suggestions', async () => {
		detectAndSplitMultipleSuggestions.mockResolvedValue({
			isMultiple: true,
			suggestions: [
				{ title: 'A', description: 'a', originalText: 'a' },
				{ title: 'B', description: 'b', originalText: 'b' },
			],
		});
		searchSimilarStatements.mockImplementation(({ userInput }: { userInput: string }) => {
			if (userInput === 'A: a') return Promise.resolve(okSearch(['match-a']));
			if (userInput === 'B: b') return Promise.resolve({ ok: false, error: 'x', statusCode: 500 });

			return Promise.resolve(okSearch([]));
		});
		const { response, send } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'q1', userInput: 'A and B', userId: 'u1', checkPieces: true }),
			response,
		);

		const body = send.mock.calls[0][0];
		expect(body.pieces).toHaveLength(2);
		expect(body.pieces[0].similarStatements[0].statementId).toBe('match-a');
		// Whole text: full search. Pieces: quick (no paraphrase round).
		expect(searchSimilarStatements).toHaveBeenCalledWith(
			expect.objectContaining({ userInput: 'A and B', quick: false }),
		);
		expect(searchSimilarStatements).toHaveBeenCalledWith(
			expect.objectContaining({ userInput: 'A: a', quick: true }),
		);
		// A failed piece search degrades to "nothing similar" rather than failing the request
		expect(body.pieces[1]).toEqual({ similarStatements: [], userText: 'B: b' });
	});

	it('applies the moderation verdict last and discards the work', async () => {
		checkForInappropriateContent.mockResolvedValue({
			isInappropriate: true,
			reason: 'Please rephrase',
			category: 'personal_attack',
		});
		searchSimilarStatements.mockResolvedValue(okSearch(['s1']));
		const { response, status, send } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'q1', userInput: 'rude text', userId: 'u1' }),
			response,
		);

		// The search still ran (it started alongside moderation)…
		expect(searchSimilarStatements).toHaveBeenCalledTimes(1);
		// …but the caller only sees the refusal
		expect(status).toHaveBeenCalledWith(400);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({
			ok: false,
			reason: 'Please rephrase',
			category: 'personal_attack',
		});
		expect(logModerationRejection).toHaveBeenCalledTimes(1);
	});

	it('marks the response when moderation was unavailable', async () => {
		checkForInappropriateContent.mockResolvedValue({ isInappropriate: false, error: 'LLM down' });
		const { response, send } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'q1', userInput: 'idea', userId: 'u1' }),
			response,
		);

		expect(send.mock.calls[0][0]).toMatchObject({ ok: true, flaggedForReview: true });
	});

	it('passes a search refusal through with its status', async () => {
		searchSimilarStatements.mockResolvedValue({ ok: false, error: 'limit', statusCode: 403 });
		const { response, status, send } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'q1', userInput: 'idea', userId: 'u1' }),
			response,
		);

		expect(status).toHaveBeenCalledWith(403);
		expect(send.mock.calls[0][0]).toMatchObject({ ok: false, error: 'limit' });
	});

	it('404s when the question does not exist', async () => {
		getCachedParentStatement.mockResolvedValue(null);
		const { response, status } = makeResponse();

		await prepareSuggestion(
			makeRequest({ questionId: 'nope', userInput: 'idea', userId: 'u1' }),
			response,
		);

		expect(status).toHaveBeenCalledWith(404);
		expect(searchSimilarStatements).not.toHaveBeenCalled();
	});
});
