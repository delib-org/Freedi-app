import type { TableAssignment, TableAssignmentRun } from '@freedi/shared-types';
import { assignTables } from '../fn_classAssignTables';
import { ClassroomError } from '../classroomErrors';
import { copySeating } from '../registration/fn_classCopySeating';
import { closeRegistration } from '../registration/fn_classCloseRegistration';
import {
	connectRegistration,
	disconnectRegistration,
} from '../registration/fn_classRegistrationConnection';
import { arriveByName } from '../registration/fn_classArriveByName';
import { FakeFirestore } from './fakeFirestore';
import {
	MAIN,
	NOW,
	SID,
	STEPS,
	TABLES_STEP,
	TEACHER,
	connectedRoom,
	ledgerOf,
	lessonOf,
	seedLesson,
	seedMember,
	seedRegistration,
	subOf,
	tableAt,
} from './registrationFixture';

/** Connecting, copying and closing (IA tables-class-bridge 5.3, 2.2, 2.5, section 9). */

async function expectRefusal(
	promise: Promise<unknown>,
	code: string,
	reason?: string,
): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject(reason ? { code, reason } : { code });
}

const sessionOf = (fake: FakeFirestore): TableAssignment =>
	fake.read(`tableAssignments/${SID}`) as unknown as TableAssignment;

describe('classConnectRegistration', () => {
	function fresh(sessionOverrides: Record<string, unknown> = {}): FakeFirestore {
		const fake = new FakeFirestore();
		seedLesson(fake);
		seedRegistration(fake, { status: 'registrationOpen', ...sessionOverrides });

		return fake;
	}

	it('connects both ways and takes out the side step when the registration asks a position', async () => {
		const fake = fresh();
		const result = await connectRegistration(
			fake.asFirestore(),
			TEACHER,
			{
				mainId: MAIN,
				tableAssignmentId: SID,
			},
			NOW,
		);

		expect(result).toEqual({ connected: true, sideStepRemoved: true });
		expect(sessionOf(fake).contextStatementId).toBe(MAIN);
		expect(lessonOf(fake).statementSettings?.classRegistration).toEqual({
			tableAssignmentId: SID,
			connectedAt: NOW,
			sideStepRemoved: true,
		});
		expect(lessonOf(fake).statementSettings?.lessonPlan?.steps).not.toContain('side');
	});

	it('keeps the side step when the registration asks no position', async () => {
		const fake = fresh({ settings: { tableSize: 4, balanceTolerance: 0.3 } });
		const result = await connectRegistration(fake.asFirestore(), TEACHER, {
			mainId: MAIN,
			tableAssignmentId: SID,
		});

		expect(result.sideStepRemoved).toBe(false);
		expect(lessonOf(fake).statementSettings?.lessonPlan?.steps).toEqual([...STEPS]);
	});

	it('is the registration host only, even for the lesson teacher', async () => {
		const fake = fresh({ hostUid: 'someone-else' });
		await expectRefusal(
			connectRegistration(fake.asFirestore(), TEACHER, { mainId: MAIN, tableAssignmentId: SID }),
			'permission-denied',
			'not-registration-host',
		);
	});

	it('refuses a student of the lesson', async () => {
		const fake = fresh();
		seedMember(fake, 'kid');
		await expectRefusal(
			connectRegistration(fake.asFirestore(), 'kid', { mainId: MAIN, tableAssignmentId: SID }),
			'permission-denied',
		);
	});

	it('keeps one registration to one lesson, and refuses an ended one', async () => {
		await expectRefusal(
			connectRegistration(fresh({ contextStatementId: 'other-lesson' }).asFirestore(), TEACHER, {
				mainId: MAIN,
				tableAssignmentId: SID,
			}),
			'failed-precondition',
			'connected-elsewhere',
		);
		await expectRefusal(
			connectRegistration(fresh({ status: 'ended' }).asFirestore(), TEACHER, {
				mainId: MAIN,
				tableAssignmentId: SID,
			}),
			'failed-precondition',
			'registration-ended',
		);
	});

	it('answers the same again without changing anything', async () => {
		const fake = fresh();
		const db = fake.asFirestore();
		await connectRegistration(db, TEACHER, { mainId: MAIN, tableAssignmentId: SID }, NOW);
		const again = await connectRegistration(
			db,
			TEACHER,
			{ mainId: MAIN, tableAssignmentId: SID },
			NOW + 1,
		);

		expect(again).toEqual({ connected: true, sideStepRemoved: true });
		expect(lessonOf(fake).statementSettings?.classRegistration?.connectedAt).toBe(NOW);
	});
});

describe('classDisconnectRegistration', () => {
	it('removes the connection, puts the side step back and forgets early arrivals', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		seedRegistration(fake, { status: 'registrationOpen' });
		const db = fake.asFirestore();
		await connectRegistration(db, TEACHER, { mainId: MAIN, tableAssignmentId: SID });
		await arriveByName(db, 'kid', { mainId: MAIN, fullName: 'Dana Levi' }, NOW);
		expect(ledgerOf(fake, 'r1')).toBeDefined();

		await disconnectRegistration(db, TEACHER, { mainId: MAIN });

		expect(lessonOf(fake).statementSettings?.classRegistration).toBeUndefined();
		expect(lessonOf(fake).statementSettings?.lessonPlan?.steps).toEqual([...STEPS]);
		expect(sessionOf(fake).contextStatementId).toBeUndefined();
		expect(ledgerOf(fake, 'r1')).toBeUndefined();
		expect(subOf(fake, 'kid').role).toBe('member');
	});

	it('is refused once the seating was copied', async () => {
		const fake = connectedRoom();
		await copySeating(fake.asFirestore(), TEACHER, { mainId: MAIN }, NOW);
		await expectRefusal(
			disconnectRegistration(fake.asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
			'seating-copied',
		);
	});
});

