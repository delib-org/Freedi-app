import { updateDoc } from 'firebase/firestore';
import { QuestionStage, QuestionType, QuestionSettings, QuestionStep } from '@freedi/shared-types';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SetStatementStageParams {
	statementId: string;
	step: QuestionStep;
}
export async function setQuestionStage({
	statementId,
	step = QuestionStep.suggestion,
}: SetStatementStageParams) {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		const statementRef = createStatementRef(statementId);
		const questionSettings: QuestionSettings = {
			currentStep: step,
			questionType: getDefaultQuestionType(),
		};
		await updateDoc(statementRef, { questionSettings });
	} catch (error) {
		logError(error, {
			operation: 'statements.statementMetaData.setStatementMetaData.setQuestionStage',
		});
	}
}

interface SetStatementTypeProps {
	statementId: string;
	type: QuestionType;
	stage: QuestionStage;
}

export async function setQuestionType({
	statementId,
	type = getDefaultQuestionType(),
	stage = QuestionStage.suggestion,
}: SetStatementTypeProps) {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		const statementRef = createStatementRef(statementId);
		const questionSettings: QuestionSettings = {
			currentStage: stage,
			questionType: type,
		};
		await updateDoc(statementRef, { questionSettings });
	} catch (error) {
		logError(error, {
			operation: 'statements.statementMetaData.setStatementMetaData.setQuestionType',
		});
	}
}
