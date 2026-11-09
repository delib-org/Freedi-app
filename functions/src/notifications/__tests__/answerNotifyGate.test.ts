import { StatementType, type Statement, type StatementSubscription } from '@freedi/shared-types';

/** In-memory Firestore stand-in: subscriptions are queryable by statementId + channel flag. */
const subscriptions: Record<string, Partial<StatementSubscription>> = {};
const written: Array<{ id: string; data: Record<string, unknown> }> = [];
let docReads: string[] = [];

jest.mock('../../index', () => {
	const makeQuery = (filters: Array<[string, unknown]>) => ({
		where: (field: string, _op: string, value: unknown) => makeQuery([...filters, [field, value]]),
		get: async () => ({
			docs: Object.values(subscriptions)
				.filter((s) => filters.every(([f, v]) => (s as Record<string, unknown>)[f] === v))
				.map((s) => ({ data: () => s })),
		}),
	});

	return {
		db: {
			collection: (collection: string) => ({
				...makeQuery([]),
				doc: (id: string) => ({
					id,
					get: async () => {
						docReads.push(`${collection}/${id}`);
						const data = collection === 'statementsSubscribe' ? subscriptions[id] : undefined;

						return { exists: !!data, data: () => data };
					},
				}),
			}),
			getAll: async (...refs: Array<{ id: string }>) =>
				refs.map(() => ({ exists: false, data: () => undefined })),
			batch: () => ({
				set: (ref: { id: string }, data: Record<string, unknown>) => {
					written.push({ id: ref.id, data });
				},
				commit: async () => undefined,
			}),
		},
	};
});
jest.mock('../../fn_notifications', () => ({
	processFcmNotificationsImproved: jest.fn(async () => ({
		successful: 0,
		failed: 0,
		invalidTokens: [],
	})),
}));
jest.mock('../notificationEmail', () => ({ sendNotificationEmail: jest.fn(async () => true) }));
jest.mock('../../model/questionTypeDefaults', () => ({ getDefaultQuestionType: () => 'simple' }));

import { notifyStatementSubscribers } from '../notifyStatementSubscribers';
import { authorVetoesReplies, isNewAnswer, isReplyToAnswer } from '../answerNotifyGate';

const creator = (uid: string) => ({ uid, displayName: uid, email: '', photoURL: '' });

function stmt(id: string, parentId: string, type: StatementType, creatorUid: string): Statement {
	return {
		statementId: id,
		parentId,
		topParentId: 'q1',
		statement: `text ${id}`,
		statementType: type,
		creator: creator(creatorUid),
		creatorId: creatorUid,
		createdAt: 1,
		lastUpdate: 1,
	} as unknown as Statement;
}

function sub(uid: string, statementId: string, extra: Partial<StatementSubscription> = {}): void {
	subscriptions[`${uid}--${statementId}`] = {
		userId: uid,
		statementId,
		user: creator(uid),
		getInAppNotification: true,
		...extra,
	} as Partial<StatementSubscription>;
}

const question = stmt('q1', 'top', StatementType.question, 'host');
const answer = stmt('a1', 'q1', StatementType.option, 'alice');

beforeEach(() => {
	Object.keys(subscriptions).forEach((k) => delete subscriptions[k]);
	written.length = 0;
	docReads = [];
});

const recipients = (): string[] => written.map((w) => String(w.data.userId)).sort();
const subscriptionReads = (): string[] =>
	docReads.filter((r) => r.startsWith('statementsSubscribe/'));

describe('answer notification gate', () => {
	it('classifies new answers and replies', () => {
		expect(isNewAnswer(answer, question)).toBe(true);
		const reply = stmt('r1', 'a1', StatementType.statement, 'bob');
		expect(isReplyToAnswer(reply, answer)).toBe(true);
		const discussion = stmt('d1', 'q1', StatementType.statement, 'bob');
		expect(isNewAnswer(discussion, question)).toBe(false);
		expect(isReplyToAnswer(discussion, question)).toBe(false);
	});

	describe('new answer', () => {
		it('skips a subscriber whose new-answers choice is false', async () => {
			sub('bob', 'q1', { notifyOnNewAnswers: false });
			sub('carol', 'q1', { notifyOnNewAnswers: true });
			sub('dave', 'q1'); // never asked: absent means no veto
			await notifyStatementSubscribers(answer, question);
			expect(recipients()).toEqual(['carol', 'dave']);
		});

		it('is not vetoed by the replies choice', async () => {
			sub('bob', 'q1', { notifyOnReplies: false });
			await notifyStatementSubscribers(answer, question);
			expect(recipients()).toEqual(['bob']);
		});

		it('says answer, not reply', async () => {
			sub('bob', 'q1');
			await notifyStatementSubscribers(answer, question);
			expect(written[0].data.triggerType).toBe('new_answer');
		});

		it('needs no extra document read', async () => {
			sub('bob', 'q1');
			await notifyStatementSubscribers(answer, question);
			expect(subscriptionReads()).toEqual([]);
		});
	});

	describe('reply to an answer', () => {
		const reply = stmt('r1', 'a1', StatementType.statement, 'bob');

		it('skips the author when their replies choice on the question is false', async () => {
			sub('alice', 'a1');
			sub('carol', 'a1');
			sub('alice', 'q1', { notifyOnReplies: false });
			await notifyStatementSubscribers(reply, answer);
			expect(recipients()).toEqual(['carol']); // other subscribers unaffected
			expect(subscriptionReads()).toContain('statementsSubscribe/alice--q1');
		});

		it('notifies the author when replies is true or absent', async () => {
			sub('alice', 'a1');
			sub('alice', 'q1', { notifyOnReplies: true });
			await notifyStatementSubscribers(reply, answer);
			expect(recipients()).toEqual(['alice']);

			written.length = 0;
			delete subscriptions['alice--q1'];
			await notifyStatementSubscribers(reply, answer);
			expect(recipients()).toEqual(['alice']);
		});

		it('is not vetoed by the new-answers choice', async () => {
			sub('alice', 'a1');
			sub('alice', 'q1', { notifyOnNewAnswers: false });
			await notifyStatementSubscribers(reply, answer);
			expect(recipients()).toEqual(['alice']);
		});

		it('keeps the reply trigger type', async () => {
			sub('alice', 'a1');
			await notifyStatementSubscribers(reply, answer);
			expect(written[0].data.triggerType).toBe('statement_reply');
		});
	});

	describe('discussion on the question itself', () => {
		it('is never gated, whatever the choices say', async () => {
			sub('bob', 'q1', { notifyOnReplies: false, notifyOnNewAnswers: false });
			const discussion = stmt('d1', 'q1', StatementType.statement, 'carol');
			await notifyStatementSubscribers(discussion, question);
			expect(recipients()).toEqual(['bob']);
			expect(subscriptionReads()).toEqual([]);
		});
	});

	describe('authorVetoesReplies', () => {
		it('is false when the author has no question subscription', async () => {
			await expect(authorVetoesReplies(answer)).resolves.toBe(false);
		});
	});
});
