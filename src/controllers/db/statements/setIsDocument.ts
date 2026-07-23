import { getDoc, updateDoc } from 'firebase/firestore';
import { Statement, StatementType } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError, ValidationError } from '@/utils/errorHandling';

/**
 * Idempotently set the isDocument flag on an option statement (Cross-App
 * Statement Router → Sign route, and its Undo). Unlike `toggleIsDocument`,
 * an explicit set cannot desync under repeated confirm/undo taps.
 * Returns true on success (including the no-op case), false on failure.
 */
export async function setIsDocument(
	statementId: string,
	isDocument: boolean,
	userId?: string,
): Promise<boolean> {
	try {
		if (!statementId) {
			throw new ValidationError('Statement ID is undefined', {
				operation: 'statements.setIsDocument.setIsDocument',
			});
		}

		const statementRef = createStatementRef(statementId);
		const statementDB = await getDoc(statementRef);

		if (!statementDB.exists()) throw new Error('Statement not found');

		const statementData = statementDB.data() as Statement;

		if (statementData.statementType !== StatementType.option) {
			throw new ValidationError('Only options can be marked as documents', {
				operation: 'statements.setIsDocument.setIsDocument',
				statementId,
			});
		}

		if ((statementData.isDocument === true) === isDocument) {
			return true;
		}

		await updateDoc(statementRef, { isDocument, lastUpdate: getCurrentTimestamp() });

		return true;
	} catch (error) {
		logError(error, {
			operation: 'statements.setIsDocument.setIsDocument',
			statementId,
			userId,
			metadata: { isDocument },
		});

		return false;
	}
}

/**
 * Toggle the isDocument flag on an option statement.
 * Only options can be marked as documents (questions and documents already have their own types).
 */
export async function toggleIsDocument(statementId: string): Promise<boolean | undefined> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');

		const statementRef = createStatementRef(statementId);
		const statementDB = await getDoc(statementRef);

		if (!statementDB.exists()) throw new Error('Statement not found');

		const statementData = statementDB.data() as Statement;

		if (statementData.statementType !== StatementType.option) {
			logError(new Error('Only options can be marked as documents'), {
				operation: 'statements.setIsDocument.toggleIsDocument',
			});

			return undefined;
		}

		const isDocument = !(statementData.isDocument === true);

		await updateDoc(statementRef, { isDocument, lastUpdate: getCurrentTimestamp() });

		return isDocument;
	} catch (error) {
		logError(error, { operation: 'statements.setIsDocument.toggleIsDocument' });

		return undefined;
	}
}
