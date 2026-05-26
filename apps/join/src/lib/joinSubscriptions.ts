/** Firestore-backed source of truth for the join app's Main page list.
 *
 *  The "My Questions" list is the set of top-level Statements that the
 *  current user has either created from join, or opened from join. We piggy-
 *  back on the existing `statementsSubscribe` collection so each entry is a
 *  per-user-per-statement document (id = `${uid}--${statementId}`), and the
 *  subscription already carries the embedded statement (title/color) needed
 *  to render the card.
 *
 *  Two fields drive the relationship:
 *    • `openedInJoin` — epoch ms; presence (>0) is the "show on join Main"
 *      flag. Updated on every open so it doubles as last-active.
 *    • `joinOrder`    — user's manual drag-to-reorder index; lower renders
 *      first. Undefined falls back to `openedInJoin desc`.
 *
 *  Removal sets both fields to `deleteField()` rather than dropping the
 *  subscription doc, so the user keeps their role/notification prefs etc.
 */

import {
	Collections,
	Role,
	Statement,
	StatementSubscription,
	getStatementSubscriptionId,
} from '@freedi/shared-types';
import {
	db,
	doc,
	collection,
	getDoc,
	setDoc,
	updateDoc,
	writeBatch,
	deleteField,
	query,
	where,
	onSnapshot,
} from './firebase';
import type { Unsubscribe } from './firebase';

export interface JoinMainEntry {
	id: string;
	title: string;
	color?: string;
	openedInJoin: number;
	joinOrder?: number;
}

function buildSubId(userId: string, statementId: string): string {
	return (
		getStatementSubscriptionId(statementId, { uid: userId } as Parameters<
			typeof getStatementSubscriptionId
		>[1]) ?? `${userId}--${statementId}`
	);
}

/** Upsert the user's subscription for `statement` and stamp it as opened in
 *  join. If the subscription doc doesn't yet exist (the creator just wrote
 *  the statement and the `onStatementCreated` cloud function hasn't fanned
 *  out the admin sub yet), we create it ourselves with role=admin so the
 *  Main page query picks it up immediately. Subsequent visits use a partial
 *  merge — we never reset notification prefs or other join-unrelated fields.
 *
 *  `joinOrder` is intentionally NOT set here; a freshly-marked entry stays
 *  at the user's chosen ordering tail (rendered after manually-ordered ones,
 *  most-recent-first) until they drag-reorder. */
export async function markOpenedInJoin(
	statement: Statement,
	userId: string,
	displayName: string,
): Promise<void> {
	const subId = buildSubId(userId, statement.statementId);
	const ref = doc(db, Collections.statementsSubscribe, subId);
	const now = Date.now();

	const snap = await getDoc(ref);
	if (snap.exists()) {
		await updateDoc(ref, {
			openedInJoin: now,
			lastUpdate: now,
		});

		return;
	}

	// First-time write — minimum viable subscription doc. Mirrors the shape
	// `setStatementSubscriptionToDB` produces in the main app, scoped to what
	// the join app actually reads. The cloud-function fan-out for admin subs
	// short-circuits when the doc already exists, so this won't be clobbered.
	const sub: StatementSubscription = {
		statementsSubscribeId: subId,
		userId,
		statementId: statement.statementId,
		statement,
		user: {
			uid: userId,
			displayName,
			photoURL: null,
			isAnonymous: false,
		},
		role: Role.admin,
		parentId: statement.parentId,
		statementType: statement.statementType,
		topParentId: statement.topParentId || statement.parentId,
		lastUpdate: now,
		createdAt: now,
		openedInJoin: now,
	};

	await setDoc(ref, sub, { merge: true });
}

/** Remove from the join Main list without dropping the subscription. The
 *  user may still be a participant on this statement elsewhere; we only
 *  clear the join-specific flags. */
export async function unmarkFromJoinMain(statementId: string, userId: string): Promise<void> {
	const subId = buildSubId(userId, statementId);
	const ref = doc(db, Collections.statementsSubscribe, subId);
	await updateDoc(ref, {
		openedInJoin: deleteField(),
		joinOrder: deleteField(),
		lastUpdate: Date.now(),
	});
}

/** Persist a new manual ordering. Each id in `orderedIds` gets `joinOrder`
 *  equal to its index (0-based, lower = earlier). Entries not present in
 *  `orderedIds` are left untouched, so a stale optimistic order from one
 *  tab can't reset another tab's manual reorder of an entry that's drifted
 *  out of the snapshot. */
export async function setJoinMainOrder(orderedIds: string[], userId: string): Promise<void> {
	if (orderedIds.length === 0) return;
	const batch = writeBatch(db);
	const now = Date.now();
	orderedIds.forEach((statementId, index) => {
		const subId = buildSubId(userId, statementId);
		const ref = doc(db, Collections.statementsSubscribe, subId);
		batch.update(ref, {
			joinOrder: index,
			lastUpdate: now,
		});
	});
	await batch.commit();
}

/** Live listener for the user's join Main list. Filters to top-level
 *  statements with `openedInJoin` set; the parentId='top' filter is applied
 *  client-side so we don't need a 3-field composite index (the query plan
 *  uses (userId asc, openedInJoin asc) which composes from existing indexes
 *  more easily). */
export function subscribeToJoinMain(
	userId: string,
	cb: (entries: JoinMainEntry[]) => void,
): Unsubscribe {
	const q = query(
		collection(db, Collections.statementsSubscribe),
		where('userId', '==', userId),
		where('openedInJoin', '>', 0),
	);

	return onSnapshot(
		q,
		(snap) => {
			const entries: JoinMainEntry[] = [];
			snap.forEach((d) => {
				const data = d.data() as StatementSubscription;
				// Belt-and-suspenders: only top-level statements belong on Main.
				const parentId = data.parentId ?? data.statement?.parentId;
				if (parentId !== 'top') return;
				if (typeof data.openedInJoin !== 'number' || data.openedInJoin <= 0) return;

				entries.push({
					id: data.statementId,
					title: data.statement?.statement ?? '',
					color: data.statement?.color,
					openedInJoin: data.openedInJoin,
					joinOrder: data.joinOrder,
				});
			});

			// Manual order first (joinOrder asc), then untouched entries by
			// most-recent-open. Matches the localStorage flow this replaces:
			// dragged cards stay put, fresh ones pile at the bottom.
			entries.sort((a, b) => {
				const ao = typeof a.joinOrder === 'number' ? a.joinOrder : Number.MAX_SAFE_INTEGER;
				const bo = typeof b.joinOrder === 'number' ? b.joinOrder : Number.MAX_SAFE_INTEGER;
				if (ao !== bo) return ao - bo;

				return b.openedInJoin - a.openedInJoin;
			});

			cb(entries);
		},
		(err) => {
			console.error('[joinSubscriptions] subscribeToJoinMain failed:', err);
			cb([]);
		},
	);
}
