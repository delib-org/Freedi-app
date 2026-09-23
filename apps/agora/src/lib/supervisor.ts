import { parse } from 'valibot';
import {
	AgoraClassAggregateSchema,
	AgoraStudentAggregateSchema,
	AgoraTeacherAggregateSchema,
	AgoraTeacherLessonRowSchema,
	type AgoraClassAggregate,
	type AgoraStudentAggregate,
	type AgoraTeacherAggregate,
	type SupervisorClassDetail,
	type SupervisorClassRow,
	type SupervisorOverview,
	type SupervisorStudentDetail,
	type SupervisorSystemView,
	type SupervisorTeacherDetail,
} from '@freedi/shared-types';
import { supervisorConsole } from './callables';
import type { TeacherDashboard } from './teacher';
import { parseEach } from './teacher';

// ---------------------------------------------------------------------------
// The supervisor's answers, with every stored aggregate parsed at the door.
// The callable types carry them as `unknown`; a malformed doc fails here,
// loudly, rather than inside a chart.
// ---------------------------------------------------------------------------

export interface SupervisorClassView extends Omit<SupervisorClassRow, 'aggregate'> {
	aggregate: AgoraClassAggregate | null;
}

export type SupervisorSchoolView = Omit<NonNullable<SupervisorOverview['school']>, 'classes'> & {
	classes: SupervisorClassView[];
};

export interface SupervisorOverviewView extends Omit<SupervisorOverview, 'school'> {
	school: SupervisorSchoolView | null;
}

export interface SupervisorTeacherView
	extends Omit<SupervisorTeacherDetail, 'aggregate' | 'classes'> {
	aggregate: AgoraTeacherAggregate | null;
	classes: SupervisorClassView[];
}

export interface SupervisorClassPage extends Omit<SupervisorClassDetail, 'aggregate' | 'careers'> {
	aggregate: AgoraClassAggregate | null;
	careers: Record<string, AgoraStudentAggregate>;
}

export interface SupervisorStudentPage extends Omit<SupervisorStudentDetail, 'career'> {
	career: AgoraStudentAggregate | null;
}

const parseClassAggregate = (data: unknown): AgoraClassAggregate | null =>
	data ? parse(AgoraClassAggregateSchema, data) : null;

function parseClassRow(row: SupervisorClassRow): SupervisorClassView {
	return { ...row, aggregate: parseClassAggregate(row.aggregate) };
}

export async function fetchSupervisorOverview(
	schoolId?: string,
	days?: number,
): Promise<SupervisorOverviewView> {
	const data = await supervisorConsole({
		view: 'overview',
		...(schoolId ? { schoolId } : {}),
		...(days ? { days } : {}),
	});
	noteOverviewRole(data);

	return {
		...data,
		school: data.school
			? { ...data.school, classes: data.school.classes.map(parseClassRow) }
			: null,
	};
}

export async function fetchSupervisorTeacher(
	schoolId: string,
	teacherId: string,
	days?: number,
): Promise<SupervisorTeacherView> {
	const data = await supervisorConsole({
		view: 'teacher',
		schoolId,
		teacherId,
		...(days ? { days } : {}),
	});

	return {
		...data,
		aggregate: data.aggregate ? parse(AgoraTeacherAggregateSchema, data.aggregate) : null,
		lessonRows: parseEach(
			data.lessonRows ?? [],
			(r) => parse(AgoraTeacherLessonRowSchema, r),
			'lesson',
		),
		classes: (data.classes ?? []).map(parseClassRow),
	};
}

export async function fetchSupervisorClass(classId: string): Promise<SupervisorClassPage> {
	const data = await supervisorConsole({ view: 'class', classId });

	return {
		...data,
		aggregate: parseClassAggregate(data.aggregate),
		careers: Object.fromEntries(
			Object.entries(data.careers ?? {}).map(([id, career]) => [
				id,
				parse(AgoraStudentAggregateSchema, career),
			]),
		),
	};
}

export async function fetchSupervisorStudent(memberId: string): Promise<SupervisorStudentPage> {
	const data = await supervisorConsole({ view: 'student', memberId });

	return { ...data, career: data.career ? parse(AgoraStudentAggregateSchema, data.career) : null };
}

export async function fetchSupervisorSystem(days?: number): Promise<SupervisorSystemView> {
	return supervisorConsole({ view: 'system', ...(days ? { days } : {}) });
}

// ---------------------------------------------------------------------------
// Who this teacher is allowed to supervise. Two sources feed it — the teacher
// dashboard (already paid for on /teach) and the overview itself — and either
// is good for a minute. Nothing here grants anything: the server decides
// every read; this only decides whether to show the door.
// ---------------------------------------------------------------------------

