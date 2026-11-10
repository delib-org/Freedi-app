import { updateDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, updateTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { QuestionStageIndex } from '@/view/pages/statement/components/questionScreen/questionStage';
import { applyStagePreset } from '@/view/pages/statement/components/questionScreen/stagePreset';

/** Moves a question to a stage and sets what participants can do there, in one write. */
export async function setStagePresetToDB(
	statement: Statement,
	stage: QuestionStageIndex,
): Promise<void> {
	try {
		await updateDoc(createStatementRef(statement.statementId), {
			...applyStagePreset(statement, stage),
			...updateTimestamp(),
		});
	} catch (error) {
		logError(error, {
			operation: 'statements.setStagePreset.setStagePresetToDB',
			statementId: statement.statementId,
			metadata: { stage },
		});
		throw error;
	}
}
