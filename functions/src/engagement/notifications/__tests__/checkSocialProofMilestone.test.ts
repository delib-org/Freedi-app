import {
	Collections,
	NotificationChannel,
	NotificationTriggerType,
	SourceApp,
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

import { checkSocialProofMilestone, MILESTONES } from '../socialProofTrigger';

const AUTHOR = 'author';
const ANSWER = 'answer1';
const QUESTION = 'question1';
const CLASS_TABLE = { tableId: 't1', coAuthors: [] } as unknown as Statement['classTable'];

function answer(raters: number, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: ANSWER,
		parentId: QUESTION,
		topParentId: 'top1',
		statementType: StatementType.option,
		statement: 'Keep the library open',
		creator: { uid: AUTHOR, displayName: 'A' },
		evaluation: { numberOfEvaluators: raters },
		...overrides,
	} as unknown as Statement;
}

function queued(): NotificationQueueItem[] {
	return [
		...(fake.store.get(Collections.notificationQueue)?.values() ?? []),
	] as unknown as NotificationQueueItem[];
}

describe('checkSocialProofMilestone', () => {
	beforeEach(() => {
		fake = createFakeDb();
		mockLogError.mockClear();
	});

	it('uses 5, 25 and 100 only', () => {
		expect(MILESTONES).toEqual([5, 25, 100]);
	});

	it.each([1, 4, 8, 10, 24, 50, 99, 103])('does no reads at %i raters', async (raters) => {
		const collection = jest.spyOn(fake.db, 'collection');

		await checkSocialProofMilestone(answer(raters));

		expect(collection).not.toHaveBeenCalled();
	});

	it.each([5, 25, 100])('queues the deterministic id at %i raters', async (raters) => {
		await checkSocialProofMilestone(answer(raters));

		expect(fake.read(Collections.notificationQueue, `social_${ANSWER}_${raters}`)).toBeDefined();
	});

	it('goes in-app only with the reviewed wording', async () => {
		await checkSocialProofMilestone(answer(5));

		expect(queued()[0]).toMatchObject({
			title: 'People are reading your answer',
			body: '5 people have rated your answer: "Keep the library open"',
			channels: [NotificationChannel.IN_APP],
			triggerType: NotificationTriggerType.SOCIAL_PROOF,
			targetPath: `/statement/${QUESTION}?focusId=${ANSWER}`,
		});
	});

	it('reaches a Hebrew author in Hebrew', async () => {
		await checkSocialProofMilestone(answer(5, { statement: 'לפתוח את הספרייה' }));

		expect(queued()[0]).toMatchObject({
			title: 'אנשים קוראים את התשובה שלך',
			body: '5 אנשים דירגו את התשובה שלך: "לפתוח את הספרייה"',
		});
	});

	it('catches a milestone that concurrent ratings stepped over', async () => {
		await checkSocialProofMilestone(answer(6));

		expect(fake.read(Collections.notificationQueue, `social_${ANSWER}_5`)).toBeDefined();
		expect(queued()[0].body).toContain('5 people');
	});

	it('sends once across a re-delivery and the catch-up counts', async () => {
		await checkSocialProofMilestone(answer(5));
		await checkSocialProofMilestone(answer(5));
		await checkSocialProofMilestone(answer(6));
		await checkSocialProofMilestone(answer(7));

		expect(queued()).toHaveLength(1);
		expect(fake.read(Collections.answerNoticeState, ANSWER)).toMatchObject({ noticesSent: 1 });
	});

	describe('other apps', () => {
		it.each<[string, Partial<Statement>]>([
			['a Mass Consensus answer', { sourceApp: SourceApp.MASS_CONSENSUS }],
			['a join-class answer', { classTable: CLASS_TABLE }],
		])('sends nothing for %s, with no read', async (_name, overrides) => {
			const collection = jest.spyOn(fake.db, 'collection');

			await checkSocialProofMilestone(answer(7, overrides));

			expect(collection).not.toHaveBeenCalled();
			expect(queued()).toHaveLength(0);
		});

		it.each<[string, Partial<Statement>]>([
			['stamped main', { sourceApp: SourceApp.MAIN }],
			['with no stamp, as older answers are', {}],
		])('treats an answer %s as main-app', async (_name, overrides) => {
			await checkSocialProofMilestone(answer(5, overrides));

			expect(queued()).toHaveLength(1);
		});
	});

	it.each<[string, Partial<Statement>]>([
		['a question', { statementType: StatementType.question }],
		['a combined answer', { isCluster: true }],
		['a hidden answer', { hide: true }],
		['an answer with no author', { creator: undefined }],
	])('sends nothing for %s', async (_name, overrides) => {
		await checkSocialProofMilestone(answer(5, overrides));

		expect(queued()).toHaveLength(0);
	});

	it.each<[string, Record<string, unknown>]>([
		['Updates about my answers is off', { answerUpdates: false }],
		['all notifications are paused', { muted: true }],
	])('sends nothing when %s', async (_name, settings) => {
		fake.seed(Collections.notificationSettings, AUTHOR, settings);

		await checkSocialProofMilestone(answer(5));

		expect(queued()).toHaveLength(0);
	});

	describe('shares the caps with the answer update', () => {
		it('is held by a recent notice on the same answer', async () => {
			const now = Date.now();
			const bucket = Math.floor(now / (48 * 60 * 60 * 1000));
			fake.seed(Collections.noticeCapSlots, `answer_${ANSWER}_${bucket}_1`, { createdAt: now });

			await checkSocialProofMilestone(answer(5));

			expect(queued()).toHaveLength(0);
		});

		it('holds a later notice for the same person in the same question', async () => {
			await checkSocialProofMilestone(answer(5));

			await checkSocialProofMilestone(answer(25, { statementId: 'answer2' }));

			expect(queued()).toHaveLength(1);
		});

		it('does not move the score baseline', async () => {
			await checkSocialProofMilestone(answer(5));

			const state = fake.read(Collections.answerNoticeState, ANSWER);
			expect(state?.baselineRaters).toBeUndefined();
			expect(state?.baselineConsensus).toBeUndefined();
		});
	});

	it('sends nothing, does not throw, and logs when a read fails', async () => {
		fake.db.getAll = jest.fn().mockRejectedValue(new Error('unavailable'));

		await expect(checkSocialProofMilestone(answer(5))).resolves.toBeUndefined();
		expect(queued()).toHaveLength(0);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'engagement.checkSocialProofMilestone' }),
		);
	});
});
