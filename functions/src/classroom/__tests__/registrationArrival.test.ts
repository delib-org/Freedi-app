import { seatLink } from '../../tableAssignment/fn_tablesSeatLink';
import { cancelRegistration } from '../../tableAssignment/fn_tablesCancelRegistration';
import { ClassroomError } from '../classroomErrors';
import { addNoDevice } from '../fn_classAddNoDevice';
import { arriveByName } from '../registration/fn_classArriveByName';
import { copySeating } from '../registration/fn_classCopySeating';
import { disconnectRegistration } from '../registration/fn_classRegistrationConnection';
import { registrationSupport } from '../registration/fn_classRegistrationSupport';
import { seatByCode } from '../registration/fn_classSeatByCode';
import { FakeFirestore } from './fakeFirestore';
import {
	MAIN,
	NOW,
	REGISTRANTS,
	SID,
	TEACHER,
	connectedRoom,
	ledgerOf,
	lessonOf,
	seedLesson,
	seedRegistration,
	subOf,
	tableAt,
	TABLES_STEP,
} from './registrationFixture';

/** Arriving by personal link or full name; walk-ins; no phone; support by side (IA 5.1, 5.2, 5.4, 2.5). */

async function expectRefusal(
	promise: Promise<unknown>,
	code: string,
	reason?: string,
): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject(reason ? { code, reason } : { code });
}

/** A connected room whose seating is copied already. */
async function copiedRoom(): Promise<FakeFirestore> {
	const fake = connectedRoom();
	await copySeating(fake.asFirestore(), TEACHER, { mainId: MAIN }, NOW);

	return fake;
}

async function codeOf(fake: FakeFirestore, registrationUid: string): Promise<string> {
	return (await seatLink(fake.asFirestore(), registrationUid, { sessionId: SID })).seatCode;
}

const arrivedCount = (fake: FakeFirestore): number | undefined =>
	lessonOf(fake).statementSettings?.classRegistration?.arrivedCount;

