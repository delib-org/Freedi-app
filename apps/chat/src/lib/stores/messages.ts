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

/** Sort modes offered by the conversation toolbar (mirrors the main app's `SortType`). */
export type SortMode = 'agreement' | 'newest' | 'discussed';

export interface SortOption {
	id: SortMode;
	label: string;
}

/** Order here is the fan-out order in the sort menu. `agreement` is the default. */
export const SORT_OPTIONS: SortOption[] = [
	{ id: 'agreement', label: 'Agreement' },
	{ id: 'newest', label: 'New' },
	{ id: 'discussed', label: 'Discussed' },
];

/** Raw evaluation count is denormalized onto the statement, not in the shared schema. */
function evalCountOf(node: TreeNode): number {
	const x = node.statement as Statement & { evaluationCount?: number };

	return typeof x.evaluationCount === 'number' ? x.evaluationCount : 0;
}

const byCreatedAtAsc = (a: TreeNode, b: TreeNode): number =>
	(a.statement.createdAt ?? 0) - (b.statement.createdAt ?? 0);

/**
 * Sort a node's children by the chosen mode. `agreement` (the default) keeps the
 * original behaviour: corroboration desc, then oldest-first as a stable tiebreak.
 */
export function sortChildren(nodes: TreeNode[], mode: SortMode = 'agreement'): TreeNode[] {
	const arr = [...nodes];

	switch (mode) {
		case 'newest':
			return arr.sort((a, b) => (b.statement.createdAt ?? 0) - (a.statement.createdAt ?? 0));
		case 'discussed':
			return arr.sort((a, b) => evalCountOf(b) - evalCountOf(a) || byCreatedAtAsc(a, b));
		case 'agreement':
		default:
			return arr.sort((a, b) => {
				const ca = a.statement.corroborationScore;
				const cb = b.statement.corroborationScore;
				if (typeof ca === 'number' && typeof cb === 'number' && ca !== cb) {
					return cb - ca;
				}

				return byCreatedAtAsc(a, b);
			});
	}
}
