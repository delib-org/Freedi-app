import { User } from 'firebase/auth';

export function convertFirebaseUserToCreator(user: User) {
	const sessionDisplayName = localStorage.getItem('displayName');
	const displayName = user.displayName ?? sessionDisplayName ?? 'Anonymous';

	return {
		displayName,
		photoURL: user.photoURL,
		uid: user.uid,
		isAnonymous: user.isAnonymous,
		email: user.email,
	};
}
