import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { useNavigate, useLocation, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { setHistory } from '@/redux/history/HistorySlice';

interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: User | null;
}

export const useAuthentication = () => {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		isLoading: true,
		user: null,
	});

	const navigate = useNavigate();
	const location = useLocation();
	const dispatch = useDispatch();
	const { statementId } = useParams();

	// Track route history for all navigation
	useEffect(() => {
		if (location.pathname !== '/start') {
			dispatch(setHistory({ statementId, pathname: location.pathname }));
		}
	}, [dispatch, location, statementId]);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
				});

				// After authentication, history state will contain the initial route
				const historyState = JSON.parse(
					localStorage.getItem('routeHistory') || '{}'
				);
				const savedPath = historyState?.pathname;

				if (
					savedPath &&
					savedPath !== '/start' &&
					location.pathname === '/start'
				) {
					navigate(savedPath, { replace: true });
				}
			} else {
				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
				});

				// Save current location before redirecting to start
				if (location.pathname !== '/start') {
					dispatch(
						setHistory({ statementId, pathname: location.pathname })
					);
					navigate('/start', { replace: true });
				}
			}
		});

		return () => unsubscribe();
	}, [navigate, dispatch, location.pathname, statementId]);

	return authState;
};
