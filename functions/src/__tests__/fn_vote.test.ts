import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Collections } from '@freedi/shared-types';
import { createFakeDb } from '../progress/__tests__/fakeDb';
import type { FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../index', () => ({
	get db() {
		return {
			...fake.db,
			doc: (path: string) => {
				const [collection, id] = path.split('/');

				return fake.db.collection(collection).doc(id);
			},
		};
	},
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../engagement/credits/trackEngagement', () => ({
	trackVoteEngagement: jest.fn(() => Promise.resolve()),
}));
jest.mock('../fn_adminStats', () => ({
	onVoteCreatedStats: jest.fn(() => Promise.resolve()),
}));

import { updateVote } from '../fn_vote';

type Doc = Record<string, unknown>;

const QUESTION = 'q1';

function seedOption(id: string, over: Doc = {}): void {
	fake.seed(Collections.statements, id, {
		statementId: id,
		parentId: QUESTION,
		statement: id,
		statementType: 'option',
		consensus: 0,
		creatorId: 'c',
		creator: { uid: 'c', displayName: 'c' },
		topParentId: QUESTION,
		lastUpdate: 1,
		createdAt: 1,
		...over,
	});
}

const voteDoc = (userId: string, optionId: string): Doc => ({
	voteId: `${userId}--${QUESTION}`,
	statementId: optionId,
	parentId: QUESTION,
	userId,
	createdAt: 1,
	lastUpdate: 1,
});

const castVote = (userId: string, optionId: string) =>
	updateVote({
		data: {
			before: { data: () => undefined },
			after: { id: `${userId}--${QUESTION}`, exists: true, data: () => voteDoc(userId, optionId) },
		},
	} as never);

const option = (id: string): Doc | undefined => fake.read(Collections.statements, id);
const question = (): Doc | undefined => fake.read(Collections.statements, QUESTION);

/** Counts every write the trigger makes to an option document. */
function spyOptionWrites(): { count: () => number } {
	const original = fake.db.collection;
	let writes = 0;
	fake.db.collection = (name: string) => {
		const collection = original(name);
		if (name !== Collections.statements) return collection;

		return {
			...collection,
			doc: (id: string) => {
				const ref = collection.doc(id);
				if (id === QUESTION) return ref;

				return {
					...ref,
					update: async (data: Doc) => {
						writes += 1;
						await ref.update(data);
					},
				};
			},
		};
	};

	return { count: () => writes };
}

describe('updateVote', () => {
	beforeEach(() => {
		fake = createFakeDb();
		fake.seed(Collections.statements, QUESTION, {
			statementId: QUESTION,
			topParentId: QUESTION,
			selections: {},
		});
		seedOption('a');
		seedOption('b');
	});

	it('marks the first leader and copies it onto the question', async () => {
		await castVote('u1', 'a');

		expect(option('a')?.isVoted).toBe(true);
		expect(question()?.topVotedOption).toMatchObject({ statementId: 'a' });
		expect(question()?.selections).toEqual({ a: 1 });
	});

	it('writes no option flag while the leader stays the same', async () => {
		await castVote('u1', 'a');
		const spy = spyOptionWrites();

		await castVote('u2', 'a');
		await castVote('u3', 'a');
		await castVote('u4', 'b');

		expect(spy.count()).toBe(0);
		expect(question()?.selections).toEqual({ a: 3, b: 1 });
		expect(option('a')?.isVoted).toBe(true);
		expect(option('b')?.isVoted).toBeUndefined();
	});

	it('moves the flag when the leader changes', async () => {
		await castVote('u1', 'a');
		await castVote('u2', 'b');
		await castVote('u3', 'b');

		expect(option('a')?.isVoted).toBe(false);
		expect(option('b')?.isVoted).toBe(true);
		expect(question()?.topVotedOption).toMatchObject({ statementId: 'b' });
	});

	it('repairs a leader whose flag was left unset by a run that stopped halfway', async () => {
		fake.seed(Collections.statements, QUESTION, {
			statementId: QUESTION,
			topParentId: QUESTION,
			selections: { b: 2 },
			topVotedOption: { statementId: 'a' },
		});
		seedOption('a', { isVoted: true });

		await castVote('u1', 'b');

		expect(option('a')?.isVoted).toBe(false);
		expect(option('b')?.isVoted).toBe(true);
	});
});
