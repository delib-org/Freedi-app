import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Statement } from '@freedi/shared-types';

interface UseNewSolutionsBufferReturn {
	/** Solutions that should be rendered in the list */
	visibleChildren: Statement[];
	/** Number of new solutions waiting in the buffer */
	pendingCount: number;
	/** Flush the buffer — merge pending solutions into the visible list */
	showPending: () => void;
}

const MAX_DISPLAY_COUNT = 50;
const HIGHLIGHT_DURATION_MS = 12_000;

/**
 * Buffers new solutions that arrive after the initial load so the list
 * doesn't constantly reorder during live events.
 *
 * The current user's own solutions always bypass the buffer.
 */
export function useNewSolutionsBuffer(
	allChildren: Statement[],
	isBufferingActive: boolean,
	currentUserId?: string,
): UseNewSolutionsBufferReturn {
	const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => new Set());
	const hasInitializedRef = useRef(false);
	const prevSortActiveRef = useRef(isBufferingActive);

	// Initialize: mark all current children as acknowledged on first meaningful data
	useEffect(() => {
		if (isBufferingActive && !hasInitializedRef.current && allChildren.length > 0) {
			hasInitializedRef.current = true;
			setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));
		}
	}, [allChildren, isBufferingActive]);

	// Reset when buffering is toggled off, or when re-enabled after being off
	useEffect(() => {
		if (!isBufferingActive) {
			hasInitializedRef.current = false;
			setAcknowledgedIds(new Set());
		} else if (!prevSortActiveRef.current && isBufferingActive) {
			hasInitializedRef.current = true;
			setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));
		}
		prevSortActiveRef.current = isBufferingActive;
	}, [isBufferingActive, allChildren]);

	// Auto-acknowledge the current user's own solutions
	useEffect(() => {
		if (!isBufferingActive || !hasInitializedRef.current || !currentUserId) return;

		const ownNewIds: string[] = [];
		for (const child of allChildren) {
			if (child.creatorId === currentUserId && !acknowledgedIds.has(child.statementId)) {
				ownNewIds.push(child.statementId);
			}
		}

		if (ownNewIds.length > 0) {
			setAcknowledgedIds((prev) => {
				const next = new Set(prev);
				ownNewIds.forEach((id) => next.add(id));

				return next;
			});
		}
	}, [allChildren, isBufferingActive, currentUserId, acknowledgedIds]);

	const { visibleChildren, pendingCount } = useMemo(() => {
		if (!isBufferingActive || !hasInitializedRef.current || acknowledgedIds.size === 0) {
			return { visibleChildren: allChildren, pendingCount: 0 };
		}

		const visible: Statement[] = [];
		let pending = 0;

		for (const child of allChildren) {
			if (acknowledgedIds.has(child.statementId)) {
				visible.push(child);
			} else {
				pending++;
			}
		}

		return { visibleChildren: visible, pendingCount: pending };
	}, [allChildren, isBufferingActive, acknowledgedIds]);

	const showPending = useCallback(() => {
		setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));
	}, [allChildren]);

	return { visibleChildren, pendingCount: Math.min(pendingCount, MAX_DISPLAY_COUNT), showPending };
}

/**
 * Tracks which solutions are "new" (just flushed from the buffer).
 * Returns a Set of statement IDs that should be highlighted.
 * IDs are automatically removed after HIGHLIGHT_DURATION_MS.
 */
export function useNewSolutionsHighlight(
	rootChildren: Statement[],
	isActive: boolean,
): Set<string> {
	const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
	const knownIdsRef = useRef<Set<string>>(new Set());
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

	useEffect(() => {
		if (!isActive) {
			knownIdsRef.current = new Set();
			setHighlightedIds(new Set());
			timersRef.current.forEach((t) => clearTimeout(t));
			timersRef.current.clear();

			return;
		}

		// Detect new IDs that just appeared in the visible list
		const freshIds: string[] = [];
		for (const child of rootChildren) {
			if (!knownIdsRef.current.has(child.statementId)) {
				freshIds.push(child.statementId);
			}
		}

		// Update known set to current list
		knownIdsRef.current = new Set(rootChildren.map((c) => c.statementId));

		if (freshIds.length === 0) return;

		setHighlightedIds((prev) => {
			const next = new Set(prev);
			freshIds.forEach((id) => next.add(id));

			return next;
		});

		// Auto-remove highlights after duration
		for (const id of freshIds) {
			if (timersRef.current.has(id)) continue;
			const timer = setTimeout(() => {
				setHighlightedIds((prev) => {
					const next = new Set(prev);
					next.delete(id);

					return next;
				});
				timersRef.current.delete(id);
			}, HIGHLIGHT_DURATION_MS);
			timersRef.current.set(id, timer);
		}
	}, [rootChildren, isActive]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			timersRef.current.forEach((t) => clearTimeout(t));
		};
	}, []);

	return highlightedIds;
}

export { MAX_DISPLAY_COUNT };
