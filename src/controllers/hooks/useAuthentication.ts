import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { useNavigate, useLocation } from 'react-router';
import { useDispatch } from 'react-redux';
import { resetEvaluations } from '@/redux/evaluations/evaluationsSlice';
import { resetResults } from '@/redux/results/resultsSlice';
import { resetStatements } from '@/redux/statements/statementsSlice';
import { resetVotes } from '@/redux/vote/votesSlice';
import { Creator } from '@freedi/shared-types';
import { convertFirebaseUserToCreator } from '@/types/user/userUtils';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import { setCreator } from '@/redux/creator/creatorSlice';
import { setUserToDB } from '../db/user/setUser';

interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: User | null;
	creator: Creator | null;
	initialRoute?: string;
}

export const useAuthentication = (): AuthState => {
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

	// Track if user has been set to prevent duplicate calls
	const userSetRef = useRef<string | null>(null);

	// Main auth effect
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {

			if (user) {
				// User is authenticated
				const creator = convertFirebaseUserToCreator(user);

				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
					creator,
					initialRoute: initialRoute.current?.pathname,
				});
				dispatch(setCreator(creator));
				
				// Only set user to DB if it's a new user or user has changed
				if (userSetRef.current !== user.uid) {
					userSetRef.current = user.uid;
					setUserToDB(creator);
				}
			} else {
				// User is not authenticated
				userSetRef.current = null; // Reset the ref when user logs out
				
				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					creator: null,
					initialRoute: initialRoute.current?.pathname,
				});

				// Save current location before redirecting to start
				// Don't redirect if we're on a statement route - it might be public
				const isStatementRoute = location.pathname.includes('/statement/') || 
					location.pathname.includes('/stage/') ||
					location.pathname.includes('/statement-screen/');
				
				if (
					location.pathname !== '/start' &&
					location.pathname !== '/' &&
					!isStatementRoute
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
