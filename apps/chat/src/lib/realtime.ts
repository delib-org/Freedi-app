/**
 * Live updates (§3). `onMount`-only: lazily imports `firebase/firestore` and
 * opens an `onSnapshot` on `where('topParentId','==',id)`. Public/unlisted use
 * the auth-free `firestore()`; private use `firestoreAuthed()`. Patches the flat
 * statement list on added/modified/removed, resolving the "evaluating…" chip
 * live. Returns an unsubscribe.
 *
 * Nothing here is in the first HTML payload — it runs only after hydration.
 */
import { Collections, Visibility } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { firestore, firestoreAuthed } from './firebaseClient';

type GetCurrent = () => Statement[];
type OnUpdate = (next: Statement[]) => void;

export function subscribeToConversation(
	topParentId: string,
	visibility: Visibility,
	onUpdate: OnUpdate,
	getCurrent: GetCurrent,
): () => void {
	let unsub: (() => void) | null = null;
	let cancelled = false;

	(async () => {
		try {
			const db =
				visibility === Visibility.private
					? (await firestoreAuthed()).db
					: await firestore();

			const { collection, query, where, onSnapshot } = await import('firebase/firestore');
			const q = query(
				collection(db, Collections.statements),
				where('topParentId', '==', topParentId),
			);

			const stop = onSnapshot(q, (snap) => {
				const byId = new Map(getCurrent().map((s) => [s.statementId, s]));
				for (const change of snap.docChanges()) {
					const data = change.doc.data() as Statement;
					if (change.type === 'removed') byId.delete(data.statementId);
					else byId.set(data.statementId, data);
				}
				onUpdate([...byId.values()]);
			});

			if (cancelled) stop();
			else unsub = stop;
		} catch (e) {
			console.error('[chat] realtime subscribe failed:', e instanceof Error ? e.message : e);
		}
	})();

	return () => {
		cancelled = true;
		if (unsub) unsub();
	};
}
