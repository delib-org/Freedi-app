import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	ClusterEvaluationLink,
	Collections,
	Evaluation,
	Statement,
	StatementEvaluation,
	getClusterEvaluationLinkId,
} from '@freedi/shared-types';
import {
	calcAgreement,
	calcLikeMindedness,
	calcAgreementIndex,
	calcConfidenceIndex,
	calcMeanSentiment,
	calcSmoothedSEM,
	DEFAULT_SAMPLING_QUALITY,
} from '@freedi/shared-types';

const db = getFirestore();

/**
 * Condensation-specific cluster aggregation.
 *
 * Computes the full StatementEvaluation object for a cluster statement by
 * reading evaluations from:
 *   (a) the cluster statement itself, AND
 *   (b) every statement listed in cluster.integratedOptions
 *
 * Deduplicates per evaluator: if a user evaluated the cluster and/or
 * multiple members, they are counted ONCE using the AVERAGE of their
 * evaluations across the full set. This matches `fn_clusterAggregation`'s
 * framing-based dedup semantics but operates on the non-destructive
 * `integratedOptions` model (originals keep their own parentId and
 * independent evaluation).
 *
 * The resulting StatementEvaluation is written back to
 * `statements/{clusterId}.evaluation` so existing UI selectors pick up
 * aggregated agreement/std/confidence/pro-con stats without modification.
 */

interface AggregationOptions {
	/** Target population for confidence index. Read from the cluster or its
	 *  parent's evaluationSettings when available. */
	targetPopulation?: number;
	samplingQuality?: number;
	/**
	 * When true, a user's direct vote on the cluster (an Evaluation whose
	 * statementId equals `clusterStatementId`) takes precedence over the
	 * average of their member votes. Required by the live-synth path so
	 * direct synth votes override member-vote rollup per the
	 * "one vote per evaluator, direct-wins" model. Default false preserves
	 * the existing condensation-pipeline semantics (per-user average).
	 *
	 * Requires `clusterStatementId` to be set; otherwise falls back to
	 * average behavior.
	 */
	directVoteWins?: boolean;
	/**
	 * The statementId of the cluster being aggregated. Only used when
	 * `directVoteWins` is true. The aggregator inspects each user's
	 * evaluations and uses the one targeting this id (if present)
	 * instead of the per-user average.
	 */
	clusterStatementId?: string;
}

export async function fetchEvaluationsForIds(statementIds: string[]): Promise<Evaluation[]> {
	const BATCH = 30;
	const results: Evaluation[] = [];
	for (let i = 0; i < statementIds.length; i += BATCH) {
		const batch = statementIds.slice(i, i + BATCH);
		if (batch.length === 0) continue;
		const snap = await db
			.collection(Collections.evaluations)
			.where('statementId', 'in', batch)
			.get();
		snap.docs.forEach((doc) => results.push(doc.data() as Evaluation));
	}

	return results;
}

/**
 * Pure, Firestore-free aggregation: given the raw per-user evaluation records
 * that constitute a cluster (direct evals on the cluster + evals on each
 * `integratedOptions` member), compute the aggregated `StatementEvaluation`
 * using per-user dedup+averaging semantics.
 *
 * Returns the aggregated evaluation AND the intermediate `byUser` /
 * `perUserAverages` maps so callers that persist provenance can reuse them
 * without re-running the dedup loop.
 */
