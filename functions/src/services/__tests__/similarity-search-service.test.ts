import { Statement } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const findSimilarToText = jest.fn();
jest.mock('../vector-search-service', () => ({
	vectorSearchService: { findSimilarToText: (...args: unknown[]) => findSimilarToText(...args) },
}));

const getEmbeddingCoverage = jest.fn();
jest.mock('../embedding-cache-service', () => ({
	embeddingCache: { getEmbeddingCoverage: (...args: unknown[]) => getEmbeddingCoverage(...args) },
}));

const generateParaphrases = jest.fn();
jest.mock('../paraphrase-service', () => ({
	generateParaphrases: (...args: unknown[]) => generateParaphrases(...args),
}));

const getCachedSubStatements = jest.fn();
jest.mock('../cached-statement-service', () => ({
	getCachedSubStatements: (...args: unknown[]) => getCachedSubStatements(...args),
}));

const getCachedSimilarityResponse = jest.fn();
const saveCachedSimilarityResponse = jest.fn();
const getCachedSimilarStatementIds = jest.fn();
jest.mock('../cached-ai-service', () => ({
	getCachedSimilarityResponse: (...args: unknown[]) => getCachedSimilarityResponse(...args),
	saveCachedSimilarityResponse: (...args: unknown[]) => saveCachedSimilarityResponse(...args),
	getCachedSimilarStatementIds: (...args: unknown[]) => getCachedSimilarStatementIds(...args),
}));

jest.mock('../statement-service', () => ({
	getUserStatements: (statements: Statement[], creatorId: string) =>
		statements.filter((s) => s.creatorId === creatorId),
	convertToSimpleStatements: (statements: Statement[]) =>
		statements.map((s) => ({ id: s.statementId, statement: s.statement })),
	getStatementsByIds: (ids: string[], statements: Statement[]) =>
		ids.map((id) => statements.find((s) => s.statementId === id)).filter(Boolean),
	removeDuplicateStatement: (statements: Statement[]) => ({
		statements,
		duplicateStatement: undefined,
	}),
	hasReachedMaxStatements: (userStatements: Statement[], max: number) =>
		userStatements.length >= max,
}));

import {
	firstPassIsEnough,
	mergeHits,
	searchSimilarStatements,
	thresholdFor,
} from '../similarity-search-service';

const stmt = (statementId: string, creatorId = 'someone-else'): Statement =>
	({
		statementId,
		statement: `text of ${statementId}`,
		creatorId,
	}) as Partial<Statement> as Statement;

const hit = (statementId: string, similarity: number) => ({
	statement: stmt(statementId),
	similarity,
});

