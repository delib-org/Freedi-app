import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { useNavigate, useLocation } from 'react-router';
import { useDispatch } from 'react-redux';
import { resetEvaluations } from '@/redux/evaluations/evaluationsSlice';
import { resetResults } from '@/redux/results/resultsSlice';
import { resetStatements } from '@/redux/statements/statementsSlice';
import { resetVotes } from '@/redux/vote/votesSlice';
import { Creator } from '@/types/user/User';
import { convertFirebaseUserToCreator } from '@/types/user/userUtils';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: User | null;
	creator: Creator | null;
	initialRoute?: string;
}

export const useAuthentication = () => {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		isLoading: true,
		user: null,
		creator: null,
		initialRoute: '',
	});
	const navigate = useNavigate();
	const location = useLocation();
	const dispatch = useDispatch();

	// Get initial route from local storage
	const initialRoute = useRef(
		JSON.parse(localStorage.getItem(LocalStorageObjects.InitialRoute))
	);

	// Main auth effect
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				// User is authenticated
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
					creator: convertFirebaseUserToCreator(user),
					initialRoute: initialRoute.current?.pathname,
				});
			} else {
				// User is not authenticated
				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					creator: null,
					initialRoute: initialRoute.current?.pathname,
				});

				// Save current location before redirecting to start
				if (
					location.pathname !== '/start' &&
					location.pathname !== '/'
				) {
					const historyData = {
						pathname: location.pathname,
					};
					localStorage.setItem(
						LocalStorageObjects.InitialRoute,
						JSON.stringify(historyData)
					);
					navigate('/start', { replace: true });
				}

				// Reset application state
				dispatch(resetStatements());
				dispatch(resetEvaluations());
				dispatch(resetVotes());
				dispatch(resetResults());
			}
		});

		return () => unsubscribe();
	}, []);

	return authState;
};
