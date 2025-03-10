import { User } from 'firebase/auth';

export function convertFirebaseUserToCreator(user: User) {
	return {
		displayName: user.displayName ?? 'Anonymous' + user.uid,
		photoURL: user.photoURL,
		uid: user.uid,
	};
}
