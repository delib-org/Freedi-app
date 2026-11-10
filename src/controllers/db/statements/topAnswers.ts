import { documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import { RANKED_ANSWERS } from '@/constants/common';
import { createCollectionRef } from '@/utils/firebaseUtils';
import type { RankedCursor } from '@/redux/answerViews/answerViewsSlice';
import { parseAnswers, storeSideLoadedAnswers } from './answerBatch';

export interface TopAnswersPage {
	ids: string[];
	hasMore: boolean;
	cursor: RankedCursor | undefined;
}

/**
 * One page of the question's answers by consensus, read once: no listener, so
 * nobody receives every vote on answers they never scroll to.
 * Rides `(parentId, statementType, consensus DESC)`; the id tie-break matches
 * the direction Firestore already appends to that index.
 */
export async function fetchTopAnswers(
	questionId: string,
	after: RankedCursor | undefined,
): Promise<TopAnswersPage> {
	const constraints = [
		where('parentId', '==', questionId),
		where('statementType', '==', StatementType.option),
		orderBy('consensus', 'desc'),
		orderBy(documentId(), 'desc'),
		...(after ? [startAfter(after.consensus, after.statementId)] : []),
		limit(RANKED_ANSWERS.PAGE_SIZE),
	];
	const snapshot = await getDocs(
		query(createCollectionRef(Collections.statements), ...constraints),
	);
	const answers = parseAnswers(
		snapshot.docs.map((doc) => doc.data()),
		questionId,
	);
	storeSideLoadedAnswers(answers);
	const last = answers[answers.length - 1];

	return {
		ids: answers.map((answer) => answer.statementId),
		hasMore: snapshot.docs.length === RANKED_ANSWERS.PAGE_SIZE,
		cursor: last ? { consensus: last.consensus, statementId: last.statementId } : after,
	};
}
