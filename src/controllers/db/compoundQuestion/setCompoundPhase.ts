import { setDoc } from 'firebase/firestore';
import { Statement, CompoundPhase } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SetCompoundPhaseProps {
	statement: Statement;
	newPhase: CompoundPhase;
	userId: string;
	reason?: string;
}

export async function setCompoundPhase({
	statement,
	newPhase,
	userId,
	reason,
}: SetCompoundPhaseProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const currentPhase = statement.questionSettings?.compoundSettings?.currentPhase;
		if (currentPhase === newPhase) return;

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();

		const historyEntry = {
			from: currentPhase ?? CompoundPhase.defineQuestion,
			to: newPhase,
			changedBy: userId,
			changedAt: now,
			...(reason && { reason }),
		};

		const existingHistory = statement.questionSettings?.compoundSettings?.phaseHistory ?? [];

		await setDoc(
			statementRef,
			{
				questionSettings: {
					compoundSettings: {
						currentPhase: newPhase,
						phaseHistory: [...existingHistory, historyEntry],
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.setCompoundPhase',
			statementId: statement.statementId,
			metadata: { newPhase },
		});
	}
}
