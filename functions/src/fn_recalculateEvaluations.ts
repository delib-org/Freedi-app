import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './index';
import {
	Collections,
	Statement,
	Evaluation,
	StatementType,
	StatementEvaluation,
	functionConfig,
} from '@freedi/shared-types';
import type { PopperHebbianScore } from '@freedi/shared-types';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';
import { resolveQuestionPopulation } from './evaluation/resolveQuestionPopulation';
import { hasCounterMismatch, recomputeOptionCounters } from './evaluation/recomputeOptionCounters';
import { planClusterRecompute, type StatementFix } from './evaluation/planClusterRecompute';
import { buildQuestionClusterTrees } from './evaluation/questionClusterTrees';

interface RecalculateRequest {
	statementId: string; // Parent statement ID (the question)
	dryRun?: boolean; // If true, only report what would change without applying
}

interface RecalculateResult {
	success: boolean;
	dryRun: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	fixes: StatementFix[]; // Detailed list of changes (applied or would-be-applied)
	errors: string[];
}

// The counters come from recomputeOptionCounters, which follows the live
// trigger's rule (every evaluation document is a participant, zeros included)
// and the canonical agreement formula from @freedi/shared-types. A "recalculate"
// tool that writes different numbers from the live trigger is worse than no tool.

/**
 * Bulk recompute: fetch every evaluation under the parent in ONE query,
 * group by statementId in memory, and write all updates as batched ops.
 *
 * This replaces the old pattern of (240 options × per-option Firestore
 * read + per-option evaluation query + per-option write), which scales
 * as O(options × round-trips) ≈ 2 min on a 240-option question.
 *
 * The new cost is:
 *   - 1 query for options under parent
 *   - 1 query for all evaluations under parent (with `parentId == X`)
 *   - local O(n) grouping
 *   - ≤ ceil(optionCount / 500) batched commits
 * Total wall time on the same data: seconds, not minutes.
 *
 * Semantics match the legacy per-option path exactly so existing UI and
 * callers keep working (before/after counts, cluster option detection,
 * direct-eval overwrites source, etc.).
 */
