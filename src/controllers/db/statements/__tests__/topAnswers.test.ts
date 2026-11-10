import { RANKED_ANSWERS } from '@/constants/common';
import { fetchTopAnswers } from '../topAnswers';

const mockGetDocs = jest.fn();
const mockStore = jest.fn();

jest.mock('firebase/firestore', () => ({
	documentId: () => '__name__',
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	limit: (value: number) => ({ limit: value }),
	orderBy: (field: string, direction: string) => ({ orderBy: [field, direction] }),
	query: (_ref: unknown, ...constraints: unknown[]) => constraints,
	startAfter: (...values: unknown[]) => ({ startAfter: values }),
	where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
}));
jest.mock('@/utils/firebaseUtils', () => ({ createCollectionRef: () => 'statements' }));
jest.mock('../answerBatch', () => ({
	parseAnswers: (raw: unknown[]) => jest.requireMock('../answerBatch').__parse(raw),
	__parse: (raw: unknown[]) => raw,
	storeSideLoadedAnswers: (...args: unknown[]) => mockStore(...args),
}));

function docs(count: number): { docs: Array<{ id: string; data: () => unknown }> } {
	return {
		docs: Array.from({ length: count }, (_, index) => ({
			id: `a${index}`,
			data: () => ({ statementId: `a${index}`, consensus: 1 - index / 100 }),
		})),
	};
}

describe('fetchTopAnswers', () => {
	beforeEach(() => jest.clearAllMocks());

	it('asks the consensus index for the first page, once, with no listener', async () => {
		mockGetDocs.mockResolvedValueOnce(docs(2));

		await fetchTopAnswers('q', undefined);

		expect(mockGetDocs.mock.calls[0][0]).toEqual([
			{ where: ['parentId', '==', 'q'] },
			{ where: ['statementType', '==', 'option'] },
			{ orderBy: ['consensus', 'desc'] },
			{ orderBy: ['__name__', 'desc'] },
			{ limit: RANKED_ANSWERS.PAGE_SIZE },
		]);
	});

	it('continues after the cursor', async () => {
		mockGetDocs.mockResolvedValueOnce(docs(1));

		await fetchTopAnswers('q', { consensus: 0.4, statementId: 'x' });

		expect(mockGetDocs.mock.calls[0][0]).toContainEqual({ startAfter: [0.4, 'x'] });
	});

	it('stores the answers and points the cursor at the last one', async () => {
		mockGetDocs.mockResolvedValueOnce(docs(2));

		const page = await fetchTopAnswers('q', undefined);

		expect(mockStore).toHaveBeenCalledTimes(1);
		expect(page.ids).toEqual(['a0', 'a1']);
		expect(page.cursor).toEqual({ consensus: 0.99, statementId: 'a1' });
	});

	it('builds the cursor from the raw document, so a parse failure cannot repeat a page', async () => {
		const original = jest.requireMock('../answerBatch').__parse;
		jest.requireMock('../answerBatch').__parse = () => [];
		mockGetDocs.mockResolvedValueOnce(docs(2));

		const page = await fetchTopAnswers('q', undefined);

		jest.requireMock('../answerBatch').__parse = original;
		expect(page.ids).toEqual([]);
		expect(page.cursor).toEqual({ consensus: 0.99, statementId: 'a1' });
	});

	it('keeps a null consensus as null in the cursor', async () => {
		mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'n', data: () => ({ consensus: null }) }] });

		const page = await fetchTopAnswers('q', undefined);

		expect(page.cursor).toEqual({ consensus: null, statementId: 'n' });
	});

	it('keeps the old cursor on an empty page', async () => {
		mockGetDocs.mockResolvedValueOnce({ docs: [] });
		const after = { consensus: 0.1, statementId: 'x' };

		expect((await fetchTopAnswers('q', after)).cursor).toEqual(after);
	});

	it('has more only when the page came back full', async () => {
		mockGetDocs.mockResolvedValueOnce(docs(RANKED_ANSWERS.PAGE_SIZE));
		expect((await fetchTopAnswers('q', undefined)).hasMore).toBe(true);

		mockGetDocs.mockResolvedValueOnce(docs(RANKED_ANSWERS.PAGE_SIZE - 1));
		expect((await fetchTopAnswers('q', undefined)).hasMore).toBe(false);
	});
});
