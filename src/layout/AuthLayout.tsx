import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import { FC, ReactNode, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

interface AuthLayoutProps {
	children?: ReactNode;
}

const AuthLayout: FC<AuthLayoutProps> = () => {
	const { isAuthenticated, isLoading, checkAuth } = useAuthorization();
	const location = useLocation();

	useEffect(() => {
		// Check authentication status when component mounts
		checkAuth();
	}, [checkAuth]);

	// Show loading state while checking authentication
	if (isLoading) {
		return <LoadingPage />;
	}

	// Redirect to login if not authenticated
	if (!isAuthenticated) {
		// Save the attempted URL to redirect back after login
		return (
			<Navigate
				to='/login-first'
				state={{ from: location.pathname }}
				replace
			/>
		);
	}

	// Render child routes if authenticated
	return <Outlet />;
};

export default AuthLayout;
