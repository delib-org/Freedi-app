/**
 * Live Firestore subscriptions for the join-app delegate system.
 *
 * Two cooperating subscriptions:
 *   1. `subscribeMyDelegate(questionId)` — watches the current user's own
 *      `joinDelegates/{qid--uid}` doc so a freshly accepted invite (or a
 *      revocation) takes effect without a page refresh. Drives the
 *      `setCurrentDelegate` side-effect in admin.ts (so admin-only UI
 *      surfaces appear/disappear immediately).
 *   2. `subscribeQuestionDelegates(questionId)` — admin-only listeners that
 *      populate the DelegatesPanel lists (active delegates + pending
 *      invitations). Mounted lazily when the panel opens.
 *
 * Carved out of store.ts so the lifecycle of these listeners is legible.
 * The current-delegate side-effect goes through `setCurrentDelegate` in
 * admin.ts; we don't duplicate the admin permission cache here.
 */

import m from 'mithril';
import {
	JoinDelegate,
	JoinDelegateInvitation,
	Collections,
	getJoinDelegateId,
} from '@freedi/shared-types';
import {
	db,
	collection,
	doc,
	query,
	where,
	onSnapshot,
	Unsubscribe,
} from '../firebase';
import { getUserState } from '../user';
import { setCurrentDelegate } from '../admin';

let delegatesForQuestion: JoinDelegate[] = [];
let delegateInvitationsForQuestion: JoinDelegateInvitation[] = [];
let myDelegateUnsub: Unsubscribe | null = null;
let delegatesUnsub: Unsubscribe | null = null;
let delegateInvitationsUnsub: Unsubscribe | null = null;

/**
 * Watches the current user's own delegate doc so a freshly accepted invite
 * (or a revocation) takes effect without a refresh. Anonymous users skip
 * this — delegates must be Google-signed-in.
 */
export function subscribeMyDelegate(questionId: string): void {
	if (myDelegateUnsub) {
		myDelegateUnsub();
		myDelegateUnsub = null;
	}

	const user = getUserState().user;
	if (!user || user.isAnonymous) return;

	const delegateId = getJoinDelegateId(questionId, user.uid);
	const ref = doc(db, Collections.joinDelegates, delegateId);

	myDelegateUnsub = onSnapshot(
		ref,
		(snap) => {
			const delegate = snap.exists() ? (snap.data() as JoinDelegate) : null;
			setCurrentDelegate(delegate, questionId);
		},
		() => {
			/* read may be denied if rules haven't propagated yet; ignore */
		},
	);
}

/**
 * Admin-only: live-watch the full delegate + invitation lists for a
 * question. Mounted by DelegatesPanel on open, torn down on close.
 * Multiple calls for the same question are harmless — we always tear down
 * prior listeners first.
 */
export function subscribeQuestionDelegates(questionId: string): void {
	unsubscribeQuestionDelegates();

	const delegatesQuery = query(
		collection(db, Collections.joinDelegates),
		where('questionId', '==', questionId),
	);
	delegatesUnsub = onSnapshot(delegatesQuery, (snap) => {
		delegatesForQuestion = snap.docs
			.map((d) => d.data() as JoinDelegate)
			.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
		m.redraw();
	});

	const invitesQuery = query(
		collection(db, Collections.joinDelegateInvitations),
		where('questionId', '==', questionId),
	);
	delegateInvitationsUnsub = onSnapshot(invitesQuery, (snap) => {
		delegateInvitationsForQuestion = snap.docs
			.map((d) => d.data() as JoinDelegateInvitation)
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
		m.redraw();
	});
}

export function unsubscribeQuestionDelegates(): void {
	if (delegatesUnsub) {
		delegatesUnsub();
		delegatesUnsub = null;
	}
	if (delegateInvitationsUnsub) {
		delegateInvitationsUnsub();
		delegateInvitationsUnsub = null;
	}
	delegatesForQuestion = [];
	delegateInvitationsForQuestion = [];
}

export function getDelegatesForQuestion(): JoinDelegate[] {
	return delegatesForQuestion;
}

export function getDelegateInvitationsForQuestion(): JoinDelegateInvitation[] {
	return delegateInvitationsForQuestion;
}
