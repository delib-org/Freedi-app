import { useEffect, useState } from 'react';

/**
 * `true` once `active` has been true for `ms` milliseconds — used to wait
 * for late-arriving flags (the system-admin bit has no loading state) before
 * redirecting a user away from a page.
 */
export const AUTH_FLAG_GRACE_MS = 1500;

export function useGrace(active: boolean, ms: number = AUTH_FLAG_GRACE_MS): boolean {
	const [elapsed, setElapsed] = useState(false);

	useEffect(() => {
		if (!active) {
			setElapsed(false);

			return;
		}
		const timer = window.setTimeout(() => setElapsed(true), ms);

		return () => window.clearTimeout(timer);
	}, [active, ms]);

	return active && elapsed;
}
