import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { ELEVATED_ROLES, expectedSubscriptionId } from '../../utils/subscriptionIdentity';

/**
 * Shared admin gate for the synthesis callables.
 *
 * Resolves the topParent of the question and reads the caller's subscription
 * there by its doc id `{uid}--{topParentId}`; it must hold an elevated role
 * (admin, statement-creator, creator). Returns the parent statement (often
 * useful to the caller — saves a second Firestore read).
 */
export async function assertSynthesisAdmin(questionId: string, userId: string): Promise<Statement> {
	const db = getFirestore();
	const parentDoc = await db.collection(Collections.statements).doc(questionId).get();
	if (!parentDoc.exists) {
		throw new HttpsError('not-found', 'Question not found');
	}
	const parent = parentDoc.data() as Statement;
	const topParentId = parent.topParentId || questionId;

	// By doc id, like every other admin check (the rules' isAdmin): a field query
	// on statementId would trust a doc whose id names another statement.
	const subSnap = await db
		.collection(Collections.statementsSubscribe)
		.doc(expectedSubscriptionId(userId, topParentId))
		.get();
	const role = subSnap.exists ? subSnap.get('role') : undefined;

	if (typeof role !== 'string' || !ELEVATED_ROLES.has(role)) {
		throw new HttpsError('permission-denied', 'Only admins can run synthesis operations');
	}

	return parent;
}
