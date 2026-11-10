import { renderHook, waitFor } from '@testing-library/react';
import { Access, Role } from '@freedi/shared-types';
import { setStatementSubscriptionToDB } from '../../db/subscriptions/setSubscriptions';
import { useAuthorization } from '../useAuthorization';

let mockStatements: Record<string, unknown>;
let mockSubscriptions: Record<string, unknown>;
let mockCreator: { uid: string; isAnonymous: boolean };

jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: () => unknown) => selector(),
}));
jest.mock('react-redux', () => ({ useSelector: (selector: () => unknown) => selector() }));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: () => mockCreator }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: (id?: string) => () => (id ? mockStatements[id] : undefined),
	statementSubscriptionSelector: (id?: string) => () => (id ? mockSubscriptions[id] : undefined),
}));
jest.mock('../../db/subscriptions/setSubscriptions', () => ({
	setStatementSubscriptionToDB: jest.fn(),
}));
jest.mock('../../db/statements/listenToStatements', () => ({
	listenToStatement: () => () => undefined,
	listenToStatementSubscription: () => () => undefined,
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: { getPushSubscriptionFields: () => ({}) },
}));

function group(access: Access, creatorUid = 'host') {
	mockStatements = {
		s1: {
			statementId: 's1',
			topParentId: 's1',
			creator: { uid: creatorUid },
			membership: { access },
		},
	};
}

describe('useAuthorization on the shared verdict', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptions = {};
		mockCreator = { uid: 'u1', isAnonymous: false };
	});

	it('lets a public visitor in and subscribes them once', async () => {
		group(Access.public);

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isAuthorized).toBe(true));
		expect(result.current.role).toBe(Role.member);
		expect(setStatementSubscriptionToDB).toHaveBeenCalledTimes(1);
	});

	it('lets a member in without writing', async () => {
		group(Access.secret);
		mockSubscriptions = { s1: { role: Role.member } };

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isAuthorized).toBe(true));
		expect(setStatementSubscriptionToDB).not.toHaveBeenCalled();
	});

	it("lets the level's creator in without writing", async () => {
		group(Access.secret, 'u1');

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isAuthorized).toBe(true));
		expect(setStatementSubscriptionToDB).not.toHaveBeenCalled();
	});

	it('auto-subscribes on an open-to-all group', async () => {
		group(Access.openToAll);

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isAuthorized).toBe(true));
		expect(setStatementSubscriptionToDB).toHaveBeenCalledWith(
			expect.objectContaining({ role: Role.member }),
		);
	});

	it('shows waiting for a pending request without writing', async () => {
		group(Access.moderated);
		mockSubscriptions = { s1: { role: Role.waiting } };

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isWaitingForApproval).toBe(true));
		expect(setStatementSubscriptionToDB).not.toHaveBeenCalled();
	});

	it('files a join request on arrival at a moderated group', async () => {
		group(Access.moderated);

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.isWaitingForApproval).toBe(true));
		expect(setStatementSubscriptionToDB).toHaveBeenCalledWith(
			expect.objectContaining({ role: Role.waiting }),
		);
	});

	it('refuses a secret group', async () => {
		group(Access.secret);

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.error).toBe(true));
		expect(result.current.isAuthorized).toBe(false);
	});

	it('refuses someone banned from an open group', async () => {
		group(Access.openToAll);
		mockSubscriptions = { s1: { role: Role.banned } };

		const { result } = renderHook(() => useAuthorization('s1'));

		await waitFor(() => expect(result.current.error).toBe(true));
		expect(setStatementSubscriptionToDB).not.toHaveBeenCalled();
	});

	it('keeps loading while the statement is unknown', () => {
		mockStatements = {};

		const { result } = renderHook(() => useAuthorization('s1'));

		expect(result.current.loading).toBe(true);
		expect(result.current.error).toBe(false);
	});
});
