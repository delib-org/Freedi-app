/** Drag-to-reorder controller for Mithril views.
 *
 *  Both the MainHub (sub-questions) and the Main page (my workspaces) want
 *  the same affordance: an admin grabs a card, drags it onto another card,
 *  and the list rewrites itself. Rather than copy the drag-state machine in
 *  every view, this module exposes a small factory that returns an isolated
 *  controller with self-managed `draggingId`, `dropTargetId`, and
 *  `pendingOrder` plus the event-handler bundles a view spreads onto the
 *  card / list / end-drop elements.
 *
 *  After a drop, the controller calls `onCommit(orderedIds)` and keeps the
 *  optimistic order live until the promise settles, so the list stays in the
 *  new position even before the persistence layer (Firestore, localStorage)
 *  confirms.
 */

import m from 'mithril';

interface ReorderOptions {
	/** Persist the new order. Called once per drop, after drag state has been
	 *  cleared. The controller keeps `pendingOrder` in effect until this
	 *  resolves so the optimistic order stays visible. */
	onCommit: (orderedIds: string[]) => void | Promise<void>;
	/** Optional gate — when present and falsy, all attrs become no-ops so the
	 *  cards aren't draggable for non-admins / read-only viewers. */
	enabled?: () => boolean;
}

interface CardAttrs {
	draggable?: boolean;
	ondragstart?: (e: DragEvent) => void;
	ondragover?: (e: DragEvent) => void;
	ondragleave?: () => void;
	ondrop?: (e: DragEvent) => void;
	ondragend?: () => void;
}

interface ListAttrs {
	ondragover?: (e: DragEvent) => void;
}

interface EndDropAttrs {
	ondragover: (e: DragEvent) => void;
	ondrop: (e: DragEvent) => void;
}

export interface DragReorder {
	/** True while a card is being dragged — used to conditionally render the
	 *  end-drop zone. */
	isActive(): boolean;
	isDragging(id: string): boolean;
	isDropTarget(id: string): boolean;
	/** Apply the optimistic post-drop order to a list, if any. Pure — pass any
	 *  ID extractor; safe to call every render. */
	applyOrder<T>(items: T[], getId: (item: T) => string): T[];
	/** Cleared on view init / unmount to drop stale drag state from a previous
	 *  mount of the same controller (module-level instances persist across
	 *  Mithril mounts). */
	reset(): void;
	cardAttrs(id: string, currentIds: string[]): CardAttrs;
	listAttrs(): ListAttrs;
	endDropAttrs(currentIds: string[]): EndDropAttrs;
}

/** Sentinel target id for "drop after the last card". Kept out of the public
 *  surface — callers don't pass ids; the end-drop zone is wired internally. */
const END = '__end__';

function reorderForDrop(
	currentIds: string[],
	draggingId: string,
	targetId: string,
): string[] | null {
	if (!currentIds.includes(draggingId)) return null;
	const without = currentIds.filter((id) => id !== draggingId);
	if (targetId === END) return [...without, draggingId];
	const targetIdx = without.indexOf(targetId);
	if (targetIdx === -1) return null;

	return [...without.slice(0, targetIdx), draggingId, ...without.slice(targetIdx)];
}

function reorderByIds<T>(items: T[], orderedIds: string[], getId: (item: T) => string): T[] {
	const byId = new Map(items.map((item) => [getId(item), item]));
	const result: T[] = [];
	for (const id of orderedIds) {
		const item = byId.get(id);
		if (item) {
			result.push(item);
			byId.delete(id);
		}
	}
	// Items that arrived after the optimistic snapshot are appended so they
	// don't disappear from the view between the drop and the commit.
	for (const item of byId.values()) result.push(item);

	return result;
}

export function createDragReorder(options: ReorderOptions): DragReorder {
	let draggingId: string | null = null;
	let dropTargetId: string | null = null;
	let pendingOrder: string[] | null = null;

	function isAllowed(): boolean {
		return options.enabled ? options.enabled() : true;
	}

	function clearDragState(): void {
		draggingId = null;
		dropTargetId = null;
	}

	async function commit(targetId: string, currentIds: string[]): Promise<void> {
		const dragId = draggingId;
		clearDragState();
		if (!dragId || dragId === targetId) {
			m.redraw();

			return;
		}
		const reordered = reorderForDrop(currentIds, dragId, targetId);
		if (!reordered) {
			m.redraw();

			return;
		}
		pendingOrder = reordered;
		m.redraw();
		try {
			await options.onCommit(reordered);
		} catch (err) {
			console.error('[dragReorder] commit failed:', err);
		} finally {
			pendingOrder = null;
			m.redraw();
		}
	}

	return {
		isActive: () => draggingId !== null,
		isDragging: (id) => draggingId === id,
		isDropTarget: (id) => dropTargetId === id && draggingId !== id,
		applyOrder<T>(items: T[], getId: (item: T) => string): T[] {
			if (!pendingOrder) return items;

			return reorderByIds(items, pendingOrder, getId);
		},
		reset() {
			clearDragState();
			pendingOrder = null;
		},

		cardAttrs(id, currentIds) {
			if (!isAllowed()) return {};

			return {
				draggable: true,
				ondragstart: (e: DragEvent) => {
					draggingId = id;
					dropTargetId = null;
					if (e.dataTransfer) {
						e.dataTransfer.effectAllowed = 'move';
						// Some browsers require text data to permit drop.
						e.dataTransfer.setData('text/plain', id);
					}
					m.redraw();
				},
				ondragover: (e: DragEvent) => {
					if (!draggingId || draggingId === id) return;
					e.preventDefault();
					if (dropTargetId !== id) {
						dropTargetId = id;
						m.redraw();
					}
				},
				ondragleave: () => {
					if (dropTargetId === id) {
						dropTargetId = null;
						m.redraw();
					}
				},
				ondrop: (e: DragEvent) => {
					if (!draggingId || draggingId === id) {
						clearDragState();
						m.redraw();

						return;
					}
					e.preventDefault();
					void commit(id, currentIds);
				},
				ondragend: () => {
					clearDragState();
					m.redraw();
				},
			};
		},

		listAttrs() {
			if (!isAllowed()) return {};

			return {
				// Allow drop on the list-end gap — without this the browser
				// rejects the drop event on container padding.
				ondragover: (e: DragEvent) => {
					if (!draggingId) return;
					e.preventDefault();
				},
			};
		},

		endDropAttrs(currentIds) {
			return {
				ondragover: (e: DragEvent) => {
					e.preventDefault();
					if (dropTargetId !== END) {
						dropTargetId = END;
						m.redraw();
					}
				},
				ondrop: (e: DragEvent) => {
					e.preventDefault();
					void commit(END, currentIds);
				},
			};
		},
	};
}
