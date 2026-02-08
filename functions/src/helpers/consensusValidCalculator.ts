import { PopperHebbianScore } from '@freedi/shared-types';

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

// Hebbian score constants for Popperian-Bayesian formula
const HEBBIAN_CONFIG = {
	FALSIFICATION_STRENGTH: 0.7,   // Max 70% reduction per comment
	CORROBORATION_STRENGTH: 0.15,  // Max ~6% boost per comment
	RECOVERY_RESISTANCE: 0.6,      // Slower recovery from low scores
	FLOOR: 0.05,                   // Never completely dead
	CEILING: 0.95,                 // Never fully proven
	THRESHOLD: 0.6                 // Corroborated threshold
};

/**
 * Evidence type from Statement.evidence
 */
interface Evidence {
	corroborationScore?: number;
	support?: number;
	evidenceType?: string;
	evidenceWeight?: number;
	helpfulCount?: number;
	notHelpfulCount?: number;
}

/**
 * Migrate old support field (-1 to 1) to new corroborationScore (0-1)
 * Also handles reading the new corroborationScore field directly
 */
export function migrateCorroborationScore(evidence: Evidence): number {
	// If new field exists, use it
	if (typeof evidence.corroborationScore === 'number') {
		return evidence.corroborationScore;
	}

	// Migrate from old support field (-1 to 1) → (0 to 1)
	if (typeof evidence.support === 'number') {
		return (evidence.support + 1) / 2;
	}

	// Default to neutral if no data
	return 0.5;
}

/**
 * Update Hebbian score using Popperian-Bayesian formula
 *
 * Properties:
 * - Falsification-sensitive: Strong refutation significantly damages score
 * - Multiplicative updates: Each comment compounds on current score
 * - Recovery resistance: Low scores are harder to improve
 * - Asymmetric: Easier to falsify than corroborate (Popperian)
 *
 * @param currentScore - Current Hebbian score [0, 1]
 * @param corroborationScore - AI classification [0, 1]: 0=falsifies, 0.5=neutral, 1=corroborates
 * @param weight - Evidence credibility weight [0, 1] from evidence type and votes
 * @returns New Hebbian score [0, 1]
 */
export function updateHebbianScore(
	currentScore: number,
	corroborationScore: number,
	weight: number
): number {
	const {
		FALSIFICATION_STRENGTH,
		CORROBORATION_STRENGTH,
		RECOVERY_RESISTANCE,
		FLOOR,
		CEILING
	} = HEBBIAN_CONFIG;

	const isFalsifying = corroborationScore < 0.5;
	const isCorroborating = corroborationScore > 0.5;

	let newScore = currentScore;

	if (isFalsifying) {
		// Falsification: multiplicative damage
		// Map 0-0.5 to 1-0 (0 = max falsification, 0.5 = no falsification)
		const falsificationStrength = (0.5 - corroborationScore) * 2;
		const damage = falsificationStrength * FALSIFICATION_STRENGTH * weight;
		newScore = currentScore * (1 - damage);
	} else if (isCorroborating) {
		// Corroboration: additive boost with diminishing returns
		// Map 0.5-1 to 0-1 (0.5 = no corroboration, 1 = max corroboration)
		const corroborationStrength = (corroborationScore - 0.5) * 2;
		const headroom = CEILING - currentScore;
		const resistanceFactor = 1 - RECOVERY_RESISTANCE * (1 - currentScore);
		const boost = corroborationStrength * CORROBORATION_STRENGTH * weight * headroom * resistanceFactor;
		newScore = currentScore + boost;
	}

	// Clamp to valid range
	return Math.max(FLOOR, Math.min(CEILING, newScore));
}

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
 * Integrates traditional voting (consensus) with evidence-based validation (hebbianScore)
 * to create a unified quality metric.
 *
 * Formula:
 * - normalizedConsensus = 1 / (1 + e^(-consensus/20))
 * - hebbianScore = from PopperHebbianScore or 0.6 (PRIOR) if not available
 * - consensusValid = (w1 × normalizedConsensus) + (w2 × hebbianScore)
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

	// Get Hebbian score (default to 0.6 PRIOR if no Popper-Hebbian score)
	// Use hebbianScore if available, fallback to corroborationLevel for backward compatibility
	const hebbianScore = (popperHebbianScore as { hebbianScore?: number })?.hebbianScore
		?? popperHebbianScore?.corroborationLevel
		?? 0.6;

	// Calculate weighted average
	const consensusValid =
		finalConfig.consensusWeight * normalizedConsensus +
		finalConfig.corroborationWeight * hebbianScore;

	return consensusValid;
}

/**
 * Determine status based on Hebbian score
 *
 * Uses threshold of 0.6:
 * - >= 0.6: looking-good (corroborated)
 * - 0.4 - 0.6: under-discussion (developing)
 * - <= 0.4: needs-fixing (falsified)
 *
 * @param hebbianScore - Hebbian score [0, 1]
 * @returns Status indicator
 */
export function determineStatus(
	hebbianScore: number
): 'looking-good' | 'under-discussion' | 'needs-fixing' {
	if (hebbianScore >= HEBBIAN_CONFIG.THRESHOLD) {
		return 'looking-good'; // Well corroborated
	} else if (hebbianScore <= 0.4) {
		return 'needs-fixing'; // Falsified / challenged
	} else {
		return 'under-discussion'; // Balanced / developing
	}
}
