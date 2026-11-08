import { useEffect, useRef } from 'react';
import { updateLastReadTimestamp } from '@/controllers/db/subscriptions/setSubscriptions';
import { UI } from '@/constants/common';

interface UseMarkDiscussionReadProps {
	statementId?: string;
	userId?: string;
	/** The statement document has loaded (read marking never starts before it). */
	isLoaded: boolean;
	/** Bumped by the server when a child is created/edited - the "new content" signal. */
	lastChildUpdate?: number;
}

/**
 * Marks a discussion as read while the user is looking at it.
 * - Writes once on open (statementId / user change).
 * - While open, writes again only when newer content arrives (lastChildUpdate
 *   advances), at most once per READ_MARK_THROTTLE_MS, with a trailing write.
 * - Never writes while the tab is hidden; catches up when it becomes visible.
 * Unrelated statement updates (consensus, counts) do not trigger writes.
 */
export function useMarkDiscussionRead({
	statementId,
	userId,
	isLoaded,
	lastChildUpdate,
}: UseMarkDiscussionReadProps): void {
	const latestChildUpdateRef = useRef<number>(lastChildUpdate ?? 0);
	const coveredChildUpdateRef = useRef<number>(0);
	const lastWriteAtRef = useRef<number>(0);
	const needsWriteRef = useRef<boolean>(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const attemptRef = useRef<() => void>(() => undefined);

	latestChildUpdateRef.current = lastChildUpdate ?? 0;

	const active = Boolean(statementId && userId && isLoaded);

	useEffect(() => {
		if (!active || !statementId || !userId) return undefined;

		const clearTimer = (): void => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};

		const attempt = (): void => {
			if (!needsWriteRef.current) return;
			if (document.visibilityState === 'hidden') return;

			const wait = lastWriteAtRef.current + UI.READ_MARK_THROTTLE_MS - Date.now();
			if (wait > 0) {
				// Trailing write: record the final state once the window ends
				if (timerRef.current === null) {
					timerRef.current = setTimeout(() => {
						timerRef.current = null;
						attempt();
					}, wait);
				}

				return;
			}

			needsWriteRef.current = false;
			lastWriteAtRef.current = Date.now();
			coveredChildUpdateRef.current = latestChildUpdateRef.current;
			void updateLastReadTimestamp(statementId, userId);
		};

		attemptRef.current = attempt;

		// Open: one immediate write (deferred until visible if the tab is hidden)
		needsWriteRef.current = true;
		lastWriteAtRef.current = 0;
		coveredChildUpdateRef.current = 0;
		attempt();

		const handleVisibility = (): void => {
			if (document.visibilityState === 'visible') attempt();
		};
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibility);
			clearTimer();
			attemptRef.current = () => undefined;
		};
	}, [active, statementId, userId]);

	// Newer content than we last recorded -> schedule a (throttled) write
	useEffect(() => {
		if (!active) return;
		if ((lastChildUpdate ?? 0) > coveredChildUpdateRef.current) {
			needsWriteRef.current = true;
			attemptRef.current();
		}
	}, [active, lastChildUpdate]);
}
