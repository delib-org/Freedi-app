/**
 * getAnswerBatch: who may call it, what it may return, batch paging for one
 * person, the per-instance answers cache, and the cap on `size`.
 */
import type { CallableRequest } from 'firebase-functions/v2/https';
import { ANSWER_BATCH, type GetAnswerBatchRequest } from '@freedi/shared-types';

jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../services/__tests__/helpers/fakeFirestore').firestoreModule,
);
jest.mock('firebase-functions/v2/https', () => {
	class HttpsError extends Error {
		constructor(
			readonly code: string,
			message: string,
		) {
			super(message);
		}
	}

	return { HttpsError, onCall: (_options: unknown, handler: unknown) => handler };
});
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../config/cors', () => ({ ALLOWED_ORIGINS: [] }));

const mockEnforce = jest.fn();
jest.mock('../utils/rateLimit', () => ({
	enforceCallableRateLimit: (...args: unknown[]) => mockEnforce(...args),
}));
jest.mock('../db', () => {
	const { getFirestore } = jest.requireActual('../services/__tests__/helpers/fakeFirestore')
		.firestoreModule as { getFirestore: () => unknown };

	return { db: getFirestore() };
});

import { executeGetAnswerBatch } from '../fn_getAnswerBatch';
import { resetFirestore, seed } from '../services/__tests__/helpers/fakeFirestore';

const QUESTION = 'q1';
const MEMBER = 'member-1';

/** Each test gets its own question, so the 30 s cache cannot carry answers across tests. */
let questionId = QUESTION;
let questionCounter = 0;

function seedQuestion(id: string, access: string): void {
	seed('statements', id, {
		statementId: id,
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		membership: { access },
	});
}

function seedAnswers(count: number, extra: Record<string, unknown> = {}): void {
	for (let index = 0; index < count; index++) {
		seed('statements', `${questionId}-a${index}`, {
			statementId: `${questionId}-a${index}`,
			statement: `Answer ${index}`,
			statementType: 'option',
			parentId: questionId,
			topParentId: questionId,
			creatorId: 'someone-else',
			createdAt: 1,
			lastUpdate: 1,
			...extra,
		});
	}
}

function member(uid: string, statementId: string, role = 'member'): void {
	seed('statementsSubscribe', `${uid}--${statementId}`, { userId: uid, statementId, role });
}

function rating(uid: string, statementId: string): void {
	seed('evaluations', `${uid}--${statementId}`, {
		evaluatorId: uid,
		parentId: questionId,
		statementId,
		evaluation: 1,
	});
}

function call(
	uid: string | undefined,
	data: Partial<GetAnswerBatchRequest> = { questionId },
): ReturnType<typeof executeGetAnswerBatch> {
	return executeGetAnswerBatch({
		auth: uid ? { uid } : undefined,
		data,
		rawRequest: { headers: {} },
	} as unknown as CallableRequest<GetAnswerBatchRequest>);
}

beforeEach(() => {
	resetFirestore();
	mockEnforce.mockReset();
	mockEnforce.mockResolvedValue(undefined);
	questionCounter += 1;
	questionId = `${QUESTION}-${questionCounter}`;
	seedQuestion(questionId, 'secret');
	member(MEMBER, questionId);
});

