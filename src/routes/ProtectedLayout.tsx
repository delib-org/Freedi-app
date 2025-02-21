import { AuthProvider } from '@/context/AuthContext';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import { Navigate, Outlet, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const { isAuthorized, loading, error } = useAuthorization(statementId);

	if (loading) {
		return <LoadingPage />;
	}

	if (error || !isAuthorized) {
		return <Navigate to='/401' replace />;
	}

	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	);
}
