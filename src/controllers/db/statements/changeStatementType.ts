import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Statement, StatementType } from 'delib-npm';

export async function changeStatementType(
	statement: Statement,
	newType: StatementType,
	isAuthorized: boolean
) {
	try {
		if (!statement) throw new Error('No statement');
		if (!isAuthorized) {
			alert('You are not authorized to change this statement type');

			return false;
		}
		if (statement.statementType === StatementType.group) {
			alert('cannot change group type');
		}
		// Check parent type if changing to option
		if (newType === StatementType.option && statement.parentId) {
			const parentRef = doc(
				FireStore,
				Collections.statements,
				statement.parentId
			);
			const parentDoc = await getDoc(parentRef);

			if (
				parentDoc.exists() &&
				parentDoc.data().statementType === StatementType.group
			) {
				alert('Cannot change to option type when parent is a group');

				return false;
			}
		}

		// Update the statement type
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		await updateDoc(statementRef, {
			statementType: newType,
			lastUpdated: new Date(),
		});

		return true; // Return success
	} catch (error) {
		console.error('Error changing statement type:', error);
		alert('Failed to change statement type');

		return false;
	}
}
