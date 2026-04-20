import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from './index';
import {
	Collections,
	Statement,
	Evaluation,
	StatementType,
	StatementEvaluation,
	functionConfig,
} from '@freedi/shared-types';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';
import type { PopperHebbianScore } from '@freedi/shared-types';

// Uncertainty floor for Mean - SEM calculation
const FLOOR_STD_DEV = 0.5;

interface RecalculateRequest {
	statementId: string; // Parent statement ID (the question)
	dryRun?: boolean; // If true, only report what would change without applying
}

interface StatementFix {
	statementId: string;
	statementText?: string; // First 50 chars of statement text for identification
	isClusterOption?: boolean;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
}

interface RecalculateResult {
	success: boolean;
	dryRun: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	fixes: StatementFix[]; // Detailed list of changes (applied or would-be-applied)
	errors: string[];
}

/**
 * Calculate agreement using Mean - SEM with uncertainty floor
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	let sem = FLOOR_STD_DEV;

	if (numberOfEvaluators > 1) {
		const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
		const observedStdDev = Math.sqrt(Math.max(0, variance));
		const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
		sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);
	}

	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);

	return mean - penalty;
}

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

	// 2. All evaluations under this parent (single query). The `parentId`
	// field on Evaluation makes this the right bulk anchor.
	const evalsSnapshot = await db
		.collection(Collections.evaluations)
		.where('parentId', '==', parentId)
		.get();

	// 3. Group evaluations by the statement they target (in memory — O(n)).
	const evalsByStatementId = new Map<string, Evaluation[]>();
	evalsSnapshot.forEach((doc) => {
		const evaluation = doc.data() as Evaluation;
		if (!evaluation.statementId) return;
		const bucket = evalsByStatementId.get(evaluation.statementId);
		if (bucket) bucket.push(evaluation);
		else evalsByStatementId.set(evaluation.statementId, [evaluation]);
	});

	logger.info(
		`${modeLabel}Bulk recalc for ${parentId}: ${optionsSnapshot.size} options, ${evalsSnapshot.size} raw evaluations`,
	);

	// 4. Plan updates per option into a write set (batched at commit time).
	interface PlannedUpdate {
		ref: DocumentReference;
		payload: Record<string, unknown>;
		fix: StatementFix;
	}
	const planned: PlannedUpdate[] = [];

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

			const plannedUpdate = isClusterOption
				? planClusterRecompute(statement, doc.id, evalsByStatementId)
				: planOptionRecompute(statement, doc.id, evalsByStatementId);

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
	const uniqueEvaluators = new Set<string>();
	evalsSnapshot.forEach((d) => {
		const e = d.data() as Evaluation;
		const uid = e.evaluator?.uid ?? e.evaluatorId;
		if (uid) uniqueEvaluators.add(uid);
	});
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
): { payload: Record<string, unknown>; fix: StatementFix } | null {
	const evals = evalsByStatementId.get(statementId) ?? [];
	let actualProCount = 0;
	let actualConCount = 0;
	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;
	for (const e of evals) {
		const v = e.evaluation;
		if (v > 0) {
			actualProCount++;
			sumPro += v;
		} else if (v < 0) {
			actualConCount++;
			sumCon += Math.abs(v);
		}
		sumEvaluations += v;
		sumSquaredEvaluations += v * v;
	}
	const totalWithNonZeroEval = actualProCount + actualConCount;

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

	const hasProMismatch = before.numberOfProEvaluators !== actualProCount;
	const hasConMismatch = before.numberOfConEvaluators !== actualConCount;
	const hasEvaluatorMismatch = before.numberOfEvaluators !== totalWithNonZeroEval;
	if (!hasProMismatch && !hasConMismatch && !hasEvaluatorMismatch) return null;

	const averageEvaluation = totalWithNonZeroEval > 0 ? sumEvaluations / totalWithNonZeroEval : 0;
	const agreement = calcAgreement(sumEvaluations, sumSquaredEvaluations, totalWithNonZeroEval);
	const consensusValid = calculateConsensusValid(
		agreement,
		(statement as Statement & { popperHebbianScore?: PopperHebbianScore }).popperHebbianScore ??
			undefined,
	);

	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: totalWithNonZeroEval,
		numberOfProEvaluators: actualProCount,
		numberOfConEvaluators: actualConCount,
		sumEvaluations,
		sumSquaredEvaluations,
		sumPro,
		sumCon,
		averageEvaluation,
		agreement,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};

	return {
		payload: {
			evaluation: updatedEvaluation,
			totalEvaluators: totalWithNonZeroEval,
			consensus: agreement,
			consensusValid,
			proSum: sumPro,
			conSum: sumCon,
		},
		fix: {
			statementId,
			statementText: statement.statement?.substring(0, 50),
			isClusterOption: false,
			before: { ...before, consensus: statement.consensus ?? 0 },
			after: {
				numberOfEvaluators: totalWithNonZeroEval,
				numberOfProEvaluators: actualProCount,
				numberOfConEvaluators: actualConCount,
				consensus: agreement,
			},
		},
	};
}

/**
 * Cluster-option recompute using pre-grouped evaluations. Direct evaluations
 * on the cluster OVERWRITE source-statement evaluations for the same user,
 * matching the legacy semantics.
 */
