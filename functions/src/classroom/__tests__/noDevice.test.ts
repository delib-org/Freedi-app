import { CLASS_TABLES_COLLECTION } from '@freedi/shared-types';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { postProposal } from '../fn_classPostProposal';
import type { PostProposalDeps } from '../fn_classPostProposal';
import { castVoteFor } from '../fn_classCastVoteFor';
import { addNoDevice, MAX_NO_DEVICE_PER_TABLE } from '../fn_classAddNoDevice';
import { assignTables } from '../fn_classAssignTables';
import { carryNoDeviceMembers } from '../assignTables';
import { autoEvaluatorUids, onClassOptionCreated } from '../autoEvaluations';
import { editProposal } from '../fn_classEditProposal';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const OTHER_MAIN = 'main2';
const TEACHER = 'teacher';
const OTHER_TEACHER = 'other-teacher';
const STUDENT = 'dana';
const ND = 'nd_aaa';
const ND2 = 'nd_bbb';
const ND_ELSEWHERE = 'nd_elsewhere';
const SECRET_NAME = 'Yael the phoneless';
const NOW = 2_000_000;

const deps = (flagged = false): PostProposalDeps => ({
	detect: async () => flagged,
	now: () => NOW,
});

function table(mainId: string, n: number, extra: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: `${mainId}--${n}`,
		mainId,
		n,
		memberUids: [],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...extra,
	};
}

interface SeedOptions {
	ballot?: Record<string, unknown>;
	status?: string;
	limit?: 'one' | 'unlimited';
}

function seed({ ballot, status, limit }: SeedOptions = {}): FakeFirestore {
	const fake = new FakeFirestore();
	const lesson = (mainId: string, teacher: string): void => {
		fake.seed(`statements/${mainId}`, {
			statementId: mainId,
			statement: 'Lesson',
			parentId: 'top',
			statementType: 'question',
			creatorId: teacher,
			creator: { uid: teacher, displayName: 'A teacher' },
			statementSettings: {
				lessonPlan: { steps: ['proposals'], stepIndex: 0, ...(status ? { status } : {}) },
				...(limit ? { proposalLimit: limit } : {}),
			},
		});
		fake.seed(`statementsSubscribe/${teacher}--${mainId}`, {
			userId: teacher,
			statementId: mainId,
			role: 'admin',
			user: { uid: teacher, displayName: 'A teacher', isAnonymous: false },
		});
	};
	lesson(MAIN, TEACHER);
	lesson(OTHER_MAIN, OTHER_TEACHER);
	fake.seed(`statementsSubscribe/${STUDENT}--${MAIN}`, {
		userId: STUDENT,
		statementId: MAIN,
		role: 'member',
		tableId: `${MAIN}--1`,
		user: { uid: STUDENT, displayName: 'Dana', isAnonymous: true },
	});
	fake.seed(`statementsSubscribe/${OTHER_TEACHER}--${MAIN}`, {
		userId: OTHER_TEACHER,
		statementId: MAIN,
		role: 'member',
		user: { uid: OTHER_TEACHER, displayName: 'Visitor', isAnonymous: true },
	});
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: { classRole: 'challenge', ...(ballot ? { ballot } : {}) },
	});
	fake.seed(
		`${CLASS_TABLES_COLLECTION}/${MAIN}--1`,
		table(MAIN, 1, {
			memberUids: [STUDENT],
			noDeviceMembers: [{ id: ND, name: SECRET_NAME }],
		}),
	);
	fake.seed(
		`${CLASS_TABLES_COLLECTION}/${MAIN}--2`,
		table(MAIN, 2, { noDeviceMembers: [{ id: ND2, name: 'Omer' }] }),
	);
	fake.seed(
		`${CLASS_TABLES_COLLECTION}/${OTHER_MAIN}--1`,
		table(OTHER_MAIN, 1, { noDeviceMembers: [{ id: ND_ELSEWHERE, name: 'Elsewhere' }] }),
	);

	return fake;
}

