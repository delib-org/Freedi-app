import { resetTurns } from '../fn_classResetTurns';
import { resetVote } from '../fn_classResetVote';
import { setItemHidden } from '../fn_classSetItemHidden';
import { ballotAfterReset, isVoteRunning } from '../resetVoteLogic';
import { selectTablesToReset } from '../resetTurnsLogic';
import { chunk } from '../batchedWrites';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';
import type { ClassTable } from '@freedi/shared-types';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];

async function expectReason(promise: Promise<unknown>, reason: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ reason });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toMatchObject({ code });
}

function seed(fake: FakeFirestore, stepIndex: number, status?: string): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		statementType: 'question',
		creatorId: TEACHER,
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex, ...(status ? { status } : {}) } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed(`statementsSubscribe/s1--${MAIN}`, {
		userId: 's1',
		statementId: MAIN,
		role: 'member',
		decisionSupport: 0.5,
	});
	fake.seed(`statementsSubscribe/s2--${MAIN}`, {
		userId: 's2',
		statementId: MAIN,
		role: 'member',
	});
}

function seedTable(fake: FakeFirestore, n: number): void {
	fake.seed(`classTables/${MAIN}--${n}`, {
		tableId: `${MAIN}--${n}`,
		mainId: MAIN,
		n,
		memberUids: ['s1', 's2'],
		noDeviceMembers: [{ id: 'nd1', name: 'Dan' }],
		step: 'talk',
		askerUid: 's1',
		turn: 4,
		questionId: 'q1',
		writingMode: 'table',
		writingLocked: true,
		speakerUid: 's2',
		speakerEndsAt: 123,
		spokenUids: ['s2'],
		usedQuestionIds: ['q1'],
		askedUids: ['s1'],
		passedAskingUids: ['s2'],
		passedSpeakingUids: ['s2'],
		updatedAt: 1,
	});
}

describe('classResetTurns', () => {
	it('refuses a non-admin, an ended lesson and any step but Table talk', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedTable(fake, 1);
		const db = fake.asFirestore();
		await expectCode(resetTurns(db, 's1', { mainId: MAIN }), 'permission-denied');
		seed(fake, 5);
		await expectReason(resetTurns(db, TEACHER, { mainId: MAIN }), 'not-table-talk');
		seed(fake, 4, 'ended');
		await expectReason(resetTurns(db, TEACHER, { mainId: MAIN }), 'lesson-ended');
	});

	it('gives every table its turns back and keeps members', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedTable(fake, 1);
		seedTable(fake, 2);
		const res = await resetTurns(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res).toEqual({ reset: 2 });
		const table = fake.read(`classTables/${MAIN}--1`) as unknown as ClassTable;
		expect(table).toMatchObject({
			step: 'pick',
			turn: 1,
			askerUid: null,
			askedUids: [],
			passedAskingUids: [],
			usedQuestionIds: [],
			spokenUids: [],
			writingMode: 'each',
			writingLocked: false,
			memberUids: ['s1', 's2'],
			noDeviceMembers: [{ id: 'nd1', name: 'Dan' }],
		});
		for (const gone of ['questionId', 'speakerUid', 'speakerEndsAt', 'passedSpeakingUids']) {
			expect(table).not.toHaveProperty(gone);
		}
	});

	it('resets only table n, and refuses a table that does not exist', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedTable(fake, 1);
		seedTable(fake, 2);
		const db = fake.asFirestore();
		await expectCode(resetTurns(db, TEACHER, { mainId: MAIN, n: 9 }), 'not-found');
		expect(await resetTurns(db, TEACHER, { mainId: MAIN, n: 2 })).toEqual({ reset: 1 });
		expect(fake.read(`classTables/${MAIN}--1`)).toMatchObject({ turn: 4 });
		expect(fake.read(`classTables/${MAIN}--2`)).toMatchObject({ turn: 1 });
	});

	it('selects tables by number', () => {
		const tables = [{ n: 1 }, { n: 2 }] as ClassTable[];
		expect(selectTablesToReset(tables)).toHaveLength(2);
		expect(() => selectTablesToReset(tables, 1.5)).toThrow(ClassroomError);
	});
});

