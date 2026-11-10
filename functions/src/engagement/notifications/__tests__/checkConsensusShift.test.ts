import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
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

import {
	checkConsensusShift,
	countRaters,
	MIN_NEW_RATERS,
	MIN_RATERS,
	MIN_SCORE_CHANGE_POINTS,
} from '../socialProofTrigger';

const AUTHOR = 'author';
const ANSWER = 'answer1';
const QUESTION = 'question1';
const BASE_RATERS = 15;
const BASE_SCORE = 0.5;
const HOUR = 60 * 60 * 1000;
const TEXT = 'Keep the library open on weekends';
const CLASS_TABLE = { tableId: 't1', coAuthors: [] } as unknown as Statement['classTable'];

function answer(raters: number, consensus: number, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: ANSWER,
		parentId: QUESTION,
		topParentId: 'top1',
		statementType: StatementType.option,
		statement: TEXT,
		consensus,
		creator: { uid: AUTHOR, displayName: 'A' },
		evaluation: { numberOfEvaluators: raters },
		...overrides,
	} as unknown as Statement;
}

function seedBaseline(extra: Record<string, unknown> = {}): void {
	fake.seed(Collections.answerNoticeState, ANSWER, {
		statementId: ANSWER,
		baselineRaters: BASE_RATERS,
		baselineConsensus: BASE_SCORE,
		lastUpdate: 1,
		...extra,
	});
}

function seedQuestion(showEvaluation: boolean): void {
	fake.seed(Collections.statements, QUESTION, {
		statementId: QUESTION,
		statementSettings: { showEvaluation },
	});
}

const DUE_RATERS = BASE_RATERS + MIN_NEW_RATERS;
const DUE_SCORE = BASE_SCORE + MIN_SCORE_CHANGE_POINTS / 100;

function queued(): NotificationQueueItem[] {
	return [
		...(fake.store.get(Collections.notificationQueue)?.values() ?? []),
	] as unknown as NotificationQueueItem[];
}

