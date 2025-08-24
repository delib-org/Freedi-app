import { Creator } from 'delib-npm';
import { User } from 'firebase/auth';

export function convertFirebaseUserToCreator(user: User | Creator): Creator {
	const sessionDisplayName = localStorage.getItem('displayName');
	const displayName = user.displayName ?? sessionDisplayName ?? 'Anonymous';

	return {
		displayName,
		photoURL: user.photoURL || null,
		uid: user.uid,
		isAnonymous: user.isAnonymous ?? false,
		email: user.email || null,
	};
}
