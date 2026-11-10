import { httpsCallable } from 'firebase/functions';
import { DocumentData, documentId, query, QuerySnapshot, where } from 'firebase/firestore';
import { parse } from 'valibot';
import {
	GetAnswerBatchRequest,
	GetAnswerBatchResponse,
	Collections,
	Statement,
	StatementSchema,
} from '@freedi/shared-types';
import { functions } from '../config';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import { store } from '@/redux/store';
import { deleteStatement, setStatement, setStatements } from '@/redux/statements/statementsSlice';
import { markSideLoaded } from '@/redux/answerViews/answerViewsSlice';
import { logError } from '@/utils/errorHandling';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { FIREBASE } from '@/constants/common';
import {
	createManagedCollectionListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';

export interface AnswerBatchPage {
	ids: string[];
	hasMore: boolean;
	remaining: number;
	totalAnswers: number;
}

/**
 * Adds answers fetched outside the windowed list. A copy the window keeps live
 * is left alone, and so is one newer than this fetch; a side-loaded copy with
 * no listener of its own takes the fresher values.
 */
export function storeSideLoadedAnswers(answers: readonly Statement[]): void {
	const state = store.getState();
	const stored = new Map(state.statements.statements.map((s) => [s.statementId, s]));
	const sideLoaded = state.answerViews.sideLoadedIds;
	const fresh = answers.filter((answer) => {
		const current = stored.get(answer.statementId);
		if (!current) return true;

		return sideLoaded[answer.statementId] === true && answer.lastUpdate >= current.lastUpdate;
	});
	if (fresh.length === 0) return;

	store.dispatch(markSideLoaded(fresh.map((answer) => answer.statementId)));
	store.dispatch(setStatements(fresh));
}

export function parseAnswers(raw: readonly unknown[], questionId: string): Statement[] {
	const answers: Statement[] = [];
	for (const item of raw) {
		try {
			answers.push(parse(StatementSchema, normalizeStatementData(item as DocumentData)));
		} catch (error) {
			logError(error, { operation: 'answerBatch.parseAnswers', statementId: questionId });
		}
	}

	return answers;
}

/** Asks the sampler for this person's next answers to rate. */
export async function fetchAnswerBatch(
	questionId: string,
	size?: number,
): Promise<AnswerBatchPage> {
	const call = httpsCallable<GetAnswerBatchRequest, GetAnswerBatchResponse>(
		functions,
		'getAnswerBatch',
	);
	const { data } = await call({ questionId, size });
	const answers = parseAnswers(data.answers, questionId);
	storeSideLoadedAnswers(answers);

	return {
		ids: answers.map((answer) => answer.statementId),
		hasMore: data.hasMore,
		remaining: data.stats.remainingCount,
		totalAnswers: data.totalAnswers,
	};
}

/** Keeps the batch on screen live: an edit, hide or delete reaches an open card. */
export function listenToBatchAnswers(questionId: string, ids: readonly string[]): () => void {
	const chunks: string[][] = [];
	for (let start = 0; start < ids.length; start += FIREBASE.IN_QUERY_LIMIT) {
		chunks.push(ids.slice(start, start + FIREBASE.IN_QUERY_LIMIT));
	}

	const unsubscribers = chunks.map((chunk) =>
		createManagedCollectionListener(
			query(createCollectionRef(Collections.statements), where(documentId(), 'in', chunk)),
			generateListenerKey('answer-batch', questionId, chunk.join(',')),
			(snapshot: QuerySnapshot<DocumentData>) => {
				snapshot.docChanges().forEach((change) => {
					if (change.type === 'removed') {
						store.dispatch(deleteStatement(change.doc.id));

						return;
					}
					const [answer] = parseAnswers([change.doc.data()], questionId);
					if (answer) store.dispatch(setStatement(answer));
				});
			},
			(error) => {
				logError(error, { operation: 'answerBatch.listenToBatchAnswers', statementId: questionId });
			},
		),
	);

	return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
