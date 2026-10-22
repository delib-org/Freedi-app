import type { ClassTable } from '@freedi/shared-types';
import { assignTables } from '../fn_classAssignTables';
import { moveStudent } from '../fn_classMoveStudent';
import { addNoDevice, cleanNoDeviceName } from '../fn_classAddNoDevice';
import { parseAction, tableStep } from '../fn_classTableStep';
import { allTablesTo } from '../fn_classAllTablesTo';
import { closeBallot, freezeBallot } from '../fn_classBallot';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const NOW = 1_800_000_000_000;

function fixedRng(): () => number {
	let i = 0;

	return () => ((i++ * 7) % 10) / 10;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

function seedLesson(fake: FakeFirestore, students = 12): string[] {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	const uids: string[] = [];
	for (let i = 0; i < students; i++) {
		const uid = `s${String(i).padStart(2, '0')}`;
		uids.push(uid);
		const side = i % 3 === 0 ? 10 : i % 3 === 1 ? 50 : 90;
		fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
			userId: uid,
			statementId: MAIN,
			role: 'member',
			side,
			camp: side < 40 ? 'a' : side > 60 ? 'b' : 'center',
			createdAt: 1000 + i,
		});
	}
	fake.seed(`statements/q1`, {
		statementId: 'q1',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: { classRole: 'guiding' },
	});
	fake.seed(`statements/ch`, {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		statementSettings: { classRole: 'challenge' },
	});
	fake.seed(`statements/other`, {
		statementId: 'other',
		parentId: 'elsewhere',
		statementType: 'question',
	});

	return uids;
}

describe('classAssignTables', () => {
	it('refuses a non-admin', async () => {
		const fake = new FakeFirestore();
		const [student] = seedLesson(fake);
		await expectCode(
			assignTables(fake.asFirestore(), student, { mainId: MAIN }),
			'permission-denied',
		);
	});

	it('seats every member, writes tables and tableIds, and skips the teacher', async () => {
		const fake = new FakeFirestore();
		const uids = seedLesson(fake, 12);
		const res = await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN }, fixedRng());
		expect(res).toEqual({ tables: 3, placed: 12 });
		const tables = fake.list('classTables') as unknown as ClassTable[];
		expect(tables.map((t) => t.n).sort()).toEqual([1, 2, 3]);
		expect(tables.flatMap((t) => t.memberUids).sort()).toEqual(uids);
		for (const t of tables) {
			expect(t).toMatchObject({ step: 'pick', turn: 1, writingLocked: false, mainId: MAIN });
			for (const uid of t.memberUids) {
				expect(fake.read(`statementsSubscribe/${uid}--${MAIN}`)?.tableId).toBe(t.tableId);
			}
		}
		expect(fake.read(`statementsSubscribe/${TEACHER}--${MAIN}`)?.tableId).toBeUndefined();
	});

	it('needs replace: true to re-run and then replaces cleanly', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 12);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN, tableSize: 3 }, fixedRng());
		expect(fake.list('classTables')).toHaveLength(4);
		await expectCode(assignTables(db, TEACHER, { mainId: MAIN }), 'already-exists');

		// one student leaves (role changes) before the re-seat
		fake.seed(`statementsSubscribe/s00--${MAIN}`, {
			...fake.read(`statementsSubscribe/s00--${MAIN}`),
			role: 'banned',
		});
		const res = await assignTables(
			db,
			TEACHER,
			{ mainId: MAIN, tableSize: 5, replace: true },
			fixedRng(),
		);
		expect(res).toEqual({ tables: 3, placed: 11 }); // 11 at size 5: 2 tables would need a 6
		expect(fake.list('classTables')).toHaveLength(3);
		expect(fake.read(`statementsSubscribe/s00--${MAIN}`)?.tableId).toBeUndefined();
	});

	it('rejects a bad table size', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		await expectCode(
			assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN, tableSize: 7 as 3 }),
			'invalid-argument',
		);
	});
});

