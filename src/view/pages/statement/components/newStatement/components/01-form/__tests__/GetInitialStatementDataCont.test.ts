import { getSimilarOptions } from '../GetInitialStatementDataCont';
import { logError } from '@/utils/errorHandling';

jest.mock('@/services/similarOptions', () => ({ similarOptionsEndPoint: 'https://test/similar' }));
jest.mock('@/controllers/db/authHeaders', () => ({
	getAuthHeaders: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
	NetworkError: class NetworkError extends Error {},
}));

const fetchMock = jest.fn();
const setError = jest.fn();

function respondWith(status: number, body: unknown): void {
	fetchMock.mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	});
}

const check = () => getSimilarOptions('q1', 'my text', 'u1', setError);

describe('getSimilarOptions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		global.fetch = fetchMock;
	});

	it('tells a moderation rejection apart, and does not log it as a failure', async () => {
		respondWith(400, {
			ok: false,
			error: 'Input contains inappropriate content',
			reason: 'Please rephrase',
			category: 'profanity',
		});

		await expect(check()).resolves.toEqual({
			rejected: true,
			reason: 'Please rephrase',
			category: 'profanity',
		});
		expect(logError).not.toHaveBeenCalled();
		expect(setError).not.toHaveBeenCalled();
	});

	it('reports nothing similar as an empty, non-rejected result', async () => {
		respondWith(200, { ok: true, similarStatements: [], userText: 'my text' });

		await expect(check()).resolves.toEqual({
			rejected: false,
			similarStatements: [],
			similarTexts: [],
			userText: 'my text',
		});
	});

	it('returns matches', async () => {
		const similarStatements = [{ statementId: 'a1' }];
		respondWith(200, { ok: true, similarStatements, similarTexts: ['x'], userText: 'my text' });

		await expect(check()).resolves.toEqual({
			rejected: false,
			similarStatements,
			similarTexts: ['x'],
			userText: 'my text',
		});
	});

	it('fails open on a network failure', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(check()).resolves.toBeNull();
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('fails open on a server error', async () => {
		respondWith(500, { ok: false, error: 'Internal server error' });

		await expect(check()).resolves.toBeNull();
	});

	it('fails open on an HTML error page', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 504,
			json: () => Promise.reject(new SyntaxError('Unexpected token <')),
		});

		await expect(check()).resolves.toBeNull();
	});

	it('does not mistake another 400 for a rejection', async () => {
		respondWith(400, { ok: false, error: 'Missing required fields' });

		await expect(check()).resolves.toBeNull();
	});
});
