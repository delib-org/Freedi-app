const mockSet = jest.fn().mockResolvedValue(undefined);
let workflowExists = true;

jest.mock('../../db', () => ({
	db: {
		collection: () => ({
			doc: () => ({
				get: async () => ({ exists: workflowExists }),
				set: (...args: unknown[]) => mockSet(...args),
			}),
			where: () => ({ get: async () => ({ docs: [] }) }),
		}),
	},
}));
jest.mock('../../progress/assertStatementAdmin', () => ({ assertStatementAdmin: jest.fn() }));
jest.mock('../../config/openai-chat', () => ({ TAXONOMY_MODEL: 'm' }));

import { stampWorkflowSummary } from '../records';

describe('stampWorkflowSummary', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		workflowExists = true;
	});

	it('does nothing when the question has no workflow doc', async () => {
		workflowExists = false;
		await stampWorkflowSummary('q1', 10);
		expect(mockSet).not.toHaveBeenCalled();
	});

	it('stamps summaryAt and summaryHash when a workflow doc exists', async () => {
		await stampWorkflowSummary('q1', 10);
		expect(mockSet).toHaveBeenCalledWith(
			{ summaryAt: 10, summaryHash: expect.any(String) },
			{ merge: true },
		);
	});
});