describe('checkConsensusShift', () => {
	beforeEach(() => {
		fake = createFakeDb();
		mockLogError.mockClear();
	});

	describe('cheap conditions, on data already in hand', () => {
		it('does no reads below the rater minimum', async () => {
			const collection = jest.spyOn(fake.db, 'collection');

			await checkConsensusShift(answer(MIN_RATERS - 1, 0.9));

			expect(collection).not.toHaveBeenCalled();
		});

		it.each<[string, Partial<Statement>]>([
			['a question', { statementType: StatementType.question }],
			['a combined answer', { isCluster: true }],
			['a hidden answer', { hide: true }],
			['an answer with no author', { creator: undefined }],
		])('does no reads for %s', async (_name, overrides) => {
			const collection = jest.spyOn(fake.db, 'collection');

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE, overrides));

			expect(collection).not.toHaveBeenCalled();
		});

		it.each<[string, Partial<Statement>]>([
			['a Mass Consensus answer', { sourceApp: SourceApp.MASS_CONSENSUS }],
			['a join-class answer', { classTable: CLASS_TABLE }],
		])('does no reads for %s', async (_name, overrides) => {
			const collection = jest.spyOn(fake.db, 'collection');

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE, overrides));

			expect(collection).not.toHaveBeenCalled();
		});
	});

	describe('countRaters', () => {
		const withTable = (raters: number, coAuthors: string[]): Statement =>
			answer(raters, 0, {
				classTable: { tableId: 't1', coAuthors } as unknown as Statement['classTable'],
			});

		it('counts everyone on an ordinary answer', () => {
			expect(countRaters(answer(20, 0))).toBe(20);
		});

		it('subtracts the author and each co-author', () => {
			expect(countRaters(withTable(20, ['c1', 'c2']))).toBe(17);
		});

		it('counts the author once when listed among the co-authors', () => {
			expect(countRaters(withTable(20, [AUTHOR, 'c1']))).toBe(18);
		});

		it('never goes below zero', () => {
			expect(countRaters(withTable(1, ['c1', 'c2']))).toBe(0);
		});
	});

	describe('main-app questions only', () => {
		it.each<[string, Record<string, unknown>]>([
			['a Mass Consensus question', { sourceApp: SourceApp.MASS_CONSENSUS }],
			['a join-class question', { classTable: { tableId: 't1', coAuthors: [] } }],
		])('holds for an unstamped answer under %s', async (_name, extra) => {
			fake.seed(Collections.statements, QUESTION, {
				statementId: QUESTION,
				statementSettings: { showEvaluation: true },
				...extra,
			});
			seedBaseline();

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(0);
		});

		it.each<[string, Partial<Statement>]>([
			['stamped main', { sourceApp: SourceApp.MAIN }],
			['with no stamp, as older answers are', {}],
		])('sends for an answer %s', async (_name, overrides) => {
			seedQuestion(true);
			seedBaseline();

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE, overrides));

			expect(queued()).toHaveLength(1);
		});
	});

	describe('baseline', () => {
		it('only records the starting point the first time, without a notice', async () => {
			seedQuestion(true);

			await checkConsensusShift(answer(MIN_RATERS, 0.9));

			expect(queued()).toHaveLength(0);
			expect(fake.read(Collections.answerNoticeState, ANSWER)).toMatchObject({
				baselineRaters: MIN_RATERS,
				baselineConsensus: 0.9,
			});
		});

		it('moves the baseline when a notice goes out', async () => {
			seedQuestion(true);
			seedBaseline();

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(fake.read(Collections.answerNoticeState, ANSWER)).toMatchObject({
				baselineRaters: DUE_RATERS,
				baselineConsensus: DUE_SCORE,
				noticesSent: 1,
			});
		});
	});

	describe('gates', () => {
		beforeEach(() => {
			seedQuestion(true);
			seedBaseline();
		});

		it('sends at exactly the new-rater and score thresholds', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(1);
		});

		it('sends when the score fell by the same amount', async () => {
			await checkConsensusShift(answer(DUE_RATERS, BASE_SCORE - MIN_SCORE_CHANGE_POINTS / 100));

			expect(queued()).toHaveLength(1);
		});

		it('holds with one new rater too few', async () => {
			await checkConsensusShift(answer(DUE_RATERS - 1, DUE_SCORE));

			expect(queued()).toHaveLength(0);
		});

		it('holds with one point too few', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE - 0.01));

			expect(queued()).toHaveLength(0);
		});

		it('does not read the question while the state conditions fail', async () => {
			const collection = jest.spyOn(fake.db, 'collection');

			await checkConsensusShift(answer(DUE_RATERS - 1, DUE_SCORE));

			expect(collection.mock.calls.map(([name]) => name)).toEqual([Collections.answerNoticeState]);
		});
	});

	describe('live results', () => {
		it('holds when live results are off, and rests before checking again', async () => {
			seedQuestion(false);
			seedBaseline();

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(0);
			const state = fake.read(Collections.answerNoticeState, ANSWER) as { quietUntil: number };
			expect(state.quietUntil).toBeGreaterThan(Date.now());
		});

		it('holds when the question is missing', async () => {
			seedBaseline();

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(0);
		});
	});

	describe('rest and counters stop on one read', () => {
		beforeEach(() => seedQuestion(true));

		it.each<[string, Record<string, unknown>]>([
			['while resting', { quietUntil: Date.now() + HOUR }],
			['at the lifetime limit', { noticesSent: 3 }],
			['inside the 48 hours', { lastNoticeAt: Date.now() - HOUR }],
		])('reads only the state doc %s', async (_name, extra) => {
			seedBaseline(extra);
			const collection = jest.spyOn(fake.db, 'collection');

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(collection.mock.calls.map(([name]) => name)).toEqual([Collections.answerNoticeState]);
			expect(queued()).toHaveLength(0);
		});
	});

	describe('preference', () => {
		beforeEach(() => {
			seedQuestion(true);
			seedBaseline();
		});

		it.each<[string, Record<string, unknown>]>([
			['Updates about my answers is off', { answerUpdates: false }],
			['all notifications are paused', { muted: true }],
			['the in-app channel is off', { defaultChannels: { inApp: false } }],
			['frequency is Off', { defaultFrequency: NotificationFrequency.NONE }],
			['the main app is muted', { perApp: { main: { muted: true } } }],
		])('holds when %s', async (_name, settings) => {
			fake.seed(Collections.notificationSettings, AUTHOR, settings);

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(0);
		});

		it('is on when the person never set it', async () => {
			fake.seed(Collections.notificationSettings, AUTHOR, { muted: false });

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(1);
		});
	});

	describe('the notice', () => {
		beforeEach(() => {
			seedQuestion(true);
			seedBaseline();
		});

		it('goes in-app only', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()[0].channels).toEqual([NotificationChannel.IN_APP]);
			expect(queued()[0].triggerType).toBe(NotificationTriggerType.CONSENSUS_SHIFT);
			expect(queued()[0].targetPath).toBe(`/statement/${QUESTION}?focusId=${ANSWER}`);
		});

		it('states no direction, size or number', async () => {
			fake.seed(Collections.users, AUTHOR, { defaultLanguage: 'en' });

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			const { title, body } = queued()[0];
			expect(`${title} ${body}`).not.toMatch(
				/\d|%|\b(increased|decreased|rose|fell|up|down|higher|lower)\b/i,
			);
			expect(body).toBe(
				`More people have rated your answer "${TEXT}" and its agreement score has changed. The score is shown next to your answer.`,
			);
		});

		it('never writes to the statement', async () => {
			const before = fake.read(Collections.statements, ANSWER);

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(fake.read(Collections.statements, ANSWER)).toBe(before);
		});

		it('sends one notice when the same rating is delivered twice', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(1);
		});
	});

	describe('language', () => {
		beforeEach(() => {
			seedQuestion(true);
			seedBaseline();
		});

		it('uses the stored language over the text', async () => {
			fake.seed(Collections.users, AUTHOR, { defaultLanguage: 'en' });

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE, { statement: 'תשובה בעברית' }));

			expect(queued()[0].title).toBe('Update on your answer');
		});

		it('writes Hebrew to someone who wrote in Hebrew', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE, { statement: 'תשובה בעברית' }));

			expect(queued()[0].title).toBe('עדכון על התשובה שלך');
		});

		it('writes English to someone who wrote in English', async () => {
			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()[0].title).toBe('Update on your answer');
		});
	});

	describe('fails closed', () => {
		beforeEach(() => seedQuestion(true));

		it('sends nothing, does not throw, and logs when a read fails', async () => {
			seedBaseline();
			fake.db.getAll = jest.fn().mockRejectedValue(new Error('unavailable'));

			await expect(checkConsensusShift(answer(DUE_RATERS, DUE_SCORE))).resolves.toBeUndefined();
			expect(queued()).toHaveLength(0);
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({ operation: 'engagement.checkConsensusShift' }),
			);
		});

		it('sends nothing when the state doc is malformed', async () => {
			seedBaseline({ baselineRaters: 'many' });

			await expect(checkConsensusShift(answer(DUE_RATERS, DUE_SCORE))).resolves.toBeUndefined();
			expect(queued()).toHaveLength(0);
		});

		it('rests after the caps refuse', async () => {
			seedBaseline();
			const now = Date.now();
			const bucket = Math.floor(now / (24 * HOUR));
			fake.seed(Collections.noticeCapSlots, `person_${AUTHOR}_${bucket}_1`, { createdAt: now });
			fake.seed(Collections.noticeCapSlots, `person_${AUTHOR}_${bucket}_2`, { createdAt: now });

			await checkConsensusShift(answer(DUE_RATERS, DUE_SCORE));

			expect(queued()).toHaveLength(0);
			const state = fake.read(Collections.answerNoticeState, ANSWER) as { quietUntil: number };
			expect(state.quietUntil).toBeGreaterThan(now);
		});
	});
});
