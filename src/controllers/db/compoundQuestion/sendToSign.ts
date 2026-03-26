import { setDoc } from 'firebase/firestore';
import { Statement, StatementType, createStatementObject } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

interface SendToSignProps {
	solution: Statement;
	compoundStatement: Statement;
}

export async function sendSolutionToSign({
	solution,
	compoundStatement,
}: SendToSignProps): Promise<string | undefined> {
	try {
		if (!solution.statementId) throw new Error('Solution ID is required');
		if (!compoundStatement.statementId) throw new Error('Compound statement ID is required');

		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator is required');

		const signDocument = createStatementObject({
			statement: solution.statement,
			statementType: StatementType.document,
			parentId: compoundStatement.statementId,
			topParentId: compoundStatement.topParentId || compoundStatement.statementId,
			creatorId: creator.uid,
			creator,
		});

		if (!signDocument) throw new Error('Failed to create sign document');

		const signRef = createStatementRef(signDocument.statementId);
		await setDoc(signRef, {
			...signDocument,
			isDocument: true,
		});

		const compoundRef = createStatementRef(compoundStatement.statementId);
		const now = getCurrentTimestamp();

		const existingSignDocs =
			compoundStatement.questionSettings?.compoundSettings?.signDocumentIds ?? [];

		await setDoc(
			compoundRef,
			{
				questionSettings: {
					compoundSettings: {
						signDocumentIds: [
							...existingSignDocs,
							{
								solutionId: solution.statementId,
								signDocumentId: signDocument.statementId,
								sentAt: now,
								sentBy: creator.uid,
							},
						],
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		return signDocument.statementId;
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.sendSolutionToSign',
			statementId: solution.statementId,
		});

		return undefined;
	}
}
