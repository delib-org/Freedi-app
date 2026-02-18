import { createContext, useContext, useEffect, useRef, useState, ReactNode, FC } from 'react';
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
import { setUserToDB } from '@/controllers/db/user/setUser';

export interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: User | null;
	creator: Creator | null;
	initialRoute?: string;
}

const defaultAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: true,
	user: null,
	creator: null,
	initialRoute: '',
};

const AuthStateContext = createContext<AuthState | null>(null);

export const AuthStateProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [authState, setAuthState] = useState<AuthState>(defaultAuthState);
	const dispatch = useDispatch();

	const initialRoute = useRef(
		JSON.parse(localStorage.getItem(LocalStorageObjects.InitialRoute) || 'null'),
	);

	const userSetRef = useRef<string | null>(null);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				const creator = convertFirebaseUserToCreator(user);

				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
					creator,
					initialRoute: initialRoute.current?.pathname,
				});
				dispatch(setCreator(creator));

				if (userSetRef.current !== user.uid) {
					userSetRef.current = user.uid;
					setUserToDB(creator);
				}
			} else {
				userSetRef.current = null;

				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					creator: null,
					initialRoute: initialRoute.current?.pathname,
				});

				dispatch(resetStatements());
				dispatch(resetEvaluations());
				dispatch(resetVotes());
				dispatch(resetResults());
			}
		});

		return () => unsubscribe();
	}, [dispatch]);

	return <AuthStateContext.Provider value={authState}>{children}</AuthStateContext.Provider>;
};

export const useAuthState = (): AuthState => {
	const context = useContext(AuthStateContext);
	if (!context) {
		throw new Error('useAuthState must be used within an AuthStateProvider');
	}

	return context;
};
