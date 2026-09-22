import { useEffect, useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import type {
	SupervisorConsoleRequest,
	SupervisorConsoleResponse,
	SupervisorOverview,
	SupervisorTeacherDetail,
	SupervisorClassDetail,
	SupervisorStudentDetail,
	SupervisorSystemView,
	BackfillTeacherAggregatesRequest,
	BackfillTeacherAggregatesResponse,
} from '@freedi/shared-types';
import { auth, functions } from '@/firebase';
import { logError } from '@/utils/logError';

type Result<R extends SupervisorConsoleRequest> = R extends { view: 'overview' }
	? SupervisorOverview
	: R extends { view: 'teacher' }
		? SupervisorTeacherDetail
		: R extends { view: 'class' }
			? SupervisorClassDetail
			: R extends { view: 'student' }
				? SupervisorStudentDetail
				: SupervisorSystemView;
const CACHE_MS = 60000;
const cache = new Map<string, { at: number; data: SupervisorConsoleResponse }>();
export function useSupervisorConsole<R extends SupervisorConsoleRequest>(request: R | null) {
	const [uid, setUid] = useState(auth.currentUser?.uid ?? '');
	useEffect(
		() =>
			onAuthStateChanged(auth, (u) => {
				cache.clear();
				setUid(u?.uid ?? '');
			}),
		[],
	);
	const requestKey = JSON.stringify(request);
	const key = `${uid}:${requestKey}`;
	const [revision, setRevision] = useState(0);
	const [state, setState] = useState<{
		key: string;
		data: Result<R> | null;
		loading: boolean;
		error: boolean;
	}>({ key: '', data: null, loading: true, error: false });
	const refresh = useCallback(() => {
		cache.delete(key);
		setRevision((n) => n + 1);
	}, [key]);
	useEffect(() => {
		let alive = true;
		if (!request || !uid) {
			setState({ key, data: null, loading: false, error: false });

			return;
		}
		const hit = cache.get(key);
		if (hit && Date.now() - hit.at < CACHE_MS) {
			setState({ key, data: hit.data as Result<R>, loading: false, error: false });

			return;
		}
		setState({ key, data: null, loading: true, error: false });
		const call = httpsCallable<SupervisorConsoleRequest, SupervisorConsoleResponse>(
			functions,
			'agoraSupervisorConsole',
		);
		void call(JSON.parse(requestKey) as R)
			.then((result) => {
				if (!alive) return;
				if (cache.size > 100) cache.clear();
				cache.set(key, { at: Date.now(), data: result.data });
				setState({ key, data: result.data as Result<R>, loading: false, error: false });
			})
			.catch((error) => {
				if (alive) {
					logError(error, { operation: 'agoraSupervisor.load' });
					setState({ key, data: null, loading: false, error: true });
				}
			});

		return () => {
			alive = false;
		};
	}, [key, requestKey, uid, revision]);

	return {
		...(state.key === key ? state : { key, data: null, loading: !!request, error: false }),
		refresh,
	};
}
export async function backfillTeacherLessons(
	request: BackfillTeacherAggregatesRequest,
): Promise<BackfillTeacherAggregatesResponse> {
	const call = httpsCallable<BackfillTeacherAggregatesRequest, BackfillTeacherAggregatesResponse>(
		functions,
		'agoraAdminBackfillTeacherAggregates',
		{ timeout: 540000 },
	);

	return (await call(request)).data;
}