const OPEN = { candidateIds: ['p1', 'p2'], frozenAt: 1 };

function propose(
	fake: FakeFirestore,
	actor: string,
	forStudentId: string | undefined,
	proposalId = 'pnd',
): ReturnType<typeof postProposal> {
	return postProposal(
		fake.asFirestore(),
		actor,
		{ mainId: MAIN, proposalId, text: 'Plant trees', ...(forStudentId ? { forStudentId } : {}) },
		deps(),
	);
}

function vote(
	fake: FakeFirestore,
	actor: string,
	forStudentId: string,
	optionId = 'p1',
): ReturnType<typeof castVoteFor> {
	return castVoteFor(fake.asFirestore(), actor, { mainId: MAIN, forStudentId, optionId });
}

describe('classPostProposal with forStudentId', () => {
	it('writes the proposal as the student, with who entered it and no name', async () => {
		const fake = seed();
		await expect(propose(fake, TEACHER, ND)).resolves.toEqual({ ok: true, proposalId: 'pnd' });
		expect(fake.read('statements/pnd')).toMatchObject({
			statement: 'Plant trees',
			statementType: 'option',
			parentId: 'ch',
			creatorId: ND,
			creator: { uid: ND, displayName: '', photoURL: null, isAnonymous: true },
			classTable: {
				tableId: `${MAIN}--1`,
				shared: false,
				coAuthors: [],
				enteredByUid: TEACHER,
			},
		});
		expect(JSON.stringify(fake.read('statements/pnd'))).not.toContain(SECRET_NAME);
	});

	it('leaves the language check off, as for all the teacher writes', async () => {
		const fake = seed();
		const res = await postProposal(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, proposalId: 'pnd', text: 'whatever', forStudentId: ND },
			deps(true),
		);
		expect(res.ok).toBe(true);
	});

	it('refuses a student of the lesson, and writes nothing', async () => {
		const fake = seed();
		await expect(propose(fake, STUDENT, ND)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(fake.read('statements/pnd')).toBeUndefined();
	});

	it("refuses another lesson's teacher, visiting as a member or not at all", async () => {
		const fake = seed();
		await expect(propose(fake, OTHER_TEACHER, ND)).rejects.toMatchObject({
			code: 'permission-denied',
		});
		await expect(propose(fake, 'stranger', ND)).rejects.toMatchObject({
			code: 'permission-denied',
		});
		expect(fake.read('statements/pnd')).toBeUndefined();
	});

	it('refuses an id that is not on a table of THIS lesson', async () => {
		const fake = seed();
		await expect(propose(fake, TEACHER, ND_ELSEWHERE)).rejects.toMatchObject({
			reason: 'not-no-device',
		});
		await expect(propose(fake, TEACHER, 'nd_nobody')).rejects.toMatchObject({
			reason: 'not-no-device',
		});
		expect(fake.read('statements/pnd')).toBeUndefined();
	});

	it("refuses a real student's uid: the teacher cannot write as somebody with a phone", async () => {
		const fake = seed();
		await expect(propose(fake, TEACHER, STUDENT)).rejects.toMatchObject({
			reason: 'not-no-device',
		});
	});

	it('a student cannot spoof one by naming the id as their own proposal id', async () => {
		const fake = seed();
		await propose(fake, TEACHER, ND, 'shared-id');
		await expect(propose(fake, STUDENT, undefined, 'shared-id')).rejects.toMatchObject({
			reason: 'proposal-id-taken',
		});
		expect(fake.read('statements/shared-id')).toMatchObject({ creatorId: ND });
	});

	it('the limit is per author: each student without a device has their own one', async () => {
		const fake = seed();
		await propose(fake, TEACHER, ND, 'a1');
		await expect(propose(fake, TEACHER, ND, 'a2')).rejects.toMatchObject({
			reason: 'already-proposed',
		});
		await expect(propose(fake, TEACHER, ND2, 'b1')).resolves.toMatchObject({ ok: true });
		await expect(propose(fake, TEACHER, undefined, 't1')).resolves.toMatchObject({ ok: true });
	});

	it('unlimited lets the teacher enter several, and a retry stays the same write', async () => {
		const fake = seed({ limit: 'unlimited' });
		await propose(fake, TEACHER, ND, 'a1');
		await propose(fake, TEACHER, ND, 'a2');
		await expect(propose(fake, TEACHER, ND, 'a1')).resolves.toMatchObject({ ok: true });
		expect(fake.list('statements').filter((s) => s.creatorId === ND)).toHaveLength(2);
	});

	it('refuses once the ballot is frozen', async () => {
		await expect(propose(seed({ ballot: OPEN }), TEACHER, ND)).rejects.toMatchObject({
			reason: 'vote-running',
		});
	});

	it('the teacher can edit an entered proposal; a student cannot', async () => {
		const fake = seed();
		await propose(fake, TEACHER, ND);
		await expect(
			editProposal(
				fake.asFirestore(),
				TEACHER,
				{ mainId: MAIN, proposalId: 'pnd', text: 'Plant more' },
				deps(),
			),
		).resolves.toMatchObject({ ok: true });
		await expect(
			editProposal(
				fake.asFirestore(),
				STUDENT,
				{ mainId: MAIN, proposalId: 'pnd', text: 'Mine' },
				deps(),
			),
		).rejects.toMatchObject({ code: 'permission-denied' });
		expect(fake.read('statements/pnd')).toMatchObject({
			statement: 'Plant more',
			creatorId: ND,
			classTable: { enteredByUid: TEACHER },
		});
	});
});

