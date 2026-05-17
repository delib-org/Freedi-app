import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	JoinDelegate,
	Role,
	Statement,
	getJoinDelegateId,
} from '@freedi/shared-types';
import { logError } from './errorHandling';

/**
 * Shared authorization for Join-system admin callables. Three callables had
 * hand-rolled copies of "creator OR admin/creator subscription OR delegate"
 * that drifted in subtle ways (notably `fn_resolveJoinIntents` rejected the
 * question's creator without an admin subscription doc — a latent lockout).
 *
 * Single source of truth here. Callers state their `operation` for log
 * provenance; the helper returns which auth path was used so individual
 * functions can branch on it (e.g. "log this as a delegate action").
 */

export type JoinAuthSource = 'creator' | 'subscription' | 'delegate';

export type DelegatePermissionKey = 'canManageOrganizerSolutions' | 'canManageParticipantSolutions';

export interface JoinAdminAuthOptions {
	uid: string;
	questionId: string;
	/**
	 * When true (default), a JoinDelegate with the required permission is
	 * an accepted auth path. Set false on operations that must NOT be
	 * exercised by delegates (e.g. inviting another delegate — that would
	 * be a privilege-escalation surface).
	 */
	allowDelegate?: boolean;
	/**
	 * Permission key checked on the delegate doc when `allowDelegate` is true.
	 * Defaults to `canManageOrganizerSolutions` since that's what every
	 * existing caller needs.
	 */
	delegatePermission?: DelegatePermissionKey;
	/** Operation tag for structured permission-denied logs. */
	operation: string;
}

export interface JoinAdminAuthResult {
	via: JoinAuthSource;
	question: Statement;
}

/**
 * Verifies that `uid` is allowed to administer `questionId` and returns the
 * auth path used + the loaded question doc. Throws `HttpsError` on denial:
 *   • `not-found` if the question is missing
 *   • `permission-denied` otherwise
 *
 * Callers don't need to load the question doc themselves — it's returned
 * from this helper to save a Firestore read.
 */
export async function assertJoinAdminAuthorized(
	opts: JoinAdminAuthOptions,
): Promise<JoinAdminAuthResult> {
	const {
		uid,
		questionId,
		allowDelegate = true,
		delegatePermission = 'canManageOrganizerSolutions',
		operation,
	} = opts;

	const qSnap = await db.collection(Collections.statements).doc(questionId).get();
	if (!qSnap.exists) {
		throw new HttpsError('not-found', 'Question not found');
	}
	const question = qSnap.data() as Statement;

	if (question.creatorId === uid) {
		return { via: 'creator', question };
	}

	const subSnap = await db
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${questionId}`)
		.get();
	if (subSnap.exists) {
		const role = subSnap.data()?.role;
		if (role === Role.admin || role === Role.creator) {
			return { via: 'subscription', question };
		}
	}

	if (allowDelegate) {
		const delegateSnap = await db
			.collection(Collections.joinDelegates)
			.doc(getJoinDelegateId(questionId, uid))
			.get();
		if (delegateSnap.exists) {
			const delegate = delegateSnap.data() as JoinDelegate;
			if (delegate.permissions?.[delegatePermission]) {
				return { via: 'delegate', question };
			}
		}
	}

	logError(new Error('join admin authorization denied'), {
		operation,
		userId: uid,
		statementId: questionId,
	});
	throw new HttpsError('permission-denied', 'You are not authorized for this question');
}
