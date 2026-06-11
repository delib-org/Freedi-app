/**
 * Cluster-diverse batch selection for the serving algorithm
 *
 * Spreads each evaluation batch across different clusters (round-robin) so
 * users don't get several near-identical statements in one view, and rotates
 * to clusters the user hasn't seen yet on subsequent batches.
 *
 * Cluster membership is derived from the cluster docs' `integratedOptions`
 * arrays — the live-synth pipeline only writes membership on the cluster doc
 * (see functions/src/synthesis/pipeline/clusterOps.ts), never `integratedInto`
 * on members. `integratedInto` is honored as a legacy fallback (written by the
 * older integration path).
 */

import { Statement } from '@freedi/shared-types';
import { isDerivedStatement } from './derivedStatements';

/**
 * Build a memberId -> clusterId map from the cluster docs present in a
 * statement list. Only live (not hidden/dissolved) derived docs with a
 * non-empty `integratedOptions` array contribute. First claim wins —
 * the pipeline maintains a one-owner invariant per option.
 *
 * @param statements - Raw statements (originals AND cluster docs mixed)
 */
export function buildClusterMembershipMap(statements: Statement[]): Map<string, string> {
  const membership = new Map<string, string>();

  for (const statement of statements) {
    if (statement.hide === true) continue;
    if (!isDerivedStatement(statement)) continue;
    if (!Array.isArray(statement.integratedOptions) || statement.integratedOptions.length === 0) {
      continue;
    }

    for (const memberId of statement.integratedOptions) {
      if (!membership.has(memberId)) {
        membership.set(memberId, statement.statementId);
      }
    }
  }

  return membership;
}

/**
 * Resolve the cluster key of a servable statement.
 * Precedence: membership map -> legacy `integratedInto` -> own id (singleton).
 *
 * @param statement - A servable original statement
 * @param membership - memberId -> clusterId map from buildClusterMembershipMap
 */
export function getClusterKey(
  statement: Statement,
  membership: ReadonlyMap<string, string>
): string {
  return (
    membership.get(statement.statementId) ??
    statement.integratedInto ??
    statement.statementId
  );
}

/**
 * Map statements the user already evaluated / was shown to their cluster keys,
 * so subsequent batches can prefer clusters the user hasn't met yet.
 *
 * @param seenStatementIds - IDs the user evaluated or was already served
 * @param membership - memberId -> clusterId map
 */
export function deriveSeenClusters(
  seenStatementIds: ReadonlySet<string>,
  membership: ReadonlyMap<string, string>
): Set<string> {
  const seenClusters = new Set<string>();

  for (const statementId of seenStatementIds) {
    seenClusters.add(membership.get(statementId) ?? statementId);
  }

  return seenClusters;
}

/**
 * Cluster round-robin selection.
 *
 * `candidates` must be pre-ordered by the caller: descending priority for the
 * adaptive path, pre-shuffled for the random path. The function is fully
 * deterministic — no randomness inside.
 *
 * Selection order:
 * 1. Clusters are visited in the order of their best (first) member, with
 *    clusters NOT in `seenClusters` before seen ones (cross-batch rotation).
 * 2. Each pass takes the next unconsumed member from each cluster; passes
 *    repeat until `size` items are selected or candidates are exhausted.
 *
 * With no clusters every candidate is its own singleton, so pass 1 returns
 * the plain top-N slice — identical to pre-diversity behavior.
 *
 * @param candidates - Pre-ordered candidate items
 * @param size - Number of items to select
 * @param clusterKeyOf - Maps an item to its cluster key
 * @param seenClusters - Cluster keys the user already encountered (optional)
 */
export function selectDiverseBatch<T>(
  candidates: readonly T[],
  size: number,
  clusterKeyOf: (item: T) => string,
  seenClusters?: ReadonlySet<string>
): T[] {
  if (size <= 0 || candidates.length === 0) {
    return [];
  }

  // Group by cluster, preserving input order both across clusters
  // (Map insertion order = best-member rank) and within each cluster.
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = clusterKeyOf(candidate);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  // Unseen clusters first, seen clusters after — stable within each partition.
  const unseen: T[][] = [];
  const seen: T[][] = [];
  for (const [key, group] of groups) {
    if (seenClusters?.has(key)) {
      seen.push(group);
    } else {
      unseen.push(group);
    }
  }
  const orderedGroups = [...unseen, ...seen];

  // Round-robin passes: one member per cluster per pass.
  const selected: T[] = [];
  for (let pass = 0; selected.length < size; pass++) {
    let tookAny = false;
    for (const group of orderedGroups) {
      if (pass >= group.length) continue;
      selected.push(group[pass]);
      tookAny = true;
      if (selected.length >= size) break;
    }
    if (!tookAny) break;
  }

  return selected;
}
