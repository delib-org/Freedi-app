import type { Statement } from '@freedi/shared-types';

const mockAwardCredit = jest.fn().mockResolvedValue(undefined);

jest.mock('../../engagement/credits/creditEngine', () => ({
	awardCredit: (...args: unknown[]) => mockAwardCredit(...args),
	getOrCreateUserEngagement: jest.fn(),
}));

import {
	trackEvaluationEngagement,
	trackStatementCreation,
	trackVoteEngagement,
} from '../../engagement/credits/trackEngagement';

const ND = 'nd_aaa';

describe('a student without a device earns no credits', () => {
	beforeEach(() => mockAwardCredit.mockClear());

	it('skips the vote the teacher entered', async () => {
		await trackVoteEngagement('p1', ND, 'ch');
		expect(mockAwardCredit).not.toHaveBeenCalled();
	});

	it('skips the proposal the teacher entered', async () => {
		await trackStatementCreation({
			statementId: 'pnd',
			statementType: 'option',
			parentId: 'ch',
			creator: { uid: ND, displayName: '' },
		} as unknown as Statement);
		expect(mockAwardCredit).not.toHaveBeenCalled();
	});

	it('skips the auto +1 on it', async () => {
		await trackEvaluationEngagement('pnd', ND, 'ch');
		expect(mockAwardCredit).not.toHaveBeenCalled();
	});
});
