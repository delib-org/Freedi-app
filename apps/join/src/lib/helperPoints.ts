/**
 * Helper-points read layer for the join app.
 *
 * Points are earned when a suggestion author marks a user's comment helpful —
 * awarded server-side by the `onCommentVerdictWritten` Cloud Function into
 * the publicly-readable `helperPoints` collection (per-question doc
 * `${questionId}--${uid}` plus a global `total--${uid}`), alongside the
 * cross-app engagement credit. This module only reads:
 *
 *   • the current user's own total + per-question docs (live listeners, with
 *     a "+1 ⭐" toast when the total grows mid-session), and
 *   • a lazy cache of other users' totals for the star badge next to
 *     commenter names in chat.
 */

import m from 'mithril';
import { Collections, HELPER_POINTS_TOTAL_SCOPE, getHelperPointsId } from '@freedi/shared-types';
import { db, doc, getDoc, Unsubscribe } from './firebase';
import { resilientOnSnapshot } from './resilientListeners';
import { getUserState } from './user';
import { showFacilitatorToast } from './facilitatorToast';
import { t } from './i18n';

let myTotal = 0;
let myQuestionPoints = 0;
// The first snapshot delivers the stored value — only later increases are
// "you just earned a point" moments worth a toast.
let myTotalInitialized = false;
let totalUnsub: Unsubscribe | null = null;
let questionUnsub: Unsubscribe | null = null;

/** Pure toast decision — exported for tests. */
export function shouldToastOnPoints(
	prevTotal: number,
	nextTotal: number,
	initialized: boolean,
): boolean {
	return initialized && nextTotal > prevTotal;
}

export function getMyHelperPoints(): { total: number; question: number } {
	return { total: myTotal, question: myQuestionPoints };
}

/**
 * Live listeners on the current user's own tallies for this question. Safe to
 * call again on navigation — tears down the previous subscription first.
 */
export function subscribeMyHelperPoints(questionId: string): Unsubscribe {
	unsubscribeMyHelperPoints();

	const uid = getUserState().user?.uid;
	if (!uid) {
		return () => undefined;
	}

	const totalRef = doc(
		db,
		Collections.helperPoints,
		getHelperPointsId(HELPER_POINTS_TOTAL_SCOPE, uid),
	);
	totalUnsub = resilientOnSnapshot('helperPoints:total', totalRef, (snap) => {
		const points = snap.exists() ? ((snap.data() as { points?: number }).points ?? 0) : 0;
		if (shouldToastOnPoints(myTotal, points, myTotalInitialized)) {
			showFacilitatorToast(t('points.earned_toast'));
		}
		myTotal = points;
		myTotalInitialized = true;
		// Own total also feeds the cache so a user's badge next to their own
		// past comments stays consistent.
		totalsCache.set(uid, points);
		m.redraw();
	});

	const questionRef = doc(db, Collections.helperPoints, getHelperPointsId(questionId, uid));
	questionUnsub = resilientOnSnapshot('helperPoints:question', questionRef, (snap) => {
		myQuestionPoints = snap.exists() ? ((snap.data() as { points?: number }).points ?? 0) : 0;
		m.redraw();
	});

	return () => unsubscribeMyHelperPoints();
}

export function unsubscribeMyHelperPoints(): void {
	if (totalUnsub) {
		totalUnsub();
		totalUnsub = null;
	}
	if (questionUnsub) {
		questionUnsub();
		questionUnsub = null;
	}
	myTotal = 0;
	myQuestionPoints = 0;
	myTotalInitialized = false;
}

// ---------------------------------------------------------------------------
// Other users' totals — lazy one-shot cache for chat star badges. Points
// change rarely; a per-session fetch per user is enough (the user's own badge
// stays live via the subscription above).
// ---------------------------------------------------------------------------

const totalsCache: Map<string, number> = new Map();
const totalsInflight: Set<string> = new Set();

/** Cached helper-points total for any user; 0 until loaded. */
export function getHelperPointsFor(uid: string): number {
	return totalsCache.get(uid) ?? 0;
}

/**
 * Kick off fetches for any uids not yet cached. Safe to call on every render
 * — cached and in-flight uids are skipped.
 */
export function loadHelperPointsTotals(uids: string[]): void {
	for (const uid of uids) {
		if (!uid || totalsCache.has(uid) || totalsInflight.has(uid)) continue;
		totalsInflight.add(uid);
		void getDoc(
			doc(db, Collections.helperPoints, getHelperPointsId(HELPER_POINTS_TOTAL_SCOPE, uid)),
		)
			.then((snap) => {
				const points = snap.exists() ? ((snap.data() as { points?: number }).points ?? 0) : 0;
				totalsCache.set(uid, points);
				if (points > 0) m.redraw();
			})
			.catch((err) => {
				console.error('[loadHelperPointsTotals] failed:', err);
			})
			.finally(() => {
				totalsInflight.delete(uid);
			});
	}
}
