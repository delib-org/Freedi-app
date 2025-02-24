import { User } from 'firebase/auth';

export function convertFirebaseUserToCreator(user: User) {
	return {
		displayName: user.displayName,
		photoURL: user.photoURL,
		uid: user.uid,
	};
}