function seedVote(
	fake: FakeFirestore,
	stepIndex: number,
	ballot: Record<string, unknown> | null,
): void {
	seed(fake, stepIndex);
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		selections: { p1: 2, p2: 1 },
		topVotedOption: { statementId: 'p1' },
		statementSettings: { classRole: 'challenge', ...(ballot ? { ballot } : {}) },
	});
	for (const id of ['p1', 'p2']) {
		fake.seed(`statements/${id}`, {
			statementId: id,
			parentId: 'ch',
			statementType: 'option',
			isVoted: id === 'p1',
		});
		fake.seed(`votes/u--${id}`, { voteId: `u--${id}`, parentId: 'ch', statementId: id });
	}
	fake.seed('votes/x--other', { voteId: 'x--other', parentId: 'elsewhere', statementId: 'z' });
}

describe('classResetVote', () => {
	it('refuses without a ballot and while the vote is running', async () => {
		const fake = new FakeFirestore();
		seedVote(fake, 6, null);
		await expectReason(resetVote(fake.asFirestore(), TEACHER, { mainId: MAIN }), 'no-ballot');
		seedVote(fake, 6, { candidateIds: ['p1', 'p2'], frozenAt: 10 });
		await expectReason(resetVote(fake.asFirestore(), TEACHER, { mainId: MAIN }), 'vote-running');
		expect(fake.list('votes')).toHaveLength(3);
	});

	it('clears votes, tally, decision and decisionSupport; keeps candidates', async () => {
		const fake = new FakeFirestore();
		seedVote(fake, 7, { candidateIds: ['p1', 'p2'], frozenAt: 10, closedAt: 20, decisionId: 'p1' });
		const res = await resetVote(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res).toEqual({ votesDeleted: 2 });
		expect(fake.list('votes').map((v) => v.voteId)).toEqual(['x--other']);
		expect(fake.read('statements/p1')).toMatchObject({ isVoted: false });
		const ch = fake.read('statements/ch') ?? {};
		expect(ch).not.toHaveProperty('selections');
		expect(ch).not.toHaveProperty('topVotedOption');
		expect(ch.statementSettings).toMatchObject({
			ballot: { candidateIds: ['p1', 'p2'], frozenAt: 10 },
		});
		expect((ch.statementSettings as { ballot: object }).ballot).not.toHaveProperty('closedAt');
		expect((ch.statementSettings as { ballot: object }).ballot).not.toHaveProperty('decisionId');
		expect(fake.read(`statementsSubscribe/s1--${MAIN}`)).not.toHaveProperty('decisionSupport');
		expect(fake.read(`statementsSubscribe/s2--${MAIN}`)).toMatchObject({ role: 'member' });
	});

	it('allows a reset of an open ballot when the lesson left the Vote step', async () => {
		const fake = new FakeFirestore();
		seedVote(fake, 5, { candidateIds: ['p1', 'p2'], frozenAt: 10 });
		await expect(resetVote(fake.asFirestore(), TEACHER, { mainId: MAIN })).resolves.toEqual({
			votesDeleted: 2,
		});
	});

	it('pure helpers', () => {
		expect(
			ballotAfterReset({ candidateIds: ['a'], frozenAt: 1, closedAt: 2, decisionId: 'a' }),
		).toEqual({
			candidateIds: ['a'],
			frozenAt: 1,
		});
		expect(isVoteRunning(undefined, null)).toBe(false);
	});
});

