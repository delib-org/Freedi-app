import type { Firestore } from 'firebase-admin/firestore';
import { tableStep } from '../fn_classTableStep';
import { FakeFirestore } from './fakeFirestore';

/**
 * Trello w13dMDZf: the role, the picked question and the challenge are read
 * together. A person who is not seated is refused exactly as before, and
 * nothing is written, even when one of the parallel reads fails.
 */

const MAIN = 'main1';
const TABLE = `${MAIN}--1`;
const TEACHER = 'teacher';
const OUTSIDER = 'outsider';
const NOW = 1_700_000_000_000;

function seed(fake: FakeFirestore): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: { lessonPlan: { steps: ['tableTalk'], stepIndex: 0 } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed(`statements/q1`, {
		statementId: 'q1',
		parentId: MAIN,
		statementType: 'question',
		statement: 'Q',
	});
	fake.seed(`classTables/${TABLE}`, {
		tableId: TABLE,
		mainId: MAIN,
		n: 1,
		step: 'pick',
		turn: 1,
		memberUids: ['s1', 's2'],
		spokenUids: [],
		usedQuestionIds: [],
		noDeviceMembers: [],
		askerUid: 's1',
		updatedAt: 1,
	});
}

/** The same fake, but one document read of `statements/<id>` rejects. */
function withFailingRead(fake: FakeFirestore, failingId: string): Firestore {
	const real = fake.asFirestore();
	const collection = real.collection.bind(real);
	const patched = {
		...real,
		runTransaction: real.runTransaction.bind(real),
		collection: (name: string) => {
			const api = collection(name);
			if (name !== 'statements') return api;

			return {
				...api,
				doc: (id: string) => {
					const ref = api.doc(id);

					return id === failingId
						? { ...ref, get: () => Promise.reject(new Error('read failed')) }
						: ref;
				},
			};
		},
	};

	return patched as unknown as Firestore;
}

async function outcome(promise: Promise<unknown>): Promise<{ code?: unknown; message: string }> {
	try {
		await promise;

		return { message: 'resolved' };
	} catch (error) {
		const e = error as { code?: unknown; message: string };

		return { code: e.code, message: e.message };
	}
}

describe('classTableStep, reads together', () => {
	it('refuses a person who is not seated, and writes nothing', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		const before = fake.read(`classTables/${TABLE}`);
		const result = await outcome(
			tableStep(
				fake.asFirestore(),
				OUTSIDER,
				{ tableId: TABLE, action: 'pickQuestion', questionId: 'q1' },
				() => NOW,
			),
		);
		expect(result.message).toMatch(/not seated/i);
		expect(fake.read(`classTables/${TABLE}`)).toEqual(before);
	});

	it('still refuses (and writes nothing) when the question read fails alongside the role read', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		const before = fake.read(`classTables/${TABLE}`);
		const result = await outcome(
			tableStep(
				withFailingRead(fake, 'q1'),
				OUTSIDER,
				{ tableId: TABLE, action: 'pickQuestion', questionId: 'q1' },
				() => NOW,
			),
		);
		expect(result.message).toBe('read failed');
		expect(fake.read(`classTables/${TABLE}`)).toEqual(before);
	});

	it('an unknown question is still refused as invalid-argument before any write', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		const before = fake.read(`classTables/${TABLE}`);
		const result = await outcome(
			tableStep(
				fake.asFirestore(),
				TEACHER,
				{ tableId: TABLE, action: 'pickQuestion', questionId: 'missing' },
				() => NOW,
			),
		);
		expect(result.code).toBe('invalid-argument');
		expect(fake.read(`classTables/${TABLE}`)).toEqual(before);
	});

	it('the teacher still picks a question', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		await tableStep(
			fake.asFirestore(),
			TEACHER,
			{ tableId: TABLE, action: 'pickQuestion', questionId: 'q1' },
			() => NOW,
		);
		expect(fake.read(`classTables/${TABLE}`)?.questionId).toBe('q1');
	});
});