describe('classSeatByCode (the personal link)', () => {
	it('seats the device at the registration table under the registered name', async () => {
		const fake = await copiedRoom();
		const code = await codeOf(fake, 'r1');
		const result = await seatByCode(fake.asFirestore(), 'phone-1', { seatCode: code }, NOW);

		expect(result).toEqual({
			mainId: MAIN,
			fullName: 'Dana Levi',
			tableN: 1,
			topic: 'Water',
			movedFromAnotherDevice: false,
		});
		expect(tableAt(fake, 1).memberUids).toEqual(['phone-1']);
		expect(tableAt(fake, 1).reservedSeats?.map((s) => s.name)).toEqual(['Avi Cohen', 'Noa Bar']);
		expect(subOf(fake, 'phone-1')).toMatchObject({
			role: 'member',
			tableId: `${MAIN}--1`,
			user: { displayName: 'Dana Levi' },
		});
		expect(arrivedCount(fake)).toBe(1);
	});

	it('is reusable: the same device again keeps its seat and counts once', async () => {
		const fake = await copiedRoom();
		const code = await codeOf(fake, 'r1');
		await seatByCode(fake.asFirestore(), 'phone-1', { seatCode: code }, NOW);
		await seatByCode(fake.asFirestore(), 'phone-1', { seatCode: code }, NOW + 1);

		expect(tableAt(fake, 1).memberUids).toEqual(['phone-1']);
		expect(arrivedCount(fake)).toBe(1);
	});

	it('moves the seat to the latest device, and the first one is told', async () => {
		const fake = await copiedRoom();
		const code = await codeOf(fake, 'r1');
		await seatByCode(fake.asFirestore(), 'phone-1', { seatCode: code }, NOW);
		const second = await seatByCode(fake.asFirestore(), 'laptop', { seatCode: code }, NOW + 1);

		expect(second.movedFromAnotherDevice).toBe(true);
		expect(tableAt(fake, 1).memberUids).toEqual(['laptop']);
		expect(subOf(fake, 'phone-1').tableId).toBeUndefined();
		expect(subOf(fake, 'phone-1').seatMovedAt).toBe(NOW + 1);
		expect(ledgerOf(fake, 'r1').classUid).toBe('laptop');
		expect(arrivedCount(fake)).toBe(1);
	});

	it('before the tables are copied, records the arrival only; copying then seats it', async () => {
		const fake = connectedRoom();
		const code = await codeOf(fake, 'r4');
		const early = await seatByCode(fake.asFirestore(), 'phone-4', { seatCode: code }, NOW);

		expect(early.tableN).toBeNull();
		expect(fake.list('classTables')).toEqual([]);
		await copySeating(fake.asFirestore(), TEACHER, { mainId: MAIN }, NOW);
		expect(tableAt(fake, 2).memberUids).toEqual(['phone-4']);
	});

	it('gives a stranger with the link that seat only: no answers in the reply or on the tables', async () => {
		const fake = await copiedRoom();
		const result = await seatByCode(
			fake.asFirestore(),
			'stranger',
			{ seatCode: await codeOf(fake, 'r1') },
			NOW,
		);

		expect(Object.keys(result).sort()).toEqual([
			'fullName',
			'mainId',
			'movedFromAnotherDevice',
			'tableN',
			'topic',
		]);
		expect(JSON.stringify(fake.list('classTables'))).not.toMatch(/position|preferences|seatCode/);
	});

	it('answers one "no longer active" for every dead link', async () => {
		const fake = await copiedRoom();
		const db = fake.asFirestore();
		const inactive = (seatCode: unknown) =>
			expectRefusal(
				seatByCode(db, 'x', { seatCode } as { seatCode: string }),
				'not-found',
				'seat-link-inactive',
			);

		await inactive('not a code');
		await inactive('A'.repeat(43));
		await inactive(undefined);

		const late = connectedRoom();
		const lateCode = await codeOf(late, 'r5');
		late.seed(`tableAssignments/${SID}`, {
			...late.read(`tableAssignments/${SID}`),
			status: 'registrationOpen',
		});
		await cancelRegistration(late.asFirestore(), 'r5', { sessionId: SID });
		await expectRefusal(
			seatByCode(late.asFirestore(), 'x', { seatCode: lateCode }),
			'not-found',
			'seat-link-inactive',
		);

		const ended = connectedRoom();
		const endedCode = await codeOf(ended, 'r1');
		ended.seed(`tableAssignments/${SID}`, {
			...ended.read(`tableAssignments/${SID}`),
			status: 'ended',
		});
		await expectRefusal(
			seatByCode(ended.asFirestore(), 'x', { seatCode: endedCode }),
			'not-found',
			'seat-link-inactive',
		);

		const removed = connectedRoom(0);
		const removedCode = await codeOf(removed, 'r1');
		await disconnectRegistration(removed.asFirestore(), TEACHER, { mainId: MAIN });
		await expectRefusal(
			seatByCode(removed.asFirestore(), 'x', { seatCode: removedCode }),
			'not-found',
			'seat-link-inactive',
		);

		const lessonEnded = connectedRoom();
		const lessonCode = await codeOf(lessonEnded, 'r1');
		const lesson = lessonEnded.read(`statements/${MAIN}`) as {
			statementSettings: { lessonPlan: object };
		};
		lessonEnded.seed(`statements/${MAIN}`, {
			...lesson,
			statementSettings: {
				...lesson.statementSettings,
				lessonPlan: { ...lesson.statementSettings.lessonPlan, status: 'ended' },
			},
		});
		await expectRefusal(
			seatByCode(lessonEnded.asFirestore(), 'x', { seatCode: lessonCode }),
			'not-found',
			'seat-link-inactive',
		);
	});
});

