import m from 'mithril';
import { AgoraSession, AgoraSessionStatus } from '@freedi/shared-types';
import { fetchTeacherDashboard, type TeacherDashboard } from './teacher';
import { getUserState } from './user';
import { clearSupervisorRole, noteDashboardRole } from './supervisor';

/**
 * What the teacher's navigation bar needs to know: which classes this teacher
 * has, and which lessons are running right now.
 *
 * It is a cache and not a listener on purpose. The bar is on every teacher
 * screen, and a listener per screen would put a query behind a button most
 * teachers never press. Nothing is fetched until the menu is opened for the
 * first time, and the answer is then held for {@link STALE_MS} so walking
 * between two lessons does not re-ask the console on every hop.
 *
 * The /teach dashboard already asks the very same question on load, so it
 * hands its answer over ({@link noteTeacherDashboard}) and the first menu on
 * that screen opens with no round trip at all.
 */
export interface TeacherNavState {
	canSupervise: boolean;
	classes: TeacherDashboard['classes'];
	/** This teacher's sessions, newest first — live and finished both */
	sessions: readonly AgoraSession[];
	loading: boolean;
	/** Filled at least once. Until then the menu shows a spinner, not "none". */
	loaded: boolean;
	/** The last fill failed. Said quietly in the menu; never blocks the bar. */
	failed: boolean;
}

/** How long a filled cache is trusted before the next menu re-asks */
const STALE_MS = 60_000;

const state: TeacherNavState = {
	canSupervise: false,
	classes: [],
	sessions: [],
	loading: false,
	loaded: false,
	failed: false,
};

let filledAt = 0;
let generation = 0;

/**
 * Whose classes the cache holds. A credential-recovery sign-in swaps the uid
 * under a live page without a sign-out, so "clear on sign-out" alone would let
 * the next account read the last one's class names and codes from here.
 * Every read checks the owner first and forgets a stranger's answer.
 */
let ownerUid: string | null = null;

function currentUid(): string | null {
	return getUserState().user?.uid ?? null;
}

/** Drop the cache when it was filled for an account other than the signed-in one */
function forgetOtherAccount(): void {
	if (ownerUid !== null && ownerUid !== currentUid()) clearTeacherNav();
}

export function getTeacherNavState(): Readonly<TeacherNavState> {
	forgetOtherAccount();

	return state;
}

/**
 * Is this game still being played?
 *
 * A scored session is finished even while its status is still `open` — the
 * sweep flips the status hours later, and "live" over a final score reads as
 * a lie. The same rule decides where a row leads: a live game opens its
 * console, a finished one its report.
 */
export function isSessionLive(session: AgoraSession): boolean {
	return (
		session.classScore === undefined &&
		(session.lessonEndsAt ?? session.createdAt + 24 * 60 * 60 * 1000) > Date.now() &&
		(session.status === AgoraSessionStatus.open || session.status === AgoraSessionStatus.live)
	);
}

/** The lessons running now, newest first — what the menu leads with */
export function liveSessions(): AgoraSession[] {
	forgetOtherAccount();

	return state.sessions.filter(isSessionLive);
}

/** The class a game belongs to, when this teacher still has it */
export function navClass(classId: string | undefined): TeacherNavState['classes'][number] | null {
	if (!classId) return null;
	forgetOtherAccount();

	return state.classes.find((agoraClass) => agoraClass.classId === classId) ?? null;
}

/**
 * Hand the bar an answer somebody else already paid for. `uid` is the account
 * the answer was read for; an answer for anyone but the signed-in teacher is
 * dropped rather than cached under their name.
 */
export function noteTeacherDashboard(dashboard: TeacherDashboard, uid: string | null): void {
	if (uid === null || uid !== currentUid()) return;
	ownerUid = uid;
	state.canSupervise = dashboard.isSystemAdmin || dashboard.supervisedSchools.length > 0;
	noteDashboardRole(dashboard);
	state.classes = dashboard.classes;
	state.sessions = dashboard.sessions;
	state.loading = false;
	state.loaded = true;
	state.failed = false;
	filledAt = Date.now();
}

/** Fill the cache when it is empty or stale. Fire and forget; redraws when it lands. */
export function loadTeacherNav(force = false): void {
	forgetOtherAccount();
	if (state.loading) return;
	if (!force && state.loaded && Date.now() - filledAt < STALE_MS) return;
	state.loading = true;
	// The signed-in uid is what lets the dashboard be read from Firestore
	// rather than from the console; without it this falls back to the callable.
	const uid = currentUid();
	const current = generation;
	fetchTeacherDashboard(uid ?? undefined)
		.then((dashboard) => {
			if (current === generation) noteTeacherDashboard(dashboard, uid);
		})
		.catch((error: unknown) => {
			if (current !== generation) return;
			console.error('[TeacherNav] Loading the teacher menu failed:', error);
			if (uid === currentUid()) state.failed = true;
		})
		.finally(() => {
			if (current !== generation) return;
			state.loading = false;
			m.redraw();
		});
}

/** Forget everything — on sign-out, so the next teacher never sees the last one's classes */
export function clearTeacherNav(): void {
	generation++;
	clearSupervisorRole();
	state.canSupervise = false;
	state.classes = [];
	state.sessions = [];
	state.loading = false;
	state.loaded = false;
	state.failed = false;
	filledAt = 0;
	ownerUid = null;
}