describe('classCopySeating', () => {
	it('happens at the Tables step only', async () => {
		await expectRefusal(
			copySeating(connectedRoom(0).asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
			'not-tables-step',
		);
	});

	it('needs published tables', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, TABLES_STEP, { tableAssignmentId: SID, connectedAt: NOW });
		seedRegistration(fake, {
			contextStatementId: MAIN,
			status: 'registrationClosed',
			publishedRunId: undefined,
		});
		await expectRefusal(
			copySeating(fake.asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
			'registration-not-published',
		);
	});

	it('brings the tables with their numbers and topics, arrivals as members, the rest reserved', async () => {
		const fake = connectedRoom();
		const db = fake.asFirestore();
		await arriveByName(db, 'dev-dana', { mainId: MAIN, fullName: 'Dana Levi' }, NOW);
		seedMember(fake, 'walk-in');

		const result = await copySeating(db, TEACHER, { mainId: MAIN }, NOW);

		expect(result).toEqual({
			tables: 2,
			arrived: 1,
			reserved: 4,
			walkInsSeated: 1,
			withoutTable: 0,
		});
		expect(tableAt(fake, 1)).toMatchObject({ topic: 'Water', memberUids: ['dev-dana'] });
		expect(tableAt(fake, 1).reservedSeats?.map((s) => s.name)).toEqual(['Avi Cohen', 'Noa Bar']);
		expect(tableAt(fake, 2)).toMatchObject({ topic: 'Roads', memberUids: ['walk-in'] });
		expect(subOf(fake, 'dev-dana').tableId).toBe(`${MAIN}--1`);
		expect(subOf(fake, 'walk-in').tableId).toBe(`${MAIN}--2`);
		expect(lessonOf(fake).statementSettings?.classRegistration).toMatchObject({
			seatingCopiedAt: NOW,
			seatsPerTable: 4,
		});
		// The registration's size is never written onto the lesson (older clients refuse above 8).
		expect(lessonOf(fake).statementSettings?.tableSize).toBeUndefined();
		// No position or choice reaches a table.
		expect(JSON.stringify(fake.list('classTables'))).not.toMatch(/position|preferences|r1|r2/);
	});

	it('copies again only with replace ("עדכון מההרשמה"), undoing moves by hand', async () => {
		const fake = connectedRoom();
		const db = fake.asFirestore();
		await arriveByName(db, 'dev-dana', { mainId: MAIN, fullName: 'Dana Levi' }, NOW);
		await copySeating(db, TEACHER, { mainId: MAIN }, NOW);
		await expectRefusal(
			copySeating(db, TEACHER, { mainId: MAIN }),
			'already-exists',
			'seating-copied',
		);

		fake.seed(`classTables/${MAIN}--2`, { ...tableAt(fake, 2), memberUids: ['dev-dana'] });
		fake.seed(`classTables/${MAIN}--1`, { ...tableAt(fake, 1), memberUids: [] });
		await copySeating(db, TEACHER, { mainId: MAIN, replace: true }, NOW + 1);

		expect(tableAt(fake, 1).memberUids).toEqual(['dev-dana']);
		expect(tableAt(fake, 2).memberUids).toEqual([]);
	});

	it('leaves dealing to lessons without a registration', async () => {
		await expectRefusal(
			assignTables(connectedRoom().asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
			'registration-connected',
		);
	});
});

describe('classCloseRegistration (closing from Class)', () => {
	function openSplitRoom(hostUid = TEACHER): FakeFirestore {
		const fake = new FakeFirestore();
		seedLesson(fake, 0, { tableAssignmentId: SID, connectedAt: NOW });
		seedRegistration(fake, {
			contextStatementId: MAIN,
			hostUid,
			mode: 'direct',
			splitByTopic: true,
			status: 'registrationOpen',
			publishedRunId: undefined,
		});
		for (const uid of ['r1', 'r2', 'r3', 'r4', 'r5']) {
			const path = `tableAssignmentParticipants/${SID}_${uid}`;
			fake.seed(path, { ...fake.read(path), preferences: ['t-water'] });
		}

		return fake;
	}

	it('runs the Tables path: a "sit where you like" registration closes and publishes', async () => {
		const fake = openSplitRoom();
		const result = await closeRegistration(fake.asFirestore(), TEACHER, { mainId: MAIN }, NOW);
		const session = sessionOf(fake);
		const run = fake.read(
			`tableAssignmentRuns/${session.publishedRunId}`,
		) as unknown as TableAssignmentRun;

		expect(result.status).toBe('published');
		expect(session.status).toBe('published');
		expect(run.tables.map((t) => t.memberUids.length)).toEqual([3, 2]);
	});

	it('is refused to a teacher who does not host the registration', async () => {
		await expectRefusal(
			closeRegistration(openSplitRoom('someone-else').asFirestore(), TEACHER, { mainId: MAIN }),
			'permission-denied',
		);
	});
});
