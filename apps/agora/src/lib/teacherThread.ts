import m from 'mithril';
import { safeParse } from 'valibot';
import { db, collection, query, where, onSnapshot, Unsubscribe } from './firebase';
import { Collections, AgoraTeacherMessage, AgoraTeacherMessageSchema } from '@freedi/shared-types';
import { teacherMessage } from './callables';
import { trackWrite } from './confirmedWrite';

/**
 * The student's side of the private thread with the teacher.
 *
 * One listener on `agoraTeacherMessages` keyed by session + my uid — the
 * exact pair the rule proves — so a note, a reply and a moderation notice all
 * arrive the same way, whatever stage the room is on. Replies go through the
 * callable: the collection takes no client writes at all.
 */
const state: { messages: AgoraTeacherMessage[]; loaded: boolean } = {
	messages: [],
	loaded: false,
};

let unsubscribe: Unsubscribe | null = null;
let listeningKey = '';
let storageKey = '';

function seenKey(sessionId: string): string {
	return `agora_${sessionId}_teacherseen`;
}

function readSeen(): number {
	try {
		return Number(sessionStorage.getItem(storageKey) ?? '0');
	} catch {
		return 0;
	}
}

export function listenToTeacherThread(sessionId: string, userId: string): void {
	const key = `${sessionId}--${userId}`;
	if (listeningKey === key) return;
	stopTeacherThread();
	listeningKey = key;
	storageKey = seenKey(sessionId);

	unsubscribe = onSnapshot(
		query(
			collection(db, Collections.agoraTeacherMessages),
			where('sessionId', '==', sessionId),
			where('studentUid', '==', userId),
		),
		(snapshot) => {
			const messages: AgoraTeacherMessage[] = [];
			snapshot.forEach((docSnap) => {
				const parsed = safeParse(AgoraTeacherMessageSchema, docSnap.data());
				if (parsed.success) messages.push(parsed.output);
			});
			messages.sort((a, b) => a.createdAt - b.createdAt);
			state.messages = messages;
			state.loaded = true;
			m.redraw();
		},
		(error) => {
			console.error('[TeacherThread] Listener failed:', error);
		},
	);
}

export function stopTeacherThread(): void {
	if (unsubscribe) unsubscribe();
	unsubscribe = null;
	listeningKey = '';
	state.messages = [];
	state.loaded = false;
}

export function getTeacherThread(): readonly AgoraTeacherMessage[] {
	return state.messages;
}

/** Has the teacher ever written? Decides whether the door is drawn at all. */
export function hasTeacherThread(): boolean {
	return state.messages.length > 0;
}

/** Lines from the teacher newer than the last time the sheet was open */
export function teacherThreadUnread(): number {
	const seen = readSeen();

	return state.messages.filter((line) => line.from === 'teacher' && line.createdAt > seen).length;
}

/** The sheet was opened: everything up to now has been read */
export function markTeacherThreadSeen(): void {
	const latest = state.messages.reduce((max, line) => Math.max(max, line.createdAt), 0);
	try {
		sessionStorage.setItem(storageKey, String(Math.max(latest, readSeen())));
	} catch {
		// Storage refused — the badge simply persists for this sitting
	}
}

/** A reply from the student. Confirmed like every write that matters. */
export async function replyToTeacher(sessionId: string, text: string): Promise<void> {
	await trackWrite(`teacher-reply--${sessionId}`, teacherMessage({ sessionId, text }));
}

/** What the moderation notice says the teacher removed, for one statement */
export function removedTextFor(statementId: string): AgoraTeacherMessage | undefined {
	return [...state.messages]
		.reverse()
		.find((line) => line.aboutStatementId === statementId && line.moderation === 'hidden');
}
