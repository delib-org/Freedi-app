/**
 * Tree-building over a flat `Statement[]`. Two-pass builder that **skips
 * `dialecticSnapshot` nodes** (archived revision snapshots) so they stay out of
 * the main feed (§3). Reads `corroborationScore` / `evidenceStatus` /
 * aggregates straight off the denormalized fields — the heavy `corroboration.ts`
 * pass runs server-side, never here.
 */
import type { Statement } from '@freedi/shared-types';

export interface TreeNode {
	statement: Statement;
	children: TreeNode[];
	depth: number;
}

/**
 * Build a forest rooted at the direct children of `rootId`. Snapshot nodes and
 * their subtrees are excluded.
 */
export function buildTree(statements: Statement[], rootId: string): TreeNode[] {
	const live = statements.filter((s) => !s.dialecticSnapshot);

	const byParent = new Map<string, Statement[]>();
	for (const s of live) {
		const list = byParent.get(s.parentId);
		if (list) list.push(s);
		else byParent.set(s.parentId, [s]);
	}

	const build = (parentId: string, depth: number): TreeNode[] => {
		const kids = byParent.get(parentId) ?? [];

		return kids.map((statement) => ({
			statement,
			depth,
			children: build(statement.statementId, depth + 1),
		}));
	};

	return build(rootId, 0);
}

/** Convenience: sort a node's children — options by C desc, others by createdAt asc. */
export function sortChildren(nodes: TreeNode[]): TreeNode[] {
	return [...nodes].sort((a, b) => {
		const ca = a.statement.corroborationScore;
		const cb = b.statement.corroborationScore;
		if (typeof ca === 'number' && typeof cb === 'number' && ca !== cb) {
			return cb - ca;
		}

		return (a.statement.createdAt ?? 0) - (b.statement.createdAt ?? 0);
	});
}
