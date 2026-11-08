import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Statement } from '@freedi/shared-types';

let mockParent: Record<string, unknown> | null = null;
const mockTransactionUpdate = jest.fn();
jest.mock('../../index', () => ({
	db: {
		collection: () => ({
			doc: () => ({
				get: async () => ({ exists: mockParent !== null, data: () => mockParent }),
			}),
		}),
		runTransaction: async (fn: (t: unknown) => Promise<void>) =>
			fn({
				get: async () => ({ data: () => mockParent }),
				update: (_ref: unknown, patch: unknown) => mockTransactionUpdate(patch),
			}),
	},
}));
jest.mock('firebase-functions/v1', () => ({ logger: { info: jest.fn() } }));

const mockRecompute = jest.fn<(parentId: string | undefined) => Promise<void>>();
jest.mock('../updateChosenOptions', () => ({
	updateParentStatementWithChosenOptions: (parentId: string | undefined) => mockRecompute(parentId),
}));

import { syncTopAnswersOnOptionDeleted, syncTopAnswersOnOptionUpdated } from '../topAnswerSync';

const option = {
	statementId: 'opt1',
	parentId: 'q1',
	topParentId: 'top1',
	statementType: 'option',
	statement: 'old text',
	creatorId: 'u1',
	createdAt: 1,
	lastUpdate: 1,
	consensus: 0.5,
} as unknown as Statement;

describe('topAnswerSync', () => {
	beforeEach(() => {
		mockRecompute.mockReset();
		mockTransactionUpdate.mockReset();
		mockParent = { statementId: 'q1', results: [] };
	});

	describe('syncTopAnswersOnOptionDeleted', () => {
		it('recomputes when the deleted option is cached in the parent results', async () => {
			mockParent = { statementId: 'q1', results: [{ statementId: 'opt1' }] };
			await syncTopAnswersOnOptionDeleted(option);
			expect(mockRecompute).toHaveBeenCalledWith('q1');
		});

		it('recomputes when the deleted option was marked chosen', async () => {
			await syncTopAnswersOnOptionDeleted({ ...option, isChosen: true });
			expect(mockRecompute).toHaveBeenCalledWith('q1');
		});

		it('skips an option that was not a top answer', async () => {
			mockParent = { statementId: 'q1', results: [{ statementId: 'other' }] };
			await syncTopAnswersOnOptionDeleted(option);
			expect(mockRecompute).not.toHaveBeenCalled();
		});

		it('skips non-option statements', async () => {
			await syncTopAnswersOnOptionDeleted({
				...option,
				statementType: 'question',
				isChosen: true,
			} as unknown as Statement);
			expect(mockRecompute).not.toHaveBeenCalled();
		});

		it('skips when the parent is gone too', async () => {
			mockParent = null;
			await syncTopAnswersOnOptionDeleted({ ...option, isChosen: true });
			expect(mockRecompute).not.toHaveBeenCalled();
		});
	});

	describe('syncTopAnswersOnOptionUpdated', () => {
		it('rewrites the cached copy when a top answer is edited', async () => {
			mockParent = {
				statementId: 'q1',
				results: [{ statementId: 'other' }, { statementId: 'opt1', statement: 'old text' }],
			};
			await syncTopAnswersOnOptionUpdated(option, { ...option, statement: 'new text' });

			const patch = mockTransactionUpdate.mock.calls[0][0] as {
				results: Array<{ statementId: string; statement?: string }>;
			};
			expect(patch.results[0].statementId).toBe('other');
			expect(patch.results[1]).toMatchObject({ statementId: 'opt1', statement: 'new text' });
			expect(mockRecompute).not.toHaveBeenCalled();
		});

		it('leaves results alone when an edited option is not a top answer', async () => {
			await syncTopAnswersOnOptionUpdated(option, { ...option, statement: 'new text' });
			expect(mockTransactionUpdate).not.toHaveBeenCalled();
		});

		it('recomputes when an option is hidden or unhidden', async () => {
			await syncTopAnswersOnOptionUpdated(option, { ...option, hide: true });
			expect(mockRecompute).toHaveBeenCalledWith('q1');
		});

		it('does nothing when neither text nor visibility changed', async () => {
			await syncTopAnswersOnOptionUpdated(option, { ...option, consensus: 0.9 });
			expect(mockRecompute).not.toHaveBeenCalled();
			expect(mockTransactionUpdate).not.toHaveBeenCalled();
		});
	});
});
