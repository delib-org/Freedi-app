import { AuthProvider } from '@/context/AuthContext';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import { Outlet, useParams } from 'react-router';

export default function ProtectedLayout() {
	const { statementId } = useParams();
	const { loading } = useAuthorization(statementId);

	if (loading) {
		return <LoadingPage />;
	}

	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	);
}