describe('classCastVoteFor', () => {
	it('writes the vote in the student slot, with who entered it and no name', async () => {
		const fake = seed({ ballot: OPEN });
		await expect(vote(fake, TEACHER, ND)).resolves.toEqual({ ok: true, statementId: 'p1' });
		const written = fake.read(`votes/${ND}--ch`);
		expect(written).toMatchObject({
			voteId: `${ND}--ch`,
			statementId: 'p1',
			parentId: 'ch',
			userId: ND,
			enteredByUid: TEACHER,
		});
		expect(JSON.stringify(written)).not.toContain(SECRET_NAME);
		expect(written).not.toHaveProperty('voter');
	});

	it('keeps each student in their own slot', async () => {
		const fake = seed({ ballot: OPEN });
		await vote(fake, TEACHER, ND, 'p1');
		await vote(fake, TEACHER, ND2, 'p2');
		expect(fake.read(`votes/${ND}--ch`)).toMatchObject({ statementId: 'p1', userId: ND });
		expect(fake.read(`votes/${ND2}--ch`)).toMatchObject({ statementId: 'p2', userId: ND2 });
	});

	it('moves a vote, keeping createdAt; a repeat writes nothing the trigger would refuse', async () => {
		const fake = seed({ ballot: OPEN });
		fake.seed(`votes/${ND}--ch`, {
			voteId: `${ND}--ch`,
			statementId: 'p1',
			parentId: 'ch',
			userId: ND,
			createdAt: 5,
			lastUpdate: 5,
		});
		await vote(fake, TEACHER, ND, 'p1');
		expect(fake.read(`votes/${ND}--ch`)).toMatchObject({ lastUpdate: 5 });
		await vote(fake, TEACHER, ND, 'p2');
		const moved = fake.read(`votes/${ND}--ch`);
		expect(moved).toMatchObject({ statementId: 'p2', createdAt: 5 });
		expect(moved?.lastUpdate).not.toBe(5);
	});

	it('takes none, the withdrawal the rule allows', async () => {
		const fake = seed({ ballot: OPEN });
		await expect(vote(fake, TEACHER, ND, 'none')).resolves.toMatchObject({ statementId: 'none' });
	});

	it('refuses a student, a stranger and another lesson teacher', async () => {
		const fake = seed({ ballot: OPEN });
		for (const actor of [STUDENT, 'stranger', OTHER_TEACHER]) {
			await expect(vote(fake, actor, ND)).rejects.toMatchObject({ code: 'permission-denied' });
		}
		expect(fake.read(`votes/${ND}--ch`)).toBeUndefined();
	});

	it('refuses an id that is not on a table of THIS lesson, and a real student', async () => {
		const fake = seed({ ballot: OPEN });
		for (const id of [ND_ELSEWHERE, 'nd_nobody', STUDENT]) {
			await expect(vote(fake, TEACHER, id)).rejects.toMatchObject({ reason: 'not-no-device' });
			expect(fake.read(`votes/${id}--ch`)).toBeUndefined();
		}
	});

	it('repeats the ballot check: not open, paused, closed, not a candidate', async () => {
		await expect(vote(seed(), TEACHER, ND)).rejects.toMatchObject({ reason: 'no-ballot' });
		await expect(
			vote(seed({ ballot: { ...OPEN, pausedAt: 2 } }), TEACHER, ND),
		).rejects.toMatchObject({ reason: 'vote-paused' });
		await expect(
			vote(seed({ ballot: { ...OPEN, closedAt: 2 } }), TEACHER, ND),
		).rejects.toMatchObject({ reason: 'vote-closed' });
		await expect(vote(seed({ ballot: OPEN }), TEACHER, ND, 'pX')).rejects.toMatchObject({
			reason: 'not-a-candidate',
		});
	});

	it('refuses while the lesson is held', async () => {
		for (const status of ['paused', 'ended']) {
			await expect(vote(seed({ ballot: OPEN, status }), TEACHER, ND)).rejects.toMatchObject({
				code: 'failed-precondition',
			});
		}
	});
});