export async function bulkRecalculateForParent(
	parentId: string,
	dryRun: boolean,
): Promise<RecalculateResult> {
	const modeLabel = dryRun ? '[DRY RUN] ' : '';
	const result: RecalculateResult = {
		success: true,
		dryRun,
		statementsProcessed: 0,
		statementsFixed: 0,
		fixes: [],
		errors: [],
	};

	// 1. Options under this parent (single query).
	const optionsSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option)
		.get();

	if (optionsSnapshot.empty) {
		logger.info(`${modeLabel}No options under ${parentId} — nothing to recalculate`);

		return result;
	}

	// 1b. The question's explicit N, resolved once and used for every option and
	//     synthesis of this run (undefined = open population, no correction).
	const populationSize = await resolveQuestionPopulation(db, parentId);

	// 2. All evaluations under this parent, paginated by `evaluatorId` to
	//    stream the result set instead of buffering the whole collection
	//    in one Firestore get (which Query Insights flagged at ~3.6s avg
	//    latency for large parents). The composite index
	//    (parentId ASC, evaluatorId ASC) already exists in firestore.indexes.json.
	//    Both per-option buckets and the parent-level unique-evaluator set are
	//    collected in one streaming pass so step 6 needs no second query.
	const EVAL_PAGE_SIZE = 500;
	const evalsByStatementId = new Map<string, Evaluation[]>();
	const uniqueEvaluators = new Set<string>();
	let totalEvaluations = 0;
	let evalCursor: QueryDocumentSnapshot | null = null;

	for (;;) {
		let pageQuery = db
			.collection(Collections.evaluations)
			.where('parentId', '==', parentId)
			.orderBy('evaluatorId')
			.limit(EVAL_PAGE_SIZE);
		if (evalCursor) pageQuery = pageQuery.startAfter(evalCursor);
		const page = await pageQuery.get();
		if (page.empty) break;

		page.forEach((doc) => {
			const evaluation = doc.data() as Evaluation;
			const uid = evaluation.evaluator?.uid ?? evaluation.evaluatorId;
			if (uid) uniqueEvaluators.add(uid);
			if (!evaluation.statementId) return;
			const bucket = evalsByStatementId.get(evaluation.statementId);
			if (bucket) bucket.push(evaluation);
			else evalsByStatementId.set(evaluation.statementId, [evaluation]);
		});
		totalEvaluations += page.size;

		if (page.size < EVAL_PAGE_SIZE) break;
		evalCursor = page.docs[page.docs.length - 1];
	}

	logger.info(
		`${modeLabel}Bulk recalc for ${parentId}: ${optionsSnapshot.size} options, ${totalEvaluations} raw evaluations`,
	);

	// 4. Plan updates per option into a write set (batched at commit time).
	interface PlannedUpdate {
		ref: DocumentReference;
		payload: Record<string, unknown>;
		fix: StatementFix;
	}
	const planned: PlannedUpdate[] = [];

	// 3b. Member trees of the question's clusters (theme -> synthesis -> options),
	//     so a cluster's score follows votes through nested clusters exactly like
	//     recomputeClusterEvaluation does.
	const isClusterDoc = (statement: Statement & { integratedOptions?: string[] }): boolean =>
		(statement.integratedOptions ?? []).length > 0 || statement.isCluster === true;
	const optionsById = new Map(
		optionsSnapshot.docs.map((doc) => [doc.id, doc.data() as Statement] as const),
	);
	const clusterTrees = await buildQuestionClusterTrees(
		parentId,
		optionsById,
		[...optionsById.entries()].filter(([, statement]) => isClusterDoc(statement)).map(([id]) => id),
		evalsByStatementId,
	);

	for (const doc of optionsSnapshot.docs) {
		result.statementsProcessed++;
		try {
			const statement = doc.data() as Statement & {
				integratedOptions?: string[];
				isCluster?: boolean;
				popperHebbianScore?: PopperHebbianScore;
			};

			const isClusterOption =
				(statement.integratedOptions && statement.integratedOptions.length > 0) ||
				statement.isCluster === true;

			const clusterTree = clusterTrees.get(doc.id);
			const plannedUpdate =
				isClusterOption && clusterTree
					? planClusterRecompute(statement, doc.id, clusterTree, evalsByStatementId, populationSize)
					: planOptionRecompute(statement, doc.id, evalsByStatementId, populationSize);

			if (plannedUpdate) {
				planned.push({ ref: doc.ref, ...plannedUpdate });
				result.fixes.push(plannedUpdate.fix);
				result.statementsFixed++;
			}
		} catch (error) {
			const msg = `Failed to process ${doc.id}: ${error instanceof Error ? error.message : String(error)}`;
			result.errors.push(msg);
			logger.error(msg);
		}
	}

	// 5. Commit in batches of 400 (safely under the 500 op cap).
	if (!dryRun && planned.length > 0) {
		const BATCH_CAP = 400;
		for (let i = 0; i < planned.length; i += BATCH_CAP) {
			const batch = db.batch();
			for (const p of planned.slice(i, i + BATCH_CAP)) {
				batch.update(p.ref, { ...p.payload, lastUpdate: Date.now() });
			}
			await batch.commit();
		}
	}

	// 6. Update parent totals using the same in-memory data (no extra query).
	//    `uniqueEvaluators` was accumulated during the streaming pagination above.
	const totalUniqueEvaluators = uniqueEvaluators.size;

	if (!dryRun) {
		const parentRef = db.collection(Collections.statements).doc(parentId);
		const parentDoc = await parentRef.get();
		if (parentDoc.exists) {
			const parentData = parentDoc.data() as Statement;
			const parentEvaluation: StatementEvaluation = parentData.evaluation || {
				agreement: 0,
				sumEvaluations: 0,
				numberOfEvaluators: 0,
				sumPro: 0,
				sumCon: 0,
				numberOfProEvaluators: 0,
				numberOfConEvaluators: 0,
				sumSquaredEvaluations: 0,
				averageEvaluation: 0,
				evaluationRandomNumber: Math.random(),
				viewed: 0,
			};
			parentEvaluation.asParentTotalEvaluators = totalUniqueEvaluators;
			await parentRef.update({
				evaluation: parentEvaluation,
				totalEvaluators: totalUniqueEvaluators,
				lastUpdate: Date.now(),
			});
		}
	} else {
		logger.info(
			`${modeLabel}Would set parent ${parentId} totalEvaluators = ${totalUniqueEvaluators}`,
		);
	}

	logger.info(
		`${modeLabel}Bulk recalc done for ${parentId}: processed=${result.statementsProcessed}, ` +
			`${dryRun ? 'would fix' : 'fixed'}=${result.statementsFixed}, errors=${result.errors.length}`,
	);

	return result;
}

/**
 * Pure-ish computation for a non-cluster option. Returns null if the stored
 * aggregates already match the recomputed values (nothing to write).
 */
