import { doc, updateDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { QuestionStage, Collections, QuestionType } from '@/types/enums';
import { QuestionSettings, QuestionStep } from '@/types/question';

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
		const questionSettings: QuestionSettings = { currentStage: stage, questionType: QuestionType.document }
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

export async function setQuestionType({ statementId, type = QuestionType.simple, stage = QuestionStage.suggestion }: SetStatementTypeProps) {
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
