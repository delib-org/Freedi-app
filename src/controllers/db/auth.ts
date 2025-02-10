import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInAnonymously,
	signInWithPopup,
	Unsubscribe,
} from 'firebase/auth';
import { NavigateFunction } from 'react-router-dom';

// Helper functions

// Redux store imports
import { resetEvaluations } from '@/model/evaluations/evaluationsSlice';
import { defaultFontSize } from '@/model/fonts/fontsModel';
import { setInitLocation } from '@/model/location/locationSlice';
import { resetResults } from '@/model/results/resultsSlice';
import { resetStatements } from '@/model/statements/statementsSlice';
import { AppDispatch, store } from '@/model/store';
import { setFontSize, setUser } from '@/model/users/userSlice';
import { resetVotes } from '@/model/vote/votesSlice';
import { User } from '@/types/user';

import { auth } from './config';
import { setUserToDB } from './users/setUsersDB';

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
export const listenToAuth =
	(dispatch: AppDispatch) =>
	(navigate: NavigateFunction, initialUrl: string): Unsubscribe => {
		return onAuthStateChanged(auth, async (userFB) => {
			try {
				if (!userFB) {
					dispatch(resetStatements());
					dispatch(resetEvaluations());
					dispatch(resetVotes());
					dispatch(resetResults());
					dispatch(setUser(null));
					navigate('/');

					return;
				}

				const userCopy = { ...userFB };

				const defaultDisplayName = `Anonymous ${Math.floor(Math.random() * 10000)}`;

				userCopy.displayName = userCopy.isAnonymous
					? (sessionStorage.getItem('displayName') ??
						defaultDisplayName)
					: (localStorage.getItem('displayName') ??
						defaultDisplayName);

				const userDB = (await setUserToDB(userCopy)) as User;
				if (!userDB) {
					throw new Error('userDB is undefined');
				}

				const fontSize = userDB.fontSize || defaultFontSize;
				document.body.style.fontSize = `${fontSize}px`;

				dispatch(setFontSize(fontSize));
				dispatch(setUser(userDB));

				if (initialUrl) {
					navigate(initialUrl);
				}
			} catch (error) {
				console.error(error);
			}
		});
	};
