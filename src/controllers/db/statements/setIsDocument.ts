import { getDoc, updateDoc } from 'firebase/firestore';
import { Statement, StatementType } from '@freedi/shared-types';
import { createStatementRef } from '@/utils/firebaseUtils';

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
			console.error('Only options can be marked as documents');

			return undefined;
		}

		const isDocument = !(statementData.isDocument === true);

		await updateDoc(statementRef, { isDocument });

		return isDocument;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}
