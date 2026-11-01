import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { safeParse } from 'valibot';
import {
	Collections,
	QUESTION_SEARCH_CONFIG,
	SearchQuestionsByMeaningRequestSchema,
	functionConfig,
	type QuestionMeaningMatch,
	type SearchQuestionsByMeaningRequest,
	type SearchQuestionsByMeaningResponse,
} from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from './config/cors';
import { embeddingService } from './services/embedding-service';
import {
	QUESTION_EMBEDDING_MODEL,
	questionEmbeddingsCollection,
	toQuestionSource,
} from './services/question-embedding-store';
import {
	QUESTION_SEARCH_LIMITS,
	isQuestionInScope,
	loadAdminTrees,
	mergeQuestionHits,
	type QuestionHit,
	type QuestionScopes,
	type ScopedQuestion,
} from './questionSearch/questionSearchScopes';
import { logError } from './utils/errorHandling';

/**
 * "Search by meaning" for questions (MC survey question picker).
 *
 * The caller's uid comes from auth only. The search embeds the query once,
 * then runs one `findNearest` on `questionEmbeddings` per access scope —
 * questions the caller created, and each tree the caller administers (most
 * recent first, capped) — merges and ranks the hits, and re-checks every hit
 * it returns against the live statement (type, hide flag, creator / admin
 * scope), so a stale vector mirror can never leak a question.
 *
 * Worst-case reads per call: MAX_ADMIN_SUBSCRIPTIONS_SCANNED (50) admin
 * subscriptions + (1 + MAX_ADMIN_TREES) × NEAREST_PER_SCOPE (11 × 20 = 220)
 * vector docs + (limit + VERIFY_SLACK) ≤ 60 statements = 330.
 */

const MAX_DISTANCE = 1 - QUESTION_SEARCH_LIMITS.MIN_SIMILARITY;

/** COSINE distance from findNearest → similarity in [0, 1]. */
function toSimilarity(distance: unknown): number {
	return typeof distance === 'number' ? Math.max(0, Math.min(1, 1 - distance)) : 0;
}

async function nearestIn(scope: Query, queryVector: number[]): Promise<QuestionHit[]> {
	const snap = await scope
		.findNearest({
			vectorField: 'embedding',
			queryVector: FieldValue.vector(queryVector),
			limit: QUESTION_SEARCH_LIMITS.NEAREST_PER_SCOPE,
			distanceMeasure: 'COSINE',
			distanceThreshold: MAX_DISTANCE,
			distanceResultField: 'vectorDistance',
		})
		.get();

	return snap.docs
		.map((doc) => {
			const data = doc.data();
			const mirror: ScopedQuestion = {
				statementId: doc.id,
				creatorId: data.creatorId,
				topParentId: data.topParentId,
				parents: Array.isArray(data.parents) ? data.parents : [],
				hide: data.hide === true,
			};

			return { statementId: doc.id, similarity: toSimilarity(data.vectorDistance), mirror };
		})
		.filter((hit) => hit.similarity >= QUESTION_SEARCH_LIMITS.MIN_SIMILARITY);
}

/** One findNearest per scope; a failed scope is logged and skipped. */
async function searchScopes(
	scopes: QuestionScopes,
	queryVector: number[],
): Promise<QuestionHit[][]> {
	const vectors = questionEmbeddingsCollection();
	const queries: Query[] = [
		vectors.where('creatorId', '==', scopes.uid),
		...scopes.trees.map((tree) => vectors.where('topParentId', '==', tree.topParentId)),
	];
	const failures: unknown[] = [];
	const settled = await Promise.all(
		queries.map((query) =>
			nearestIn(query, queryVector).catch((error: unknown) => {
				failures.push(error);

				return null;
			}),
		),
	);

	if (failures.length === queries.length) throw failures[0];
	for (const failure of failures) {
		logError(failure, {
			operation: 'fn_searchQuestionsByMeaning.searchScopes',
			userId: scopes.uid,
			metadata: { failedScopes: failures.length, totalScopes: queries.length },
		});
	}

	return settled.filter((hits): hits is QuestionHit[] => hits !== null);
}

/** The real gate: keep a hit only if the LIVE statement is an in-scope, visible question. */
async function verifyHits(
	firestore: Firestore,
	hits: readonly QuestionHit[],
	scopes: QuestionScopes,
	limit: number,
): Promise<QuestionMeaningMatch[]> {
	const candidates = hits
		.filter((hit) => isQuestionInScope(hit.mirror, scopes))
		.slice(0, limit + QUESTION_SEARCH_LIMITS.VERIFY_SLACK);
	if (candidates.length === 0) return [];

	const statements = firestore.collection(Collections.statements);
	const snaps = await firestore.getAll(...candidates.map((hit) => statements.doc(hit.statementId)));

	const results: QuestionMeaningMatch[] = [];
	candidates.forEach((hit, i) => {
		const question = snaps[i].exists ? toQuestionSource(snaps[i].data()) : null;
		if (!question || question.statementId !== hit.statementId) return;
		if (!isQuestionInScope(question, scopes)) return;

		results.push({
			statementId: question.statementId,
			statement: question.statement,
			parentId: question.parentId,
			topParentId: question.topParentId,
			similarity: hit.similarity,
		});
	});

	return results.slice(0, limit);
}

export async function executeQuestionSearch(
	uid: string | undefined,
	data: unknown,
): Promise<SearchQuestionsByMeaningResponse> {
	if (!uid) {
		throw new HttpsError('unauthenticated', 'Sign in to search');
	}

	const parsed = safeParse(SearchQuestionsByMeaningRequestSchema, data);
	if (!parsed.success) {
		throw new HttpsError('invalid-argument', 'Invalid search request');
	}

	const request: SearchQuestionsByMeaningRequest = parsed.output;
	const limit = request.limit ?? QUESTION_SEARCH_CONFIG.DEFAULT_LIMIT;

	try {
		const firestore = getFirestore();
		const [trees, embedded] = await Promise.all([
			loadAdminTrees(firestore, uid),
			embeddingService.generateEmbedding(request.query, undefined, {
				model: QUESTION_EMBEDDING_MODEL,
				skipBrief: true,
			}),
		]);
		const scopes: QuestionScopes = { uid, trees };
		const groups = await searchScopes(scopes, embedded.embedding);
		const results = await verifyHits(firestore, mergeQuestionHits(groups), scopes, limit);

		return { results };
	} catch (error) {
		if (error instanceof HttpsError) throw error;

		logError(error, {
			operation: 'fn_searchQuestionsByMeaning.executeQuestionSearch',
			userId: uid,
			metadata: { queryLength: request.query.length, limit },
		});
		throw new HttpsError('internal', 'Search failed');
	}
}

export const searchQuestionsByMeaning = onCall<SearchQuestionsByMeaningRequest>(
	{
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
		memory: '512MiB',
	},
	(request): Promise<SearchQuestionsByMeaningResponse> =>
		executeQuestionSearch(request.auth?.uid, request.data),
);
