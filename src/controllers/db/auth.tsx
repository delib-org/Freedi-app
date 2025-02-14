import {
	signInWithPopup,
	GoogleAuthProvider,
	onAuthStateChanged,
	signInAnonymously,
	Unsubscribe,
	User as FirebaseUser,
} from 'firebase/auth';
import { NavigateFunction } from 'react-router';
import { auth } from './config';
import { setUserToDB } from './users/setUsersDB';
import { resetEvaluations } from '@/redux/evaluations/evaluationsSlice';
import { defaultFontSize } from '@/model/fonts/fontsModel';
import { setInitLocation } from '@/redux/location/locationSlice';
import { resetResults } from '@/redux/results/resultsSlice';
import { resetStatements } from '@/redux/statements/statementsSlice';
import { AppDispatch, store } from '@/redux/store';
import { setFontSize, setUser } from '@/redux/users/userSlice';
import { resetVotes } from '@/redux/vote/votesSlice';
import { User, UserSchema } from '@/types/user/User';
import { parse } from 'valibot';

export function googleLogin() {
	const provider = new GoogleAuthProvider();
	signInWithPopup(auth, provider)
		.then(() => {
			console.info('user signed in with google ');
		})
		.catch((error) => {
			console.error(error);
		});
}

export const logOut = async () => {
	try {
		await auth.signOut();
		store.dispatch(setInitLocation('/home'));
	} catch (error) {
		console.error('Error during logout:', error);
	}
};

export function signAnonymously() {
	signInAnonymously(auth)
		.then(() => {
			console.info('user signed in anonymously');
		})
		.catch((error) => {
			console.error(error);
		});
}

const generateAnonymousName = (): string => {
	const randomId = Math.floor(Math.random() * 10000);

	return `Anonymous ${randomId}`;
};

const updateUserFontSize = (dispatch: AppDispatch, fontSize: number): void => {
	dispatch(setFontSize(fontSize));
	document.body.style.fontSize = `${fontSize}px`;
};

const handleUserSignOut = (): void => {
	const dispatch = store.dispatch;
	dispatch(resetStatements());
	dispatch(resetEvaluations());
	dispatch(resetVotes());
	dispatch(resetResults());
	dispatch(setUser(null));
};

const handleUserSignIn = async (
	userFB: unknown,
	navigate: NavigateFunction,
	initialUrl: string
): Promise<void> => {
	const dispatch = store.dispatch;

	const user = parse(UserSchema, userFB);
	if (!user) {
		throw new Error('Invalid user data');
	}

	if (!user.displayName) {
		user.displayName =
			localStorage.getItem('displayName') ?? generateAnonymousName();
	}
	if (user.isAnonymous) {
		user.displayName =
			sessionStorage.getItem('displayName') ?? generateAnonymousName();
	}

	const userDB = (await setUserToDB(user)) as User;
	if (!userDB) {
		throw new Error('Failed to save user to database');
	}

	const fontSize = userDB.fontSize ?? defaultFontSize;
	updateUserFontSize(dispatch, fontSize);
	dispatch(setUser(userDB));

	if (initialUrl) {
		navigate(initialUrl);
	}
};

function convertUserFBToUser(userFB: FirebaseUser): User {
	return {
		uid: userFB.uid,
		displayName: userFB.displayName || generateAnonymousName(),
		email: userFB.email || '',
		photoURL: userFB.photoURL || '',
		isAnonymous: userFB.isAnonymous,
	};
}

export const listenToAuth = (
	navigate: NavigateFunction, // Now passed as a parameter
	isAnonymous: boolean,
	initialUrl: string
): Unsubscribe => {
	return onAuthStateChanged(auth, async (userFB) => {
		try {
			if (!userFB) {
				if (isAnonymous) {
					signAnonymously();
				} else {
					navigate('/');
				}
				handleUserSignOut();

				return;
			}
			await handleUserSignIn(
				convertUserFBToUser(userFB),
				navigate,
				initialUrl
			);
		} catch (error) {
			console.error('Authentication error:', error);
		}
	});
};
