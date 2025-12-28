import { AuthProvider } from '@/context/AuthContext';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { usePublicAccess } from '@/controllers/hooks/usePublicAccess';
import { setStatement, statementSelector } from '@/redux/statements/statementsSlice';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import WaitingPage from '@/view/pages/waiting/WaitingPage';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useNavigate, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { isCheckingAccess } = usePublicAccess(statementId);
	const { loading, error, isAuthorized, isWaitingForApproval } = useAuthorization(statementId);
	const statement = useSelector(statementSelector(statementId));

	// First, fetch the statement if we don't have it
	// Wait until auth check is complete before fetching
	useEffect(() => {
		if (!statement && statementId && !isCheckingAccess) {
			getStatementFromDB(statementId).then((fetchedStatement) => {
				if (fetchedStatement) {
					dispatch(setStatement(fetchedStatement));
				}
				else navigate("/404")
			});
		}
	}, [statementId, statement, dispatch, navigate, isCheckingAccess]);

	useEffect(() => {
		// Don't redirect to 401 if we're still checking access
		if (!isAuthorized && !loading && !error && !isWaitingForApproval && !isCheckingAccess) {
			navigate("/401");
		}
	}, [isAuthorized, loading, error, isWaitingForApproval, isCheckingAccess, navigate]);

	// Show loading while checking access
	if (isCheckingAccess || loading) {
		return <LoadingPage />;
	}

	if (isWaitingForApproval) {
		return <WaitingPage />;
	}

	if (error) {
		return <Page401 />;
	}

	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	);
}
