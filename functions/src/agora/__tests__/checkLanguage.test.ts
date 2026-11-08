import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AGORA_POINTS } from '@freedi/shared-types';

/**
 * A tiny in-memory Firestore: `collection().doc().get()/set()` plus
 * `runTransaction`, enough to watch the strike ledger and the thread line.
 */
const store = new Map<string, Record<string, unknown>>();
const sets: Array<{ path: string; data: Record<string, unknown> }> = [];

function pathOf(collectionName: string, id: string): string {
	return `${collectionName}/${id}`;
}

const fakeDb = {
	collection: (name: string) => ({
		doc: (id: string) => ({
			get: async () => {
				const data = store.get(pathOf(name, id));

				return { exists: data !== undefined, data: () => data };
			},
			set: async (data: Record<string, unknown>) => {
				store.set(pathOf(name, id), data);
				sets.push({ path: pathOf(name, id), data });
			},
			__path: pathOf(name, id),
		}),
	}),
	runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
		const tx = {
			get: async (ref: { __path: string }) => {
				const data = store.get(ref.__path);

				return { exists: data !== undefined, data: () => data };
			},
			update: (ref: { __path: string }, data: Record<string, unknown>) => {
				store.set(ref.__path, { ...(store.get(ref.__path) ?? {}), ...data });
			},
		};

		return fn(tx);
	},
};

jest.mock('../../db', () => ({ db: fakeDb }));
jest.mock('../../fn_profanityChecker', () => ({ containsBadLanguage: jest.fn() }));
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

import { checkLanguageFor } from '../fn_agoraCheckLanguage';

const SESSION = 's1';
const STUDENT = 'alice';
const TEACHER = 'teacher-1';
const PARTICIPANT = `agoraParticipants/${SESSION}--${STUDENT}`;

const clean = async (): Promise<boolean> => false;
const dirty = async (): Promise<boolean> => true;

function participant(): Record<string, unknown> {
	return store.get(PARTICIPANT) ?? {};
}