describe('classSetItemHidden', () => {
	function seedItems(ballot: Record<string, unknown> | null): FakeFirestore {
		const fake = new FakeFirestore();
		seedVote(fake, 6, ballot);
		fake.seed('statements/g1', {
			statementId: 'g1',
			parentId: MAIN,
			statementType: 'question',
			classTable: { tableId: `${MAIN}--1`, shared: false, coAuthors: [] },
		});
		fake.seed('statements/g2', { statementId: 'g2', parentId: MAIN, statementType: 'question' });
		fake.seed('statements/a1', { statementId: 'a1', parentId: 'g1', statementType: 'option' });
		fake.seed('statements/stray', {
			statementId: 'stray',
			parentId: 'nowhere',
			statementType: 'option',
		});

		return fake;
	}

	it('hides and restores an answer and a table question', async () => {
		const fake = seedItems(null);
		const db = fake.asFirestore();
		// a1 sits under g1, a table question of the lesson
		expect(
			await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: 'a1', hidden: true }),
		).toEqual({
			hidden: true,
			votesWithdrawn: 0,
		});
		expect(fake.read('statements/a1')).toMatchObject({ hide: true });
		await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: 'g1', hidden: true });
		expect(fake.read('statements/g1')).toMatchObject({ hide: true });
		await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: 'a1', hidden: false });
		expect(fake.read('statements/a1')).toMatchObject({ hide: false });
	});

	it('refuses non-admins, strangers, plain guiding questions and bad input', async () => {
		const fake = seedItems(null);
		const db = fake.asFirestore();
		const hide = (statementId: string, who = TEACHER) =>
			setItemHidden(db, who, { mainId: MAIN, statementId, hidden: true });
		await expectCode(hide('a1', 's1'), 'permission-denied');
		await expectCode(hide('stray'), 'invalid-argument');
		await expectCode(hide('g2'), 'invalid-argument');
		await expectCode(hide('missing'), 'not-found');
		await expectCode(
			setItemHidden(db, TEACHER, {
				mainId: MAIN,
				statementId: 'a1',
				hidden: 'yes' as unknown as boolean,
			}),
			'invalid-argument',
		);
	});

	it('takes a candidate off an open ballot and turns its votes into none', async () => {
		const fake = seedItems({ candidateIds: ['p1', 'p2'], frozenAt: 10 });
		const res = await setItemHidden(fake.asFirestore(), TEACHER, {
			mainId: MAIN,
			statementId: 'p1',
			hidden: true,
		});
		expect(res).toEqual({ hidden: true, votesWithdrawn: 1 });
		expect(fake.read('votes/u--p1')).toMatchObject({ statementId: 'none' });
		expect(fake.read('votes/u--p2')).toMatchObject({ statementId: 'p2' });
		expect(fake.read('statements/ch')?.statementSettings).toMatchObject({
			ballot: { candidateIds: ['p2'] },
		});
		expect(fake.read('statements/p1')).toMatchObject({ hide: true });
	});

	it('refuses the last candidate and any candidate of a closed ballot', async () => {
		const last = seedItems({ candidateIds: ['p1'], frozenAt: 10 });
		await expectReason(
			setItemHidden(last.asFirestore(), TEACHER, { mainId: MAIN, statementId: 'p1', hidden: true }),
			'last-candidate',
		);
		const closed = seedItems({ candidateIds: ['p1', 'p2'], frozenAt: 10, closedAt: 20 });
		await expectReason(
			setItemHidden(closed.asFirestore(), TEACHER, {
				mainId: MAIN,
				statementId: 'p1',
				hidden: true,
			}),
			'vote-closed',
		);
		// restoring on a closed ballot is allowed and leaves the ballot alone
		await setItemHidden(closed.asFirestore(), TEACHER, {
			mainId: MAIN,
			statementId: 'p1',
			hidden: false,
		});
		expect(closed.read('statements/p1')).toMatchObject({ hide: false });
	});
});

describe('chunk', () => {
	it('never exceeds the batch limit', () => {
		const runs = chunk(Array.from({ length: 1201 }, (_, i) => i));
		expect(runs.map((r) => r.length)).toEqual([500, 500, 201]);
	});
});
