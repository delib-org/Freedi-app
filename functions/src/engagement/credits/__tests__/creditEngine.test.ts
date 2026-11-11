import { CreditAction, SourceApp } from '@freedi/shared-types';
import type { UserEngagement } from '@freedi/shared-types';

const INCREMENT_ONE = { increment: 1 };
const mockTransactionSet = jest.fn();
const mockTransactionUpdate = jest.fn();
let mockEngagementDoc: { exists: boolean; data: () => Partial<UserEngagement> };

jest.mock('firebase-admin/firestore', () => {
	const emptyQuery = {
		where: () => emptyQuery,
		limit: () => emptyQuery,
		get: async () => ({ empty: true, size: 0 }),
	};
	const docRef = { path: 'doc', update: jest.fn().mockResolvedValue(undefined) };

	return {
		getFirestore: () => ({
			collection: () => ({ ...emptyQuery, doc: () => docRef }),
			runTransaction: (run: (transaction: unknown) => Promise<unknown>) =>
				run({
					get: async () => mockEngagementDoc,
					set: mockTransactionSet,
					update: mockTransactionUpdate,
				}),
		}),
		FieldValue: { increment: (by: number) => ({ increment: by }), arrayUnion: jest.fn() },
	};
});
jest.mock('firebase-functions', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
jest.mock('../creditRules', () => ({
	getCreditRule: async () => ({ baseAmount: 10, cooldownMs: 0, dailyLimit: 50 }),
}));
jest.mock('../levelProgression', () => ({
	checkAndNotifyLevelUp: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../badgeEngine', () => ({
	checkAndAwardBadges: jest.fn().mockResolvedValue([]),
}));

import { awardCredit } from '../creditEngine';
import { checkAndAwardBadges } from '../badgeEngine';

const STAT_FIELDS = ['totalEvaluations', 'totalOptions', 'totalComments', 'totalVotes'] as const;
const STAT_BY_ACTION = [
	[CreditAction.EVALUATE_OPTION, 'totalEvaluations'],
	[CreditAction.CREATE_OPTION, 'totalOptions'],
	[CreditAction.COMMENT, 'totalComments'],
	[CreditAction.VOTE, 'totalVotes'],
] as const;

function award(action: CreditAction): ReturnType<typeof awardCredit> {
	return awardCredit({ userId: 'u1', action, sourceApp: SourceApp.MAIN });
}

/** The engagement doc written by the transaction, as opposed to the ledger row. */
function createdEngagement(): UserEngagement {
	const write = mockTransactionSet.mock.calls.find(([, written]) => 'totalCredits' in written);

	return write?.[1] as UserEngagement;
}

describe('awardCredit stat counters', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockEngagementDoc = { exists: false, data: () => ({}) };
	});

	describe('when the action creates the engagement doc', () => {
		it.each(STAT_BY_ACTION)('counts the first %s in %s', async (action, statField) => {
			await expect(award(action)).resolves.toMatchObject({ success: true });

			expect(createdEngagement()[statField]).toBe(1);
		});

		it.each(STAT_BY_ACTION)('leaves the other stats at zero for %s', async (action, statField) => {
			await award(action);

			STAT_FIELDS.filter((field) => field !== statField).forEach((field) => {
				expect(createdEngagement()[field]).toBe(0);
			});
		});

		it('adds no stat for an action without a counter', async () => {
			await award(CreditAction.JOIN_DISCUSSION);

			STAT_FIELDS.forEach((field) => expect(createdEngagement()[field]).toBe(0));
		});

		it('hands the counted first action to the badge check', async () => {
			await award(CreditAction.CREATE_OPTION);

			expect(checkAndAwardBadges).toHaveBeenCalledWith(
				'u1',
				expect.objectContaining({ totalOptions: 1 }),
				SourceApp.MAIN,
			);
		});
	});

	describe('when the engagement doc already exists', () => {
		beforeEach(() => {
			mockEngagementDoc = {
				exists: true,
				data: () => ({ userId: 'u1', totalCredits: 20, totalOptions: 3 }),
			};
		});

		it.each(STAT_BY_ACTION)('increments for %s through %s', async (action, statField) => {
			await award(action);

			expect(mockTransactionUpdate.mock.calls[0][1][statField]).toEqual(INCREMENT_ONE);
			expect(createdEngagement()).toBeUndefined();
		});
	});
});
