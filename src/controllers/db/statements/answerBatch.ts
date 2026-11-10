import { httpsCallable } from 'firebase/functions';
import { DocumentData } from 'firebase/firestore';
import { parse } from 'valibot';
import {
	GetAnswerBatchRequest,
	GetAnswerBatchResponse,
	Statement,
	StatementSchema,
} from '@freedi/shared-types';
import { functions } from '../config';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import { store } from '@/redux/store';
import { setStatements } from '@/redux/statements/statementsSlice';
import { markSideLoaded } from '@/redux/answerViews/answerViewsSlice';
import { logError } from '@/utils/errorHandling';

export interface AnswerBatchPage {
	ids: string[];
	hasMore: boolean;
	remaining: number;
	totalAnswers: number;
}

/**
 * Adds answers fetched outside the windowed list. An answer the store already
 * holds is left alone: its copy is live, and this one may be older.
 */
export function storeSideLoadedAnswers(answers: readonly Statement[]): void {
	const stored = new Set(store.getState().statements.statements.map((s) => s.statementId));
	const fresh = answers.filter((answer) => !stored.has(answer.statementId));
	if (fresh.length === 0) return;

	store.dispatch(markSideLoaded(fresh.map((answer) => answer.statementId)));
	store.dispatch(setStatements(fresh));
}

function parseAnswers(raw: readonly unknown[], questionId: string): Statement[] {
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
