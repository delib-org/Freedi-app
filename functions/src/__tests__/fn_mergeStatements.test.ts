import { Request, Response } from 'firebase-functions/v1';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const judgeAutoMerge = jest.fn();
jest.mock('../services/auto-merge-gate', () => ({
	judgeAutoMerge: (...args: unknown[]) => judgeAutoMerge(...args),
}));

const mergeAndReorganizeParagraphs = jest.fn();
jest.mock('../services/ai-service', () => ({
	mergeAndReorganizeParagraphs: (...args: unknown[]) => mergeAndReorganizeParagraphs(...args),
}));

interface FakeDoc {
	exists: boolean;
	data: () => Record<string, unknown> | undefined;
}

const docs = new Map<string, Record<string, unknown>>();
const txSet = jest.fn();
const txUpdate = jest.fn();
const runTransaction = jest.fn(
	async (fn: (tx: { set: jest.Mock; update: jest.Mock }) => Promise<void>) =>
		fn({ set: txSet, update: txUpdate }),
);

jest.mock('firebase-admin/firestore', () => {
	const docRef = (id: string) => ({
		id,
		get: async (): Promise<FakeDoc> => ({
			exists: docs.has(id),
			data: () => docs.get(id),
		}),
		set: jest.fn().mockResolvedValue(undefined),
	});
	const collection = () => ({
		doc: (id?: string) => docRef(id ?? 'new-doc-id'),
		where: () => ({
			where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) }),
		}),
	});

	return {
		getFirestore: () => ({ collection, runTransaction }),
		FieldValue: { increment: (n: number) => ({ increment: n }) },
	};
});

import { mergeStatements } from '../fn_mergeStatements';

function makeResponse() {
	const send = jest.fn();
	const status = jest.fn(() => ({ send }));

	return { response: { status, send } as unknown as Response, status, send };
}

const body = (extra: Record<string, unknown> = {}) => ({
	targetStatementId: 'target',
	newContent: 'Improve dialogue between the residents of the neighbourhood',
	questionId: 'q1',
	userId: 'u1',
	...extra,
});

function seed(autoMergeSimilar?: boolean): void {
	docs.clear();
	docs.set('target', {
		statementId: 'target',
		statement: 'Improve public landscaping, paths and shade',
		paragraphs: [],
	});
	docs.set('q1', {
		statementId: 'q1',
		statement: 'How can we improve the neighbourhood?',
		statementSettings: autoMergeSimilar === undefined ? {} : { autoMergeSimilar },
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	seed();
	mergeAndReorganizeParagraphs.mockResolvedValue({ paragraphs: [{ content: 'merged' }] });
});

describe('mergeStatements auto-merge gate', () => {
	it('merges (and records the +1) when the judge says same', async () => {
		judgeAutoMerge.mockResolvedValue({ allowed: true, verdict: 'same', reason: '' });
		const { response, status, send } = makeResponse();

		await mergeStatements({ body: body({ autoMerge: true }) } as Request, response);

		expect(judgeAutoMerge).toHaveBeenCalledWith(
			expect.objectContaining({
				targetStatementId: 'target',
				targetText: 'Improve public landscaping, paths and shade',
			}),
		);
		expect(status).toHaveBeenCalledWith(200);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
		expect(runTransaction).toHaveBeenCalled();
	});

	it('refuses with 409 and writes nothing when the judge says different', async () => {
		judgeAutoMerge.mockResolvedValue({ allowed: false, verdict: 'related', reason: '' });
		const { response, status, send } = makeResponse();

		await mergeStatements({ body: body({ autoMerge: true }) } as Request, response);

		expect(status).toHaveBeenCalledWith(409);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ ok: false, notSameIdea: true, verdict: 'related' }),
		);
		expect(mergeAndReorganizeParagraphs).not.toHaveBeenCalled();
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it('refuses when the judge errored (fail-closed)', async () => {
		judgeAutoMerge.mockResolvedValue({ allowed: false, verdict: 'judge-error', reason: 'x' });
		const { response, status } = makeResponse();

		await mergeStatements({ body: body({ autoMerge: true }) } as Request, response);

		expect(status).toHaveBeenCalledWith(409);
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it('gates on the question setting even when the client does not flag the merge', async () => {
		seed(true);
		judgeAutoMerge.mockResolvedValue({ allowed: false, verdict: 'different', reason: '' });
		const { response, status } = makeResponse();

		await mergeStatements({ body: body() } as Request, response);

		expect(judgeAutoMerge).toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(409);
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it('does not judge a merge the participant chose on a non-auto question', async () => {
		seed(false);
		const { response, status } = makeResponse();

		await mergeStatements({ body: body() } as Request, response);

		expect(judgeAutoMerge).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(200);
		expect(runTransaction).toHaveBeenCalled();
	});

	it('still refuses keyboard noise before judging', async () => {
		const { response, status } = makeResponse();

		await mergeStatements(
			{ body: body({ newContent: 'ייי', autoMerge: true }) } as Request,
			response,
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(judgeAutoMerge).not.toHaveBeenCalled();
	});
});