function planOptionRecompute(
	statement: Statement,
	statementId: string,
	evalsByStatementId: Map<string, Evaluation[]>,
	populationSize: number | undefined,
): { payload: Record<string, unknown>; fix: StatementFix } | null {
	const evals = evalsByStatementId.get(statementId) ?? [];
	const counters = recomputeOptionCounters(evals, populationSize);

	const currentEval: StatementEvaluation = statement.evaluation || {
		numberOfEvaluators: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumEvaluations: 0,
		sumPro: 0,
		sumCon: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		agreement: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};
	const before = {
		numberOfEvaluators: currentEval.numberOfEvaluators || 0,
		numberOfProEvaluators: currentEval.numberOfProEvaluators || 0,
		numberOfConEvaluators: currentEval.numberOfConEvaluators || 0,
	};

	if (!hasCounterMismatch(currentEval, counters)) return null;

	const { agreement, numberOfEvaluators: totalEvaluators } = counters;
	const consensusValid = calculateConsensusValid(
		agreement,
		(statement as Statement & { popperHebbianScore?: PopperHebbianScore }).popperHebbianScore ??
			undefined,
	);

	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: counters.numberOfEvaluators,
		numberOfProEvaluators: counters.numberOfProEvaluators,
		numberOfConEvaluators: counters.numberOfConEvaluators,
		sumEvaluations: counters.sumEvaluations,
		sumSquaredEvaluations: counters.sumSquaredEvaluations,
		sumPro: counters.sumPro,
		sumCon: counters.sumCon,
		averageEvaluation: counters.averageEvaluation,
		agreement,
		agreementIndex: counters.agreementIndex,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};
	// `evaluation` is written whole, so dropping the key removes a stale
	// snapshot the `...currentEval` spread would otherwise carry over.
	if (counters.stakeholderCount !== undefined) {
		updatedEvaluation.stakeholderCount = counters.stakeholderCount;
	} else {
		delete updatedEvaluation.stakeholderCount;
	}

	return {
		payload: {
			evaluation: updatedEvaluation,
			totalEvaluators: totalEvaluators,
			consensus: agreement,
			consensusValid,
			proSum: counters.sumPro,
			conSum: counters.sumCon,
		},
		fix: {
			statementId,
			statementText: statement.statement?.substring(0, 50),
			isClusterOption: false,
			before: { ...before, consensus: statement.consensus ?? 0 },
			after: {
				numberOfEvaluators: totalEvaluators,
				numberOfProEvaluators: counters.numberOfProEvaluators,
				numberOfConEvaluators: counters.numberOfConEvaluators,
				consensus: agreement,
			},
		},
	};
}

/**
 * Firebase callable function to recalculate all evaluation data for a question's options
 */
export const recalculateStatementEvaluations = onCall<RecalculateRequest>(
	{
		region: functionConfig.region,
		// Admin recalc loops serially over every option under a parent and
		// runs per-option Firestore reads + writes. Questions with hundreds
		// of options (240+ in the wild) blow past the default 60s timeout.
		// Bump timeout + memory so this reliably completes in one call.
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async (request): Promise<RecalculateResult> => {
		const { statementId, dryRun = false } = request.data;

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		// Check if user is authenticated
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const userId = request.auth.uid;

		// Check if user has admin access to this statement
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

		if (!statementDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}

		const statement = statementDoc.data() as Statement;

		// Check if user is the creator or has admin role
		const isCreator = statement.creatorId === userId;

		if (!isCreator) {
			// Check if user is an admin for this statement
			const adminDoc = await db
				.collection(Collections.statementsSubscribe)
				.doc(`${userId}--${statementId}`)
				.get();

			if (!adminDoc.exists) {
				throw new HttpsError(
					'permission-denied',
					'User is not authorized to recalculate this statement',
				);
			}

			const adminData = adminDoc.data();
			if (adminData?.role !== 'admin') {
				throw new HttpsError(
					'permission-denied',
					'User must be an admin to recalculate evaluations',
				);
			}
		}

		const modeLabel = dryRun ? '[DRY RUN] ' : '';
		logger.info(
			`${modeLabel}Starting recalculation for statement ${statementId} by user ${userId}`,
		);

		const result: RecalculateResult = {
			success: true,
			dryRun,
			statementsProcessed: 0,
			statementsFixed: 0,
			fixes: [],
			errors: [],
		};

		try {
			// Delegate to the bulk path — single query for evaluations,
			// in-memory grouping, batched writes. See `bulkRecalculateForParent`.
			const bulkResult = await bulkRecalculateForParent(statementId, dryRun);
			Object.assign(result, bulkResult);

			// Timestamp the last drift-correction so the scheduled sweep can
			// skip questions that were just recalculated by an admin.
			if (!dryRun) {
				await db
					.collection(Collections.statements)
					.doc(statementId)
					.update({ lastEvaluationRecalcAt: Date.now() })
					.catch(() => {
						// best-effort — stored status is a sweep hint, not a lock
					});
			}

			logger.info(
				`${modeLabel}Recalculation complete: ${result.statementsProcessed} processed, ` +
					`${result.statementsFixed} ${dryRun ? 'would be fixed' : 'fixed'}`,
			);

			return result;
		} catch (error) {
			logger.error(`${modeLabel}Recalculation failed:`, error);
			throw new HttpsError(
				'internal',
				`Recalculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	},
);
