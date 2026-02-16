import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	writeBatch,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Statement, StatementType } from '@freedi/shared-types';

export async function deleteStatementFromDB(
	statement: Statement,
	isAuthorized: boolean,
	t: (key: string) => string,
) {
	try {
		if (!statement) throw new Error('No statement');

		if (!isAuthorized) return alert(t('You are not authorized to delete this statement'));

		if (statement.statementType === StatementType.group) return alert(t('cannot delete group'));

		if (!statement) throw new Error('No statement');
		const confirmed = confirm(`${t('Are you sure you want to delete')} ${statement.statement}?`);
		if (!confirmed) {
			return;
		}

		//get all children and update their parentId to this statement's parentId
		const childrenRef = collection(FireStore, Collections.statements);
		const q = query(childrenRef, where('parentId', '==', statement.statementId));
		const children = await getDocs(q);
		// Check if parent is a group and any child is an option
		if (statement.parentId) {
			// Get the parent statement
			const parentRef = doc(FireStore, Collections.statements, statement.parentId);
			const parentDoc = await getDoc(parentRef);

			// Check if parent is a group
			if (parentDoc.exists() && parentDoc.data().statementType === StatementType.group) {
				// Check if any child is an option
				const hasOptionChild = children.docs.some(
					(child) => child.data().statementType === StatementType.option,
				);

				if (hasOptionChild) {
					alert(
						'Cannot delete this statement. It contains option statements under a group parent.',
					);

					return;
				}
			}
		}
		// Update each child's parentId to the deleted statement's parentId
		const batch = writeBatch(FireStore);
		children.docs.forEach((child) => {
			const childRef = doc(FireStore, Collections.statements, child.id);
			batch.update(childRef, { parentId: statement.parentId });
		});
		await batch.commit();

		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		await deleteDoc(statementRef);
	} catch (error) {
		console.error(error);
	}
}
