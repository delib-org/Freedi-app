import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';

/**
 * Callable guard: the caller must be the statement's creator or hold the
 * 'admin' role on its subscription (`statementsSubscribe/{uid}--{statementId}`).
 * Returns the statement so the caller does not read it twice.
 */
export async function assertStatementAdmin(
	db: Firestore,
	statementId: string,
	uid: string,
): Promise<Statement> {
	const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

	if (!statementDoc.exists) {
		throw new HttpsError('not-found', 'Statement not found');
	}

	const statement = statementDoc.data() as Statement;

	if (statement.creatorId === uid) return statement;

	const adminDoc = await db
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${statementId}`)
		.get();

	if (!adminDoc.exists) {
		throw new HttpsError('permission-denied', 'User is not authorized for this statement');
	}

	if (adminDoc.data()?.role !== 'admin') {
		throw new HttpsError('permission-denied', 'User must be an admin of this statement');
	}

	return statement;
}
