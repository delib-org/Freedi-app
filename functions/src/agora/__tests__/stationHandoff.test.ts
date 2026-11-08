import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Linked stations end to end on the server: the plan keeps its link, a
 * pasted link is checked against the question, a code is minted only for a
 * seated student at an opened step, and redeemed once, before it expires,
 * for the app it was minted for — as the same uid, under a pseudonym.
 */

jest.mock('../../db', () => ({
	db: jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore')
		.fakeDb,
}));
jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_options: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		details: unknown;
		constructor(code: string, message: string, details?: unknown) {
			super(message);
			this.code = code;
			this.details = details;
		}
	},
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

const createCustomToken = jest.fn(async (uid: string, claims: object) =>
	JSON.stringify({ uid, claims }),
);
const updateUser = jest.fn(async () => undefined);
jest.mock('firebase-admin/auth', () => ({
	getAuth: () => ({ createCustomToken, updateUser }),
}));

import {
	AGORA_STATION_LINK,
	Access,
	AgoraSessionStatus,
	AgoraStage,
	Role,
	StatementType,
	parseHandoffFragment,
	type AgoraStagePlan,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import { Timestamp } from 'firebase-admin/firestore';
import { store } from './helpers/fakeFirestore';
import { sanitizeStagePlan } from '../stagePlanInput';
import { checkStationLink, verifyPlanLinks } from '../stationLink';
import { mintStationHandoff } from '../fn_agoraMintStationHandoff';
import { consumeAppHandoff, digestHandoffCode, storeAppHandoff } from '../../handoff/appHandoff';
import { guestDisplayName, redeemForGuest } from '../../handoff/fn_redeemAppHandoff';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const SESSION = 's1';
const ITEM = 'linked-1';
const QUESTION = 'q1';
const NOW = 1_000_000;
const LINK = { app: 'main' as const, statementId: QUESTION, title: 'Old words', linkedAt: 5 };

interface Reasoned {
	code: string;
	details?: { reason?: string };
}

async function refusal(promise: Promise<unknown>): Promise<Reasoned> {
	try {
		await promise;
	} catch (error) {
		return error as Reasoned;
	}
	throw new Error('expected a refusal');
}

function plan(linked: Partial<AgoraStagePlanItem> = {}): AgoraStagePlan {
	return [
		{ itemId: 'lobby', stage: AgoraStage.lobby },
		{ itemId: ITEM, stage: AgoraStage.linked, link: LINK, ...linked },
		{ itemId: 'results', stage: AgoraStage.results },
	];
}

function seedQuestion(extra: Record<string, unknown> = {}): void {
	store.set(`statements/${QUESTION}`, {
		statementId: QUESTION,
		statement: '  Where should the garden go?  ',
		statementType: StatementType.question,
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		parentId: 'top',
		topParentId: QUESTION,
		...extra,
	});
}

function seedSession(extra: Record<string, unknown> = {}): void {
	store.set(`agoraSessions/${SESSION}`, {
		sessionId: SESSION,
		teacherId: TEACHER,
		status: AgoraSessionStatus.live,
		stage: AgoraStage.linked,
		stageIndex: 1,
		stagePlan: plan(),
		...extra,
	});
}

function seatStudent(extra: Record<string, unknown> = {}): void {
	store.set(`agoraParticipants/${SESSION}--${STUDENT}`, {
		participantId: `${SESSION}--${STUDENT}`,
		sessionId: SESSION,
		userId: STUDENT,
		anonName: 'Brave Owl',
		joinedAt: 7,
		...extra,
	});
}

beforeEach(() => {
	store.clear();
	jest.clearAllMocks();
	process.env.STATION_MAIN_ORIGIN = 'https://app.wizcol.com';
});

describe('sanitizeStagePlan', () => {
	it('copies the link and the texts of a linked step', () => {
		const clean = sanitizeStagePlan(
			plan({ title: '  Garden vote ', explanation: ' Rate two ', link: { ...LINK, title: ' x ' } }),
			{ hasCharacters: false },
		);
		expect(clean[1]).toEqual({
			itemId: ITEM,
			stage: AgoraStage.linked,
			title: 'Garden vote',
			explanation: 'Rate two',
			link: { ...LINK, title: 'x' },
		});
	});

	it('refuses a linked step without a link', () => {
		expect(() => sanitizeStagePlan(plan({ link: undefined }), { hasCharacters: false })).toThrow(
			/linked_needs_link/,
		);
	});
});

describe('checkStationLink / verifyPlanLinks', () => {
	it("returns the question's words for its admin", async () => {
		seedQuestion();
		await expect(
			checkStationLink(`https://app.wizcol.com/statement/${QUESTION}`, TEACHER),
		).resolves.toEqual({
			app: 'main',
			statementId: QUESTION,
			title: 'Where should the garden go?',
		});
	});

	it('names what is wrong with a link', async () => {
		seedQuestion();
		expect(
			(await refusal(checkStationLink('https://evil.example/statement/q1', TEACHER))).details,
		).toEqual({ reason: 'bad_link' });
		expect(
			(await refusal(checkStationLink('https://join.wizcol.com/q/q1', TEACHER))).details,
		).toEqual({ reason: 'bad_link' });
		expect(
			(await refusal(checkStationLink('https://app.wizcol.com/statement/nope', TEACHER))).details,
		).toEqual({ reason: 'not_found' });
		expect(
			(await refusal(checkStationLink(`https://app.wizcol.com/statement/${QUESTION}`, 'stranger')))
				.details,
		).toEqual({ reason: 'not_admin' });
		seedQuestion({ statementType: StatementType.option });
		expect(
			(await refusal(checkStationLink(`https://app.wizcol.com/statement/${QUESTION}`, TEACHER)))
				.details,
		).toEqual({ reason: 'not_question' });
	});

	it('keeps a stored link as stored, and re-checks a new one with server words', async () => {
		seedQuestion();
		const kept = await verifyPlanLinks(plan(), 'stranger', plan(), NOW);
		expect(kept[1].link).toEqual(LINK);

		const fresh = await verifyPlanLinks(plan(), TEACHER, [], NOW);
		expect(fresh[1].link).toEqual({
			app: 'main',
			statementId: QUESTION,
			title: 'Where should the garden go?',
			linkedAt: NOW,
		});
		expect((await refusal(verifyPlanLinks(plan(), 'stranger', [], NOW))).details).toEqual({
			reason: 'not_admin',
		});
	});
});

describe('appHandoff codes', () => {
	const record = {
		uid: STUDENT,
		app: 'main' as const,
		sessionId: SESSION,
		itemId: ITEM,
		statementId: QUESTION,
	};

	it('stores only the hash, and redeems once', async () => {
		const { code, expiresAt } = await storeAppHandoff(record, NOW);
		expect(expiresAt).toBe(NOW + AGORA_STATION_LINK.HANDOFF_TTL_MS);
		expect(store.has(`appHandoffs/${code}`)).toBe(false);
		expect(store.get(`appHandoffs/${digestHandoffCode(code)}`)).toMatchObject(record);
		// The TTL policy sweeps on a Timestamp; the ms field alone would never expire
		expect(Timestamp.fromMillis).toHaveBeenCalledWith(expiresAt);
		expect(store.get(`appHandoffs/${digestHandoffCode(code)}`)).toHaveProperty('expireAt');

		await expect(consumeAppHandoff(code, 'main', NOW + 1)).resolves.toMatchObject(record);
		expect(store.has(`appHandoffs/${digestHandoffCode(code)}`)).toBe(false);
		expect((await refusal(consumeAppHandoff(code, 'main', NOW + 2))).details).toEqual({
			reason: 'expired',
		});
	});

	it('refuses an expired code and a code for another app', async () => {
		const { code } = await storeAppHandoff(record, NOW);
		expect((await refusal(consumeAppHandoff(code, 'join', NOW))).details).toEqual({
			reason: 'wrong_app',
		});
		expect(
			(await refusal(consumeAppHandoff(code, 'main', NOW + AGORA_STATION_LINK.HANDOFF_TTL_MS + 1)))
				.details,
		).toEqual({ reason: 'expired' });
		expect((await refusal(consumeAppHandoff('x'.repeat(101), 'main', NOW))).code).toBe(
			'invalid-argument',
		);
	});
});

describe('mintStationHandoff', () => {
	it('mints a fragment link for a seated student at an opened step', async () => {
		seedSession();
		seatStudent();
		const { url, expiresAt } = await mintStationHandoff(
			STUDENT,
			{ sessionId: SESSION, itemId: ITEM },
			NOW,
		);
		expect(url.startsWith(`https://app.wizcol.com/statement/${QUESTION}#`)).toBe(true);
		expect(expiresAt).toBe(NOW + AGORA_STATION_LINK.HANDOFF_TTL_MS);
		const fragment = parseHandoffFragment(new URL(url).hash);
		expect(fragment).toMatchObject({ opened: true, sessionId: SESSION, itemId: ITEM });
		expect(store.get(`appHandoffs/${digestHandoffCode(fragment?.code ?? '')}`)).toMatchObject({
			uid: STUDENT,
			statementId: QUESTION,
		});
	});

	it('refuses strangers, removed students, future steps, other steps and ended lessons', async () => {
		seedSession();
		expect(
			(await refusal(mintStationHandoff(STUDENT, { sessionId: SESSION, itemId: ITEM }, NOW))).code,
		).toBe('permission-denied');
		seatStudent();
		expect(
			(await refusal(mintStationHandoff(STUDENT, { sessionId: SESSION, itemId: 'lobby' }, NOW)))
				.code,
		).toBe('invalid-argument');
		seedSession({ stage: AgoraStage.lobby, stageIndex: 0 });
		expect(
			(await refusal(mintStationHandoff(STUDENT, { sessionId: SESSION, itemId: ITEM }, NOW)))
				.details,
		).toEqual({ reason: 'closed' });
		seedSession({ status: AgoraSessionStatus.ended, stage: AgoraStage.ended, stageIndex: 3 });
		expect(
			(await refusal(mintStationHandoff(STUDENT, { sessionId: SESSION, itemId: ITEM }, NOW)))
				.details,
		).toEqual({ reason: 'ended' });
		seedSession({ removedUids: { [STUDENT]: { removedAt: 1 } } });
		expect(
			(await refusal(mintStationHandoff(STUDENT, { sessionId: SESSION, itemId: ITEM }, NOW))).code,
		).toBe('permission-denied');
	});
});

describe('redeemForGuest', () => {
	const record = {
		uid: STUDENT,
		app: 'main' as const,
		sessionId: SESSION,
		itemId: ITEM,
		statementId: QUESTION,
		expiresAt: NOW + 1,
		createdAt: NOW,
	};

	it('signs in as the same uid with the claim, under the Agora pseudonym', async () => {
		seedSession();
		seatStudent();
		seedQuestion({ membership: { access: Access.public } });
		const result = await redeemForGuest(record, NOW);
		expect(result).toMatchObject({ displayName: 'Brave Owl', sessionId: SESSION, itemId: ITEM });
		expect(createCustomToken).toHaveBeenCalledWith(STUDENT, {
			agora: { s: SESSION, i: ITEM, q: QUESTION },
		});
		expect(updateUser).toHaveBeenCalledWith(STUDENT, { displayName: 'Brave Owl' });
		// Open question: nothing to add
		expect(store.has(`statementsSubscribe/${STUDENT}--${QUESTION}`)).toBe(false);
	});

	it('adds a member subscription to a private question, never over an existing role', async () => {
		seedSession();
		seatStudent();
		seedQuestion({ membership: { access: Access.moderated } });
		await redeemForGuest(record, NOW);
		expect(store.get(`statementsSubscribe/${STUDENT}--${QUESTION}`)).toMatchObject({
			role: Role.member,
			userId: STUDENT,
			statementId: QUESTION,
			user: { uid: STUDENT, displayName: 'Brave Owl' },
		});

		store.set(`statementsSubscribe/${STUDENT}--${QUESTION}`, { role: Role.banned });
		await redeemForGuest(record, NOW);
		expect(store.get(`statementsSubscribe/${STUDENT}--${QUESTION}`)).toEqual({ role: Role.banned });
	});

	it('refuses an ended lesson and a student without a seat', async () => {
		seedQuestion();
		seedSession({ status: AgoraSessionStatus.ended });
		seatStudent();
		expect((await refusal(redeemForGuest(record, NOW))).details).toEqual({ reason: 'ended' });
		seedSession();
		store.delete(`agoraParticipants/${SESSION}--${STUDENT}`);
		expect((await refusal(redeemForGuest(record, NOW))).code).toBe('permission-denied');
		expect(createCustomToken).not.toHaveBeenCalled();
	});

	it('never uses a typed name from a named session', () => {
		expect(
			guestDisplayName({ identity: 'named' }, { anonName: 'Dana Levi', joinedAt: 3 }),
		).not.toBe('Dana Levi');
		expect(guestDisplayName({}, { anonName: 'Brave Owl', joinedAt: 3 })).toBe('Brave Owl');
	});
});
