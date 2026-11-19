import type { ClassTable } from '@freedi/shared-types';
import { postProposal } from '../fn_classPostProposal';
import type { PostProposalDeps } from '../fn_classPostProposal';
import { tableStep } from '../fn_classTableStep';
import { FakeFirestore } from './fakeFirestore';

/** Proposals pen through the callables: a send needs the pen, frees it, and the last send moves to rate. */

const MAIN = 'main1';
const TEACHER = 'teacher';
const NOW = 2_000_000;
const TABLE = `${MAIN}--1`;

function member(fake: FakeFirestore, uid: string, extra = {}): void {
	fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
		userId: uid,
		statementId: MAIN,
		role: uid === TEACHER ? 'admin' : 'member',
		user: { uid, displayName: uid, isAnonymous: true },
		...extra,
	});
}

function seed(tableOverrides: Partial<ClassTable> = {}): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		statement: 'Lesson',
		parentId: 'top',
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'Ms Teacher' },
		statementSettings: { lessonPlan: { steps: ['proposals'], stepIndex: 0 } },
	});
	member(fake, TEACHER);
	member(fake, 'a', { tableId: TABLE });
	member(fake, 'b', { tableId: TABLE });
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: { classRole: 'challenge' },
	});
	const table: ClassTable = {
		tableId: TABLE,
		mainId: MAIN,
		n: 1,
		memberUids: ['a', 'b'],
		noDeviceMembers: [],
		step: 'write',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: ['a', 'b'],
		usedQuestionIds: [],
		updatedAt: 0,
		...tableOverrides,
	};
	fake.seed(`classTables/${TABLE}`, table);

	return fake;
}

const deps: PostProposalDeps = { detect: async () => false, now: () => NOW };
const send = (fake: FakeFirestore, uid: string, id: string) =>
	postProposal(fake.asFirestore(), uid, { mainId: MAIN, proposalId: id, text: 'An idea' }, deps);

describe('classPostProposal with the pen', () => {
	it('refuses a send from a tablemate who does not hold the pen (a stale tab)', async () => {
		const fake = seed();
		await expect(send(fake, 'a', 'p1')).rejects.toMatchObject({ reason: 'no-pen' });
		expect(fake.read('statements/p1')).toBeUndefined();
	});

	it('refuses a send while someone else holds the pen', async () => {
		const fake = seed({ writerUid: 'b' });
		await expect(send(fake, 'a', 'p1')).rejects.toMatchObject({ reason: 'no-pen' });
	});

	it('refuses a send during Talk', async () => {
		const fake = seed({ step: 'talk' });
		await expect(send(fake, 'a', 'p1')).rejects.toMatchObject({ reason: 'no-pen' });
	});

	it('writes the proposal, frees the pen and records the writer', async () => {
		const fake = seed({ writerUid: 'a' });
		await expect(send(fake, 'a', 'p1')).resolves.toEqual({ ok: true, proposalId: 'p1' });
		const table = fake.read(`classTables/${TABLE}`) as ClassTable;
		expect(table.writerUid).toBeUndefined();
		expect(table.writtenUids).toEqual(['a']);
		expect(table.step).toBe('write');
	});

	it('moves the table to rate when the last tablemate sends', async () => {
		const fake = seed({ writerUid: 'b', writtenUids: ['a'] });
		await send(fake, 'b', 'p2');
		expect((fake.read(`classTables/${TABLE}`) as ClassTable).step).toBe('rate');
	});

	it('answers a retry of a send that already landed, after the pen was freed', async () => {
		const fake = seed({ writerUid: 'a' });
		await send(fake, 'a', 'p1');
		await expect(send(fake, 'a', 'p1')).resolves.toEqual({ ok: true, proposalId: 'p1' });
	});

	it('does not touch the pen when the teacher enters a proposal', async () => {
		const fake = seed({ writerUid: 'a' });
		await postProposal(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, proposalId: 'pt', text: 'Teacher idea' },
			deps,
		);
		expect((fake.read(`classTables/${TABLE}`) as ClassTable).writerUid).toBe('a');
	});
});

describe('classTableStep claimPen race', () => {
	it('the first tap wins and the second is refused as pen-taken', async () => {
		const fake = seed();
		const step = (uid: string) =>
			tableStep(fake.asFirestore(), uid, { tableId: TABLE, action: 'claimPen' }, () => NOW);
		await expect(step('a')).resolves.toMatchObject({ step: 'write' });
		await expect(step('b')).rejects.toMatchObject({ reason: 'pen-taken' });
		expect((fake.read(`classTables/${TABLE}`) as ClassTable).writerUid).toBe('a');
	});

	it('passWriting from the callable ends writing when everyone is done', async () => {
		const fake = seed({ writtenUids: ['a'] });
		const res = await tableStep(
			fake.asFirestore(),
			'b',
			{ tableId: TABLE, action: 'passWriting' },
			() => NOW,
		);
		expect(res.step).toBe('rate');
	});
});

describe('a student with no table at Proposals', () => {
	it('is refused when the subscription has no table', async () => {
		const fake = seed({ writerUid: 'a' });
		fake.seed(`statementsSubscribe/c--${MAIN}`, {
			userId: 'c',
			statementId: MAIN,
			role: 'member',
			user: { uid: 'c', displayName: 'c', isAnonymous: true },
		});
		await expect(send(fake, 'c', 'p1')).rejects.toMatchObject({ reason: 'no-pen' });
		expect(fake.read('statements/p1')).toBeUndefined();
	});

	it('is refused when the table document does not exist', async () => {
		const fake = seed({ writerUid: 'a' });
		fake.seed(`statementsSubscribe/c--${MAIN}`, {
			userId: 'c',
			statementId: MAIN,
			role: 'member',
			tableId: `${MAIN}--9`,
			user: { uid: 'c', displayName: 'c', isAnonymous: true },
		});
		await expect(send(fake, 'c', 'p1')).rejects.toMatchObject({ reason: 'no-pen' });
	});
});

describe('the pen when writing is closed', () => {
	function freeze(fake: FakeFirestore): void {
		fake.seed('statements/ch', {
			statementId: 'ch',
			parentId: MAIN,
			statementType: 'question',
			statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['x'], frozenAt: 1 } },
		});
	}
	const claim = (fake: FakeFirestore, uid: string) =>
		tableStep(fake.asFirestore(), uid, { tableId: TABLE, action: 'claimPen' }, () => NOW);

	it('refuses claimPen once the ballot is frozen', async () => {
		const fake = seed();
		freeze(fake);
		await expect(claim(fake, 'a')).rejects.toMatchObject({ reason: 'vote-running' });
		expect((fake.read(`classTables/${TABLE}`) as ClassTable).writerUid).toBeUndefined();
	});

	it('refuses claimPen when the lesson has no challenge question', async () => {
		const fake = seed();
		fake.seed('statements/ch', {
			statementId: 'ch',
			parentId: 'elsewhere',
			statementType: 'question',
		});
		await expect(claim(fake, 'a')).rejects.toMatchObject({ reason: 'not-writing' });
	});

	it('lets a holder pass after a freeze that arrived while they held the pen', async () => {
		const fake = seed({ writerUid: 'a' });
		freeze(fake);
		const res = await tableStep(
			fake.asFirestore(),
			'a',
			{ tableId: TABLE, action: 'passWriting' },
			() => NOW,
		);
		expect(res.step).toBe('write');
		const table = fake.read(`classTables/${TABLE}`) as ClassTable;
		expect(table.writerUid).toBeUndefined();
		expect(table.writtenUids).toEqual(['a']);
	});
});
