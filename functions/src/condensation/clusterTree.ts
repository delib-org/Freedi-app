import type { Evaluation, Statement } from '@freedi/shared-types';

/**
 * The ONE vote-counting rule for nested clusters (theme -> synthesis ->
 * options), shared by every writer and reader of a cluster score.
 *
 * `effective(user, node)`:
 *   1. the user's direct vote on the node, if any;
 *   2. else, if the user voted on any of `node.absorbedClusterIds`, the
 *      average of those votes;
 *   3. else the average of `effective(user, child)` over the node's member
 *      children for which it is not null;
 *   4. else null (the user did not take part in this subtree).
 *
 * A user therefore counts once per node, a direct vote on a synthesis outranks
 * that user's votes on the synthesis's members, and a theme averages one
 * effective value per member.
 *
 * This file is pure: callers supply the statement lookup.
 */

/** Hard cap on nesting (root = depth 0); deeper members become leaves. */
export const CLUSTER_TREE_MAX_DEPTH = 6;

/** The statement fields the tree needs. */
export type ClusterStatementLike = Pick<
	Statement,
	'isCluster' | 'integratedOptions' | 'absorbedClusterIds'
>;

export interface ClusterNode {
	id: string;
	absorbedClusterIds: string[];
	children: ClusterNode[];
}

export interface BuildClusterTreeOptions {
	maxDepth?: number;
}

type EvaluationValue = Pick<Evaluation, 'evaluation'>;

/** True when the statement is a cluster that can hold members of its own. */
export function isClusterLike(statement: ClusterStatementLike | undefined): boolean {
	if (!statement) return false;

	return statement.isCluster === true || (statement.integratedOptions ?? []).length > 0;
}

/**
 * Build the member tree under `rootId`. Each `integratedOptions` entry that is
 * itself a cluster becomes a child node with its own members; plain options
 * (and ids the lookup does not know) are leaves. An id already on the current
 * path is skipped (cycle guard); nodes at `maxDepth` are not expanded.
 */
export function buildClusterTree(
	rootId: string,
	getStatement: (id: string) => ClusterStatementLike | undefined,
	{ maxDepth = CLUSTER_TREE_MAX_DEPTH }: BuildClusterTreeOptions = {},
): ClusterNode {
	const build = (id: string, path: ReadonlySet<string>, depth: number): ClusterNode => {
		const statement = getStatement(id);
		const node: ClusterNode = {
			id,
			absorbedClusterIds: [...(statement?.absorbedClusterIds ?? [])],
			children: [],
		};
		const expandable = depth < maxDepth && (depth === 0 || isClusterLike(statement));
		if (!expandable || !statement) return node;

		const nextPath = new Set(path).add(id);
		for (const memberId of new Set(statement.integratedOptions ?? [])) {
			if (nextPath.has(memberId)) continue;
			node.children.push(build(memberId, nextPath, depth + 1));
		}

		return node;
	};

	return build(rootId, new Set(), 0);
}

/**
 * Every statement whose evaluations feed the root's score: all node ids in the
 * tree plus every node's absorbed clusters (their direct votes count). Deduped.
 */
export function collectTreeIds(tree: ClusterNode): string[] {
	const ids = new Set<string>();
	const walk = (node: ClusterNode): void => {
		ids.add(node.id);
		node.absorbedClusterIds.forEach((id) => ids.add(id));
		node.children.forEach(walk);
	};
	walk(tree);

	return [...ids];
}

/** Ids of the nodes that have members of their own (the nested clusters). */
export function collectInnerNodeIds(tree: ClusterNode): string[] {
	const ids = new Set<string>();
	const walk = (node: ClusterNode): void => {
		if (node.children.length > 0) ids.add(node.id);
		node.children.forEach(walk);
	};
	walk(tree);

	return [...ids];
}

function average(values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * One user's effective vote on the root of `tree` (rule above). The map holds
 * that user's evaluations keyed by the statement they were cast on.
 */
export function computeEffectiveTreeVote(
	tree: ClusterNode,
	userEvalsByStatementId: ReadonlyMap<string, EvaluationValue>,
): number | null {
	const direct = userEvalsByStatementId.get(tree.id);
	if (direct) return direct.evaluation;

	const absorbed = tree.absorbedClusterIds
		.map((id) => userEvalsByStatementId.get(id))
		.filter((e): e is EvaluationValue => e !== undefined)
		.map((e) => e.evaluation);
	if (absorbed.length > 0) return average(absorbed);

	const fromChildren: number[] = [];
	for (const child of tree.children) {
		const value = computeEffectiveTreeVote(child, userEvalsByStatementId);
		if (value !== null) fromChildren.push(value);
	}

	return fromChildren.length > 0 ? average(fromChildren) : null;
}

/** A one-level tree: the cluster with its plain members as leaves. */
export function flatClusterTree(
	clusterId: string,
	absorbedClusterIds: readonly string[] = [],
	memberIds: readonly string[] = [],
): ClusterNode {
	return {
		id: clusterId,
		absorbedClusterIds: [...absorbedClusterIds],
		children: [...new Set(memberIds)].map((id) => ({
			id,
			absorbedClusterIds: [],
			children: [],
		})),
	};
}
