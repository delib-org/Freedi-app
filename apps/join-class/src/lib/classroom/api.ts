import type {
	ClassAddNoDeviceRequest,
	ClassAddNoDeviceResponse,
	ClassAllTablesToRequest,
	ClassAllTablesToResponse,
	ClassAssignTablesRequest,
	ClassAssignTablesResponse,
	ClassCloseBallotRequest,
	ClassCloseBallotResponse,
	ClassFreezeBallotRequest,
	ClassFreezeBallotResponse,
	ClassMoveStudentRequest,
	ClassMoveStudentResponse,
	ClassSetLessonStatusRequest,
	ClassSetLessonStatusResponse,
	ClassTableStepRequest,
	ClassTableStepResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from '../firebase';

/**
 * Typed wrappers around the classroom callables (region me-west1 — the shared
 * `functions` instance in lib/firebase.ts is already pinned to it). The
 * implementations live in functions/src/classroom (lane C1); until they are
 * deployed every call rejects with `functions/not-found`, which callers should
 * treat like any other failure. Errors are logged with a [Classroom] tag and
 * rethrown so the view can show its own message.
 */

async function call<Req, Res>(name: string, payload: Req): Promise<Res> {
	try {
		const result = await httpsCallable<Req, Res>(functions, name)(payload);

		return result.data;
	} catch (error) {
		console.error(`[Classroom] ${name} failed:`, error);
		throw error;
	}
}

/** Admin: seat the joined students (round-robin by camp). `replace: true` to re-run. */
export function classAssignTables(
	req: ClassAssignTablesRequest,
): Promise<ClassAssignTablesResponse> {
	return call('classAssignTables', req);
}

/** Admin: move one student to table `toTable` (1-based) or unseat with `null`. */
export function classMoveStudent(req: ClassMoveStudentRequest): Promise<ClassMoveStudentResponse> {
	return call('classMoveStudent', req);
}

/** Admin: add a student without a device to table `n`. */
export function classAddNoDevice(req: ClassAddNoDeviceRequest): Promise<ClassAddNoDeviceResponse> {
	return call('classAddNoDevice', req);
}

/** Asker or admin: advance one table (see ClassTableAction). */
export function classTableStep(req: ClassTableStepRequest): Promise<ClassTableStepResponse> {
	return call('classTableStep', req);
}

/** Admin: put every table on `step`. */
export function classAllTablesTo(req: ClassAllTablesToRequest): Promise<ClassAllTablesToResponse> {
	return call('classAllTablesTo', req);
}

/** Admin: freeze the ballot shortlist (options above the gate, else top N). */
export function classFreezeBallot(
	req: ClassFreezeBallotRequest,
): Promise<ClassFreezeBallotResponse> {
	return call('classFreezeBallot', req);
}

/** Admin: close the ballot and record the decision. */
export function classCloseBallot(req: ClassCloseBallotRequest): Promise<ClassCloseBallotResponse> {
	return call('classCloseBallot', req);
}

/** Admin: pause, resume, end, keep open or reopen the lesson (IA 13.6). */
export function classSetLessonStatus(
	req: ClassSetLessonStatusRequest,
): Promise<ClassSetLessonStatusResponse> {
	return call('classSetLessonStatus', req);
}
