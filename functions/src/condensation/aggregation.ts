import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, Evaluation, Statement, StatementEvaluation } from '@freedi/shared-types';
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
}

async function fetchEvaluationsForIds(statementIds: string[]): Promise<Evaluation[]> {
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

	// Group per evaluator and average their evaluations across the set.
	const byUser = new Map<string, number[]>();
	for (const e of evaluations) {
		if (!e.evaluatorId) continue;
		const bucket = byUser.get(e.evaluatorId);
		if (bucket) {
			bucket.push(e.evaluation);
		} else {
			byUser.set(e.evaluatorId, [e.evaluation]);
		}
	}

	const numberOfEvaluators = byUser.size;

	// Preserve any pre-existing evaluationRandomNumber so downstream writers
	// (e.g. the main evaluation updater) don't trip over an undefined field,
	// and stable-order selectors keep working.
	const existingRandom = cluster.evaluation?.evaluationRandomNumber;
	const existingViewed = cluster.evaluation?.viewed;

	if (numberOfEvaluators === 0) {
		// Zero out the evaluation but keep the field present so UI renders.
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
		await clusterDoc.ref.update({ evaluation: empty, consensus: 0, lastUpdate: Date.now() });

		return empty;
	}

	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;
	let numberOfProEvaluators = 0;
	let numberOfConEvaluators = 0;

	byUser.forEach((values) => {
		const avg = values.reduce((a, b) => a + b, 0) / values.length;
		sumEvaluations += avg;
		sumSquaredEvaluations += avg * avg;
		if (avg > 0) {
			numberOfProEvaluators++;
			sumPro += avg;
		} else if (avg < 0) {
			numberOfConEvaluators++;
			sumCon += Math.abs(avg);
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
	const confidenceIndex = targetPopulation > 0
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

	await clusterDoc.ref.update({ evaluation, consensus, lastUpdate: Date.now() });

	logger.info('condensation.recomputeClusterEvaluation', {
		clusterId,
		members: integrated.length,
		numberOfEvaluators,
		consensus,
	});

	return evaluation;
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