export function computeClusterEvaluationFromRawEvals(
	evaluations: Evaluation[],
	options: AggregationOptions = {},
	existingRandom?: number,
	existingViewed?: number,
): {
	evaluation: StatementEvaluation;
	byUser: Map<string, Evaluation[]>;
	perUserAverages: Map<string, number>;
} {
	// Group per evaluator — keep the full Evaluation records so callers can
	// build provenance link docs without an extra fetch.
	const byUser = new Map<string, Evaluation[]>();
	for (const e of evaluations) {
		if (!e.evaluatorId) continue;
		const bucket = byUser.get(e.evaluatorId);
		if (bucket) {
			bucket.push(e);
		} else {
			byUser.set(e.evaluatorId, [e]);
		}
	}

	const numberOfEvaluators = byUser.size;
	const perUserAverages = new Map<string, number>();

	if (numberOfEvaluators === 0) {
		const empty: StatementEvaluation = {
			sumEvaluations: 0,
			agreement: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			averageEvaluation: 0,
			sumSquaredEvaluations: 0,
			standardDeviation: 0,
			agreementIndex: 0,
			likeMindedness: 0,
			confidenceIndex: 0,
			evaluationRandomNumber: existingRandom ?? Math.random(),
			viewed: existingViewed ?? 0,
		};

		return { evaluation: empty, byUser, perUserAverages };
	}

	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;
	let numberOfProEvaluators = 0;
	let numberOfConEvaluators = 0;

	const directWinsActive = options.directVoteWins === true && !!options.clusterStatementId;
	const clusterStatementId = options.clusterStatementId;

	byUser.forEach((userEvals, userId) => {
		// Direct-wins: if the user voted on the cluster itself, use that one
		// value; ignore their member votes for the rollup. Else average across
		// whatever they did vote on (the historical condensation behavior).
		let effective: number;
		if (directWinsActive) {
			const directVote = userEvals.find((e) => e.statementId === clusterStatementId);
			if (directVote) {
				effective = directVote.evaluation;
			} else {
				const values = userEvals.map((e) => e.evaluation);
				effective = values.reduce((a, b) => a + b, 0) / values.length;
			}
		} else {
			const values = userEvals.map((e) => e.evaluation);
			effective = values.reduce((a, b) => a + b, 0) / values.length;
		}
		perUserAverages.set(userId, effective);
		sumEvaluations += effective;
		sumSquaredEvaluations += effective * effective;
		if (effective > 0) {
			numberOfProEvaluators++;
			sumPro += effective;
		} else if (effective < 0) {
			numberOfConEvaluators++;
			sumCon += Math.abs(effective);
		}
	});

	const averageEvaluation = calcMeanSentiment(sumEvaluations, numberOfEvaluators);
	const consensus = calcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
	const agreementIndex = calcAgreementIndex(
		sumEvaluations,
		sumSquaredEvaluations,
		numberOfEvaluators,
	);
	const likeMindedness = calcLikeMindedness(
		sumEvaluations,
		sumSquaredEvaluations,
		numberOfEvaluators,
	);
	const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
	const standardDeviation = sem * Math.sqrt(numberOfEvaluators + 2);

	const targetPopulation = options.targetPopulation ?? 0;
	const samplingQuality = options.samplingQuality ?? DEFAULT_SAMPLING_QUALITY;
	const confidenceIndex =
		targetPopulation > 0
			? calcConfidenceIndex(numberOfEvaluators, targetPopulation, samplingQuality)
			: likeMindedness; // fall back to like-mindedness when no N is configured

	const evaluation: StatementEvaluation = {
		sumEvaluations,
		agreement: consensus, // semantically equivalent; existing UI reads this
		numberOfEvaluators,
		sumPro,
		sumCon,
		numberOfProEvaluators,
		numberOfConEvaluators,
		averageEvaluation,
		sumSquaredEvaluations,
		standardDeviation,
		agreementIndex,
		likeMindedness,
		confidenceIndex,
		evaluationRandomNumber: existingRandom ?? Math.random(),
		viewed: existingViewed ?? 0,
	};

	return { evaluation, byUser, perUserAverages };
}

/**
 * Recompute and write the cluster's aggregated StatementEvaluation.
 * Safe to call on non-cluster statements (no-op returns null).
 */
export async function recomputeClusterEvaluation(
	clusterId: string,
	options: AggregationOptions = {},
): Promise<StatementEvaluation | null> {
	const clusterDoc = await db.collection(Collections.statements).doc(clusterId).get();
	if (!clusterDoc.exists) return null;

	const cluster = clusterDoc.data() as Statement;
	if (cluster.isCluster !== true) return null;

	const integrated = cluster.integratedOptions ?? [];
	const sourceIds = [clusterId, ...integrated]; // include direct evaluations on the cluster

	const evaluations = await fetchEvaluationsForIds(sourceIds);

	// Preserve any pre-existing evaluationRandomNumber so downstream writers
	// (e.g. the main evaluation updater) don't trip over an undefined field,
	// and stable-order selectors keep working.
	const existingRandom = cluster.evaluation?.evaluationRandomNumber;
	const existingViewed = cluster.evaluation?.viewed;

	const { evaluation, byUser, perUserAverages } = computeClusterEvaluationFromRawEvals(
		evaluations,
		options,
		existingRandom,
		existingViewed,
	);

	await clusterDoc.ref.update({
		evaluation,
		consensus: evaluation.agreement,
		lastUpdate: Date.now(),
	});

	// Persist per-user provenance so the admin can see the breakdown and
	// future UI can let users remove / re-evaluate their own contributions.
	// For a zero-evaluator cluster this prunes any stale link docs.
	await syncClusterEvaluationLinks(clusterId, cluster.parentId, byUser, perUserAverages);

	logger.info('condensation.recomputeClusterEvaluation', {
		clusterId,
		members: integrated.length,
		numberOfEvaluators: evaluation.numberOfEvaluators,
		consensus: evaluation.agreement,
	});

	return evaluation;
}

