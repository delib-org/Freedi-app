import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import {
	classifyAgainstClaims,
	loadClaims,
	logRegistryDecision,
} from '../../services/claim-registry-service';
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

	const claims = await loadClaims(option.parentId);
	if (claims.length === 0) return null;

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
		cosineAtMatch,
		relation: classification.relation,
		confidence: classification.confidence,
		claimCount: claims.length,
	});

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
