import { onAuthStateChanged, type Unsubscribe } from 'firebase/auth';
import { auth } from '@/controllers/db/config';

/**
 * Defers a Firestore subscription until there is a Firebase Auth session.
 *
 * Deferring, not skipping. A guard that returns a no-op when `auth.currentUser`
 * is null looks like it fixes the unauthenticated-read problem, but it silently
 * converts "reads too early" into "never reads at all": the component mounted
 * before sign-in completed, got nothing, and has no reason to ask again. The
 * symptom is an empty pane rather than an error, which is harder to notice and
 * much harder to diagnose.
 *
 * So: subscribe immediately when a session exists, otherwise wait for the first
 * auth state carrying a user and subscribe then. Unsubscribing before that
 * cancels the pending attach.
 *
 * If sign-in never happens the subscription never attaches — which is the point.
 * That is a read the security rules would reject anyway.
 */
export function subscribeWhenAuthenticated(subscribe: () => Unsubscribe): Unsubscribe {
	if (auth.currentUser) return subscribe();

	let cancelled = false;
	let inner: Unsubscribe | null = null;

	const stopWaiting = onAuthStateChanged(auth, (user) => {
		if (!user || cancelled) return;
		stopWaiting();
		inner = subscribe();
	});

	return () => {
		cancelled = true;
		stopWaiting();
		if (inner) inner();
	};
}
