import { setDoc } from 'firebase/firestore';
import {
	Statement,
	StatementType,
	QuestionType,
	ResultsBy,
	CutoffBy,
	createStatementObject,
} from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

interface CreateSubQuestionDiscussionProps {
	parentStatement: Statement;
	title: string;
}

export async function createSubQuestionDiscussion({
	parentStatement,
	title,
}: CreateSubQuestionDiscussionProps): Promise<string | undefined> {
	try {
		if (!parentStatement.statementId) throw new Error('Parent statement ID is required');

		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator is required');

		const discussion = createStatementObject({
			statement: title,
			statementType: StatementType.question,
			parentId: parentStatement.statementId,
			topParentId: parentStatement.topParentId || parentStatement.statementId,
			creatorId: creator.uid,
			creator,
		});

		if (!discussion) throw new Error('Failed to create sub-question discussion');

		const discussionRef = createStatementRef(discussion.statementId);
		const scope = parentStatement.questionSettings?.compoundSettings?.questionScope;
		await setDoc(discussionRef, {
			...discussion,
			...(scope ? { brief: scope } : {}),
			isTitleQuestion: true,
			questionSettings: {
				questionType: QuestionType.simple,
			},
			statementSettings: {
				subScreens: ['options'],
				enableAddEvaluationOption: true,
				showEvaluation: true,
				enhancedEvaluation: true,
			},
			resultsSettings: {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: 0.4,
			},
		});

		const parentRef = createStatementRef(parentStatement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			parentRef,
			{
				questionSettings: {
					compoundSettings: {
						subQuestionDiscussionId: discussion.statementId,
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		return discussion.statementId;
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.createSubQuestionDiscussion',
			statementId: parentStatement.statementId,
		});

		return undefined;
	}
}
