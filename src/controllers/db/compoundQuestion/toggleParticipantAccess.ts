import { setDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { setStatement } from '@/redux/statements/statementsSlice';

interface ToggleParticipantAccessProps {
	statement: Statement;
}

export async function toggleParticipantAccess({
	statement,
}: ToggleParticipantAccessProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const currentValue =
			statement.questionSettings?.compoundSettings?.allowParticipantsToAddSubQuestions ?? false;
		const newValue = !currentValue;
		const now = getCurrentTimestamp();

		// Optimistic Redux update for immediate local feedback
		const updatedStatement: Statement = {
			...statement,
			questionSettings: {
				...statement.questionSettings,
				compoundSettings: {
					...statement.questionSettings?.compoundSettings,
					allowParticipantsToAddSubQuestions: newValue,
				},
			},
			lastUpdate: now,
		};
		store.dispatch(setStatement(updatedStatement));

		// Persist to Firestore (triggers real-time listeners for other clients)
		const ref = createStatementRef(statement.statementId);
		await setDoc(
			ref,
			{
				questionSettings: {
					compoundSettings: {
						allowParticipantsToAddSubQuestions: newValue,
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.toggleParticipantAccess',
			statementId: statement.statementId,
		});
	}
}
