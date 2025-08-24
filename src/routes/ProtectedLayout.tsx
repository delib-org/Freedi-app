import { AuthProvider } from '@/context/AuthContext';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { setStatement, statementSelector } from '@/redux/statements/statementsSlice';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import WaitingPage from '@/view/pages/waiting/WaitingPage';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useNavigate, useParams, useLocation } from 'react-router';
import { Access } from 'delib-npm';
import { handlePublicAutoAuth } from '@/controllers/auth/publicAuthHandler';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const location = useLocation();
	const [isCheckingPublicAccess, setIsCheckingPublicAccess] = useState(true);
	const { loading, error, isAuthorized, isWaitingForApproval } = useAuthorization(statementId);
	const statement = useSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);

	// First, fetch the statement if we don't have it
	useEffect(() => {
		if (!statement && statementId) {
			getStatementFromDB(statementId).then((fetchedStatement) => {
				if (fetchedStatement) {
					dispatch(setStatement(fetchedStatement));
				}
				else navigate("/404")
			});
		}
	}, [statementId, statement, dispatch, navigate]);

	// Check if this is a public statement and handle auto-authentication
	useEffect(() => {
		const checkPublicAccess = async () => {
			// Wait for statement to be loaded
			if (!statement) {
				return;
			}

			// Get the top parent statement if needed
			let topParentStatement = null;
			if (statement.topParentId && statement.topParentId !== statementId) {
				topParentStatement = await getStatementFromDB(statement.topParentId);
				if (topParentStatement) {
					dispatch(setStatement(topParentStatement));
				}
			}

			// Determine effective access
			const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;

			// ONLY auto-authenticate for public access
			// All other access levels (openToAll, openForRegistered, moderated) should redirect to login
			if (effectiveAccess === Access.public && !creator?.uid) {
				console.info('Public statement detected in ProtectedLayout, initiating auto-authentication');
				await handlePublicAutoAuth();
			} else if (!creator?.uid && effectiveAccess !== Access.public) {
				// For non-public statements without auth, save location and redirect to login
				console.info('Non-public statement requires authentication, redirecting to login');
				
				// Save the current location so user can return after login
				const historyData = {
					pathname: location.pathname,
					search: location.search,
					hash: location.hash
				};
				localStorage.setItem(
					LocalStorageObjects.InitialRoute,
					JSON.stringify(historyData)
				);
				
				navigate('/start', { replace: true });
			}

			setIsCheckingPublicAccess(false);
		};

		checkPublicAccess();
	}, [statement, creator?.uid, dispatch, statementId, navigate, location]);

	useEffect(() => {
		// Don't redirect to 401 if we're still checking public access
		if (!isAuthorized && !loading && !error && !isWaitingForApproval && !isCheckingPublicAccess) {
			navigate("/401");
		}
	}, [isAuthorized, loading, error, isWaitingForApproval, isCheckingPublicAccess, navigate]);

	// Show loading while checking public access
	if (isCheckingPublicAccess || loading) {
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
