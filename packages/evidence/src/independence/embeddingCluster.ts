/**
 * v1 `IndependenceEstimator` (§1b) — pure given embeddings. Discounts a
 * candidate evidence node when it is near-duplicate of an existing sibling, so
 * duplicate/coordinated reports stop multiplying inside the parent's noisy-OR.
 *
 * `independenceFactor = 1 − maxCosine(candidate, siblings)`. With no sibling
 * embeddings, the candidate is treated as fully independent (1).
 *
 * Brittle by design (paraphrase / cross-thread duplication evades it) — this is
 * the primary defense seam and is expected to be replaced (open problem §8).
 */
import type { IndependenceEstimator } from '../types';
import { clamp01 } from '../corroboration';

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];

  return s;
}

export function magnitude(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 0;

  return dot(a, b) / (ma * mb);
}

export const embeddingClusterIndependence: IndependenceEstimator = {
  version: 'independence-v1-embedding-cluster',
  async estimate({ embeddings }): Promise<number> {
    if (!embeddings || embeddings.siblings.length === 0) return 1;
    const sims = embeddings.siblings.map((s) =>
      cosineSimilarity(embeddings.candidate, s),
    );
    const maxSim = sims.reduce((m, v) => (v > m ? v : m), -Infinity);

    return clamp01(1 - maxSim);
  },
};
