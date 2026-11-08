import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import type {
	SupervisorTeacherDetail,
	TeacherConsoleDashboard,
	TeacherConsoleRequest,
	TeacherConsoleResponse,
} from '@freedi/shared-types';
import { auth, functions } from '@/firebase';
import { createRequestCache } from '@/lib/requestCache';
import { logError } from '@/utils/logError';

/**
 * The teacher's own Agora views (`agoraTeacherConsole`, me-west1), read from
 * Studio: `dashboard` (my classes, my schools, the schools I coordinate) and
 * `activity` (my lessons and console time). Identity is always the caller, so
 * a teacher can only ever read their own.
 */

/** Only the two views Studio asks for; both are served for the caller alone. */
export type OwnView = 'dashboard' | 'activity';

export type OwnViewResponse<V extends OwnView> = V extends 'dashboard'
	? TeacherConsoleDashboard
	: SupervisorTeacherDetail;

const CACHE_TTL_MS = 60_000;

const cache = createRequestCache<TeacherConsoleResponse>({ ttlMs: CACHE_TTL_MS });

let watchingAuth = false;
function watchAuth(): void {
	if (watchingAuth) return;
	watchingAuth = true;
	onAuthStateChanged(auth, () => cache.invalidate());
}

export async function callTeacherConsole<V extends OwnView>(view: V): Promise<OwnViewResponse<V>> {
	const call = httpsCallable<TeacherConsoleRequest, TeacherConsoleResponse>(
		functions,
		'agoraTeacherConsole',
	);
	const result = await call({ view });

	// The callable discriminates on `view`; the conditional type is the client's
	// statement of that contract.
	return result.data as OwnViewResponse<V>;
}

export interface OwnViewState<V extends OwnView> {
	data: OwnViewResponse<V> | null;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/** One of the caller's own views, cached for a minute. `enabled: false` asks for nothing. */
export function useOwnTeacherView<V extends OwnView>(view: V, enabled = true): OwnViewState<V> {
	const [state, setState] = useState<{
		data: OwnViewResponse<V> | null;
		loading: boolean;
		error: Error | null;
	}>({ data: null, loading: enabled, error: null });
	const [bypassTick, setBypassTick] = useState(0);

	useEffect(watchAuth, []);

	useEffect(() => {
		if (!enabled) {
			setState({ data: null, loading: false, error: null });

			return;
		}
		let alive = true;
		const key = `own|${view}`;
		const bypass = bypassTick > 0;
		setState((prev) => ({ data: prev.data, loading: true, error: null }));
		cache
			.get(key, () => callTeacherConsole(view), { bypass })
			.then((data) => {
				if (alive) setState({ data: data as OwnViewResponse<V>, loading: false, error: null });
			})
			.catch((error: unknown) => {
				if (!alive) return;
				logError(error, { operation: 'agoraTeacher.useOwnTeacherView', metadata: { view } });
				setState({ data: null, loading: false, error: asError(error) });
			});

		return () => {
			alive = false;
		};
	}, [view, enabled, bypassTick]);

	const refresh = useCallback(() => setBypassTick((n) => n + 1), []);

	return { ...state, refresh };
}
