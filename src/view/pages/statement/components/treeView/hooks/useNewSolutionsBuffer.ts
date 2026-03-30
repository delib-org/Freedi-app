import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Statement } from '@freedi/shared-types';

interface UseNewSolutionsBufferReturn {
	/** Solutions that should be rendered in the list */
	visibleChildren: Statement[];
	/** Number of new solutions waiting in the buffer */
	pendingCount: number;
	/** Flush the buffer — merge pending solutions into the visible list */
	showPending: () => void;
	/** IDs of solutions that were just flushed — highlighted for 12s */
	highlightedIds: Set<string>;
}

const MAX_DISPLAY_COUNT = 50;
const HIGHLIGHT_DURATION_MS = 12_000;
// Time to wait for all Firebase listeners to finish loading before buffering starts
const STABILIZE_MS = 3_000;

/**
 * Buffers new solutions that arrive after the initial load so the list
 * doesn't constantly reorder during live events.
 *
 * When the user clicks the pill (showPending), buffered solutions are
 * flushed into the visible list and highlighted for 12 seconds.
 *
 * The current user's own solutions always bypass the buffer (no highlight).
 */
export function useNewSolutionsBuffer(
	allChildren: Statement[],
	isBufferingActive: boolean,
	currentUserId?: string,
): UseNewSolutionsBufferReturn {
	const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => new Set());
	const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
	const hasInitializedRef = useRef(false);
	const initTimeRef = useRef(0);
	const prevSortActiveRef = useRef(isBufferingActive);
	const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

	// Initialize and keep re-snapshotting during the stabilization window
	// so that items from multiple Firebase listeners all get acknowledged
	useEffect(() => {
		if (!isBufferingActive || allChildren.length === 0) return;

		if (!hasInitializedRef.current) {
			hasInitializedRef.current = true;
			initTimeRef.current = Date.now();
			setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));

			return;
		}

		// During stabilization window, keep absorbing new items as "known"
		if (Date.now() - initTimeRef.current < STABILIZE_MS) {
			setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));
		}
	}, [allChildren, isBufferingActive]);

	// Reset when buffering is toggled off, or when re-enabled after being off
	useEffect(() => {
		if (!isBufferingActive) {
			hasInitializedRef.current = false;
			initTimeRef.current = 0;
			setAcknowledgedIds(new Set());
			setHighlightedIds(new Set());
			highlightTimersRef.current.forEach((t) => clearTimeout(t));
			highlightTimersRef.current.clear();
		} else if (!prevSortActiveRef.current && isBufferingActive) {
			hasInitializedRef.current = true;
			initTimeRef.current = Date.now();
			setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));
		}
		prevSortActiveRef.current = isBufferingActive;
	}, [isBufferingActive, allChildren]);

	// Auto-acknowledge the current user's own solutions (no highlight)
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

	const { visibleChildren, pendingCount, pendingIds } = useMemo(() => {
		if (!isBufferingActive || !hasInitializedRef.current || acknowledgedIds.size === 0) {
			return { visibleChildren: allChildren, pendingCount: 0, pendingIds: [] as string[] };
		}

		const visible: Statement[] = [];
		const pending: string[] = [];

		for (const child of allChildren) {
			if (acknowledgedIds.has(child.statementId)) {
				visible.push(child);
			} else {
				pending.push(child.statementId);
			}
		}

		return { visibleChildren: visible, pendingCount: pending.length, pendingIds: pending };
	}, [allChildren, isBufferingActive, acknowledgedIds]);

	// Flush buffer and highlight the flushed IDs
	const showPending = useCallback(() => {
		// Capture which IDs are being flushed before acknowledging them
		const flushedIds = pendingIds;

		setAcknowledgedIds(new Set(allChildren.map((c) => c.statementId)));

		if (flushedIds.length === 0) return;

		// Add to highlighted set
		setHighlightedIds((prev) => {
			const next = new Set(prev);
			flushedIds.forEach((id) => next.add(id));

			return next;
		});

		// Schedule removal after 12s
		for (const id of flushedIds) {
			if (highlightTimersRef.current.has(id)) continue;
			const timer = setTimeout(() => {
				setHighlightedIds((prev) => {
					const next = new Set(prev);
					next.delete(id);

					return next;
				});
				highlightTimersRef.current.delete(id);
			}, HIGHLIGHT_DURATION_MS);
			highlightTimersRef.current.set(id, timer);
		}
	}, [allChildren, pendingIds]);

	// Cleanup timers on unmount
	useEffect(() => {
		return () => {
			highlightTimersRef.current.forEach((t) => clearTimeout(t));
		};
	}, []);

	return {
		visibleChildren,
		pendingCount: Math.min(pendingCount, MAX_DISPLAY_COUNT),
		showPending,
		highlightedIds,
	};
}

export { MAX_DISPLAY_COUNT };
