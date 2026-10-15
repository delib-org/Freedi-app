import { useEffect, useState } from 'react';
import { countAccessRequests } from '@/db/agoraAccess';
import { logError } from '@/utils/logError';

/**
 * The number of access requests waiting for the signed-in approver, shared by
 * every nav item and count line that shows it. One module-level value with
 * subscribers, so a decision made on the requests screen updates the badge
 * without a reload. It is only a number: no request data is kept here.
 */

const FRESH_MS = 30_000;

let value = 0;
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(count: number) => void>();

function publish(next: number): void {
	value = next;
	fetchedAt = Date.now();
	listeners.forEach((listener) => listener(next));
}

function load(): Promise<void> {
	if (inFlight) return inFlight;
	inFlight = countAccessRequests()
		.then(publish)
		.catch((error: unknown) => {
			logError(error, { operation: 'accessCount.load' });
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}

/** Ask every badge to recount (after approve / decline). */
export function refreshAccessCount(): Promise<void> {
	fetchedAt = 0;

	return load();
}

/** Test seam: forget the shared value. */
export function resetAccessCount(): void {
	value = 0;
	fetchedAt = 0;
	inFlight = null;
	listeners.clear();
}

/** `enabled: false` makes no call (people who approve nothing). */
export function useAccessCount(enabled: boolean): number {
	const [count, setCount] = useState(value);

	useEffect(() => {
		if (!enabled) return undefined;
		listeners.add(setCount);
		setCount(value);
		if (Date.now() - fetchedAt > FRESH_MS) void load();

		return () => {
			listeners.delete(setCount);
		};
	}, [enabled]);

	return enabled ? count : 0;
}
