import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import ProtectedLayout from '../ProtectedLayout';

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
	Outlet: () => null,
	useNavigate: () => mockNavigate,
	useParams: () => ({ statementId: 'deleted' }),
	useLocation: () => ({ pathname: '/statement/deleted', search: '' }),
}));
jest.mock('react-redux', () => ({
	useDispatch: () => jest.fn(),
	useSelector: () => undefined,
}));
jest.mock('@/context/AuthContext', () => ({
	AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({ getStatementFromDB: jest.fn() }));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({
		loading: true,
		error: false,
		isAuthorized: false,
		isWaitingForApproval: false,
	}),
}));
jest.mock('@/controllers/hooks/usePublicAccess', () => ({
	usePublicAccess: () => ({ isCheckingAccess: false }),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: jest.fn(),
	statementSelector: () => () => undefined,
}));
jest.mock('@/view/components/atomic/organisms/ThinkingSpace/AppThinkingSpace', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/pages/loadingPage/LoadingPage', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/pages/page401/Page401', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/pages/waiting/WaitingPage', () => ({ __esModule: true, default: () => null }));

it('replaces the URL with /404 for a deleted statement, so Back does not loop', async () => {
	(getStatementFromDB as jest.Mock).mockResolvedValue(undefined);
	render(<ProtectedLayout />);

	await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/404', { replace: true }));
});
