const mockSet = jest.fn().mockResolvedValue(undefined);
const mockGenerateAndSaveSummary = jest.fn();

jest.mock('../../db', () => ({
	db: {
		runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				get: async () => ({ data: () => ({}) }),
				set: jest.fn(),
			}),
		),
	},
}));
jest.mock('../../fn_summarizeDiscussion', () => ({
	generateAndSaveSummary: (...args: unknown[]) => mockGenerateAndSaveSummary(...args),
}));
jest.mock('../../organizations/studio/draftWriter', () => ({ generateDraft: jest.fn() }));
jest.mock('../policy', () => ({
	POLICY: { leaseMs: 1000 },
	reserveGeneration: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../records', () => ({
	AGREEMENT_MODEL: 'm',
	assertProcessOpen: jest.fn().mockResolvedValue(undefined),
	automaticReady: jest.fn(),
	children: jest.fn().mockResolvedValue([]),
	persistAgreement: jest.fn(),
	selectedSources: jest.fn().mockReturnValue([{ statementId: 's1', statement: 'A' }]),
	sha: jest.fn(),
	sourcesHash: jest.fn().mockReturnValue('hash-1'),
	statements: { doc: jest.fn() },
	workflows: {
		doc: jest.fn().mockReturnValue({
			set: (...args: unknown[]) => mockSet(...args),
			get: async () => ({ data: () => ({ enabledBy: 'admin-1' }) }),
		}),
	},
}));

import { generate } from '../generation';

describe('deliberation generate(summary)', () => {
	beforeEach(() => jest.clearAllMocks());

	it('writes the question summary through the shared summarizer, selected options only', async () => {
		mockGenerateAndSaveSummary.mockResolvedValue({ summary: 'S', generatedAt: 123 });
		const question = { statementId: 'q1', statement: 'Q', creatorId: 'c1' };

		await generate(question as never, 'summary', false, 'admin-1');

		expect(mockGenerateAndSaveSummary).toHaveBeenCalledWith(question, 'q1', 'admin-1', {
			includeDivided: false,
		});
		expect(mockSet).toHaveBeenCalledWith(
			{ summaryAt: 123, summaryHash: 'hash-1' },
			{ merge: true },
		);
	});
});
