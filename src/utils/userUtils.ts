import { Creator } from '@freedi/shared-types';
import { User } from 'firebase/auth';
import { getAnonymousName } from '@/utils/temporalNameGenerator';

export function convertFirebaseUserToCreator(user: User | Creator): Creator {
	// Anonymize every user in the main app — including Google logins — with a
	// stable two-word pseudonym derived from their uid (e.g. "Wise Explorer").
	// The real displayName and profile photo from the auth provider are
	// intentionally ignored so users cannot be identified anywhere in the app.
	const displayName = getAnonymousName(user.uid);

	return {
		displayName,
		photoURL: null,
		uid: user.uid,
		isAnonymous: user.isAnonymous ?? false,
		email: user.email || null,
	};
}
