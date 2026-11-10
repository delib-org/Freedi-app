import { renderHook, waitFor } from '@testing-library/react';
import { getDoc } from 'firebase/firestore';
import { Access, Role } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { forgetLevelReads } from '@/controllers/db/statements/levelAccess';
import { useLevelVerdict } from '../useLevelVerdict';

let mockState: { statements: { statements: unknown[]; statementSubscription: unknown[] } };

jest.mock('firebase/firestore', () => ({
	...jest.requireActual('firebase/firestore'),
	getDoc: jest.fn(),
}));
jest.mock('@/redux/store', () => ({ store: { getState: () => mockState } }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: () => ({ uid: 'u1', isAnonymous: false }),
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({ getStatementFromDB: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({ createSubscriptionRef: (id: string) => ({ id }) }));
jest.mock('@/controllers/general/helpers', () => ({
	getStatementSubscriptionId: (statementId: string, uid: string) => `${uid}--${statementId}`,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const groupWith = (access: Access) => ({
	statementId: 'group',
	topParentId: 'group',
	membership: { access },
});

const openGroups = [Access.openToAll, Access.openForRegistered];
const blocked: Array<[Role, string]> = [
	[Role.banned, 'closed'],
	[Role.waiting, 'waiting'],
];
const cases = openGroups.flatMap((access) =>
	blocked.map(([role, verdict]) => [access, role, verdict] as const),
);

describe('useLevelVerdict with a level in Redux and no subscription there', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		forgetLevelReads();
	});

	it.each(cases)(
		'on %s, a person whose doc says %s is read from the database and not shown as open',
		async (access, role, verdict) => {
			const group = groupWith(access);
			mockState = { statements: { statements: [group], statementSubscription: [] } };
			(getStatementFromDB as jest.Mock).mockResolvedValue(group);
			(getDoc as jest.Mock).mockResolvedValue({ data: () => ({ role }) });

			const { result } = renderHook(() => useLevelVerdict('group'));

			expect(result.current).toBeUndefined();
			await waitFor(() => expect(result.current).toBe(verdict));
			expect(getDoc).toHaveBeenCalledTimes(1);
		},
	);

	it.each(openGroups)('on %s, a loaded ordinary subscription needs no read', (access) => {
		mockState = {
			statements: {
				statements: [groupWith(access)],
				statementSubscription: [{ statementId: 'group', role: Role.unsubscribed }],
			},
		};

		const { result } = renderHook(() => useLevelVerdict('group'));

		expect(result.current).toBe('open');
		expect(getStatementFromDB).not.toHaveBeenCalled();
		expect(getDoc).not.toHaveBeenCalled();
	});
});
