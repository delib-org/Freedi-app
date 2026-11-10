import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { increment, setDoc } from 'firebase/firestore';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import { createDocRef, getCurrentTimestamp } from '@/utils/firebaseUtils';

/**
 * Records that the current user opened this question (one document per user
 * per question). Runs for everyone: this write is what feeds the view count
 * and the `entered` counter in `questionProgress`.
 */
export function useRecordQuestionView(statement: Statement | undefined): void {
	const creator = useSelector(creatorSelector);
	const userId = creator?.uid;
	const statementId = statement?.statementId;
	const topParentId = statement?.topParentId;
	const isQuestion = statement?.statementType === StatementType.question;

	useEffect(() => {
		if (!statementId || !isQuestion || !userId) return;

		const viewRef = createDocRef(Collections.statementViews, `${userId}--${statementId}`);
		setDoc(
			viewRef,
			{
				statementId,
				userId,
				viewed: increment(1),
				lastViewed: getCurrentTimestamp(),
				parentDocumentId: topParentId ?? statementId,
			},
			{ merge: true },
		).catch((error: unknown) => {
			logError(error, {
				operation: 'useRecordQuestionView.recordView',
				userId,
				statementId,
			});
		});
	}, [statementId, topParentId, isQuestion, userId]);
}