describe('classArriveByName (full name as the fallback)', () => {
	it('seats one match nobody holds at once, whatever the spacing and case', async () => {
		const fake = await copiedRoom();
		const result = await arriveByName(
			fake.asFirestore(),
			'phone',
			{ mainId: MAIN, fullName: '  dana   LEVI ' },
			NOW,
		);

		expect(result).toMatchObject({ outcome: 'seated', fullName: 'Dana Levi', tableN: 1 });
		expect(tableAt(fake, 1).memberUids).toEqual(['phone']);
	});

	it('matches no near spelling (no fuzzy matching)', async () => {
		const fake = await copiedRoom();
		expect(
			await arriveByName(fake.asFirestore(), 'phone', { mainId: MAIN, fullName: 'Dana Lev' }),
		).toEqual({
			outcome: 'notFound',
		});
		expect(subOf(fake, 'phone')).toBeUndefined();
	});

	it('asks "is it you?" when another device holds the name: yes moves it, no joins as a walk-in', async () => {
		const fake = await copiedRoom();
		const db = fake.asFirestore();
		await arriveByName(db, 'phone', { mainId: MAIN, fullName: 'Dana Levi' }, NOW);

		expect(await arriveByName(db, 'laptop', { mainId: MAIN, fullName: 'Dana Levi' })).toEqual({
			outcome: 'nameTaken',
		});
		const no = await arriveByName(
			db,
			'other',
			{ mainId: MAIN, fullName: 'Dana Levi', answer: { kind: 'someoneElse' } },
			NOW,
		);
		expect(no).toMatchObject({ outcome: 'joined', fullName: 'Dana Levi', tableN: 2 });
		expect(tableAt(fake, 1).memberUids).toEqual(['phone']);

		const yes = await arriveByName(
			db,
			'laptop',
			{ mainId: MAIN, fullName: 'Dana Levi', answer: { kind: 'itsMe' } },
			NOW + 1,
		);
		expect(yes).toMatchObject({ outcome: 'seated', tableN: 1, movedFromAnotherDevice: true });
		expect(tableAt(fake, 1).memberUids).toEqual(['laptop']);
		expect(subOf(fake, 'phone').seatMovedAt).toBe(NOW + 1);
	});

	it('lets two people of one name choose by table and topic, nothing else', async () => {
		const fake = connectedRoom();
		seedRegistration(fake, { contextStatementId: MAIN }, [
			...REGISTRANTS.slice(0, 4),
			{ uid: 'r5', fullName: 'dana levi' },
		]);
		await copySeating(fake.asFirestore(), TEACHER, { mainId: MAIN }, NOW);
		const asked = await arriveByName(fake.asFirestore(), 'phone', {
			mainId: MAIN,
			fullName: 'Dana Levi',
		});

		expect(asked).toEqual({
			outcome: 'nameTwice',
			choices: expect.arrayContaining([
				{ seatId: expect.any(String), tableN: 1, topic: 'Water' },
				{ seatId: expect.any(String), tableN: 2, topic: 'Roads' },
			]),
		});
		const choices = (asked as { choices: { seatId: string; tableN: number }[] }).choices;
		const roads = choices.find((c) => c.tableN === 2) as { seatId: string };
		const picked = await arriveByName(
			fake.asFirestore(),
			'phone',
			{
				mainId: MAIN,
				fullName: 'Dana Levi',
				answer: { kind: 'pick', seatId: roads.seatId },
			},
			NOW,
		);
		expect(picked).toMatchObject({ outcome: 'seated', tableN: 2, fullName: 'dana levi' });
	});

	it('lets two people of one name in before the tables, to ask once they arrive', async () => {
		const fake = connectedRoom();
		seedRegistration(fake, { contextStatementId: MAIN }, [
			...REGISTRANTS,
			{ uid: 'r6', fullName: 'Dana Levi' },
		]);

		expect(
			await arriveByName(fake.asFirestore(), 'phone', { mainId: MAIN, fullName: 'Dana Levi' }),
		).toEqual({
			outcome: 'nameTwiceLater',
		});
		expect(subOf(fake, 'phone')).toMatchObject({
			role: 'member',
			user: { displayName: 'Dana Levi' },
		});
	});

	it('joins without registration only when asked, at the emptiest table with a free seat', async () => {
		const fake = await copiedRoom();
		const db = fake.asFirestore();
		expect(await arriveByName(db, 'new', { mainId: MAIN, fullName: 'Guest Person' })).toEqual({
			outcome: 'notFound',
		});
		const joined = await arriveByName(
			db,
			'new',
			{
				mainId: MAIN,
				fullName: 'Guest Person',
				answer: { kind: 'joinWithout' },
			},
			NOW,
		);

		// Table 1 holds three reserved seats, table 2 two: the walk-in goes to 2.
		expect(joined).toMatchObject({ outcome: 'joined', tableN: 2, fullName: 'Guest Person' });
		expect(tableAt(fake, 2).memberUids).toEqual(['new']);
	});

	it('leaves a walk-in without a table when no seat is free', async () => {
		const fake = await copiedRoom();
		const db = fake.asFirestore();
		for (const uid of ['g1', 'g2', 'g3']) {
			await arriveByName(
				db,
				uid,
				{ mainId: MAIN, fullName: `Guest ${uid}`, answer: { kind: 'joinWithout' } },
				NOW,
			);
		}
		const last = await arriveByName(
			db,
			'g4',
			{ mainId: MAIN, fullName: 'Guest g4', answer: { kind: 'joinWithout' } },
			NOW,
		);

		expect(last).toMatchObject({ outcome: 'joined', tableN: null });
		expect(subOf(fake, 'g4').tableId).toBeUndefined();
	});

	it('refuses a lesson without a registration', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, TABLES_STEP);
		await expectRefusal(
			arriveByName(fake.asFirestore(), 'p', { mainId: MAIN, fullName: 'Dana Levi' }),
			'failed-precondition',
			'not-connected',
		);
	});
});

