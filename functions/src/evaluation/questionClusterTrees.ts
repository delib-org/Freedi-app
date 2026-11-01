import type { Evaluation, Statement } from '@freedi/shared-types';
import { fetchEvaluationsForIds } from '../condensation/aggregation';
import {
	CLUSTER_TREE_MAX_DEPTH,
	ClusterNode,
	ClusterStatementLike,
	buildClusterTree,
	collectTreeIds,
	isClusterLike,
} from '../condensation/clusterTree';
import { fetchStatementsById } from '../condensation/clusterTreeLoader';

/** Member and absorbed ids of the clusters reachable from `rootIds` that are not yet known. */
function unknownIds(
	rootIds: string[],
	known: ReadonlyMap<string, ClusterStatementLike | null>,
): string[] {
	const missing = new Set<string>();
	const seen = new Set<string>();
	const walk = (id: string, depth: number): void => {
		if (seen.has(id) || depth > CLUSTER_TREE_MAX_DEPTH) return;
		seen.add(id);
		const statement = known.get(id);
		if (!statement) return;
		(statement.absorbedClusterIds ?? []).forEach((absorbedId) => {
			if (!known.has(absorbedId)) missing.add(absorbedId);
		});
		if (!isClusterLike(statement)) return;
		for (const memberId of statement.integratedOptions ?? []) {
			if (!known.has(memberId)) missing.add(memberId);
			else walk(memberId, depth + 1);
		}
	};
	rootIds.forEach((id) => walk(id, 0));

	return [...missing];
}

/**
 * Member trees for the clusters of one question, from the statements the bulk
 * recalc already loaded plus ONE batched fetch per extra tree level (members
 * and absorbed clusters outside the loaded set, e.g. synthesis-typed docs).
 *
 * `evalsByStatementId` (the question's evaluations) is extended IN PLACE with
 * the evaluations of tree statements that live outside the question, so the
 * planner sees the same sources `recomputeClusterEvaluation` would read.
 */
export async function buildQuestionClusterTrees(
	questionId: string,
	loaded: ReadonlyMap<string, Statement>,
	clusterIds: string[],
	evalsByStatementId: Map<string, Evaluation[]>,
): Promise<Map<string, ClusterNode>> {
	const known = new Map<string, Statement | null>(loaded);
	for (let level = 0; level <= CLUSTER_TREE_MAX_DEPTH; level++) {
		const missing = unknownIds(clusterIds, known);
		if (missing.length === 0) break;
		(await fetchStatementsById(missing)).forEach((statement, id) => known.set(id, statement));
	}

	const trees = new Map<string, ClusterNode>();
	for (const clusterId of clusterIds) {
		trees.set(
			clusterId,
			buildClusterTree(clusterId, (id) => known.get(id) ?? undefined),
		);
	}

	// Evaluations of tree statements the question's own query could not return:
	// docs of another parent, or ids with no doc, and nothing loaded for them yet.
	const outside = new Set<string>();
	for (const tree of trees.values()) {
		for (const id of collectTreeIds(tree)) {
			const statement = known.get(id);
			const inQuestion = statement ? statement.parentId === questionId : false;
			if (!inQuestion && !evalsByStatementId.has(id)) outside.add(id);
		}
	}
	if (outside.size > 0) {
		for (const e of await fetchEvaluationsForIds([...outside])) {
			const bucket = evalsByStatementId.get(e.statementId);
			if (bucket) bucket.push(e);
			else evalsByStatementId.set(e.statementId, [e]);
		}
	}

	return trees;
}