/**
 * Diff the in-memory `byUser` map against existing `clusterEvaluationLinks`
 * for this cluster, then upsert / delete so the collection always matches
 * the current aggregation state. This is the single source of truth for
 * "who contributed what to this cluster."
 */
async function syncClusterEvaluationLinks(
	clusterId: string,
	parentStatementId: string,
	byUser: Map<string, Evaluation[]>,
	perUserAverages?: Map<string, number>,
): Promise<void> {
	const now = Date.now();
	try {
		const existingSnap = await db
			.collection(Collections.clusterEvaluationLinks)
			.where('clusterId', '==', clusterId)
			.get();

		const existingByUser = new Map<string, { id: string; createdAt?: number }>();
		existingSnap.docs.forEach((d) => {
			const data = d.data() as Partial<ClusterEvaluationLink>;
			if (data.userId) {
				existingByUser.set(data.userId, { id: d.id, createdAt: data.createdAt });
			}
		});

		const toWrite: ClusterEvaluationLink[] = [];
		byUser.forEach((userEvals, userId) => {
			const inheritedFrom: ClusterEvaluationLink['inheritedFrom'] = [];
			let direct: ClusterEvaluationLink['direct'] | undefined;

			for (const e of userEvals) {
				if (e.statementId === clusterId) {
					direct = {
						evaluationId: e.evaluationId,
						value: e.evaluation,
						updatedAt: e.updatedAt,
					};
				} else {
					inheritedFrom.push({
						evaluationId: e.evaluationId,
						sourceStatementId: e.statementId,
						value: e.evaluation,
						updatedAt: e.updatedAt,
					});
				}
			}

			const contributionCount = inheritedFrom.length + (direct ? 1 : 0);
			if (contributionCount === 0) return;

			const linkId = getClusterEvaluationLinkId(clusterId, userId);
			const existing = existingByUser.get(userId);
			toWrite.push({
				linkId,
				clusterId,
				userId,
				parentStatementId,
				inheritedFrom,
				...(direct ? { direct } : {}),
				aggregatedValue: perUserAverages?.get(userId) ?? 0,
				contributionCount,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
			});
		});

		// Delete link docs whose users no longer contribute.
		const currentUserIds = new Set(byUser.keys());
		const toDelete: string[] = [];
		existingByUser.forEach((entry, userId) => {
			if (!currentUserIds.has(userId)) toDelete.push(entry.id);
		});

		// Batch the writes (Firestore 500-op limit — far more than we'd hit).
		const BATCH_CAP = 400;
		const all = [
			...toWrite.map((link) => ({ type: 'set' as const, link })),
			...toDelete.map((id) => ({ type: 'del' as const, id })),
		];
		for (let i = 0; i < all.length; i += BATCH_CAP) {
			const chunk = all.slice(i, i + BATCH_CAP);
			const batch = db.batch();
			for (const op of chunk) {
				if (op.type === 'set') {
					const ref = db.collection(Collections.clusterEvaluationLinks).doc(op.link.linkId);
					batch.set(ref, op.link);
				} else {
					const ref = db.collection(Collections.clusterEvaluationLinks).doc(op.id);
					batch.delete(ref);
				}
			}
			await batch.commit();
		}

		if (toWrite.length || toDelete.length) {
			logger.info('condensation.syncClusterEvaluationLinks', {
				clusterId,
				upserted: toWrite.length,
				deleted: toDelete.length,
			});
		}
	} catch (error) {
		logger.error('condensation.syncClusterEvaluationLinks failed', { clusterId, error });
	}
}

/**
 * Given an evaluation write, find any cluster statements that need recompute.
 * Returns the cluster statement IDs that reference the target statement via
 * `integratedOptions`, plus the target itself if it is a cluster.
 */
export async function findClustersAffectedByEvaluation(statementId: string): Promise<string[]> {
	const affected = new Set<string>();

	// Case 1: the evaluation was on the cluster statement itself.
	const targetDoc = await db.collection(Collections.statements).doc(statementId).get();
	if (targetDoc.exists) {
		const target = targetDoc.data() as Statement;
		if (target.isCluster === true) {
			affected.add(statementId);
		}
	}

	// Case 2: the evaluation was on an original that is part of one or more
	// clusters. Look up clusters via `array-contains integratedOptions`.
	const clustersSnap = await db
		.collection(Collections.statements)
		.where('integratedOptions', 'array-contains', statementId)
		.get();

	clustersSnap.docs.forEach((doc) => affected.add(doc.id));

	return Array.from(affected);
}