describe('checkLanguageFor', () => {
	beforeEach(() => {
		store.clear();
		sets.length = 0;
		store.set(`agoraSessions/${SESSION}`, { sessionId: SESSION, teacherId: TEACHER });
		store.set(PARTICIPANT, {
			participantId: `${SESSION}--${STUDENT}`,
			sessionId: SESSION,
			userId: STUDENT,
			anonName: 'Fox',
			points: { valueAccuracy: 0, proposals: 3, helping: 2, total: 5 },
		});
	});

	it('lets clean text through without touching anything', async () => {
		const result = await checkLanguageFor(
			{ uid: STUDENT, sessionId: SESSION, text: 'We should plant trees along the road.' },
			clean,
		);
		expect(result).toEqual({ ok: true });
		expect(participant().languageStrikes).toBeUndefined();
		expect(sets).toHaveLength(0);
	});

	describe("the teacher's banned words", () => {
		const BANNED = `agoraTeacherBannedWords/${TEACHER}`;

		beforeEach(() => {
			store.set(BANNED, { teacherId: TEACHER, words: ['טמבל', 'stupid'], lastUpdate: 1 });
		});

		it('asks for a rephrase with the matched word — no strike, no thread line, no model', async () => {
			const detect = jest.fn(async () => true);
			const result = await checkLanguageFor(
				{ uid: STUDENT, sessionId: SESSION, text: 'דיברת כמו הטמבל הזה' },
				detect,
			);
			expect(result).toEqual({ ok: false, reason: 'banned_word', word: 'הטמבל' });
			expect(detect).not.toHaveBeenCalled();
			expect(participant().languageStrikes).toBeUndefined();
			expect(sets).toHaveLength(0);
		});

		it('matches whole words, case-insensitively', async () => {
			expect(
				await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'So STUPID!' }, clean),
			).toEqual({ ok: false, reason: 'banned_word', word: 'stupid' });
			expect(
				await checkLanguageFor(
					{ uid: STUDENT, sessionId: SESSION, text: 'a stupidly long note' },
					clean,
				),
			).toEqual({ ok: true });
		});

		it('lets the text through once the word is removed from the list', async () => {
			store.set(BANNED, { teacherId: TEACHER, words: [], lastUpdate: 2 });
			expect(
				await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'So stupid' }, clean),
			).toEqual({ ok: true });
		});

		it("never applies another teacher's list", async () => {
			store.delete(BANNED);
			store.set('agoraTeacherBannedWords/other', { teacherId: 'other', words: ['stupid'] });
			expect(
				await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'So stupid' }, clean),
			).toEqual({ ok: true });
		});
	});

	it('treats blank text as clean without asking the detector', async () => {
		const detect = jest.fn(async () => true);
		const result = await checkLanguageFor(
			{ uid: STUDENT, sessionId: SESSION, text: '   ' },
			detect,
		);
		expect(result).toEqual({ ok: true });
		expect(detect).not.toHaveBeenCalled();
	});

	it('charges the strike, files the words on the thread and reports the cost', async () => {
		const result = await checkLanguageFor(
			{ uid: STUDENT, sessionId: SESSION, text: 'you are all idiots', statementId: 'p1' },
			dirty,
			() => 1234,
		);
		expect(result).toEqual({
			ok: false,
			reason: 'language',
			strikes: 1,
			deducted: AGORA_POINTS.LANGUAGE_PENALTY,
			pointsTotal: 5 - AGORA_POINTS.LANGUAGE_PENALTY,
		});

		const doc = participant();
		expect(doc.languageStrikes).toBe(1);
		expect(doc.lastLanguageStrikeAt).toBe(1234);
		expect((doc.points as { total: number; penalties: number }).total).toBe(
			5 - AGORA_POINTS.LANGUAGE_PENALTY,
		);
		expect((doc.points as { penalties: number }).penalties).toBe(AGORA_POINTS.LANGUAGE_PENALTY);

		const line = sets.find((entry) => entry.path.startsWith('agoraTeacherMessages/'));
		expect(line).toBeDefined();
		expect(line?.data).toMatchObject({
			sessionId: SESSION,
			teacherId: TEACHER,
			studentUid: STUDENT,
			from: 'system',
			kind: 'language',
			text: '',
			aboutStatementId: 'p1',
			removedText: 'you are all idiots',
		});
	});

	it("files where the student was writing, for the teacher's alert", async () => {
		await checkLanguageFor(
			{
				uid: STUDENT,
				sessionId: SESSION,
				text: 'shut up',
				statementId: 'a1',
				place: 'answer',
				itemId: 'q-2',
			},
			dirty,
		);
		const line = sets.find((entry) => entry.path.startsWith('agoraTeacherMessages/'));
		expect(line?.data).toMatchObject({
			kind: 'language',
			languagePlace: 'answer',
			languageItemId: 'q-2',
			aboutStatementId: 'a1',
			removedText: 'shut up',
		});
	});

	it('leaves the place off a line when the client did not say', async () => {
		await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'bad' }, dirty);
		const line = sets.find((entry) => entry.path.startsWith('agoraTeacherMessages/'));
		expect(line?.data.languagePlace).toBeUndefined();
		expect(line?.data.languageItemId).toBeUndefined();
	});

	it('counts every refusal and floors the balance at zero', async () => {
		await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'bad one' }, dirty);
		await checkLanguageFor({ uid: STUDENT, sessionId: SESSION, text: 'bad two' }, dirty);
		const third = await checkLanguageFor(
			{ uid: STUDENT, sessionId: SESSION, text: 'bad three' },
			dirty,
		);
		expect(third).toMatchObject({ ok: false, strikes: 3, deducted: 1, pointsTotal: 0 });
		expect(participant().languageStrikes).toBe(3);
		expect(sets.filter((entry) => entry.path.startsWith('agoraTeacherMessages/'))).toHaveLength(3);
	});

	it('refuses a caller who is not seated in the session', async () => {
		await expect(
			checkLanguageFor({ uid: 'stranger', sessionId: SESSION, text: 'hello there' }, clean),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('refuses an unknown session', async () => {
		await expect(
			checkLanguageFor({ uid: STUDENT, sessionId: 'nope', text: 'hello there' }, clean),
		).rejects.toMatchObject({ code: 'not-found' });
	});
});
