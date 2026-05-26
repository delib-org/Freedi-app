import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Role, type Statement } from '@freedi/shared-types';

/**
 * Shared admin gate for the synthesis callables. Mirrors the pattern used
 * by `synthesisJobStart` (legacy async path) so authorization is consistent
 * across all admin entry points.
 *
 * Resolves the topParent of the question and looks for an admin / creator
 * subscription there. Returns the parent statement (often useful to the
 * caller — saves a second Firestore read).
 */
export async function assertSynthesisAdmin(questionId: string, userId: string): Promise<Statement> {
	const db = getFirestore();
	const parentDoc = await db.collection(Collections.statements).doc(questionId).get();
	if (!parentDoc.exists) {
		throw new HttpsError('not-found', 'Question not found');
	}
	const parent = parentDoc.data() as Statement;
	const topParentId = parent.topParentId || questionId;

	const membersSnap = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', topParentId)
		.where('userId', '==', userId)
		.where('role', 'in', [Role.admin, 'creator', 'admin'])
		.limit(1)
		.get();

	if (membersSnap.empty) {
		throw new HttpsError('permission-denied', 'Only admins can run synthesis operations');
	}

	return parent;
}
