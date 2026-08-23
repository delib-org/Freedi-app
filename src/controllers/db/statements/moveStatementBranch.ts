import { updateDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, executeBatchUpdates, updateTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export type MapSide = 'left' | 'right';

export interface SiblingOrderUpdate {
	statementId: string;
	order: number;
}

interface MoveBranchParams {
	/** The node the user dragged. */
	statement: Statement;
	/** Where it was dropped. */
	newParent: Statement;
	/**
	 * Everything under `statement` (by parentId), so the ancestor chain of the
	 * whole branch travels with it. Pass an empty array for a leaf.
	 */
	subtree: Statement[];
	/**
	 * New `order` values for the destination parent's children, so the node
	 * keeps the position it was dropped at. Optional — a move that only changes
	 * the parent can leave the order alone.
	 */
	siblingOrder?: SiblingOrderUpdate[];
	/**
	 * Which side of the mind-map root the branch lands on. Only meaningful when
	 * the new parent IS the map root; ignored otherwise.
	 */
	mapSide?: MapSide;
}

export interface MoveBranchResult {
	success: boolean;
	error?: string;
}

/**
 * Re-parent a statement AND its entire branch.
 *
 * The map builds its tree from `parentId`, but `parents[]` and `topParentId`
 * drive the descendant queries and listeners. Updating only the dragged node —
 * as the old single-doc path did — left every node beneath it pointing at the
 * ancestor chain it no longer has, so the branch vanished from scoped views and
 * came back in the wrong place after a reload.
 */
export async function moveStatementBranch({
	statement,
	newParent,
	subtree,
	siblingOrder = [],
	mapSide,
}: MoveBranchParams): Promise<MoveBranchResult> {
	try {
		const parentChain = [...(newParent.parents ?? []), newParent.statementId];
		const topParentId = newParent.topParentId ?? newParent.statementId;
		const { lastUpdate } = updateTimestamp();

		// Ancestors of the moved node, which every descendant must drop.
		const oldChain = new Set(statement.parents ?? []);

		const movedOrder = siblingOrder.find(
			(entry) => entry.statementId === statement.statementId,
		)?.order;

		const updates = [
			{
				ref: createStatementRef(statement.statementId),
				data: {
					parentId: newParent.statementId,
					parents: parentChain,
					topParentId,
					lastUpdate,
					...(typeof movedOrder === 'number' ? { order: movedOrder } : {}),
					...(mapSide ? { mapSide } : {}),
				},
			},
			...subtree.map((descendant) => ({
				ref: createStatementRef(descendant.statementId),
				data: {
					// Keep the part of the chain that is internal to the moved branch
					// (between the dragged node and this descendant) and splice the new
					// ancestors in front of it.
					parents: [
						...parentChain,
						...(descendant.parents ?? []).filter(
							(ancestorId) => !oldChain.has(ancestorId) && ancestorId !== newParent.statementId,
						),
					],
					topParentId,
					lastUpdate,
				},
			})),
		];

		// Sibling positions live on the destination parent's other children too,
		// so they ride along in the same batch.
		const movedIds = new Set([statement.statementId, ...subtree.map((s) => s.statementId)]);
		const orderUpdates = siblingOrder
			.filter((entry) => !movedIds.has(entry.statementId))
			.map((entry) => ({
				ref: createStatementRef(entry.statementId),
				data: { order: entry.order, lastUpdate },
			}));

		await executeBatchUpdates([...updates, ...orderUpdates]);

		return { success: true };
	} catch (error) {
		logError(error, {
			operation: 'statements.moveStatementBranch',
			statementId: statement?.statementId,
			metadata: {
				newParentId: newParent?.statementId,
				subtreeSize: subtree.length,
			},
		});

		return { success: false, error: 'Could not move the statement' };
	}
}

/**
 * Persist sibling positions only — used when a drag reorders nodes under the
 * parent they already had, so nothing about the hierarchy changes.
 */
export async function updateSiblingOrder(siblingOrder: SiblingOrderUpdate[]): Promise<void> {
	try {
		if (siblingOrder.length === 0) return;
		const { lastUpdate } = updateTimestamp();

		await executeBatchUpdates(
			siblingOrder.map((entry) => ({
				ref: createStatementRef(entry.statementId),
				data: { order: entry.order, lastUpdate },
			})),
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.updateSiblingOrder',
			metadata: { count: siblingOrder.length },
		});
	}
}

/**
 * Move a first-level branch to the other side of the mind-map root. Nothing
 * about the hierarchy changes — only which side of the subject it hangs from.
 */
export async function updateMapSide(statementId: string, mapSide: MapSide): Promise<void> {
	try {
		const { lastUpdate } = updateTimestamp();
		await updateDoc(createStatementRef(statementId), { mapSide, lastUpdate });
	} catch (error) {
		logError(error, {
			operation: 'statements.updateMapSide',
			statementId,
			metadata: { mapSide },
		});
	}
}
