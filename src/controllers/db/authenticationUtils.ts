import {
	GoogleAuthProvider,
	signInWithPopup,
	signInAnonymously,
} from 'firebase/auth';
import { auth } from './config';

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