/** A promise that resolves only when the test says so, to prove what was (not) awaited. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});

	return { promise, resolve };
}

const parentStatement = {
	statementId: 'q1',
	statement: 'How do we improve the park?',
	statementSettings: {},
} as Partial<Statement> as Statement;

const baseInput = {
	questionId: 'q1',
	userInput: 'Plant more trees along the paths',
	creatorId: 'user-1',
	parentStatement,
	threshold: 0.8,
};

beforeEach(() => {
	jest.clearAllMocks();
	getCachedSimilarityResponse.mockResolvedValue(null);
	saveCachedSimilarityResponse.mockResolvedValue(undefined);
	getCachedSubStatements.mockResolvedValue([stmt('a'), stmt('b'), stmt('c')]);
	getEmbeddingCoverage.mockResolvedValue({ coveragePercent: 100 });
	generateParaphrases.mockResolvedValue([]);
	getCachedSimilarStatementIds.mockResolvedValue([]);
});

describe('pure helpers', () => {
	it('firstPassIsEnough: any match at or above the threshold settles it', () => {
		expect(firstPassIsEnough(0)).toBe(false);
		expect(firstPassIsEnough(1)).toBe(true);
	});

	it('mergeHits keeps the best score per statement and first-seen order', () => {
		const merged = mergeHits(
			[
				{ statementId: 'a', similarity: 0.81 },
				{ statementId: 'b', similarity: 0.9 },
			],
			[
				{ statementId: 'a', similarity: 0.95 },
				{ statementId: 'c', similarity: 0.85 },
			],
		);
		expect(merged).toEqual([
			{ statementId: 'a', similarity: 0.95 },
			{ statementId: 'b', similarity: 0.9 },
			{ statementId: 'c', similarity: 0.85 },
		]);
	});

	it('thresholdFor reads the admin setting and defaults to 0.8', () => {
		expect(thresholdFor(parentStatement)).toBe(0.8);
		expect(
			thresholdFor({
				...parentStatement,
				statementSettings: { similarityThreshold: 0.7 },
			} as Statement),
		).toBe(0.7);
	});
});

describe('searchSimilarStatements', () => {
	it('answers from the raw-text first pass without waiting for the expansions', async () => {
		const brief = deferred<never[]>();
		const paraphrases = deferred<string[]>();
		generateParaphrases.mockReturnValue(paraphrases.promise);
		findSimilarToText.mockImplementation(
			(_text: string, _q: string, _ctx: string, opts: { skipBrief?: boolean }) =>
				opts.skipBrief ? Promise.resolve([hit('a', 0.91)]) : brief.promise,
		);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.similarStatements.map((s) => s.statementId)).toEqual(['a']);
		expect(result.similarStatements[0].similarity).toBe(0.91);
		expect(result.method).toBe('embedding');
		// The brief search and the paraphrases were started at once…
		expect(findSimilarToText).toHaveBeenCalledTimes(2);
		expect(generateParaphrases).toHaveBeenCalledTimes(1);
		// …but the answer did not wait for them (they are still pending here)
		brief.resolve([]);
		paraphrases.resolve([]);
	});

	it('answers from the brief search when the first pass misses, without waiting for paraphrases', async () => {
		const paraphrases = deferred<string[]>();
		generateParaphrases.mockReturnValue(paraphrases.promise);
		findSimilarToText.mockImplementation(
			(_text: string, _q: string, _ctx: string, opts: { skipBrief?: boolean }) =>
				opts.skipBrief ? Promise.resolve([]) : Promise.resolve([hit('a', 0.86)]),
		);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.similarStatements.map((s) => s.statementId)).toEqual(['a']);
		// raw + brief of the original text; the paraphrases are still pending
		expect(findSimilarToText).toHaveBeenCalledTimes(2);
		paraphrases.resolve([]);
	});

	it('falls through to the paraphrase searches when both the raw and brief passes miss', async () => {
		generateParaphrases.mockResolvedValue(['p1', 'p2']);
		findSimilarToText.mockImplementation(
			(text: string, _q: string, _ctx: string, opts: { skipBrief?: boolean }) => {
				if (opts.skipBrief) return Promise.resolve([]);
				if (text === 'p1') return Promise.resolve([hit('b', 0.83)]);
				if (text === 'p2') return Promise.resolve([hit('c', 0.88), hit('b', 0.8)]);

				return Promise.resolve([]); // brief search of the original text
			},
		);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.similarStatements.map((s) => s.statementId)).toEqual(['c', 'b']);
		expect(result.similarStatements.map((s) => s.similarity)).toEqual([0.88, 0.83]);
		// original raw, original brief, p1, p2
		expect(findSimilarToText).toHaveBeenCalledTimes(4);
	});

	it('quick mode never starts a paraphrase round', async () => {
		findSimilarToText.mockResolvedValue([]);

		const result = await searchSimilarStatements({ ...baseInput, quick: true });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.similarStatements).toEqual([]);
		expect(generateParaphrases).not.toHaveBeenCalled();
		expect(findSimilarToText).toHaveBeenCalledTimes(2);
	});

	it('does not wait for the cache write', async () => {
		const save = deferred<void>();
		saveCachedSimilarityResponse.mockReturnValue(save.promise);
		findSimilarToText.mockResolvedValue([hit('a', 0.9)]);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		expect(saveCachedSimilarityResponse).toHaveBeenCalledWith(
			'q1',
			baseInput.userInput,
			'user-1',
			expect.objectContaining({ userText: baseInput.userInput }),
			0.8,
		);
		save.resolve();
	});

	it('returns the cached response without searching', async () => {
		getCachedSimilarityResponse.mockResolvedValue({
			similarStatements: [stmt('z')],
			userText: 'cached',
		});

		const result = await searchSimilarStatements(baseInput);

		expect(result).toMatchObject({ ok: true, cached: true, userText: 'cached' });
		expect(findSimilarToText).not.toHaveBeenCalled();
		expect(getCachedSubStatements).not.toHaveBeenCalled();
	});

	it('refuses with 403 when the user is at their suggestion limit', async () => {
		getCachedSubStatements.mockResolvedValue([stmt('mine', 'user-1')]);
		findSimilarToText.mockResolvedValue([]);

		const result = await searchSimilarStatements({
			...baseInput,
			parentStatement: {
				...parentStatement,
				statementSettings: { numberOfOptionsPerUser: 1 },
			} as Statement,
		});

		expect(result).toEqual({
			ok: false,
			error: 'You have reached the maximum number of suggestions allowed.',
			statusCode: 403,
		});
	});

	it('uses the LLM id search alone when embedding coverage is low', async () => {
		getEmbeddingCoverage.mockResolvedValue({ coveragePercent: 10 });
		getCachedSimilarStatementIds.mockResolvedValue(['b']);
		findSimilarToText.mockResolvedValue([hit('a', 0.99)]);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.method).toBe('llm');
		expect(result.similarStatements.map((s) => s.statementId)).toEqual(['b']);
		expect(result.similarStatements[0].similarity).toBeNull();
	});

	it('survives a first-pass failure by using the expansions', async () => {
		generateParaphrases.mockResolvedValue([]);
		findSimilarToText.mockImplementation(
			(_t: string, _q: string, _c: string, opts: { skipBrief?: boolean }) =>
				opts.skipBrief
					? Promise.reject(new Error('embedding down'))
					: Promise.resolve([hit('a', 0.84)]),
		);

		const result = await searchSimilarStatements(baseInput);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.similarStatements.map((s) => s.statementId)).toEqual(['a']);
	});
});
