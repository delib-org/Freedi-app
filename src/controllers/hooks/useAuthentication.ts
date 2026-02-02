import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
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

export interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: User | null;
	creator: Creator | null;
	initialRoute?: string;
}

/**
 * Hook for managing authentication state.
 *
 * This hook is responsible ONLY for:
 * - Tracking authentication state (isAuthenticated, isLoading, user, creator)
 * - Syncing authenticated user to Redux store
 * - Persisting user to database
 * - Resetting Redux state on logout
 *
 * Navigation/routing is handled separately by AuthRedirectHandler component.
 * This separation follows Single Responsibility Principle (SRP).
 */
export const useAuthentication = (): AuthState => {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		isLoading: true,
		user: null,
		creator: null,
		initialRoute: '',
	});

	const dispatch = useDispatch();

	// Get initial route from local storage
	const initialRoute = useRef(
		JSON.parse(localStorage.getItem(LocalStorageObjects.InitialRoute) || 'null')
	);

	// Track if user has been set to prevent duplicate calls
	const userSetRef = useRef<string | null>(null);

	// Main auth effect - only manages state, no navigation
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			console.error('====================================');
			console.error('🔄 MAIN APP - AUTH STATE CHANGED');
			console.error('====================================');

			if (user) {
				// LOG FULL USER ID IN BROWSER CONSOLE
				console.error('====================================');
				console.error('✅ MAIN APP - USER IS SIGNED IN:');
				console.error('🔑 USER ID (FULL):', user.uid);
				console.error('📧 EMAIL:', user.email);
				console.error('👤 DISPLAY NAME:', user.displayName);
				console.error('🆔 IS ANONYMOUS:', user.isAnonymous);
				console.error('====================================');

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
				// LOG WHEN USER IS NULL
				console.error('====================================');
				console.error('❌ MAIN APP - NO USER SIGNED IN (user = null)');
				console.error('====================================');

				// User is not authenticated
				userSetRef.current = null; // Reset the ref when user logs out

				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					creator: null,
					initialRoute: initialRoute.current?.pathname,
				});

				// Reset application state on logout
				dispatch(resetStatements());
				dispatch(resetEvaluations());
				dispatch(resetVotes());
				dispatch(resetResults());
			}
		});

		return () => unsubscribe();
	}, [dispatch]);

	return authState;
};
