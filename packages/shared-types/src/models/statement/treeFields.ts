/** What a new child needs from its parent to place itself in the tree. */
export interface TreeParent {
	statementId: string;
	parentId?: string;
	topParentId?: string;
}

/**
 * The `topParentId` a child of `parent` must carry, as the database rules check
 * it. A child of a top statement takes the top's id: some tops (Agora and
 * Odyssey roots) store 'top' as their own topParentId, and copying that would
 * be refused. Any other child copies its parent's.
 */
export function childTopParentId(parent: TreeParent): string {
	// An unknown parentId copies, as before: callers that hold only the id and
	// topParentId of a parent keep what they wrote.
	if (parent.parentId === 'top') return parent.statementId;

	return parent.topParentId || parent.statementId;
}
