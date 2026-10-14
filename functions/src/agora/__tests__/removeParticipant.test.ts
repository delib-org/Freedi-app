import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * A tiny in-memory Firestore: `collection().doc()` refs and a transaction
 * with get / update / delete — enough to watch the four writes a removal is.
 */
const store = new Map<string, Record<string, unknown>>();

function pathOf(collectionName: string, id: string): string {
	return `${collectionName}/${id}`;
}

const fakeDb = {
	collection: (name: string) => ({
		doc: (id: string) => ({ __path: pathOf(name, id) }),
	}),
	runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
		// Buffer writes so a throw inside the body commits nothing, as Firestore does
		const writes: Array<() => void> = [];
		const tx = {
			get: async (ref: { __path: string }) => {
				const data = store.get(ref.__path);

				return { exists: data !== undefined, data: () => data };
			},
			update: (ref: { __path: string }, data: Record<string, unknown>) => {
				writes.push(() => store.set(ref.__path, { ...(store.get(ref.__path) ?? {}), ...data }));
			},
			delete: (ref: { __path: string }) => {
				writes.push(() => store.delete(ref.__path));
			},
		};
		const result = await fn(tx);
		writes.forEach((write) => write());

		return result;
	},
};

jest.mock('../../db', () => ({ db: fakeDb }));
jest.mock('firebase-functions/v2/https', () => ({
	onCall: jest.fn(),
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));

import { removeParticipant } from '../fn_agoraRemoveParticipant';

const SESSION = 's1';
const TEACHER = 'teacher-1';
const STUDENT = 'alice';
const OTHER = 'bob';
const SESSION_PATH = `agoraSessions/${SESSION}`;
const seat = (uid: string): string => `agoraParticipants/${SESSION}--${uid}`;
const hand = (uid: string): string => `agoraHands/${SESSION}--${uid}`;
const identity = (uid: string): string => `agoraIdentities/${SESSION}--${uid}`;

function seatStudent(uid: string, extra: Record<string, unknown> = {}): void {
	store.set(seat(uid), {
		participantId: `${SESSION}--${uid}`,
		sessionId: SESSION,
		userId: uid,
		anonName: `name-${uid}`,
		...extra,
	});
}

describe('removeParticipant', () => {
	beforeEach(() => {
		store.clear();
		store.set(SESSION_PATH, {
			sessionId: SESSION,
			teacherId: TEACHER,
			participantCount: 2,
			stageIndex: 3,
		});
		seatStudent(STUDENT);
		seatStudent(OTHER);
		store.set(hand(STUDENT), { sessionId: SESSION, userId: STUDENT, hands: { q: ['n1'] } });
		store.set(identity(STUDENT), { realName: 'Alice A.' });
	});

	it('blocks the uid, deletes the seat, the hand and the real name', async () => {
		const result = await removeParticipant(
			{ sessionId: SESSION, teacherUid: TEACHER, studentUid: STUDENT },
			() => 5000,
		);

		expect(result).toEqual({ ok: true, removed: true });
		const session = store.get(SESSION_PATH) ?? {};
		expect(session.removedUids).toEqual({ [STUDENT]: 5000 });
		expect(session.lastUpdate).toBe(5000);
		expect(store.has(seat(STUDENT))).toBe(false);
		expect(store.has(hand(STUDENT))).toBe(false);
		expect(store.has(identity(STUDENT))).toBe(false);
	});

	it('leaves classmates, the stage and the pseudonym counter alone', async () => {
		await removeParticipant({ sessionId: SESSION, teacherUid: TEACHER, studentUid: STUDENT });

		expect(store.has(seat(OTHER))).toBe(true);
		const session = store.get(SESSION_PATH) ?? {};
		expect(session.stageIndex).toBe(3);
		expect(session.participantCount).toBe(2);
	});

	it('keeps earlier removals and their stamps', async () => {
		await removeParticipant(
			{ sessionId: SESSION, teacherUid: TEACHER, studentUid: OTHER },
			() => 100,
		);
		await removeParticipant(
			{ sessionId: SESSION, teacherUid: TEACHER, studentUid: STUDENT },
			() => 200,
		);

		expect(store.get(SESSION_PATH)?.removedUids).toEqual({ [OTHER]: 100, [STUDENT]: 200 });
	});

	it('is repeat-safe: a second removal changes nothing', async () => {
		await removeParticipant(
			{ sessionId: SESSION, teacherUid: TEACHER, studentUid: STUDENT },
			() => 100,
		);
		const again = await removeParticipant(
			{ sessionId: SESSION, teacherUid: TEACHER, studentUid: STUDENT },
			() => 999,
		);

		expect(again).toEqual({ ok: true, removed: false });
		expect(store.get(SESSION_PATH)?.removedUids).toEqual({ [STUDENT]: 100 });
	});

	it('refuses anyone but the session teacher, and writes nothing', async () => {
		await expect(
			removeParticipant({ sessionId: SESSION, teacherUid: OTHER, studentUid: STUDENT }),
		).rejects.toMatchObject({ code: 'permission-denied' });

		expect(store.has(seat(STUDENT))).toBe(true);
		expect(store.get(SESSION_PATH)?.removedUids).toBeUndefined();
	});

	it('refuses the teacher themselves and the AI raters', async () => {
		await expect(
			removeParticipant({ sessionId: SESSION, teacherUid: TEACHER, studentUid: TEACHER }),
		).rejects.toMatchObject({ code: 'invalid-argument' });

		seatStudent('ai-rater', { isAI: true });
		await expect(
			removeParticipant({ sessionId: SESSION, teacherUid: TEACHER, studentUid: 'ai-rater' }),
		).rejects.toMatchObject({ code: 'invalid-argument' });
		expect(store.has(seat('ai-rater'))).toBe(true);
	});

	it('answers not-found for a missing session', async () => {
		await expect(
			removeParticipant({ sessionId: 'nope', teacherUid: TEACHER, studentUid: STUDENT }),
		).rejects.toMatchObject({ code: 'not-found' });
	});
});
