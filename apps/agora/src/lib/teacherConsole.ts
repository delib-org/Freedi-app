import m from 'mithril';
import { safeParse } from 'valibot';
import { db, collection, query, where, onSnapshot, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraIdentity,
	AgoraIdentitySchema,
	AgoraTeacherMessage,
	AgoraTeacherMessageSchema,
	ModerateStatementRequest,
	ModerateStatementResponse,
	TeacherMessageRequest,
} from '@freedi/shared-types';
import { moderateStatement as moderateCallable, teacherMessage } from './callables';

/**
 * The teacher's live console: the two listeners only the teacher may hold
 * (real names, the private threads) and the two callables only the teacher
 * may call. Both queries carry `teacherId == me` — that equality is what the
 * rules prove, so the SDK's listen path is fine here (the class-scoped
 * `uid in array` shape the roster console had to avoid never comes up).
 */
export interface TeacherConsoleState {
	/** userId → the real name typed at the door */
	identities: Map<string, AgoraIdentity>;
	identitiesLoaded: boolean;
	/** studentUid → the thread, oldest first */
	threads: Map<string, AgoraTeacherMessage[]>;
	threadsLoaded: boolean;
}

const state: TeacherConsoleState = {
	identities: new Map(),
	identitiesLoaded: false,
	threads: new Map(),
	threadsLoaded: false,
};

let unsubscribers: Unsubscribe[] = [];
let listeningKey = '';
let seenKey = '';
let identitiesOn = false;

export function getTeacherConsoleState(): Readonly<TeacherConsoleState> {
	return state;
}

/**
 * What this device may hold. A screen on the wall subscribes to neither the
 * names nor the private threads: a name a tab never fetched cannot leak
 * through a stale cache, a bug, or the dev tools. See lib/flows/deviceRole.
 */
export interface TeacherConsoleOptions {
	identities: boolean;
	threads: boolean;
}

const EVERYTHING: TeacherConsoleOptions = { identities: true, threads: true };

export function listenToTeacherConsole(
	sessionId: string,
	teacherUid: string,
	options: TeacherConsoleOptions = EVERYTHING,
): void {
	// The options are part of the key: a device that turns private re-subscribes
	const key = `${sessionId}--${teacherUid}--${options.identities ? 'n' : '-'}${options.threads ? 't' : '-'}`;
	if (listeningKey === key) return;
	stopTeacherConsole();
	listeningKey = key;
	seenKey = `agora_${sessionId}_teacherseen`;
	unsubscribers = [];
	identitiesOn = options.identities;
	if (!options.identities && !options.threads) return;

	const identitiesUnsub = !options.identities
		? null
		: onSnapshot(
				query(
					collection(db, Collections.agoraIdentities),
					where('sessionId', '==', sessionId),
					where('teacherId', '==', teacherUid),
				),
				(snapshot) => {
					const identities = new Map<string, AgoraIdentity>();
					snapshot.forEach((docSnap) => {
						const parsed = safeParse(AgoraIdentitySchema, docSnap.data());
						if (parsed.success) identities.set(parsed.output.userId, parsed.output);
					});
					state.identities = identities;
					state.identitiesLoaded = true;
					m.redraw();
				},
				(error) => {
					console.error('[TeacherConsole] Identities listener failed:', error);
				},
			);

	const threadsUnsub = !options.threads
		? null
		: onSnapshot(
				query(
					collection(db, Collections.agoraTeacherMessages),
					where('sessionId', '==', sessionId),
					where('teacherId', '==', teacherUid),
				),
				(snapshot) => {
					const threads = new Map<string, AgoraTeacherMessage[]>();
					snapshot.forEach((docSnap) => {
						const parsed = safeParse(AgoraTeacherMessageSchema, docSnap.data());
						if (!parsed.success) return;
						const line = parsed.output;
						const thread = threads.get(line.studentUid) ?? [];
						thread.push(line);
						threads.set(line.studentUid, thread);
					});
					threads.forEach((thread) => thread.sort((a, b) => a.createdAt - b.createdAt));
					state.threads = threads;
					state.threadsLoaded = true;
					m.redraw();
				},
				(error) => {
					console.error('[TeacherConsole] Threads listener failed:', error);
				},
			);

	unsubscribers = [identitiesUnsub, threadsUnsub].filter(
		(unsubscribe): unsubscribe is Unsubscribe => unsubscribe !== null,
	);
}

/** Whether this device holds the names at all — the wall never does */
export function identitiesSubscribed(): boolean {
	return identitiesOn;
}

export function stopTeacherConsole(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningKey = '';
	identitiesOn = false;
	state.identities = new Map();
	state.identitiesLoaded = false;
	state.threads = new Map();
	state.threadsLoaded = false;
}

/** The real name behind a student, or undefined when they skipped it */
export function realNameOf(userId: string): string | undefined {
	return state.identities.get(userId)?.realName;
}

export function threadFor(studentUid: string): readonly AgoraTeacherMessage[] {
	return state.threads.get(studentUid) ?? [];
}

// ---- "seen" watermarks — the teacher's own, so sessionStorage is enough ----

function readSeenMap(): Record<string, number> {
	try {
		const raw = sessionStorage.getItem(seenKey);

		return raw ? (JSON.parse(raw) as Record<string, number>) : {};
	} catch {
		return {};
	}
}

/**
 * Lines the teacher has not yet opened: the student's replies, and the
 * language gate's notices filed on this student (`from: 'system'`) — a
 * refused slur is news the teacher owes a look as much as a reply is.
 */
export function unreadRepliesFor(studentUid: string): number {
	const seen = readSeenMap()[studentUid] ?? 0;

	return threadFor(studentUid).filter((line) => line.from !== 'teacher' && line.createdAt > seen)
		.length;
}

/** Unread replies across the whole class — the tab badge */
export function unreadRepliesTotal(): number {
	let total = 0;
	state.threads.forEach((_thread, uid) => {
		total += unreadRepliesFor(uid);
	});

	return total;
}

export function markStudentThreadSeen(studentUid: string): void {
	const latest = threadFor(studentUid).reduce((max, line) => Math.max(max, line.createdAt), 0);
	const map = readSeenMap();
	map[studentUid] = Math.max(latest, map[studentUid] ?? 0);
	try {
		sessionStorage.setItem(seenKey, JSON.stringify(map));
	} catch {
		// Storage refused — the badge simply persists for this sitting
	}
}

// ---- the two teacher-only writes ----

export async function sendTeacherNote(request: TeacherMessageRequest): Promise<void> {
	await teacherMessage(request);
}

export async function moderateStatement(
	request: ModerateStatementRequest,
): Promise<ModerateStatementResponse> {
	return moderateCallable(request);
}

/**
 * The callable's refusal codes, as something the console can say. Anything
 * it does not recognise reads as the generic failure line.
 */
export function moderationErrorKey(error: unknown): string {
	const text = String(error);
	if (/on-ballot/.test(text)) return 'teacher.hide_on_ballot';
	if (/thread-full/.test(text)) return 'teacher.thread_full';

	return 'teacher.moderation_failed';
}
