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
	/** Cosine ≥ this → auto-attach without an LLM call. */
	attachThreshold: number;
	/** Cosine in [reviewLowerBound, attachThreshold) → send to admin review (no LLM call). */
	reviewLowerBound: number;
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	enabled: false,
	minEvaluators: 3,
	minConsensus: 0.0,
	// Matches the legacy ATTACH_THRESHOLD in onOptionCreateLive.ts — the value
	// the live-synth path has used in production. Admins can override per
	// question via the synthesis settings UI.
	attachThreshold: 0.92,
	reviewLowerBound: 0.85,
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
		if (!Number.isFinite(settings.minEvaluators) || settings.minEvaluators < 1) {
			errors.push('minEvaluators must be a finite integer ≥ 1');
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
	if (settings.reviewLowerBound !== undefined) {
		if (
			!Number.isFinite(settings.reviewLowerBound) ||
			settings.reviewLowerBound < 0.5 ||
			settings.reviewLowerBound >= 1
		) {
			errors.push('reviewLowerBound must be in [0.5, 1)');
		}
	}
	if (
		settings.reviewLowerBound !== undefined &&
		settings.attachThreshold !== undefined &&
		settings.reviewLowerBound >= settings.attachThreshold
	) {
		errors.push('reviewLowerBound must be strictly less than attachThreshold');
	}

	return { valid: errors.length === 0, errors };
}