describe('the auto +1 of an entered proposal', () => {
	const option = (creatorId: string, marker: Record<string, unknown>): Statement =>
		({
			statementId: 'pnd',
			parentId: 'ch',
			parents: [MAIN, 'ch'],
			topParentId: MAIN,
			statementType: 'option',
			creatorId,
			creator: { uid: creatorId, displayName: '' },
			classTable: { shared: false, coAuthors: [], ...marker },
		}) as unknown as Statement;
	const seated = table(MAIN, 1, {
		memberUids: [STUDENT],
		noDeviceMembers: [{ id: ND, name: SECRET_NAME }],
	});

	it('admits a no-device author seated at the table', () => {
		expect(autoEvaluatorUids(option(ND, { tableId: seated.tableId }), seated)).toEqual([ND]);
	});

	it('admits nobody seated elsewhere', () => {
		expect(autoEvaluatorUids(option(ND2, { tableId: seated.tableId }), seated)).toEqual([]);
	});

	it('a student cannot stamp a +1 on a no-device tablemate as a co-author', () => {
		expect(
			autoEvaluatorUids(option(STUDENT, { tableId: seated.tableId, coAuthors: [ND] }), seated),
		).toEqual([STUDENT]);
	});

	it('writes the +1 under the student id, with no name', async () => {
		const fake = seed();
		await propose(fake, TEACHER, ND);
		await onClassOptionCreated(
			fake.asFirestore(),
			fake.read('statements/pnd') as unknown as Statement,
		);
		const evaluation = fake.read(`evaluations/${ND}--pnd`);
		expect(evaluation).toMatchObject({
			evaluatorId: ND,
			evaluation: 1,
			evaluator: { uid: ND, displayName: '', isAnonymous: true },
		});
		expect(JSON.stringify(evaluation)).not.toContain(SECRET_NAME);
	});
});

