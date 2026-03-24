import { setDoc } from 'firebase/firestore';
import {
	Statement,
	StatementType,
	QuestionType,
	createStatementObject,
	evaluationType,
} from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

interface CreateSolutionQuestionProps {
	parentStatement: Statement;
	title: string;
}

export async function createSolutionQuestion({
	parentStatement,
	title,
}: CreateSolutionQuestionProps): Promise<string | undefined> {
	try {
		if (!parentStatement.statementId) throw new Error('Parent statement ID is required');

		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator is required');

		const solutionQuestion = createStatementObject({
			statement: title,
			statementType: StatementType.question,
			parentId: parentStatement.statementId,
			topParentId: parentStatement.topParentId || parentStatement.statementId,
			creatorId: creator.uid,
			creator,
		});

		if (!solutionQuestion) throw new Error('Failed to create solution question');

		const solutionRef = createStatementRef(solutionQuestion.statementId);
		await setDoc(solutionRef, {
			...solutionQuestion,
			questionSettings: {
				questionType: QuestionType.simple,
			},
			statementSettings: {
				subScreens: ['options'],
				enableAddEvaluationOption: true,
				showEvaluation: true,
				evaluationType: evaluationType.range,
				enhancedEvaluation: true, // auto-derived from evaluationType
			},
		});

		const parentRef = createStatementRef(parentStatement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			parentRef,
			{
				questionSettings: {
					compoundSettings: {
						solutionQuestionId: solutionQuestion.statementId,
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		return solutionQuestion.statementId;
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.createSolutionQuestion',
			statementId: parentStatement.statementId,
		});

		return undefined;
	}
}
