import { deleteDoc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { createStatementRef, createCollectionRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export async function deleteStatementFromDB(
	statement: Statement,
	isAuthorized: boolean,
	t: (key: string) => string,
) {
	try {
		if (!statement) throw new Error('No statement');

		if (!isAuthorized) return alert(t('You are not authorized to delete this statement'));

		if (statement.statementType === StatementType.group) return alert(t('cannot delete group'));

		const confirmed = confirm(`${t('Are you sure you want to delete')} ${statement.statement}?`);
		if (!confirmed) {
			return;
		}

		//get all children and update their parentId to this statement's parentId
		const childrenRef = createCollectionRef(Collections.statements);
		const q = query(childrenRef, where('parentId', '==', statement.statementId));
		const children = await getDocs(q);
		// Check if parent is a group and any child is an option
		if (statement.parentId) {
			// Get the parent statement
			const parentRef = createStatementRef(statement.parentId);
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

		// Reparent each child individually so one failure doesn't block others.
		// Some children (e.g. system-created) may not be updatable by this user.
		await Promise.allSettled(
			children.docs.map(async (child) => {
				try {
					const childRef = createStatementRef(child.id);
					await updateDoc(childRef, { parentId: statement.parentId });
				} catch (updateError) {
					logError(updateError, {
						operation: 'statements.deleteStatements.reparentChild',
						statementId: statement.statementId,
						metadata: { childId: child.id },
					});
				}
			}),
		);

		// Always proceed to delete the statement itself
		const statementRef = createStatementRef(statement.statementId);
		await deleteDoc(statementRef);
	} catch (error) {
		logError(error, {
			operation: 'statements.deleteStatements',
			statementId: statement.statementId,
		});
	}
}