describe('classMoveStudent + classAddNoDevice', () => {
	it('moves a student, keeps both tables and the subscription consistent, fixes the asker', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 12);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		const t1 = fake.read(`classTables/${MAIN}--1`) as unknown as ClassTable;
		const asker = t1.askerUid as string;

		await moveStudent(db, TEACHER, { mainId: MAIN, uid: asker, toTable: 2 });
		const from = fake.read(`classTables/${MAIN}--1`) as unknown as ClassTable;
		const to = fake.read(`classTables/${MAIN}--2`) as unknown as ClassTable;
		expect(from.memberUids).not.toContain(asker);
		expect(from.askerUid).not.toBe(asker);
		expect(from.memberUids).toContain(from.askerUid);
		expect(to.memberUids).toContain(asker);
		expect(fake.read(`statementsSubscribe/${asker}--${MAIN}`)?.tableId).toBe(`${MAIN}--2`);

		await moveStudent(db, TEACHER, { mainId: MAIN, uid: asker, toTable: null });
		expect((fake.read(`classTables/${MAIN}--2`) as unknown as ClassTable).memberUids).not.toContain(
			asker,
		);
		expect(fake.read(`statementsSubscribe/${asker}--${MAIN}`)?.tableId).toBeUndefined();
	});

	it('refuses a missing table, a stranger and a non-admin', async () => {
		const fake = new FakeFirestore();
		const uids = seedLesson(fake, 6);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		await expectCode(
			moveStudent(db, TEACHER, { mainId: MAIN, uid: uids[0], toTable: 9 }),
			'not-found',
		);
		await expectCode(
			moveStudent(db, TEACHER, { mainId: MAIN, uid: 'nobody', toTable: 1 }),
			'not-found',
		);
		await expectCode(
			moveStudent(db, uids[1], { mainId: MAIN, uid: uids[0], toTable: 1 }),
			'permission-denied',
		);
		await expectCode(
			moveStudent(db, TEACHER, { mainId: MAIN, uid: uids[0], toTable: 0 }),
			'invalid-argument',
		);
	});

	it('adds a no-device member with a clean name', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 6);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		const { id } = await addNoDevice(db, TEACHER, { mainId: MAIN, n: 1, name: '  Yoni   Cohen ' });
		expect(id).toMatch(/^nd_/);
		expect((fake.read(`classTables/${MAIN}--1`) as unknown as ClassTable).noDeviceMembers).toEqual([
			{ id, name: 'Yoni Cohen' },
		]);
		await expectCode(addNoDevice(db, TEACHER, { mainId: MAIN, n: 9, name: 'x' }), 'not-found');
		expect(() => cleanNoDeviceName('   ')).toThrow(ClassroomError);
		expect(() => cleanNoDeviceName('x'.repeat(61))).toThrow(ClassroomError);
	});
});

describe('classTableStep + classAllTablesTo', () => {
	async function seated(): Promise<{ fake: FakeFirestore; table: ClassTable }> {
		const fake = new FakeFirestore();
		seedLesson(fake, 6);
		await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN }, fixedRng());

		return { fake, table: fake.read(`classTables/${MAIN}--1`) as unknown as ClassTable };
	}

	it('runs a turn for the asker and refuses a tablemate', async () => {
		const { fake, table } = await seated();
		const db = fake.asFirestore();
		const asker = table.askerUid as string;
		const mate = table.memberUids.find((u) => u !== asker) as string;
		const clock = () => NOW;

		expect(
			await tableStep(
				db,
				asker,
				{ tableId: table.tableId, action: 'pickQuestion', questionId: 'q1' },
				clock,
			),
		).toEqual({ step: 'pick', turn: 1 });
		await expectCode(
			tableStep(db, mate, { tableId: table.tableId, action: 'toTalk' }, clock),
			'permission-denied',
		);
		await tableStep(db, asker, { tableId: table.tableId, action: 'toTalk' }, clock);
		await tableStep(db, asker, { tableId: table.tableId, action: 'nextSpeaker', uid: mate }, clock);
		expect(fake.read(`classTables/${table.tableId}`)).toMatchObject({
			speakerUid: mate,
			speakerEndsAt: NOW + 60_000,
		});
		await tableStep(db, asker, { tableId: table.tableId, action: 'toWrite' }, clock);
		expect(fake.read(`classTables/${table.tableId}`)?.speakerUid).toBeUndefined();
		await tableStep(db, asker, { tableId: table.tableId, action: 'toRate' }, clock);
		await expectCode(
			tableStep(db, asker, { tableId: table.tableId, action: 'nextTurn' }, clock),
			'permission-denied',
		);
		expect(
			await tableStep(db, mate, { tableId: table.tableId, action: 'nextTurn' }, clock),
		).toEqual({ step: 'pick', turn: 2 });
		expect(fake.read(`classTables/${table.tableId}`)).toMatchObject({
			askerUid: mate,
			askedUids: [asker],
		});
		// the loser of a race sees the step moved, with the reason the client reads
		const other = table.memberUids.find((u) => u !== asker && u !== mate) as string;
		const lost = await tableStep(
			db,
			other,
			{ tableId: table.tableId, action: 'nextTurn' },
			clock,
		).catch((e: unknown) => e);
		expect(toHttpsError(lost, { operation: 'test' }).details).toEqual({ reason: 'turn-claimed' });
	});

	it("only accepts this lesson's non-challenge questions", async () => {
		const { fake, table } = await seated();
		const db = fake.asFirestore();
		const asker = table.askerUid as string;
		await expectCode(
			tableStep(db, asker, { tableId: table.tableId, action: 'pickQuestion', questionId: 'other' }),
			'invalid-argument',
		);
		await expectCode(
			tableStep(db, asker, { tableId: table.tableId, action: 'pickQuestion', questionId: 'ch' }),
			'invalid-argument',
		);
		await expectCode(
			tableStep(db, asker, {
				tableId: table.tableId,
				action: 'pickQuestion',
				questionId: 'missing',
			}),
			'invalid-argument',
		);
	});

	it('lets the teacher move one table and all tables', async () => {
		const { fake, table } = await seated();
		const db = fake.asFirestore();
		expect((await tableStep(db, TEACHER, { tableId: table.tableId, action: 'toRate' })).step).toBe(
			'rate',
		);
		expect(await allTablesTo(db, TEACHER, { mainId: MAIN, step: 'talk' })).toEqual({ updated: 2 });
		for (const t of fake.list('classTables'))
			expect(t).toMatchObject({ step: 'talk', spokenUids: [] });
		await expectCode(
			allTablesTo(db, TEACHER, { mainId: MAIN, step: 'dance' as 'talk' }),
			'invalid-argument',
		);
		await expectCode(
			allTablesTo(db, table.memberUids[0], { mainId: MAIN, step: 'rate' }),
			'permission-denied',
		);
	});

	it('parseAction drops unknown keys and rejects unknown actions', () => {
		expect(parseAction({ tableId: 't', action: 'toTalk', extra: 1 } as never)).toEqual({
			action: 'toTalk',
		});
		expect(() => parseAction({ tableId: 't', action: 'explode' } as never)).toThrow(ClassroomError);
		expect(() =>
			parseAction({ tableId: 't', action: 'setWritingMode', mode: 'all' } as never),
		).toThrow(ClassroomError);
		expect(() =>
			parseAction({ tableId: 't', action: 'pickQuestion', questionId: 'a/b' } as never),
		).toThrow(ClassroomError);
	});
});

