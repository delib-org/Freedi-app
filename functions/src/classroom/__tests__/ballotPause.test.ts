import type { ClassBallot } from '@freedi/shared-types';
import { closeBallot, freezeBallot, pauseBallot } from '../fn_classBallot';
import { decidePause } from '../ballotLogic';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STUDENT = 's1';
const NOW = 1_800_000_000_000;
const OPEN: ClassBallot = { candidateIds: ['p1', 'p2'], frozenAt: NOW - 10 };

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

function seed(fake: FakeFirestore, ballot?: ClassBallot): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed(`statementsSubscribe/${STUDENT}--${MAIN}`, {
		userId: STUDENT,
		statementId: MAIN,
		role: 'member',
	});
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		statementSettings: { classRole: 'challenge', ...(ballot ? { ballot } : {}) },
	});
	for (const [id, consensus] of [
		['p1', 0.8],
		['p2', 0.7],
	] as const) {
		fake.seed(`statements/${id}`, {
			statementId: id,
			parentId: 'ch',
			statementType: 'option',
			consensus,
		});
	}
}

function ballotOf(fake: FakeFirestore): ClassBallot | undefined {
	const doc = fake.read('statements/ch') as { statementSettings?: { ballot?: ClassBallot } };

	return doc.statementSettings?.ballot;
}

describe('decidePause', () => {
	it('refuses a ballot that is not open or already closed', () => {
		expect(decidePause(undefined, true, NOW)).toEqual({ kind: 'refuse', reason: 'not-open' });
		expect(decidePause({ ...OPEN, closedAt: NOW }, true, NOW)).toEqual({
			kind: 'refuse',
			reason: 'closed',
		});
		expect(decidePause({ ...OPEN, closedAt: NOW, pausedAt: NOW }, false, NOW)).toEqual({
			kind: 'refuse',
			reason: 'closed',
		});
	});

	it('pauses with the time and resumes by dropping it, keeping the rest', () => {
		expect(decidePause(OPEN, true, NOW)).toEqual({
			kind: 'write',
			ballot: { ...OPEN, pausedAt: NOW },
			pausedAt: NOW,
		});
		expect(decidePause({ ...OPEN, pausedAt: NOW }, false, NOW + 1)).toEqual({
			kind: 'write',
			ballot: OPEN,
			pausedAt: null,
		});
	});

	it('writes nothing when the ballot is already in the asked state', () => {
		expect(decidePause(OPEN, false, NOW)).toEqual({ kind: 'unchanged', pausedAt: null });
		expect(decidePause({ ...OPEN, pausedAt: NOW - 5 }, true, NOW)).toEqual({
			kind: 'unchanged',
			pausedAt: NOW - 5,
		});
	});
});

describe('pauseBallot (classPauseBallot)', () => {
	it('pauses and resumes an open ballot, keeping its candidates', async () => {
		const fake = new FakeFirestore();
		seed(fake, OPEN);
		const db = fake.asFirestore();

		const paused = await pauseBallot(db, TEACHER, { mainId: MAIN, paused: true });
		expect(typeof paused.pausedAt).toBe('number');
		expect(ballotOf(fake)).toEqual({ ...OPEN, pausedAt: paused.pausedAt });

		expect(await pauseBallot(db, TEACHER, { mainId: MAIN, paused: true })).toEqual(paused);

		const resumed = await pauseBallot(db, TEACHER, { mainId: MAIN, paused: false });
		expect(resumed).toEqual({ pausedAt: null });
		expect(ballotOf(fake)).toEqual(OPEN);
	});

	it('refuses students, bad input, an unopened ballot and a closed one', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		const db = fake.asFirestore();
		await expectCode(pauseBallot(db, STUDENT, { mainId: MAIN, paused: true }), 'permission-denied');
		await expectCode(
			pauseBallot(db, TEACHER, { mainId: MAIN } as unknown as { mainId: string; paused: boolean }),
			'invalid-argument',
		);
		await expectCode(
			pauseBallot(db, TEACHER, { mainId: MAIN, paused: true }),
			'failed-precondition',
		);

		seed(fake, { ...OPEN, closedAt: NOW });
		await expectCode(
			pauseBallot(db, TEACHER, { mainId: MAIN, paused: true }),
			'failed-precondition',
		);
	});

	it('keeps a paused vote paused across a re-freeze, and close stays final', async () => {
		const fake = new FakeFirestore();
		seed(fake);
		const db = fake.asFirestore();
		await freezeBallot(db, TEACHER, { mainId: MAIN });
		const { pausedAt } = await pauseBallot(db, TEACHER, { mainId: MAIN, paused: true });
		await freezeBallot(db, TEACHER, { mainId: MAIN });
		expect(ballotOf(fake)?.pausedAt).toBe(pausedAt);

		await closeBallot(db, TEACHER, { mainId: MAIN });
		await expectCode(
			pauseBallot(db, TEACHER, { mainId: MAIN, paused: false }),
			'failed-precondition',
		);
	});
});
