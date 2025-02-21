import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
// Add any user actions you need to dispatch

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
	const dispatch = useDispatch();

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
				});
				// You might want to dispatch user data to your Redux store here
				// dispatch(setUser(user));
			} else {
				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
				});
				navigate('/start');
			}
		});

		return () => unsubscribe();
	}, [navigate, dispatch]);

	return authState;
};
