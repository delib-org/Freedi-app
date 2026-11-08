import { Creator } from '@freedi/shared-types';
import { User } from 'firebase/auth';
import { getAnonymousName } from '@/utils/temporalNameGenerator';

export function convertFirebaseUserToCreator(user: User | Creator): Creator {
	// Signed-in users appear under their real provider identity — the same name
	// and photo they see in MC, join, sign and agora. The main app used to
	// overwrite this with a uid-derived pseudonym, which meant a Google user
	// posted as "Logical Vision" and had no way to tell whose account they were on.
	//
	// A pseudonym is still the right answer for someone with no provider
	// identity: an anonymous visitor gets the name they typed in EnterNameModal
	// if there is one, otherwise the stable uid-derived pseudonym that
	// createAnonymousUser() stamps on their auth profile.
	const providerName = user.displayName?.trim();
	const typedName = localStorage.getItem('displayName')?.trim();
	const isAnonymous = user.isAnonymous ?? false;

	const displayName = isAnonymous
		? typedName || providerName || getAnonymousName(user.uid)
		: providerName || typedName || getAnonymousName(user.uid);

	return {
		displayName,
		photoURL: user.photoURL || null,
		uid: user.uid,
		isAnonymous,
		email: user.email || null,
	};
}