describe('a registered person here without a phone', () => {
	it('takes their reserved seat under the registered name and counts as arrived', async () => {
		const fake = await copiedRoom();
		const seat = tableAt(fake, 2).reservedSeats?.find((s) => s.name === 'Yael Shir');
		const { id } = await addNoDevice(fake.asFirestore(), TEACHER, {
			mainId: MAIN,
			n: 2,
			seatId: seat?.seatId,
		});

		expect(tableAt(fake, 2).noDeviceMembers).toEqual([{ id, name: 'Yael Shir' }]);
		expect(tableAt(fake, 2).reservedSeats?.map((s) => s.name)).toEqual(['Omer Tal']);
		expect(ledgerOf(fake, 'r4').noDeviceId).toBe(id);
		expect(arrivedCount(fake)).toBe(1);
		expect(lessonOf(fake).statementSettings?.noDeviceCount).toBe(1);
		await expectRefusal(
			addNoDevice(fake.asFirestore(), TEACHER, { mainId: MAIN, n: 2, seatId: seat?.seatId }),
			'failed-precondition',
			'seat-taken',
		);
	});
});

describe('classRegistrationSupport (support by side from the registration, IA 2.5)', () => {
	it('gives the teacher totals per camp under the registration poles, never a position', async () => {
		const fake = await copiedRoom();
		const db = fake.asFirestore();
		for (const [uid, name, support] of [
			['p1', 'Dana Levi', 1],
			['p2', 'Avi Cohen', -1],
			['p3', 'Noa Bar', 0.5],
		] as const) {
			await arriveByName(db, uid, { mainId: MAIN, fullName: name }, NOW);
			fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
				...subOf(fake, uid),
				decisionSupport: support,
			});
		}
		const result = await registrationSupport(db, TEACHER, { mainId: MAIN });

		expect(result.poleA).toBe('Keep');
		expect(result.poleB).toBe('Change');
		expect(result.support.a).toEqual({ mean: 1, n: 1, m: 1 });
		expect(result.support.b).toEqual({ mean: -1, n: 1, m: 1 });
		expect(result.support.center).toEqual({ mean: 0.5, n: 1, m: 1 });
		expect(JSON.stringify(result)).not.toMatch(/position|p1|r1/);
		// Nothing about the position was written onto a member.
		expect(subOf(fake, 'p1').camp).toBeUndefined();
		expect(subOf(fake, 'p1').side).toBeUndefined();
	});

	it('refuses a student until support by side is shown to everyone', async () => {
		const fake = await copiedRoom();
		await arriveByName(fake.asFirestore(), 'kid', { mainId: MAIN, fullName: 'Dana Levi' }, NOW);
		await expectRefusal(
			registrationSupport(fake.asFirestore(), 'kid', { mainId: MAIN }),
			'permission-denied',
		);

		fake.seed('statements/ch', {
			...fake.read('statements/ch'),
			statementSettings: {
				classRole: 'challenge',
				voteDisplay: { liveResults: true, supportShown: true },
			},
		});
		await expect(
			registrationSupport(fake.asFirestore(), 'kid', { mainId: MAIN }),
		).resolves.toMatchObject({
			poleA: 'Keep',
		});
	});
});
