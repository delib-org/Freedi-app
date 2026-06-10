/**
 * Convergence metric (§1.5) — a pluggable `ConvergenceMetric` behind a stable
 * contract. The user's research metric drops in here later via
 * `registerConvergence(...)`.
 *
 * v1 proxy over a question's option children, sorted by C descending:
 *   convergenceIndex = C(1) * (C(1) − C(2))   // ≥2 options: strong leader AND clearly ahead
 *                    = C(1)                    // exactly 1 option
 *                    = 0                        // no options
 * Range [0,1]. Documented as a proxy; replacing it touches only this module.
 */
import type { ConvergenceMetric } from './types';
import { clamp01 } from './corroboration';

export const convergenceV1: ConvergenceMetric = {
  version: 'convergence-v1-leader-gap',
  compute(optionCs: number[]): number {
    if (!optionCs || optionCs.length === 0) return 0;
    const sorted = [...optionCs].sort((a, b) => b - a);
    if (sorted.length === 1) return clamp01(sorted[0]);
    const c1 = sorted[0];
    const c2 = sorted[1];

    return clamp01(c1 * (c1 - c2));
  },
};