describe('statementSettings.noDeviceCount', () => {
	const count = (fake: FakeFirestore): unknown =>
		(fake.read(`statements/${MAIN}`)?.statementSettings as Record<string, unknown>).noDeviceCount;

	it('counts the whole lesson on every add, healing a lesson that had none', async () => {
		const fake = seed();
		expect(count(fake)).toBeUndefined();
		await addNoDevice(fake.asFirestore(), TEACHER, { mainId: MAIN, n: 2, name: 'Noa' });
		expect(count(fake)).toBe(3);
		await addNoDevice(fake.asFirestore(), TEACHER, { mainId: MAIN, n: 1, name: 'Tal' });
		expect(count(fake)).toBe(4);
	});

	it('does not move when the add is refused', async () => {
		const fake = seed();
		fake.seed(
			`${CLASS_TABLES_COLLECTION}/${MAIN}--2`,
			table(MAIN, 2, {
				noDeviceMembers: Array.from({ length: MAX_NO_DEVICE_PER_TABLE }, (_, i) => ({
					id: `nd_${i}`,
					name: `S${i}`,
				})),
			}),
		);
		await expect(
			addNoDevice(fake.asFirestore(), TEACHER, { mainId: MAIN, n: 2, name: 'Noa' }),
		).rejects.toMatchObject({ code: 'resource-exhausted' });
		expect(count(fake)).toBeUndefined();
	});

	it('gives every new id the prefix the rest of the system checks', async () => {
		const fake = seed();
		const { id } = await addNoDevice(fake.asFirestore(), TEACHER, {
			mainId: MAIN,
			n: 2,
			name: 'Noa',
		});
		expect(id.startsWith('nd_')).toBe(true);
	});
});

describe('a re-split keeps the students without a device', () => {
	it('carries them to the same table number', async () => {
		const fake = seed();
		await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN, replace: true }, () => 0);
		const first = fake.read(`${CLASS_TABLES_COLLECTION}/${MAIN}--1`) as unknown as ClassTable;
		expect(first.noDeviceMembers.map((m) => m.id)).toContain(ND);
		const ids = fake
			.list(CLASS_TABLES_COLLECTION)
			.filter((t) => t.mainId === MAIN)
			.flatMap((t) => (t as unknown as ClassTable).noDeviceMembers.map((m) => m.id));
		expect(ids.sort()).toEqual([ND, ND2].sort());
		expect(
			(fake.read(`statements/${MAIN}`)?.statementSettings as Record<string, unknown>).noDeviceCount,
		).toBe(2);
	});

	it('moves those of a table that went away, and loses nobody', () => {
		const placed = carryNoDeviceMembers(
			[
				{ n: 1, noDeviceMembers: [{ id: 'a', name: 'A' }] },
				{ n: 2, noDeviceMembers: [{ id: 'b', name: 'B' }] },
				{ n: 3, noDeviceMembers: [{ id: 'c', name: 'C' }] },
			],
			[1, 2],
		);
		expect(placed.get(1)?.map((m) => m.id)).toEqual(['a', 'c']);
		expect(placed.get(2)?.map((m) => m.id)).toEqual(['b']);
	});

	it('goes over the cap rather than dropping a student', () => {
		const many = (prefix: string): { id: string; name: string }[] =>
			Array.from({ length: MAX_NO_DEVICE_PER_TABLE }, (_, i) => ({
				id: `${prefix}${i}`,
				name: `${prefix}${i}`,
			}));
		const placed = carryNoDeviceMembers(
			[
				{ n: 1, noDeviceMembers: many('x') },
				{ n: 2, noDeviceMembers: many('y') },
			],
			[1],
		);
		expect(placed.get(1)).toHaveLength(MAX_NO_DEVICE_PER_TABLE * 2);
	});

	it('keeps one table when only students without a device are left', async () => {
		const fake = seed();
		fake.docs.delete(`statementsSubscribe/${STUDENT}--${MAIN}`);
		fake.docs.delete(`statementsSubscribe/${OTHER_TEACHER}--${MAIN}`);
		await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN, replace: true }, () => 0);
		const left = fake
			.list(CLASS_TABLES_COLLECTION)
			.filter((t) => t.mainId === MAIN) as unknown as ClassTable[];
		expect(left).toHaveLength(1);
		expect(left[0].noDeviceMembers.map((m) => m.id).sort()).toEqual([ND, ND2].sort());
	});
});