export type SupervisorRole = 'none' | 'supervisor' | 'sysadmin';

export interface SupervisorState {
	role: SupervisorRole;
	schools: Array<{ schoolId: string; name: string }>;
	/** A source has answered at least once */
	loaded: boolean;
}

const STALE_MS = 60_000;

const state: SupervisorState = { role: 'none', schools: [], loaded: false };
let filledAt = 0;

export function getSupervisorState(): Readonly<SupervisorState> {
	return state;
}

export function isSupervisorStale(now = Date.now()): boolean {
	return !state.loaded || now - filledAt >= STALE_MS;
}

/** The teacher dashboard says which schools this account supervises */
export function noteDashboardRole(
	dashboard: Pick<TeacherDashboard, 'supervisedSchools' | 'isSystemAdmin'>,
): void {
	state.role = dashboard.isSystemAdmin
		? 'sysadmin'
		: dashboard.supervisedSchools.length > 0
			? 'supervisor'
			: 'none';
	state.schools = dashboard.supervisedSchools.map((s) => ({ schoolId: s.schoolId, name: s.name }));
	state.loaded = true;
	filledAt = Date.now();
}

/** The overview names the role outright */
export function noteOverviewRole(overview: Pick<SupervisorOverview, 'role' | 'schools'>): void {
	state.role = overview.role;
	state.schools = overview.schools.map((s) => ({ schoolId: s.schoolId, name: s.name }));
	state.loaded = true;
	filledAt = Date.now();
}

/** Refresh from the overview when what we hold is older than a minute */
export async function loadSupervisorRole(force = false): Promise<Readonly<SupervisorState>> {
	if (!force && !isSupervisorStale()) return state;
	try {
		await fetchSupervisorOverview();
	} catch (error) {
		// "You supervise nothing" is an answer, not a failure
		if (isDeniedError(error)) {
			state.role = 'none';
			state.schools = [];
			state.loaded = true;
			filledAt = Date.now();
		} else {
			console.error('[Supervision]', { operation: 'supervisor.loadSupervisorRole', error });
			throw error;
		}
	}

	return state;
}

/** On sign-out — the next account must not inherit a role */
export function clearSupervisorRole(): void {
	state.role = 'none';
	state.schools = [];
	state.loaded = false;
	filledAt = 0;
}

/**
 * The callable's status, from `FirebaseError.code` ("functions/not-found").
 * The message is the server's own sentence and names no code, so matching on
 * `String(error)` sent every "Class not found" to the retry screen.
 */
function callableCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;

	return typeof code === 'string' ? code.replace(/^functions\//, '') : '';
}

export function isDeniedError(error: unknown): boolean {
	return callableCode(error) === 'permission-denied' || String(error).includes('do not supervise');
}

export function isNotFoundError(error: unknown): boolean {
	return callableCode(error) === 'not-found';
}

// ---------------------------------------------------------------------------
// What the supervisor was looking at last time, per account so a shared
// device never opens one supervisor's school for another.
// ---------------------------------------------------------------------------

export type SuperviseScope = { schoolId: string } | { all: true };

const SCOPE_KEY = 'agora_supervise_scope';
const DAYS_KEY = 'agora_supervise_days';
export const SUPERVISE_PERIODS = [30, 90] as const;
export type SupervisePeriod = (typeof SUPERVISE_PERIODS)[number];
export const DEFAULT_PERIOD: SupervisePeriod = 90;

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* Storage is a convenience, never a requirement */
	}
}

export function parseScope(raw: string | null): SuperviseScope | null {
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;
		if ('all' in value && value.all === true) return { all: true };
		if ('schoolId' in value && typeof value.schoolId === 'string' && value.schoolId)
			return { schoolId: value.schoolId };
	} catch {
		/* An old or foreign value: start fresh */
	}

	return null;
}

export function savedScope(uid: string): SuperviseScope | null {
	return parseScope(read(`${SCOPE_KEY}:${uid}`));
}

export function saveScope(uid: string, scope: SuperviseScope): void {
	write(`${SCOPE_KEY}:${uid}`, JSON.stringify(scope));
}

export function parsePeriod(raw: string | null): SupervisePeriod {
	const n = Number(raw);

	return SUPERVISE_PERIODS.find((p) => p === n) ?? DEFAULT_PERIOD;
}

export function savedPeriod(): SupervisePeriod {
	return parsePeriod(read(DAYS_KEY));
}

export function savePeriod(days: SupervisePeriod): void {
	write(DAYS_KEY, String(days));
}
