/**
 * Per-question synthesis settings.
 *
 * Stored on `Statement.statementSettings.synthesis`. Because @freedi/shared-types
 * is consumed as a packaged tgz, we don't add this field to the shared schema
 * today — readers cast `statementSettings as Record<string, unknown>` to pull
 * `synthesis` off (same pattern the live-synth featureGate uses for the
 * deprecated `liveSynthEnabled` field).
 */
export interface SynthesisSettings {
	enabled: boolean;
	/** Minimum number of evaluators an option needs before it's considered for synthesis. */
	minEvaluators: number;
	/** Minimum consensus score (0..1) an option needs before it's considered for synthesis. */
	minConsensus: number;
	/** Cosine ≥ this → near-duplicate. Auto-attach to existing synth, else spawn new synth (1 LLM). */
	attachThreshold: number;
	/**
	 * Cosine ≥ this AND < synthLowerBound → distinct ideas worth bundling under
	 * a theme label. Spawn topic-cluster directly via `generateTopicLabel`
	 * (cheap LLM, no synthesis attempt).
	 * Bands order: reviewLowerBound < clusterThreshold ≤ synthLowerBound ≤ attachThreshold.
	 */
	clusterThreshold: number;
	/**
	 * Cosine ≥ this AND < attachThreshold → may be near-duplicates worth
	 * synthesizing. Spawn attempts `generateSynthesizedProposal` (the
	 * full unified-proposal prompt). If the LLM returns `cannotSynthesize`
	 * we fall back to `generateTopicLabel` for a topic-cluster.
	 *
	 * Why a separate lower bound rather than always trying the synth
	 * prompt down to `clusterThreshold`: the synth-judge LLM prompt is
	 * scoped to refuse on *directional conflict* only — it happily
	 * synthesizes any two pro-aligned ideas that share vocabulary. For
	 * cosine bands clearly below near-duplicate territory, that produces
	 * over-merged proposals that erase distinct ideas. Routing those
	 * directly to topic-cluster (a short theme label) preserves the
	 * structural distinction the user submitted and saves an LLM call.
	 */
	synthLowerBound: number;
	/** Cosine in [reviewLowerBound, clusterThreshold) → send to admin review (no LLM call). */
	reviewLowerBound: number;
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	enabled: false,
	// `minEvaluators: 0` means "run the moment the option exists" — the
	// pipeline fires on every option create with no evaluation gate. Admins
	// can raise this in the SynthesisPanel for questions where synthesis
	// should wait for some evaluation signal first.
	minEvaluators: 0,
	minConsensus: 0.0,
	// Three-band geometry, tuned for text-embedding-3-small with proper
	// "Question: <parent text>\nAnswer: <option>" context (see embedding.ts
	// for the matching context contract):
	//   - cosine ≥ 0.85 → near-duplicates → synth (one unified proposal)
	//   - 0.65 ≤ cosine < 0.85 → same topic / different ideas → cluster
	//   - 0.50 ≤ cosine < 0.65 → uncertain → admin review
	//   - cosine < 0.50 → singleton
	// With matched-context embeddings, within-synth paraphrases land at
	// 0.86–0.95, cross-synth same-topic at 0.70–0.83, and cross-topic at
	// 0.50–0.72. Cosine bands overlap somewhat between cross-synth and the
	// review band, which the LLM spawn-judge resolves by deciding synth vs
	// topic-cluster at spawn time.
	attachThreshold: 0.85,
	synthLowerBound: 0.78,
	clusterThreshold: 0.65,
	reviewLowerBound: 0.5,
};

/**
 * For Mass-Consensus questions the legacy default was ON. The new model keeps
 * that behavior — MC questions inherit `enabled: true` unless an admin has
 * explicitly turned it off.
 */
export const MC_DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	...DEFAULT_SYNTHESIS_SETTINGS,
	enabled: true,
};

export interface SettingsValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate a settings object before persisting. Returns ALL errors at once so
 * the admin UI can surface them together rather than one-at-a-time.
 */
export function validateSynthesisSettings(
	settings: Partial<SynthesisSettings>,
): SettingsValidationResult {
	const errors: string[] = [];

	if (settings.minEvaluators !== undefined) {
		if (!Number.isFinite(settings.minEvaluators) || settings.minEvaluators < 0) {
			errors.push('minEvaluators must be a finite integer ≥ 0');
		}
	}
	if (settings.minConsensus !== undefined) {
		if (
			!Number.isFinite(settings.minConsensus) ||
			settings.minConsensus < 0 ||
			settings.minConsensus > 1
		) {
			errors.push('minConsensus must be in [0, 1]');
		}
	}
	if (settings.attachThreshold !== undefined) {
		if (
			!Number.isFinite(settings.attachThreshold) ||
			settings.attachThreshold <= 0 ||
			settings.attachThreshold > 1
		) {
			errors.push('attachThreshold must be in (0, 1]');
		}
	}
	if (settings.synthLowerBound !== undefined) {
		if (
			!Number.isFinite(settings.synthLowerBound) ||
			settings.synthLowerBound <= 0 ||
			settings.synthLowerBound > 1
		) {
			errors.push('synthLowerBound must be in (0, 1]');
		}
	}
	if (settings.clusterThreshold !== undefined) {
		if (
			!Number.isFinite(settings.clusterThreshold) ||
			settings.clusterThreshold <= 0 ||
			settings.clusterThreshold > 1
		) {
			errors.push('clusterThreshold must be in (0, 1]');
		}
	}
	if (settings.reviewLowerBound !== undefined) {
		if (
			!Number.isFinite(settings.reviewLowerBound) ||
			settings.reviewLowerBound < 0 ||
			settings.reviewLowerBound >= 1
		) {
			errors.push('reviewLowerBound must be in [0, 1)');
		}
	}
	// Three-band invariant: reviewLowerBound < clusterThreshold < attachThreshold.
	if (
		settings.reviewLowerBound !== undefined &&
		settings.clusterThreshold !== undefined &&
		settings.reviewLowerBound >= settings.clusterThreshold
	) {
		errors.push('reviewLowerBound must be strictly less than clusterThreshold');
	}
	if (
		settings.clusterThreshold !== undefined &&
		settings.attachThreshold !== undefined &&
		settings.clusterThreshold >= settings.attachThreshold
	) {
		errors.push('clusterThreshold must be strictly less than attachThreshold');
	}
	if (
		settings.reviewLowerBound !== undefined &&
		settings.attachThreshold !== undefined &&
		settings.clusterThreshold === undefined &&
		settings.reviewLowerBound >= settings.attachThreshold
	) {
		errors.push('reviewLowerBound must be strictly less than attachThreshold');
	}
	if (
		settings.synthLowerBound !== undefined &&
		settings.attachThreshold !== undefined &&
		settings.synthLowerBound > settings.attachThreshold
	) {
		errors.push('synthLowerBound must be ≤ attachThreshold');
	}
	if (
		settings.clusterThreshold !== undefined &&
		settings.synthLowerBound !== undefined &&
		settings.clusterThreshold > settings.synthLowerBound
	) {
		errors.push('clusterThreshold must be ≤ synthLowerBound');
	}

	return { valid: errors.length === 0, errors };
}
