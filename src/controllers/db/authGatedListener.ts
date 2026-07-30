import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config';

type Unsubscribe = () => void;

/**
 * Attach a Firestore listener only once Firebase Auth has resolved a signed-in user.
 *
 * Firestore rules on most collections require `request.auth.uid != null`. A listener
 * attached during the brief window before auth resolves is rejected with
 * `permission-denied`, which surfaces as an unhandled FirebaseError rather than a
 * transient no-op. This helper defers the attach until a user exists, and detaches
 * again if the user signs out.
 *
 * Returns an unsubscribe that is safe to call at any point, including before the
 * inner listener has been attached.
 */
export function listenWhenAuthenticated(attach: () => Unsubscribe | undefined): Unsubscribe {
	let innerUnsubscribe: Unsubscribe | undefined;
	let cancelled = false;

	const detachInner = (): void => {
		if (!innerUnsubscribe) return;
		const unsubscribe = innerUnsubscribe;
		innerUnsubscribe = undefined;
		unsubscribe();
	};

	const stopAuthListener = onAuthStateChanged(auth, (user) => {
		if (cancelled) return;

		if (!user) {
			detachInner();

			return;
		}

		// Already attached for a signed-in user — nothing to do (token refreshes
		// re-fire this callback with the same user).
		if (innerUnsubscribe) return;

		innerUnsubscribe = attach();
	});

	return () => {
		cancelled = true;
		stopAuthListener();
		detachInner();
	};
}