describe('classFreezeBallot + classCloseBallot', () => {
	function seedProposals(fake: FakeFirestore): void {
		const proposals: [string, number][] = [
			['p1', 0.72],
			['p2', 0.64],
			['p3', 0.48],
			['p4', 0.31],
		];
		for (const [id, consensus] of proposals) {
			fake.seed(`statements/${id}`, {
				statementId: id,
				parentId: 'ch',
				statementType: 'option',
				consensus,
			});
		}
	}

	it('freezes the gated shortlist, closes with the top-voted decision, and closes once', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 3);
		seedProposals(fake);
		const db = fake.asFirestore();

		await expectCode(closeBallot(db, TEACHER, { mainId: MAIN }), 'failed-precondition');
		const frozen = await freezeBallot(db, TEACHER, { mainId: MAIN });
		expect(frozen.candidateIds).toEqual(['p1', 'p2']);
		expect(fake.read('statements/ch')).toMatchObject({
			statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['p1', 'p2'] } },
		});

		fake.seed('statements/ch', {
			...fake.read('statements/ch'),
			selections: { p1: 1, p2: 3, none: 2, p3: 9 },
		});
		const closed = await closeBallot(db, TEACHER, { mainId: MAIN });
		expect(closed.decisionId).toBe('p2');
		expect(fake.read('statements/ch')).toMatchObject({
			statementSettings: { ballot: { decisionId: 'p2', closedAt: closed.closedAt } },
		});

		expect(await closeBallot(db, TEACHER, { mainId: MAIN })).toEqual(closed);
		await expectCode(freezeBallot(db, TEACHER, { mainId: MAIN }), 'failed-precondition');
	});

	it('uses the top N when fewer than two pass, and the lesson threshold', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 3);
		seedProposals(fake);
		fake.seed('statements/ch', {
			...fake.read('statements/ch'),
			votingSettings: { threshold: 0.7 },
		});
		const res = await freezeBallot(fake.asFirestore(), TEACHER, { mainId: MAIN, topN: 2 });
		expect(res.candidateIds).toEqual(['p1', 'p2']);
	});

	it('refuses students, lessons without a challenge and empty ballots', async () => {
		const fake = new FakeFirestore();
		const [student] = seedLesson(fake, 3);
		const db = fake.asFirestore();
		await expectCode(freezeBallot(db, student, { mainId: MAIN }), 'permission-denied');
		await expectCode(freezeBallot(db, TEACHER, { mainId: MAIN }), 'failed-precondition'); // no proposals
		fake.docs.delete('statements/ch');
		await expectCode(freezeBallot(db, TEACHER, { mainId: MAIN }), 'failed-precondition');
	});
});
