import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AGORA_REJOIN } from '@freedi/shared-types';

/** In-memory Firestore: doc refs plus a transaction with get / update / set / delete */
const store = new Map<string, Record<string, unknown>>();

function pathOf(collectionName: string, id: string): string {
	return `${collectionName}/${id}`;
}

const fakeDb = {
	collection: (name: string) => ({
		doc: (id: string) => ({ __path: pathOf(name, id), id }),
	}),
	runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
		const writes: Array<() => void> = [];
		const tx = {
			get: async (ref: { __path: string }) => {
				const data = store.get(ref.__path);

				return { exists: data !== undefined, data: () => data };
			},
			update: (ref: { __path: string }, data: Record<string, unknown>) => {
				writes.push(() => store.set(ref.__path, { ...(store.get(ref.__path) ?? {}), ...data }));
			},
			set: (ref: { __path: string }, data: Record<string, unknown>) => {
				writes.push(() => store.set(ref.__path, data));
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

import { knockToRejoin, resolveRejoin } from '../rejoin';

const SESSION = 's1';
const TEACHER = 'teacher-1';
const STUDENT = 'alice';
const SESSION_PATH = `agoraSessions/${SESSION}`;
const SEAT = `agoraParticipants/${SESSION}--${STUDENT}`;
const PARKED = `agoraRemovals/${SESSION}--${STUDENT}`;
const IDENTITY = `agoraIdentities/${SESSION}--${STUDENT}`;

const removals = (): Record<string, Record<string, unknown>> =>
	(store.get(SESSION_PATH)?.removedUids ?? {}) as Record<string, Record<string, unknown>>;

const answer = (decision: 'approve' | 'decline', teacherUid = TEACHER, at = 3000) =>
	resolveRejoin({ sessionId: SESSION, teacherUid, studentUid: STUDENT, decision }, () => at);

describe('rejoin: knock, decline, approve', () => {
	beforeEach(() => {
		store.clear();
		store.set(SESSION_PATH, {
			sessionId: SESSION,
			teacherId: TEACHER,
			participantCount: 9,
			stageIndex: 4,
			removedUids: { [STUDENT]: { removedAt: 1000, anonName: 'Blue Fox' } },
		});
		store.set(PARKED, {
			participant: {
				participantId: `${SESSION}--${STUDENT}`,
				sessionId: SESSION,
				userId: STUDENT,
				anonName: 'Blue Fox',
				camp: 'left',
				points: { valueAccuracy: 0, proposals: 3, helping: 1, total: 4 },
				firstProposalAwardedAt: 500,
				joinedAt: 100,
				lastActive: 900,
			},
		});
	});

	it('a knock stamps the request and seats nobody', async () => {
		expect(await knockToRejoin(SESSION, STUDENT, () => 2000)).toEqual({ anonName: 'Blue Fox' });
		expect(removals()[STUDENT].requestedAt).toBe(2000);
		expect(store.has(SEAT)).toBe(false);
	});

	it('one pending request per uid: a second knock changes nothing', async () => {
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		await knockToRejoin(SESSION, STUDENT, () => 2500);
		expect(removals()[STUDENT].requestedAt).toBe(2000);
	});

	it('a login that is not on the list is not a knock', async () => {
		expect(await knockToRejoin(SESSION, 'bob', () => 2000)).toBeNull();
	});

	it('decline keeps them out, forgets the typed name, and pauses the next knock', async () => {
		store.set(IDENTITY, { realName: 'Alice A.' });
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		expect(await answer('decline')).toEqual({ ok: true, decision: 'decline' });
		expect(removals()[STUDENT].declinedAt).toBe(3000);
		expect(store.has(SEAT)).toBe(false);
		expect(store.has(IDENTITY)).toBe(false);

		await expect(knockToRejoin(SESSION, STUDENT, () => 3500)).rejects.toMatchObject({
			code: 'failed-precondition',
		});
		await knockToRejoin(SESSION, STUDENT, () => 3000 + AGORA_REJOIN.REQUEST_COOLDOWN_MS);
		expect(removals()[STUDENT].requestedAt).toBe(3000 + AGORA_REJOIN.REQUEST_COOLDOWN_MS);
	});

	it('approve gives the parked seat back under the old pseudonym', async () => {
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		expect(await answer('approve')).toEqual({ ok: true, decision: 'approve' });

		expect(removals()[STUDENT]).toBeUndefined();
		const seat = store.get(SEAT) ?? {};
		expect(seat.anonName).toBe('Blue Fox');
		expect(seat.camp).toBe('left');
		expect(seat.firstProposalAwardedAt).toBe(500);
		expect((seat.points as { total: number }).total).toBe(4);
		expect(seat.lastActive).toBe(3000);
		expect(store.has(PARKED)).toBe(false);
		const session = store.get(SESSION_PATH) ?? {};
		expect(session.participantCount).toBe(9);
		expect(session.stageIndex).toBe(4);
	});

	it('approve without a parked seat still seats them under the old pseudonym', async () => {
		store.delete(PARKED);
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		await answer('approve');
		expect(store.get(SEAT)?.anonName).toBe('Blue Fox');
	});

	it('only a pending knock can be answered', async () => {
		await expect(answer('approve')).rejects.toMatchObject({ code: 'failed-precondition' });
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		await answer('decline');
		await expect(answer('approve', TEACHER, 4000)).rejects.toMatchObject({
			code: 'failed-precondition',
		});
		expect(store.has(SEAT)).toBe(false);
	});

	it('only the session teacher may answer', async () => {
		await knockToRejoin(SESSION, STUDENT, () => 2000);
		await expect(answer('approve', 'bob')).rejects.toMatchObject({ code: 'permission-denied' });
		expect(store.has(SEAT)).toBe(false);
	});
});
