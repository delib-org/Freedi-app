import m from 'mithril';
import { Collections, Role } from '@freedi/shared-types';
import { db, doc, getDoc } from './firebase';
import { getUserState } from './user';

/** Matches `getStatementSubscriptionId` from shared-types but accepts the
 *  Firebase auth User (whose displayName is nullable) without type friction. */
function buildSubId(userId: string, statementId: string): string {
	return `${userId}--${statementId}`;
}

/**
 * Admin detection for the Join app.
 *
 * A user is considered admin of a question if:
 *   1. `user.uid === question.creatorId`, OR
 *   2. a document exists at `statementsSubscribe/{userId}--{questionId}` with
 *      role of either `admin` or `statement-creator`.
 *
 * Checked once per `loadQuestion` call; the result lives in a module-level
 * flag that views can read synchronously via `isAdmin()`.
 */

let isAdminFlag = false;
let currentQuestionId: string | null = null;

/** Synchronous accessor for views. Reflects the latest resolved check. */
export function isAdmin(): boolean {
	return isAdminFlag;
}

/**
 * Resolve admin status for the given question and update the flag. Safe to
 * call repeatedly; always resets to `false` first so navigating between
 * questions can't leak admin state across contexts.
 */
export async function checkAdminStatus(
	questionId: string,
	creatorId: string,
): Promise<void> {
	isAdminFlag = false;
	currentQuestionId = questionId;

	const user = getUserState().user;
	if (!user) return;

	if (user.uid === creatorId) {
		isAdminFlag = true;
		m.redraw();

		return;
	}

	try {
		const subId = buildSubId(user.uid, questionId);
		const snap = await getDoc(doc(db, Collections.statementsSubscribe, subId));
		if (!snap.exists()) return;

		const role = snap.data()?.role;
		if (role === Role.admin || role === Role.creator) {
			// Guard: the user may have navigated away while we were awaiting.
			if (currentQuestionId === questionId) {
				isAdminFlag = true;
				m.redraw();
			}
		}
	} catch {
		/* ignore — non-admin fallback */
	}
}
