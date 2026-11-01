import { describe, it, expect, beforeEach } from '@jest/globals';
import { Collections, Role, StatementType } from '@freedi/shared-types';
import { FakeFirestore } from '../userFeed/__tests__/fakeFirestore';

let mockDb = new FakeFirestore();

jest.mock('../index', () => ({
	get db() {
		return mockDb;
	},
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../statements/history/writeHistoryEntry', () => ({
	writeHistoryEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../statements/history/isResearchEnabled', () => ({
	isResearchEnabledForTopParent: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../evaluation/topAnswerSync', () => ({
	syncTopAnswersOnOptionUpdated: jest.fn(() => Promise.resolve()),
	syncTopAnswersOnOptionDeleted: jest.fn(() => Promise.resolve()),
}));

import { updateParentOnChildUpdate, updateParentOnChildDelete } from '../fn_statement_updates';
import { SUBSCRIPTION_ACTIVITY_STAMP_ENABLED } from '../userFeed/userFeedConfig';

/**
 * The real onDocumentUpdated / onDocumentDeleted handlers (the v2 trigger
 * wrapper is mocked to return the handler) against an in-memory Firestore.
 * Discussion `group-1` → question `question-1` → option `option-1`, 10 members.
 */

const GROUP = 'group-1';
const QUESTION = 'question-1';
const OPTION = 'option-1';
const MEMBERS = 10;
const T0 = 1_800_000_000_000;

type Doc = Record<string, unknown>;
type Handler = (event: unknown) => Promise<void>;

const creator = { uid: 'owner', displayName: 'Owner' };

function option(overrides: Doc = {}): Doc {
	return {
		statementId: OPTION,
		statement: 'Plant trees',
		statementType: StatementType.option,
		parentId: QUESTION,
		topParentId: GROUP,
		parents: [GROUP, QUESTION],
		creatorId: creator.uid,
		creator,
		consensus: 0.1,
		createdAt: T0,
		lastUpdate: T0,
		...overrides,
	};
}

const updateEvent = (before: Doc, after: Doc) => ({
	data: { before: { data: () => before }, after: { data: () => after } },
});

async function update(before: Doc, after: Doc): Promise<void> {
	await (updateParentOnChildUpdate as unknown as Handler)(updateEvent(before, after));
}

const feedWrites = (): number => mockDb.writesTo(Collections.userFeed);
const subscriptionWrites = (): number => mockDb.writesTo(Collections.statementsSubscribe);

describe('fn_statement_updates → activity classification', () => {
	beforeEach(() => {
		mockDb = new FakeFirestore();
		mockDb.seed(Collections.statements, GROUP, {
			statementId: GROUP,
			parentId: 'top',
			lastUpdate: T0,
		});
		mockDb.seed(Collections.statements, QUESTION, {
			statementId: QUESTION,
			parentId: GROUP,
			topParentId: GROUP,
			statementType: StatementType.question,
			lastUpdate: T0,
		});
		mockDb.seed(Collections.statements, OPTION, option());
		for (let i = 0; i < MEMBERS; i++) {
			const id = `u${i}--${GROUP}`;
			mockDb.seed(Collections.statementsSubscribe, id, {
				userId: `u${i}`,
				statementId: GROUP,
				role: Role.member,
				parentId: 'top',
				lastUpdate: T0,
			});
			mockDb.seed(Collections.userFeed, id, {
				userId: `u${i}`,
				statementId: GROUP,
				subscriptionId: id,
				lastActivity: T0,
			});
		}
		mockDb.resetCounters();
	});

	it('(a) a consensus-only change writes no feed, subscription or statement docs', async () => {
		await update(option(), option({ consensus: 0.7, lastUpdate: T0 + 1 }));

		expect(feedWrites()).toBe(0);
		expect(subscriptionWrites()).toBe(0);
		expect(mockDb.writes).toBe(0);
	});

	it('evaluation / result / count-only changes (lane B fields) are not activity either', async () => {
		const question = mockDb.read(Collections.statements, QUESTION) as Doc;
		await update(question, {
			...question,
			totalEvaluators: 12,
			evaluation: { asParentTotalEvaluators: 12, agreement: 0.4, numberOfEvaluators: 12 },
			results: [{ statementId: OPTION }],
			totalResults: 1,
			lastUpdate: T0 + 5,
		});
		await update(option(), option({ isChosen: true, lastUpdate: T0 + 6 }));
		await update(
			option(),
			option({ evaluation: { agreement: 0.9, numberOfEvaluators: 3 }, lastUpdate: T0 + 7 }),
		);

		expect(mockDb.writes).toBe(0);
	});

	it('a text edit refreshes the parent preview and raises the discussion for every member once', async () => {
		await update(option(), option({ statement: 'Plant more trees' }));

		expect(feedWrites()).toBe(MEMBERS);
		// phase 1 also stamps the legacy subscription; phase 2 writes userFeed only
		expect(subscriptionWrites()).toBe(SUBSCRIPTION_ACTIVITY_STAMP_ENABLED ? MEMBERS : 0);
		expect(mockDb.read(Collections.statements, QUESTION)?.lastSubStatements).toBeDefined();
	});

	it('(b) a burst of text edits inside the window fans out once', async () => {
		for (let i = 1; i <= 5; i++) {
			await update(option({ statement: `v${i - 1}` }), option({ statement: `v${i}` }));
		}

		expect(feedWrites()).toBe(MEMBERS);
	});

	it('a deletion is not activity: the parent is refreshed but no member doc is written', async () => {
		mockDb.seed(
			Collections.statements,
			'option-2',
			option({ statementId: 'option-2', createdAt: T0 + 1 }),
		);
		mockDb.resetCounters();
		await (updateParentOnChildDelete as unknown as Handler)({ data: { data: () => option() } });

		expect(feedWrites()).toBe(0);
		expect(subscriptionWrites()).toBe(0);
	});
});
