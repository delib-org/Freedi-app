import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { judgeSemanticEquivalence } from '../../services/semantic-equivalence-service';
import { computeMedoid } from './computeMedoid';
import { mergeClusters } from './mergeClusters';
import { isCluster } from './clusterOps';

/**
 * Re-judge a pair of cluster medoids. If they're semantically equivalent
 * (LLM returns `'same'`), merge the smaller cluster into the larger. Any
 * other verdict — `related`, `different`, `opposite` — leaves both clusters
 * intact.
 *
 * Used by the gray-band re-judge admin operation. One LLM call per pair.
 * Cached by `verdict-cache-service` so re-running is near-free.
 */

function db() {
	return getFirestore();
}

async function loadStatement(statementId: string): Promise<Statement | null> {
	try {
		const snap = await db().collection(Collections.statements).doc(statementId).get();
		if (!snap.exists) return null;

		return snap.data() as Statement;
	} catch (error) {
		logger.warn('rejudgeMedoidPair: load failed', {
			statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

export async function rejudgeMedoidPair(
	pair: { a: string; b: string },
	questionId: string,
): Promise<void> {
	void questionId;
	const [clusterA, clusterB] = await Promise.all([loadStatement(pair.a), loadStatement(pair.b)]);
	if (!clusterA || !clusterB) {
		logger.info('rejudgeMedoidPair: one or both clusters missing', { pair });

		return;
	}
	if (!isCluster(clusterA) || !isCluster(clusterB)) {
		logger.info('rejudgeMedoidPair: one or both are not clusters', { pair });

		return;
	}

	const [medoidA, medoidB] = await Promise.all([computeMedoid(clusterA), computeMedoid(clusterB)]);
	if (!medoidA || !medoidB) {
		logger.info('rejudgeMedoidPair: medoid computation failed', { pair });

		return;
	}

	const result = await judgeSemanticEquivalence([
		{
			pairId: `${pair.a}|${pair.b}`,
			textA: medoidA.statement,
			textB: medoidB.statement,
		},
	]);

	const verdict = result[0]?.verdict;
	if (verdict !== 'same') {
		logger.info('rejudgeMedoidPair: kept separate', { pair, verdict });

		return;
	}

	// Larger cluster absorbs smaller — keeps the higher-engagement medoid as
	// the canonical title.
	const aMembers = (clusterA.integratedOptions ?? []).length;
	const bMembers = (clusterB.integratedOptions ?? []).length;
	const winner = aMembers >= bMembers ? clusterA : clusterB;
	const loser = winner === clusterA ? clusterB : clusterA;

	await mergeClusters({
		winnerId: winner.statementId,
		loserId: loser.statementId,
		reason: `rejudge verdict=same on medoid pair (${aMembers} vs ${bMembers} members)`,
	});

	logger.info('rejudgeMedoidPair: merged', {
		winner: winner.statementId,
		loser: loser.statementId,
		questionId,
	});
}
