import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { SupervisorConsoleRequest, SupervisorConsoleResponse } from '@freedi/shared-types';
import { auth } from '@/firebase';
import { createRequestCache } from '@/lib/requestCache';
import { logError } from '@/utils/logError';
import { callSupervisorConsole, type ResponseFor } from './agoraSupervisorFunctions';

/**
 * `useSupervisorConsole(request)` — one supervision view, served through a
 * module-level cache keyed by the JSON of the request (60 s TTL, in-flight
 * de-duplication). `refresh()` bypasses the cache. `null` asks for nothing.
 *
 * The cache is emptied whenever the signed-in user changes, so a supervisor
 * who signs out never leaves a sys-admin's view behind for the next login.
 */

const CACHE_TTL_MS = 60_000;

const cache = createRequestCache<SupervisorConsoleResponse>({ ttlMs: CACHE_TTL_MS });

let watchingAuth = false;
function watchAuth(): void {
	if (watchingAuth) return;
	watchingAuth = true;
	onAuthStateChanged(auth, () => cache.invalidate());
}

export interface SupervisorConsoleState<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function useSupervisorConsole<R extends SupervisorConsoleRequest>(
	request: R | null,
): SupervisorConsoleState<ResponseFor<R>> {
	const key = request ? JSON.stringify(request) : '';
	const [state, setState] = useState<{
		key: string;
		data: ResponseFor<R> | null;
		loading: boolean;
		error: Error | null;
	}>({ key, data: null, loading: !!request, error: null });
	const [bypassTick, setBypassTick] = useState(0);

	useEffect(watchAuth, []);

	useEffect(() => {
		if (!key) {
			setState({ key, data: null, loading: false, error: null });

			return;
		}
		let alive = true;
		const bypass = bypassTick > 0;
		const cached = bypass ? undefined : cache.peek(key);
		if (cached !== undefined) {
			setState({ key, data: cached as ResponseFor<R>, loading: false, error: null });

			return;
		}
		setState((prev) => ({
			key,
			data: prev.key === key ? prev.data : null,
			loading: true,
			error: null,
		}));
		const parsed = JSON.parse(key) as R;
		cache
			.get(key, () => callSupervisorConsole(parsed), { bypass })
			.then((data) => {
				if (alive) setState({ key, data: data as ResponseFor<R>, loading: false, error: null });
			})
			.catch((error: unknown) => {
				if (!alive) return;
				logError(error, { operation: 'agoraSupervisor.useSupervisorConsole', metadata: { key } });
				setState({ key, data: null, loading: false, error: asError(error) });
			});

		return () => {
			alive = false;
		};
	}, [key, bypassTick]);

	const refresh = useCallback(() => setBypassTick((n) => n + 1), []);

	const current = state.key === key ? state : { data: null, loading: !!key, error: null };

	return { data: current.data, loading: current.loading, error: current.error, refresh };
}
