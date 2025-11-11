import { Statement } from 'delib-npm';
import { PopperHebbianScore } from 'delib-npm/dist/models/popper/popperTypes';

/**
 * Configuration for consensusValid calculation
 */
export interface ConsensusValidConfig {
	consensusWeight: number; // Weight for consensus component (default: 0.5)
	corroborationWeight: number; // Weight for corroboration component (default: 0.5)
	consensusSigmoidFactor: number; // Scaling factor for consensus normalization (default: 20)
}

const DEFAULT_CONFIG: ConsensusValidConfig = {
	consensusWeight: 0.5,
	corroborationWeight: 0.5,
	consensusSigmoidFactor: 20
};

/**
 * Calculate corroboration level from raw totalScore
 *
 * Maps unbounded totalScore to [0, 1] range using sigmoid function:
 * - 0 = Falsified / strongly challenged
 * - 0.5 = No evidence yet (neutral/agnostic starting point)
 * - 1 = Highly corroborated / strongly supported
 *
 * @param totalScore - Raw sum of (support × weight) from all evidence posts
 * @param evidenceCount - Number of evidence posts
 * @returns Normalized corroboration level [0, 1]
 */
export function calculateCorroborationLevel(
	totalScore: number,
	evidenceCount: number
): number {
	// Special case: No evidence yet = neutral/agnostic
	if (evidenceCount === 0) {
		return 0.5;
	}

	// Normalize using sigmoid function
	// Maps: -∞ → 0, 0 → 0.5, +∞ → 1
	// Scale factor of 2 makes ±2 correspond to ~0.27 and ~0.73
	const corroborationLevel = 1 / (1 + Math.exp(-totalScore / 2));

	return corroborationLevel;
}

/**
 * Normalize consensus score to [0, 1] range using sigmoid function
 *
 * @param consensus - Raw consensus score (typically 0-100+ for popular options)
 * @param sigmoidFactor - Scaling factor (default: 20)
 * @returns Normalized consensus [0, 1]
 */
export function normalizeConsensus(
	consensus: number,
	sigmoidFactor: number = DEFAULT_CONFIG.consensusSigmoidFactor
): number {
	return 1 / (1 + Math.exp(-consensus / sigmoidFactor));
}

/**
 * Calculate combined consensusValid score
 *
 * Integrates traditional voting (consensus) with evidence-based validation (corroborationLevel)
 * to create a unified quality metric.
 *
 * Formula:
 * - normalizedConsensus = 1 / (1 + e^(-consensus/20))
 * - corroborationLevel = from PopperHebbianScore or 0.5 if not available
 * - consensusValid = (w1 × normalizedConsensus) + (w2 × corroborationLevel)
 *
 * @param consensus - Raw consensus score from traditional voting
 * @param popperHebbianScore - Popperian-Hebbian score object (optional)
 * @param config - Configuration for weights and normalization (optional)
 * @returns Combined score [0, 1]
 */
export function calculateConsensusValid(
	consensus: number,
	popperHebbianScore: PopperHebbianScore | undefined,
	config: Partial<ConsensusValidConfig> = {}
): number {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };

	// Normalize consensus to [0, 1]
	const normalizedConsensus = normalizeConsensus(
		consensus,
		finalConfig.consensusSigmoidFactor
	);

	// Get corroboration level (default to 0.5 if no Popper-Hebbian score)
	const corroborationLevel = popperHebbianScore?.corroborationLevel ?? 0.5;

	// Calculate weighted average
	const consensusValid =
		finalConfig.consensusWeight * normalizedConsensus +
		finalConfig.corroborationWeight * corroborationLevel;

	return consensusValid;
}

/**
 * Determine status based on corroboration level
 *
 * @param corroborationLevel - Normalized corroboration level [0, 1]
 * @returns Status indicator
 */
export function determineStatus(
	corroborationLevel: number
): 'looking-good' | 'under-discussion' | 'needs-fixing' {
	if (corroborationLevel >= 0.7) {
		return 'looking-good'; // Well corroborated
	} else if (corroborationLevel <= 0.3) {
		return 'needs-fixing'; // Falsified / challenged
	} else {
		return 'under-discussion'; // Balanced / developing
	}
}
