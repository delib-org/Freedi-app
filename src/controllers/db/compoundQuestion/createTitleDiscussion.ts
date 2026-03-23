import { setDoc } from 'firebase/firestore';
import {
	Statement,
	StatementType,
	QuestionType,
	createStatementObject,
} from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

interface CreateTitleDiscussionProps {
	parentStatement: Statement;
	title: string;
}

export async function createTitleDiscussion({
	parentStatement,
	title,
}: CreateTitleDiscussionProps): Promise<string | undefined> {
	try {
		if (!parentStatement.statementId) throw new Error('Parent statement ID is required');

		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator is required');

		const titleDiscussion = createStatementObject({
			statement: title,
			statementType: StatementType.question,
			parentId: parentStatement.statementId,
			topParentId: parentStatement.topParentId || parentStatement.statementId,
			creatorId: creator.uid,
			creator,
		});

		if (!titleDiscussion) throw new Error('Failed to create title discussion');

		const discussionRef = createStatementRef(titleDiscussion.statementId);
		const scope = parentStatement.questionSettings?.compoundSettings?.questionScope;
		await setDoc(discussionRef, {
			...titleDiscussion,
			...(scope ? { brief: scope } : {}),
			questionSettings: {
				questionType: QuestionType.simple,
			},
		});

		const parentRef = createStatementRef(parentStatement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			parentRef,
			{
				questionSettings: {
					compoundSettings: {
						titleDiscussionId: titleDiscussion.statementId,
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		return titleDiscussion.statementId;
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.createTitleDiscussion',
			statementId: parentStatement.statementId,
		});

		return undefined;
	}
}
