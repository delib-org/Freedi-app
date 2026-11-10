import { renderHook, waitFor } from '@testing-library/react';
import { Access, Role } from '@freedi/shared-types';
import { readLevelVerdict } from '@/controllers/db/statements/levelAccess';
import { useLevelVerdict } from '../useLevelVerdict';

let mockStatements: Record<string, unknown>;
let mockSubscriptions: Record<string, unknown>;

jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: () => unknown) => selector(),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: () => ({ uid: 'u1', isAnonymous: false }),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: (id?: string) => () => (id ? mockStatements[id] : undefined),
	statementSubscriptionSelector: (id?: string) => () => (id ? mockSubscriptions[id] : undefined),
}));
jest.mock('@/controllers/db/statements/levelAccess', () => ({ readLevelVerdict: jest.fn() }));

describe('useLevelVerdict', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStatements = {};
		mockSubscriptions = {};
	});

	it('says nothing without a level', () => {
		const { result } = renderHook(() => useLevelVerdict(undefined));

		expect(result.current).toBeUndefined();
		expect(readLevelVerdict).not.toHaveBeenCalled();
	});

	it('answers open from Redux without a read', () => {
		mockStatements = { group: { statementId: 'group', topParentId: 'group', membership: {} } };
		mockSubscriptions = { group: { role: Role.member } };

		const { result } = renderHook(() => useLevelVerdict('group'));

		expect(result.current).toBe('open');
		expect(readLevelVerdict).not.toHaveBeenCalled();
	});

	it('does not trust Redux to prove a level closed, and asks the database', async () => {
		mockStatements = {
			group: {
				statementId: 'group',
				topParentId: 'group',
				membership: { access: Access.secret },
			},
		};
		(readLevelVerdict as jest.Mock).mockResolvedValue('open');

		const { result } = renderHook(() => useLevelVerdict('group'));

		expect(result.current).toBeUndefined();
		await waitFor(() => expect(result.current).toBe('open'));
	});

	it('reports a closed level once the read says so', async () => {
		(readLevelVerdict as jest.Mock).mockResolvedValue('closed');

		const { result } = renderHook(() => useLevelVerdict('group'));

		await waitFor(() => expect(result.current).toBe('closed'));
	});
});