describe('getAnswerBatch gate', () => {
	it('refuses a caller who is not signed in, before spending a rate slot', async () => {
		await expect(call(undefined)).rejects.toMatchObject({ code: 'unauthenticated' });
		expect(mockEnforce).not.toHaveBeenCalled();
	});

	it('needs a question id', async () => {
		await expect(call(MEMBER, {})).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('stops at the rate limit before reading anything', async () => {
		mockEnforce.mockRejectedValue(
			Object.assign(new Error('limit'), { code: 'resource-exhausted' }),
		);

		await expect(call(MEMBER)).rejects.toMatchObject({ code: 'resource-exhausted' });
	});

	it('refuses a non-member of a closed question', async () => {
		seedAnswers(5);

		await expect(call('stranger')).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('refuses a banned member', async () => {
		member('banned-1', questionId, 'banned');

		await expect(call('banned-1')).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets anyone signed in take part in an open question', async () => {
		seedQuestion(questionId, 'public');
		seedAnswers(3);

		await expect(call('visitor')).resolves.toMatchObject({ totalAnswers: 3 });
	});

	it('counts a member of the top statement', async () => {
		seed('statements', 'space', {
			statementId: 'space',
			statementType: 'group',
			parentId: 'top',
			topParentId: 'space',
			membership: { access: 'secret' },
		});
		seed('statements', questionId, {
			statementId: questionId,
			statementType: 'question',
			parentId: 'space',
			topParentId: 'space',
		});
		member('space-member', 'space');

		await expect(call('space-member')).resolves.toMatchObject({ answers: [] });
	});

	it('refuses a statement that is not a question', async () => {
		seed('statements', questionId, {
			statementId: questionId,
			statementType: 'option',
			parentId: 'top',
			topParentId: questionId,
			membership: { access: 'public' },
		});

		await expect(call(MEMBER)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('reads ratings by the verified uid, not by anything in the request', async () => {
		seedAnswers(2);
		rating('other-person', `${questionId}-a0`);

		const batch = await call(MEMBER, {
			questionId,
			evaluatorId: 'other-person',
		} as GetAnswerBatchRequest);

		expect(batch.answers).toHaveLength(2);
	});
});

describe('getAnswerBatch size', () => {
	it.each([
		[undefined, ANSWER_BATCH.DEFAULT_SIZE],
		[3, 3],
		[0, ANSWER_BATCH.DEFAULT_SIZE],
		[-4, ANSWER_BATCH.DEFAULT_SIZE],
		[1.5, ANSWER_BATCH.DEFAULT_SIZE],
		[ANSWER_BATCH.MAX_SIZE + 500, ANSWER_BATCH.MAX_SIZE],
	])('asked for %s, returns %s', async (size, expected) => {
		seedAnswers(ANSWER_BATCH.MAX_SIZE + 10);

		const batch = await call(MEMBER, { questionId, size });

		expect(batch.answers).toHaveLength(expected);
	});
});

describe('getAnswerBatch paging', () => {
	it('does not repeat an answer as the person rates through the batches', async () => {
		seedAnswers(31);
		const served = new Set<string>();

		for (let round = 0; round < 6; round++) {
			const batch = await call(MEMBER, { questionId, size: ANSWER_BATCH.DEFAULT_SIZE });
			for (const answer of batch.answers) {
				expect(served.has(answer.statementId)).toBe(false);
				served.add(answer.statementId);
				rating(MEMBER, answer.statementId);
			}
		}

		expect(served.size).toBe(31);
		await expect(call(MEMBER)).resolves.toMatchObject({ answers: [], hasMore: false });
	});

	it('reports what is left after this batch', async () => {
		seedAnswers(31);

		const batch = await call(MEMBER);

		expect(batch.hasMore).toBe(true);
		expect(batch.stats.remainingCount).toBe(31 - ANSWER_BATCH.DEFAULT_SIZE);
		expect(batch.totalAnswers).toBe(31);
	});

	it('never returns an answer rated elsewhere, such as in the full list', async () => {
		seedAnswers(31);
		rating(MEMBER, `${questionId}-a7`);

		for (let round = 0; round < 25; round++) {
			const batch = await call(MEMBER, { questionId, size: ANSWER_BATCH.MAX_SIZE });
			expect(batch.answers.map((answer) => answer.statementId)).not.toContain(`${questionId}-a7`);
		}
	});
});

describe('getAnswerBatch cache', () => {
	it('serves one read of the answers to everyone inside the window', async () => {
		seedAnswers(2);
		member('member-2', questionId);
		await call(MEMBER);

		seed('statements', `${questionId}-late`, {
			statementId: `${questionId}-late`,
			statementType: 'option',
			parentId: questionId,
			topParentId: questionId,
			creatorId: 'someone-else',
			createdAt: 1,
			lastUpdate: 1,
		});

		await expect(call('member-2')).resolves.toMatchObject({ totalAnswers: 2 });
	});

	it('reads ratings fresh even while the answers are cached', async () => {
		seedAnswers(2);
		await call(MEMBER);
		rating(MEMBER, `${questionId}-a0`);

		const batch = await call(MEMBER);

		expect(batch.answers.map((answer) => answer.statementId)).toEqual([`${questionId}-a1`]);
	});

	it('reads again once the window has passed', async () => {
		seedAnswers(1);
		await call(MEMBER);
		seedAnswers(2);
		const realNow = Date.now;
		Date.now = () => realNow() + 31_000;

		try {
			await expect(call(MEMBER)).resolves.toMatchObject({ totalAnswers: 2 });
		} finally {
			Date.now = realNow;
		}
	});
});
