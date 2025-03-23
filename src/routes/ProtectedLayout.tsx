import { AuthProvider } from '@/context/AuthContext';
import { listenToStatement, listenToStatementSubscription } from '@/controllers/db/statements/listenToStatements';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Outlet, useNavigate, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const navigate = useNavigate();
	const { loading, error, isAuthorized, creator } = useAuthorization(statementId);

	const statement = useSelector(statementSelector(statementId));
	const statementSubscription = useSelector(statementSubscriptionSelector(statementId));

	//Listen to statement
	useEffect(() => {
		let unsubscribe = () => { return; };
		
		if (!statement && statementId) {
			unsubscribe = listenToStatement(statementId);
		}
		
		return () => {
			unsubscribe();
		}
	}, [statementId, statement]);

	useEffect(() => {
		let unsubscribe = () => { return; };
		
		if (!statementSubscription && statementId && creator) {
			unsubscribe = listenToStatementSubscription(statementId, creator);
		}

		return () => {
			unsubscribe();
		}
	}, [statementSubscription, statementId, creator]);

	useEffect(() => {
		if (!isAuthorized && !loading && !error) {
			navigate("/401");
		}
	}, [isAuthorized, loading]);

	if (loading) {

		return <LoadingPage />;
	}

	if (error) {

		return <Page401 />; //TODO: create a page for this error	
	}

	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	);
}