function planClusterRecompute(
	statement: Statement & { integratedOptions?: string[]; isCluster?: boolean },
	clusterId: string,
	evalsByStatementId: Map<string, Evaluation[]>,
): { payload: Record<string, unknown>; fix: StatementFix } | null {
	const sourceIds = statement.integratedOptions ?? [];
	if (sourceIds.length === 0) return null;

	interface UserEval {
		evaluation: number;
		isDirect: boolean;
		sourceEvaluations: number[];
	}
	const userEvals = new Map<string, UserEval>();

	// Source evaluations (averaged per user across their sources).
	for (const sourceId of sourceIds) {
		const evals = evalsByStatementId.get(sourceId) ?? [];
		for (const e of evals) {
			const uid = e.evaluator?.uid ?? e.evaluatorId;
			if (!uid) continue;
			const existing = userEvals.get(uid);
			if (existing && !existing.isDirect) {
				existing.sourceEvaluations.push(e.evaluation);
				existing.evaluation =
					existing.sourceEvaluations.reduce((a, b) => a + b, 0) / existing.sourceEvaluations.length;
			} else if (!existing) {
				userEvals.set(uid, {
					evaluation: e.evaluation,
					isDirect: false,
					sourceEvaluations: [e.evaluation],
				});
			}
		}
	}

	// Direct evaluations on the cluster itself OVERRIDE the source avg.
	const directEvals = evalsByStatementId.get(clusterId) ?? [];
	for (const e of directEvals as (Evaluation & { migratedAt?: number })[]) {
		if (e.migratedAt) continue;
		const uid = e.evaluator?.uid ?? e.evaluatorId;
		if (!uid) continue;
		userEvals.set(uid, {
			evaluation: e.evaluation,
			isDirect: true,
			sourceEvaluations: [],
		});
	}

	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;
	let proCount = 0;
	let conCount = 0;
	for (const [, data] of userEvals) {
		const v = data.evaluation;
		sumEvaluations += v;
		sumSquaredEvaluations += v * v;
		if (v > 0) {
			proCount++;
			sumPro += v;
		} else if (v < 0) {
			conCount++;
			sumCon += Math.abs(v);
		}
	}
	const totalEvaluators = proCount + conCount;

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

	const averageEvaluation = totalEvaluators > 0 ? sumEvaluations / totalEvaluators : 0;
	const agreement = calcAgreement(sumEvaluations, sumSquaredEvaluations, totalEvaluators);
	const consensusValid = calculateConsensusValid(
		agreement,
		(statement as Statement & { popperHebbianScore?: PopperHebbianScore }).popperHebbianScore ??
			undefined,
	);

	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: totalEvaluators,
		numberOfProEvaluators: proCount,
		numberOfConEvaluators: conCount,
		sumEvaluations,
		sumSquaredEvaluations,
		sumPro,
		sumCon,
		averageEvaluation,
		agreement,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};

	return {
		payload: {
			evaluation: updatedEvaluation,
			totalEvaluators,
			consensus: agreement,
			consensusValid,
			proSum: sumPro,
			conSum: sumCon,
		},
		fix: {
			statementId: clusterId,
			statementText: statement.statement?.substring(0, 50),
			isClusterOption: true,
			before: { ...before, consensus: statement.consensus ?? 0 },
			after: {
				numberOfEvaluators: totalEvaluators,
				numberOfProEvaluators: proCount,
				numberOfConEvaluators: conCount,
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
