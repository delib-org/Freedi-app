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

	const fontSize = userDB.fontSize ?? defaultFontSize;

	updateUserFontSize(dispatch, fontSize);

	if (initialUrl) {
		navigate(initialUrl);
	}
};
