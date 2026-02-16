import { doc, updateDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import {
	QuestionStage,
	Collections,
	QuestionType,
	QuestionSettings,
	QuestionStep,
} from '@freedi/shared-types';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';

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
		const statementRef = doc(FireStore, Collections.statements, statementId);
		const questionSettings: QuestionSettings = {
			currentStep: step,
			questionType: getDefaultQuestionType(),
		};
		await updateDoc(statementRef, { questionSettings });
	} catch (error) {
		console.error(error);
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
		const statementRef = doc(FireStore, Collections.statements, statementId);
		const questionSettings: QuestionSettings = {
			currentStage: stage,
			questionType: type,
		};
		await updateDoc(statementRef, { questionSettings });
	} catch (error) {
		console.error(error);
	}
}
