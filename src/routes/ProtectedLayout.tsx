import { AuthProvider } from '@/context/AuthContext';
import { listenToStatement, listenToStatementSubscription } from '@/controllers/db/statements/listenToStatements';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import { stat } from 'fs';
import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const {creator} = useAuthentication();
	const navigate = useNavigate();
	const { loading, error, isAuthorized } = useAuthorization(statementId);

	useEffect(() => {
		const unsubscribes = [];
		if (creator?.uid) {
			unsubscribes.push(listenToStatementSubscription(statementId, creator));
		}
		if(statementId && creator?.uid) {
			unsubscribes.push(listenToStatement(statementId));
		}
		return () => {
			unsubscribes.forEach((unsubscribe) => {
				unsubscribe();
			});
		};
	}, [statementId,creator?.uid]);

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
