import { Creator } from '@freedi/shared-types';
import { User } from 'firebase/auth';
import { getPseudoName } from '@/utils/temporalNameGenerator';

export function convertFirebaseUserToCreator(user: User | Creator): Creator {
	const sessionDisplayName = localStorage.getItem('displayName');
	const displayName = user.displayName ?? sessionDisplayName ?? getPseudoName(user.uid);

	return {
		displayName,
		photoURL: user.photoURL || null,
		uid: user.uid,
		isAnonymous: user.isAnonymous ?? false,
		email: user.email || null,
	};
}
