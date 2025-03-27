import { AuthProvider } from '@/context/AuthContext';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { setStatement, statementSelector } from '@/redux/statements/statementsSlice';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import { stat } from 'fs';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useNavigate, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { loading, error, isAuthorized } = useAuthorization(statementId);
	const statement = useSelector(statementSelector(statementId));

	useEffect(() => {
		if (!statement) {
			getStatementFromDB(statementId).then((statement) => {
				if (statement) {
					dispatch(setStatement(statement));
				}
			});
		}
	}, [statement?.statementId]);

	useEffect(() => {
		if (!isAuthorized && !loading && !error) {
			navigate("/401");
		}
	}, [isAuthorized, loading]);

	if (loading) {

		return <LoadingPage />;
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
