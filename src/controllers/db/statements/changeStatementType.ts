import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Statement, StatementType, QuestionType, EvaluationUI } from 'delib-npm';
import { validateStatementTypeHierarchy } from '@/controllers/general/helpers';

export async function changeStatementType(
	statement: Statement,
	newType: StatementType,
	isAuthorized: boolean
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!statement) throw new Error('No statement');
		if (!isAuthorized) {
			return {
				success: false,
				error: 'You are not authorized to change this statement type'
			};
		}

		// Prevent changing group type
		if (statement.statementType === StatementType.group) {
			return {
				success: false,
				error: 'Cannot change group type'
			};
		}

		// Check parent type restrictions using unified validation
		if (statement.parentId && statement.parentId !== 'top') {
			const parentRef = doc(
				FireStore,
				Collections.statements,
				statement.parentId
			);
			const parentDoc = await getDoc(parentRef);

			if (parentDoc.exists()) {
				const parentData = parentDoc.data() as Statement;
				const validation = validateStatementTypeHierarchy(parentData, newType);

				if (!validation.allowed) {
					return {
						success: false,
						error: validation.reason || 'Type change not allowed'
					};
				}
			}
		}

		// Check if changing TO option/group would violate children constraints
		if (newType === StatementType.option || newType === StatementType.group) {
			// Check if this statement has option children
			const childrenQuery = query(
				collection(FireStore, Collections.statements),
				where('parentId', '==', statement.statementId),
				where('statementType', '==', StatementType.option)
			);

			const childrenSnapshot = await getDocs(childrenQuery);

			if (!childrenSnapshot.empty) {
				if (newType === StatementType.option) {
					return {
						success: false,
						error: 'Cannot change to option because this statement has option children'
					};
				}
				if (newType === StatementType.group) {
					return {
						success: false,
						error: 'Cannot change to group because this statement has option children'
					};
				}
			}
		}

		// Prepare update data
		const updateData: Record<string, unknown> = {
			statementType: newType,
			lastUpdate: Date.now()
		};

		// Add question-specific settings when changing to question
		if (newType === StatementType.question) {
			updateData.questionSettings = {
				questionType: QuestionType.simple
			};
			updateData.evaluationSettings = {
				evaluationUI: EvaluationUI.suggestions
			};
		}

		// Update the statement type
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		await updateDoc(statementRef, updateData);

		return { success: true };
	} catch (error) {
		console.error('Error changing statement type:', error);
		
return {
			success: false,
			error: 'Failed to change statement type'
		};
	}
}
