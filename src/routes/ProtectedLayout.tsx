import { AuthProvider } from '@/context/AuthContext';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const navigate = useNavigate();
	const { loading, error, isAuthorized } = useAuthorization(statementId);

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
