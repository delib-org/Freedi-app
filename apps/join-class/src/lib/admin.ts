import m from 'mithril';
import {
	Collections,
	JoinDelegate,
	JoinDelegatePermissions,
	Role,
	Statement,
	getJoinDelegateId,
} from '@freedi/shared-types';
import { db, doc, getDoc } from './firebase';
import { getUserState } from './user';

/** Matches `getStatementSubscriptionId` from shared-types but accepts the
 *  Firebase auth User (whose displayName is nullable) without type friction. */
function buildSubId(userId: string, statementId: string): string {
	return `${userId}--${statementId}`;
}

/**
 * Admin & delegate detection for the Join app.
 *
 * A user is considered admin of a question if:
 *   1. `user.uid === question.creatorId`, OR
 *   2. a document exists at `statementsSubscribe/{userId}--{questionId}` with
 *      role of either `admin` or `statement-creator`.
 *
 * Independently, a user can be a *delegate* on the question via a
 * `joinDelegates/{questionId}--{userId}` doc with one or both of the
 * `canManageOrganizerSolutions` / `canManageParticipantSolutions` flags set.
 * Delegates can edit/delete options matching the granted scope but cannot
 * change question-level settings (sort, evaluation toggles, theme, etc.).
 *
 * Both checks are run by `checkAdminStatus` and the results live in
 * module-level flags so views can read them synchronously.
 */

let isAdminFlag = false;
let currentDelegate: JoinDelegate | null = null;
let currentQuestionId: string | null = null;

/** Synchronous accessor for views. Reflects the latest resolved check. */
export function isAdmin(): boolean {
	return isAdminFlag;
}

/** The active user's delegate permissions on the current question, or null. */
export function getDelegatePermissions(): JoinDelegatePermissions | null {
	return currentDelegate?.permissions ?? null;
}

/** Whether the active user can add/edit/delete organizer (admin-tagged) options. */
export function canEditOrganizerOptions(): boolean {
	if (isAdminFlag) return true;

	return !!currentDelegate?.permissions.canManageOrganizerSolutions;
}

/** Whether the active user can add/edit/delete participant-submitted options. */
export function canEditParticipantOptions(): boolean {
	if (isAdminFlag) return true;

	return !!currentDelegate?.permissions.canManageParticipantSolutions;
}

/** Permission gate for editing/deleting a specific option. Combines the
 *  creator-edits-own-option case with admin / delegate scopes. The branch on
 *  `creatorRole` decides which delegate scope applies — organizer suggestions
 *  use `Role.admin`; everything else falls into participant scope. */
export function canEditOption(
	option: Statement | { creatorId?: string; creatorRole?: string | null },
): boolean {
	const user = getUserState().user;
	if (!user) return false;
	if (option.creatorId === user.uid) return true;

	if (isAdminFlag) return true;
	if (!currentDelegate) return false;

	const isOrganizer = option.creatorRole === Role.admin;

	return isOrganizer
		? !!currentDelegate.permissions.canManageOrganizerSolutions
		: !!currentDelegate.permissions.canManageParticipantSolutions;
}

/** Internal: clear all delegate/admin state. Called whenever we re-resolve
 *  for a different question so previous-question state can't leak. */
function resetState(questionId: string | null): void {
	isAdminFlag = false;
	currentDelegate = null;
	currentQuestionId = questionId;
}

/**
 * Resolve admin + delegate status for the given question and update flags.
 * Safe to call repeatedly; resets state first so navigation across questions
 * cannot leak prior context.
 */
export async function checkAdminStatus(questionId: string, creatorId: string): Promise<void> {
	resetState(questionId);

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
		if (snap.exists()) {
			const role = snap.data()?.role;
			if (role === Role.admin || role === Role.creator) {
				if (currentQuestionId === questionId) {
					isAdminFlag = true;
					m.redraw();
				}

				return;
			}
		}
	} catch {
		/* ignore — fall through to delegate probe */
	}

	// Not an admin. Check whether the user has a delegate record on this
	// question. Anonymous users skip this — delegates must be Google-signed-in.
	if (user.isAnonymous) return;

	try {
		const delegateId = getJoinDelegateId(questionId, user.uid);
		const delegateSnap = await getDoc(doc(db, Collections.joinDelegates, delegateId));
		if (!delegateSnap.exists()) return;

		const delegate = delegateSnap.data() as JoinDelegate;
		if (currentQuestionId === questionId) {
			currentDelegate = delegate;
			m.redraw();
		}
	} catch {
		/* ignore — non-delegate fallback */
	}
}

/** Setter used by the live `joinDelegates/{qid--uid}` listener so a freshly
 *  accepted invite (or a revocation) takes effect without a refresh. */
export function setCurrentDelegate(delegate: JoinDelegate | null, questionId: string): void {
	if (currentQuestionId !== questionId) return;
	currentDelegate = delegate;
	m.redraw();
}
