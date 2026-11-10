import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
	Collections,
	StatementType,
	functionConfig,
	type Evaluation,
	type GetAnswerBatchRequest,
	type GetAnswerBatchResponse,
	type Statement,
} from '@freedi/shared-types';
import { db } from './db';
import { ALLOWED_ORIGINS } from './config/cors';
import { RATE_BUDGETS } from './config/rateBudgets';
import { logError } from './utils/errorHandling';
import { enforceCallableRateLimit } from './utils/rateLimit';
import { resolveBatchSize, selectAnswerBatch } from './utils/answerBatchSelection';
import { resolveStatementAccess } from './utils/statementAccess';

const ANSWERS_CACHE = {
	/** The same per-instance window as getBulkStatements: 1,000 people must not each read every answer. */
	TTL_MS: 30 * 1000,
	/** Questions kept per instance. Each entry holds every answer of one question. */
	MAX_ENTRIES: 20,
} as const;

interface CachedAnswers {
	at: number;
	statements: Promise<Statement[]>;
}

const answersCache = new Map<string, CachedAnswers>();

async function readAnswers(questionId: string): Promise<Statement[]> {
	const snapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();

	return snapshot.docs.map((doc) => doc.data() as Statement);
}

/** The promise is what is cached, so a burst on a cold instance still pays for one read. */
function loadAnswers(questionId: string): Promise<Statement[]> {
	const cached = answersCache.get(questionId);
	if (cached && Date.now() - cached.at <= ANSWERS_CACHE.TTL_MS) return cached.statements;

	answersCache.delete(questionId);
	if (answersCache.size >= ANSWERS_CACHE.MAX_ENTRIES) {
		const oldest = answersCache.keys().next().value;
		if (oldest !== undefined) answersCache.delete(oldest);
	}

	const statements = readAnswers(questionId);
	answersCache.set(questionId, { at: Date.now(), statements });
	statements.catch(() => answersCache.delete(questionId));

	return statements;
}

/** Answers this person rated. The uid is the verified caller, never a request field. */
async function readRatedIds(questionId: string, uid: string): Promise<string[]> {
	const snapshot = await db
		.collection(Collections.evaluations)
		.where('parentId', '==', questionId)
		.where('evaluatorId', '==', uid)
		.get();

	return snapshot.docs.map((doc) => (doc.data() as Evaluation).statementId);
}

function requireQuestionId(data: GetAnswerBatchRequest | undefined): string {
	const questionId = data?.questionId;
	if (typeof questionId !== 'string' || questionId.length === 0) {
		throw new HttpsError('invalid-argument', 'questionId is required');
	}

	return questionId;
}

export async function executeGetAnswerBatch(
	request: CallableRequest<GetAnswerBatchRequest>,
): Promise<GetAnswerBatchResponse> {
	const uid = request.auth?.uid;
	if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
	const questionId = requireQuestionId(request.data);
	await enforceCallableRateLimit(request, RATE_BUDGETS.getAnswerBatch, uid);

	try {
		const { statement } = await resolveStatementAccess(db, uid, questionId);
		if (statement.statementType !== StatementType.question) {
			throw new HttpsError('failed-precondition', 'Only questions have batches of answers');
		}

		const [statements, ratedIds] = await Promise.all([
			loadAnswers(questionId),
			readRatedIds(questionId, uid),
		]);

		return selectAnswerBatch({
			statements,
			ratedIds,
			uid,
			size: resolveBatchSize(request.data.size),
		});
	} catch (error) {
		if (error instanceof HttpsError) throw error;
		logError(error, {
			operation: 'fn_getAnswerBatch.executeGetAnswerBatch',
			userId: uid,
			statementId: questionId,
		});
		throw new HttpsError('internal', 'Could not load answers');
	}
}

/** Returns the next answers for the caller to rate, chosen by the shared sampler. No writes. */
export const getAnswerBatch = onCall<GetAnswerBatchRequest>(
	{ region: functionConfig.region, cors: [...ALLOWED_ORIGINS], memory: '512MiB' },
	executeGetAnswerBatch,
);
