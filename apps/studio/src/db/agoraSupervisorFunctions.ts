import { httpsCallable } from 'firebase/functions';
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
import { functions } from '@/firebase';

/**
 * Typed wrappers for the Agora supervision callables (me-west1). The wire
 * shapes are the `@freedi/shared-types` contracts the functions themselves
 * import, so a drift is a compile error here, not a runtime surprise.
 */

/** The response type `agoraSupervisorConsole` returns for one request's `view`. */
export type ResponseFor<R extends SupervisorConsoleRequest> = R extends { view: 'overview' }
	? SupervisorOverview
	: R extends { view: 'teacher' }
		? SupervisorTeacherDetail
		: R extends { view: 'class' }
			? SupervisorClassDetail
			: R extends { view: 'student' }
				? SupervisorStudentDetail
				: R extends { view: 'system' }
					? SupervisorSystemView
					: never;

export async function callSupervisorConsole<R extends SupervisorConsoleRequest>(
	request: R,
): Promise<ResponseFor<R>> {
	const call = httpsCallable<SupervisorConsoleRequest, SupervisorConsoleResponse>(
		functions,
		'agoraSupervisorConsole',
	);
	const result = await call(request);

	// The union is discriminated server-side by `request.view`; the
	// conditional type above is the client's statement of that contract.
	return result.data as ResponseFor<R>;
}

/** Long-running: a page of the backfill can take minutes, hence the 9-minute timeout. */
const BACKFILL_TIMEOUT_MS = 540_000;

export async function backfillTeacherAggregates(
	request: BackfillTeacherAggregatesRequest,
): Promise<BackfillTeacherAggregatesResponse> {
	const call = httpsCallable<BackfillTeacherAggregatesRequest, BackfillTeacherAggregatesResponse>(
		functions,
		'agoraAdminBackfillTeacherAggregates',
		{ timeout: BACKFILL_TIMEOUT_MS },
	);
	const result = await call(request);

	return result.data;
}
