import type { Firestore, Query } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';

/** Scope of a tree read: direct children only, or the whole subtree. */
export type TreeScopeMode = 'direct' | 'descendants';

/**
 * The statements under `rootId` — shared by the bulk loader and search so both
 * mean the same thing by "the tree". Descendants rely on the `parents`
 * ancestor list; the root itself is not included.
 */
export function treeScopeQuery(firestore: Firestore, rootId: string, mode: TreeScopeMode): Query {
	const statements = firestore.collection(Collections.statements);

	return mode === 'direct'
		? statements.where('parentId', '==', rootId)
		: statements.where('parents', 'array-contains', rootId);
}
