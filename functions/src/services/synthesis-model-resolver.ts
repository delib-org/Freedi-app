import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { LLM_MODEL_FAST, LLM_MODEL_HEAVY } from '../config/gemini';

/**
 * Which model tier does THIS question's synthesis run at?
 *
 * The synthesis-writing call (`generateSynthesizedProposal`) is the pipeline's
 * single biggest cost — it writes a full multi-paragraph proposal per merge on
 * the heavy model (measured: ~61% of total LLM spend, and the heavy model is
 * ~6× the fast model per output token). Most of that value is only needed for
 * high-stakes events; a routine question can be synthesised on the fast model
 * at a fraction of the cost.
 *
 * So the tier is per-question, exactly like the embedding model
 * (embedding-model-resolver.ts):
 *   - 'standard' → fast model for synthesis (much cheaper; the default)
 *   - 'premium'  → heavy model for synthesis (best quality; opt-in per event)
 * The theme/placement judges are already on the fast model in both tiers; only
 * the expensive synthesis writer changes.
 *
 * Storage: `statementSettings.synthesis.modelTier` on the question — the same
 * per-question settings block the pipeline already reads. Absent → 'standard'
 * (the measured-safe default); an admin opts a high-stakes event up to
 * 'premium'.
 *
 * Fail-open and TTL-cached: an unreadable question resolves to 'standard'
 * (the default), and resolutions are cached per instance for a few
 * minutes so threading this through the hot path costs one question read per
 * parent per TTL. A just-changed tier is seen by other warm instances within
 * the TTL — a cost/quality choice, never a correctness one.
 */

export type ModelTier = 'premium' | 'standard';

export function isModelTier(value: unknown): value is ModelTier {
	return value === 'premium' || value === 'standard';
}

/** The heavy-tier model a given tier resolves to for synthesis writing. */
export function synthesisModelForTier(tier: ModelTier): string {
	return tier === 'standard' ? LLM_MODEL_FAST : LLM_MODEL_HEAVY;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { tier: ModelTier; at: number }>();

/** The synthesis model tier in force for a question. No parentId → 'standard'. */
export async function resolveModelTier(parentId?: string | null): Promise<ModelTier> {
	if (!parentId) return 'standard';

	const hit = cache.get(parentId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tier;

	let tier: ModelTier = 'standard';
	try {
		const doc = await getFirestore().collection('statements').doc(parentId).get();
		const settings = doc.data()?.statementSettings as
			| { synthesis?: { modelTier?: unknown } }
			| undefined;
		const stored = settings?.synthesis?.modelTier;
		if (isModelTier(stored)) tier = stored;
		else if (stored !== undefined) {
			logger.warn('synthesisModelResolver: ignoring unknown tier', { parentId, stored });
		}
	} catch (error) {
		logger.warn('synthesisModelResolver: question read failed, using premium', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	cache.set(parentId, { tier, at: Date.now() });

	return tier;
}

/** Resolve straight to the model name for a question's synthesis writing. */
export async function resolveSynthesisModel(parentId?: string | null): Promise<string> {
	return synthesisModelForTier(await resolveModelTier(parentId));
}

/** Drop cached tiers — after a settings save changes the tier. */
export function invalidateModelTierCache(parentId?: string): void {
	if (parentId) cache.delete(parentId);
	else cache.clear();
}
