import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import {
	AUDIT_SAMPLE_RATE,
	auditClassification,
	classifyAgainstClaims,
	loadClaims,
	logRegistryDecision,
	orderClaimsForClassification,
} from '../../services/claim-registry-service';
import { logError } from '../../utils/errorHandling';
import { attachOptionToCluster } from './clusterOps';
import type { SynthesisSettings } from './types';

/**
 * The claim-registry pass (docs/architecture/CLAIM_REGISTRY.md §6).
 *
 * Runs when `claimRegistryEnabled` and the cosine attach passes (1–2) did not
 * place the option — INCLUDING when vector search returned zero candidates,
 * which is exactly the "same meaning, distant embeddings" recall gap the
 * registry exists to close. One gpt-4o-mini call reads the question's full
 * claim codebook, so recall is independent of embedding geometry.
 *
 * Young questions need no special mode: with few statements the cosine passes
 * rarely fire (no clusters, sparse geometry), so the registry is effectively
 * the primary mechanism — and LLM meaning-judgment is calibration-free, unlike
 * the density-tuned cosine bands.
 *
 * Confidence floor: below REGISTRY_MIN_CONFIDENCE a match is treated as no
 * match. The prompt already instructs "when in doubt, none"; this is a second
 * guard against low-conviction attaches.
 */

const REGISTRY_MIN_CONFIDENCE = 0.6;

export interface RegistryPassInput {
	option: Statement;
	parent: Statement;
	settings: SynthesisSettings;
	/** Best cosine evidence per candidate cluster (empty on the zero-candidate path). */
	cosineByCluster: Map<string, number>;
	triggerSource: string;
}

export interface RegistryPassResult {
	attached: boolean;
	clusterId?: string;
	reason: string;
}

function db() {
	return getFirestore();
}

/** Returns null when the pass is disabled, found no codebook, or matched nothing. */
export async function runRegistryPass(
	input: RegistryPassInput,
): Promise<RegistryPassResult | null> {
	const { option, parent, settings, cosineByCluster, triggerSource } = input;
	if (!settings.claimRegistryEnabled) return null;

	const loaded = await loadClaims(option.parentId);
	if (loaded.length === 0) return null;

	// Most-plausible-first mitigates LLM position bias on long codebooks:
	// geometry is demoted from gatekeeper to ranker, its actually-good role.
	const claims = orderClaimsForClassification(loaded, cosineByCluster);

	const classification = await classifyAgainstClaims({
		statementText: option.statement ?? '',
		questionText: parent.statement ?? '',
		claims,
	});

	const cosineAtMatch = classification.matchedClusterId
		? (cosineByCluster.get(classification.matchedClusterId) ?? null)
		: null;

	logRegistryDecision({
		questionId: option.parentId,
		optionId: option.statementId,
		method: 'registry',
		matchedClusterId: classification.matchedClusterId,
		opposedClusterId: classification.opposedClusterId,
		cosineAtMatch,
		relation: classification.relation,
		confidence: classification.confidence,
		claimCount: claims.length,
		...(classification.failedClosed ? { failedClosed: true } : {}),
	});

	// Sampled second-model audit — detached: observes the classifier, never
	// blocks or changes the pipeline decision. A failed-closed primary is not a
	// judgment, so there is nothing to audit (and gpt-4o budget is scarce).
	if (Math.random() < AUDIT_SAMPLE_RATE && !classification.failedClosed) {
		void auditClassification({
			questionId: option.parentId,
			optionId: option.statementId,
			statementText: option.statement ?? '',
			questionText: parent.statement ?? '',
			claims,
			primary: classification,
		});
	}

	// An opposing statement is never attached to the claim it contradicts, but
	// the contradiction itself is structure synthesis wants (pro/con pairing) —
	// record the edge instead of discarding it, then continue to spawn/none.
	if (
		classification.relation === 'opposes' &&
		classification.opposedClusterId &&
		classification.confidence >= REGISTRY_MIN_CONFIDENCE
	) {
		await recordOpposesEdge(option, classification.opposedClusterId);
	}

	if (!classification.matchedClusterId) return null;
	if (classification.confidence < REGISTRY_MIN_CONFIDENCE) {
		logger.info('claimRegistry.pass.lowConfidence', {
			optionId: option.statementId,
			matchedClusterId: classification.matchedClusterId,
			confidence: classification.confidence,
		});

		return null;
	}

	// Re-fetch the matched cluster — loadClaims returns the compact codebook,
	// and the doc may have moved (hidden/merged) since the query.
	const clusterSnap = await db()
		.collection(Collections.statements)
		.doc(classification.matchedClusterId)
		.get();
	if (!clusterSnap.exists) return null;
	const cluster = clusterSnap.data() as Statement;
	if (cluster.isCluster !== true || cluster.hide === true) return null;

	const result = await attachOptionToCluster({
		cluster,
		option,
		similarity: cosineAtMatch ?? 0,
		triggerSource: `${triggerSource}:registry`,
	});
	if (!result.attached) return null;

	return {
		attached: true,
		clusterId: cluster.statementId,
		reason: `registry match confidence=${classification.confidence.toFixed(2)} cosine=${cosineAtMatch === null ? 'n/a' : cosineAtMatch.toFixed(3)}`,
	};
}

/**
 * Persist a statement-opposes-claim edge on both endpoints: the option carries
 * `opposesClusterId`, the opposed cluster accumulates `counterStatementIds`.
 * Fail-soft — the edge is enrichment, never a pipeline gate.
 */
async function recordOpposesEdge(option: Statement, opposedClusterId: string): Promise<void> {
	const now = Date.now();
	try {
		await db().collection(Collections.statements).doc(option.statementId).update({
			opposesClusterId: opposedClusterId,
			lastUpdate: now,
		});
		await db()
			.collection(Collections.statements)
			.doc(opposedClusterId)
			.update({
				counterStatementIds: FieldValue.arrayUnion(option.statementId),
				lastUpdate: now,
			});
		logger.info('claimRegistry.opposesEdge', {
			optionId: option.statementId,
			opposedClusterId,
		});
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.recordOpposesEdge',
			statementId: option.statementId,
			metadata: { opposedClusterId },
		});
	}
}
