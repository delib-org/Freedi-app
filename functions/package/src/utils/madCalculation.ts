/**
 * Mean Absolute Deviation (MAD) Calculation Utilities
 * Used for polarization index and demographic divergence analysis
 */

export interface MadResult {
  /** Mean Absolute Deviation - measures how spread out values are from the mean */
  mad: number;
  /** Arithmetic mean of the values */
  mean: number;
  /** Count of values */
  n: number;
}

/**
 * Calculate Mean Absolute Deviation (MAD) and Mean for a set of values
 *
 * MAD = Σ|valueᵢ - mean| / n
 *
 * Interpretation:
 * - MAD = 0: Complete consensus (all values identical)
 * - MAD = 0.5: Moderate division
 * - MAD = 1: Maximum polarization (values at opposite extremes)
 *
 * @param values - Array of numeric values (typically -1 to +1 for evaluations)
 * @returns Object containing mad, mean, and n
 */
export function calcMadAndMean(values: number[]): MadResult {
  if (values.length === 0) {
    return { mad: 0, mean: 0, n: 0 };
  }

  if (values.length === 1) {
    return { mad: 0, mean: values[0], n: 1 };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

  return { mad, mean, n: values.length };
}

/**
 * Calculate Demographic Collaboration Index (DCI) between two groups
 *
 * DCI measures how much two groups agree based on their mean positions
 *
 * DCI = 1 - (|meanA - meanB| / 2)
 *
 * @param meanA - Mean position of group A (-1 to +1)
 * @param meanB - Mean position of group B (-1 to +1)
 * @returns DCI value from 0 (maximum disagreement) to 1 (perfect agreement)
 */
export function calculateDCI(meanA: number, meanB: number): number {
  const divergence = Math.abs(meanA - meanB) / 2;

  return 1 - divergence;
}

/**
 * Constants for demographic analysis
 */
export const DEMOGRAPHIC_CONSTANTS = {
  /** Minimum segment size for k-anonymity */
  MIN_SEGMENT_SIZE: 5,

  /** Divergence thresholds for interpretation */
  DIVERGENCE: {
    LOW: 0.2,
    MEDIUM_LOW: 0.4,
    MEDIUM_HIGH: 0.6,
    HIGH: 0.8,
  },

  /** DCI thresholds for interpretation */
  DCI: {
    STRONG_AGREEMENT: 0.8,
    GOOD_AGREEMENT: 0.6,
    MODERATE: 0.4,
    WEAK_AGREEMENT: 0.2,
  },
} as const;

/**
 * Check if a segment size meets the k-anonymity threshold
 */
export function meetsKAnonymity(segmentSize: number): boolean {
  return segmentSize >= DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;
}

/**
 * Interpret a divergence (groupsMAD) value
 */
export function interpretDivergence(groupsMAD: number): string {
  if (groupsMAD <= DEMOGRAPHIC_CONSTANTS.DIVERGENCE.LOW) {
    return 'low';
  }
  if (groupsMAD <= DEMOGRAPHIC_CONSTANTS.DIVERGENCE.MEDIUM_LOW) {
    return 'medium-low';
  }
  if (groupsMAD <= DEMOGRAPHIC_CONSTANTS.DIVERGENCE.MEDIUM_HIGH) {
    return 'medium-high';
  }

  return 'high';
}

/**
 * Interpret a DCI value
 */
export function interpretDCI(dci: number): string {
  if (dci >= DEMOGRAPHIC_CONSTANTS.DCI.STRONG_AGREEMENT) {
    return 'strong-agreement';
  }
  if (dci >= DEMOGRAPHIC_CONSTANTS.DCI.GOOD_AGREEMENT) {
    return 'good-agreement';
  }
  if (dci >= DEMOGRAPHIC_CONSTANTS.DCI.MODERATE) {
    return 'moderate';
  }
  if (dci >= DEMOGRAPHIC_CONSTANTS.DCI.WEAK_AGREEMENT) {
    return 'weak-agreement';
  }

  return 'opposing';
}
