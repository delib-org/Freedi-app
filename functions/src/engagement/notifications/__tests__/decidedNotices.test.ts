import {
	Collections,
	NotificationChannel,
	QuestionStep,
	StatementType,
} from '@freedi/shared-types';
import type { NotificationQueueItem, Statement } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fake.db,
	Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}));

const mockLogError = jest.fn();
jest.mock('../../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import { isDecidedTransition, sendDecidedNoticesOnStageChange } from '../decidedNotices';

const QUESTION = 'q1';

function question(currentStep?: QuestionStep): Statement {
	return {
		statementId: QUESTION,
		parentId: 'top',
		topParentId: QUESTION,
		statementType: StatementType.question,
		questionSettings: { currentStep },
	} as unknown as Statement;
}

function seedAnswer(id: string, uid: string, text: string, extra: Record<string, unknown> = {}): void {
	fake.seed(Collections.statements, id, {
		statementId: id,
		parentId: QUESTION,
		statementType: StatementType.option,
		statement: text,
		creator: { uid },
		...extra,
	});
}

function queued(): NotificationQueueItem[] {
	return [...(fake.store.get(Collections.notificationQueue)?.values() ?? [])] as unknown as
		NotificationQueueItem[];
}

const TO_VOTING = question(QuestionStep.voting);
const TO_DECIDED = question(QuestionStep.finished);

describe('decided notices', () => {
	beforeEach(() => {
		fake = createFakeDb();
		mockLogError.mockClear();
	});

	describe('isDecidedTransition', () => {
		it('is true on the update that reaches Decided', () => {
			expect(isDecidedTransition(TO_VOTING, TO_DECIDED)).toBe(true);
			expect(isDecidedTransition(question(undefined), TO_DECIDED)).toBe(true);
		});

		it('is false once already Decided', () => {
			expect(isDecidedTransition(TO_DECIDED, TO_DECIDED)).toBe(false);
		});

		it('is false for any other stage', () => {
			expect(isDecidedTransition(TO_DECIDED, TO_VOTING)).toBe(false);
		});

		it('is false for a statement that is not a question', () => {
			const option = { ...TO_DECIDED, statementType: StatementType.option } as Statement;

			expect(isDecidedTransition(TO_VOTING, option)).toBe(false);
		});
	});

	it('does no reads on an ordinary update', async () => {
		const collection = jest.spyOn(fake.db, 'collection');

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_VOTING);

		expect(collection).not.toHaveBeenCalled();
	});

	it('quotes the answer when the author wrote one', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(1);
		expect(queued()[0]).toMatchObject({
			queueItemId: `decided_${QUESTION}_alice`,
			userId: 'alice',
			title: 'The group has decided',
			body: 'Your answer "Open on weekends" was part of what the group weighed. Results are now open to everyone.',
			channels: [NotificationChannel.IN_APP],
			targetPath: `/statement/${QUESTION}`,
		});
	});

	it('sends one notice without a quote to someone who wrote several', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');
		seedAnswer('a2', 'alice', 'Open at night');

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(1);
		expect(queued()[0].body).toBe(
			'Your answers were part of what the group weighed. Results are now open to everyone.',
		);
	});

	it('reaches each author in their own language', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');
		seedAnswer('a2', 'noa', 'לפתוח בסופי שבוע');

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		const byUser = new Map(queued().map((n) => [n.userId, n]));
		expect(byUser.get('alice')?.title).toBe('The group has decided');
		expect(byUser.get('noa')?.title).toBe('הקבוצה החליטה');
		expect(byUser.get('noa')?.body).toBe(
			'התשובה שלך "לפתוח בסופי שבוע" הייתה חלק ממה שהקבוצה שקלה. התוצאות פתוחות עכשיו לכולם.',
		);
	});

	it('skips combined and hidden answers', async () => {
		seedAnswer('a1', 'alice', 'Combined', { isCluster: true });
		seedAnswer('a2', 'bob', 'Hidden', { hide: true });

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(0);
	});

	it.each<[string, Record<string, unknown>]>([
		['the answer updates preference is off', { answerUpdates: false }],
		['all notifications are paused', { muted: true }],
	])('sends nothing when %s', async (_name, settings) => {
		seedAnswer('a1', 'alice', 'Open on weekends');
		fake.seed(Collections.notificationSettings, 'alice', settings);

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(0);
	});

	it('is idempotent when the trigger is delivered twice', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);
		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(1);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('sends nothing new when the host moves back and decides again', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');
		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);
		await sendDecidedNoticesOnStageChange(TO_DECIDED, TO_VOTING);

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued()).toHaveLength(1);
	});

	it('still reaches the others when one create fails', async () => {
		seedAnswer('a1', 'alice', 'Open on weekends');
		seedAnswer('a2', 'bob', 'Open at night');
		const realCollection = fake.db.collection;
		fake.db.collection = (name: string) => {
			const col = realCollection(name);
			if (name !== Collections.notificationQueue) return col;

			return {
				...col,
				doc: (id: string) => {
					const ref = col.doc(id);

					return id.endsWith('alice')
						? { ...ref, create: () => Promise.reject(new Error('unavailable')) }
						: ref;
				},
			};
		};

		await sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED);

		expect(queued().map((n) => n.userId)).toEqual(['bob']);
		expect(mockLogError).toHaveBeenCalledTimes(1);
	});

	it('does not throw when the answers cannot be read', async () => {
		fake.db.getAll = jest.fn().mockRejectedValue(new Error('unavailable'));
		seedAnswer('a1', 'alice', 'Open on weekends');

		await expect(sendDecidedNoticesOnStageChange(TO_VOTING, TO_DECIDED)).resolves.toBeUndefined();
		expect(mockLogError).toHaveBeenCalled();
	});
});
