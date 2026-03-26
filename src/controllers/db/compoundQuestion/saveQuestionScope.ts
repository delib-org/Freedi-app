import { setDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SaveQuestionScopeProps {
	statement: Statement;
	scope: string;
}

export async function saveQuestionScope({
	statement,
	scope,
}: SaveQuestionScopeProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			statementRef,
			{
				questionSettings: {
					compoundSettings: {
						questionScope: scope,
					},
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		// Also update the title discussion's brief if one exists
		const titleDiscussionId = statement.questionSettings?.compoundSettings?.titleDiscussionId;
		if (titleDiscussionId) {
			const discussionRef = createStatementRef(titleDiscussionId);
			await setDoc(discussionRef, { brief: scope, lastUpdate: now }, { merge: true });
		}
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.saveQuestionScope',
			statementId: statement.statementId,
		});
	}
}
