import type { TableAssignmentRun, TableAssignmentStatus } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { cancelRegistration } from '../fn_tablesCancelRegistration';
import { computePreview } from '../fn_tablesComputePreview';
import { register } from '../fn_tablesRegister';
import { savePreferences } from '../fn_tablesSavePreferences';
import { pinnedTablesOf } from '../publishedSeating';
import {
	HOST,
	NOW,
	SID,
	expectRefusal,
	participantPath,
	seedCounter,
	seedPublishedRun,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

/** A published assignment: u1, u2 and u3 sit at table 0; u4 registered afterwards. */
function publishedRoom(status: TableAssignmentStatus = 'published'): FakeFirestore {
	const fake = new FakeFirestore();

	seedSession(fake, { status, publishedRunId: 'run-pub' }, { tableSize: 4, balanceTolerance: 0.3 });
	seedTopics(fake, ['a', 'b']);
	['u1', 'u2', 'u3'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
	seedRegistration(fake, 'u4');
	seedCounter(fake, 4);
	seedPublishedRun(fake, 'run-pub', ['u1', 'u2', 'u3']);

	return fake;
}

describe('tablesSavePreferences after publishing', () => {
	it('lets a latecomer, whom the published run does not seat, save choices', async () => {
		const fake = publishedRoom();
		const result = await savePreferences(fake.asFirestore(), 'u4', {
			sessionId: SID,
			preferences: ['b', 'a'],
			position: 25,
		});

		expect(result.participant.preferences).toEqual(['b', 'a']);
		expect(fake.read(participantPath('u4'))).toMatchObject({
			preferences: ['b', 'a'],
			position: 25,
		});
	});

	it('refuses a person seated in the published run, and changes nothing', async () => {
		const fake = publishedRoom();
		const before = fake.read(participantPath('u1'));

		await expectRefusal(
			savePreferences(fake.asFirestore(), 'u1', { sessionId: SID, preferences: ['b'] }),
			'failed-precondition',
			'registration-closed',
		);
		expect(fake.read(participantPath('u1'))).toEqual(before);
	});

	it('refuses when the published run cannot be read, rather than treat anyone as a latecomer', async () => {
		const fake = publishedRoom();

		seedSession(fake, { status: 'published', publishedRunId: 'missing' }, { tableSize: 4 });
		await expectRefusal(
			savePreferences(fake.asFirestore(), 'u4', { sessionId: SID, preferences: ['a'] }),
			'failed-precondition',
			'registration-closed',
		);
	});

	it.each<TableAssignmentStatus>(['registrationClosed', 'draft', 'ended'])(
		'stays refused in %s even for someone with no seat',
		async (status) => {
			const fake = publishedRoom(status);

			await expectRefusal(
				savePreferences(fake.asFirestore(), 'u4', { sessionId: SID, preferences: ['a'] }),
				'failed-precondition',
				'registration-closed',
			);
		},
	);

	it('still needs a registration first', async () => {
		const fake = publishedRoom();

		await expect(
			savePreferences(fake.asFirestore(), 'stranger', { sessionId: SID, preferences: ['a'] }),
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});
});

describe('a latecomer registers and cancels after publishing', () => {
	it('registers, then ranks, in the published session', async () => {
		const fake = publishedRoom();

		await register(fake.asFirestore(), 'u9', { sessionId: SID, fullName: 'Late Lena' }, NOW);
		await savePreferences(fake.asFirestore(), 'u9', { sessionId: SID, preferences: ['a'] });

		expect(fake.read(participantPath('u9'))).toMatchObject({ preferences: ['a'] });
	});

	it('may cancel while not seated', async () => {
		const fake = publishedRoom();

		await expect(cancelRegistration(fake.asFirestore(), 'u4', { sessionId: SID })).resolves.toEqual(
			{ cancelled: true },
		);
		expect(fake.read(participantPath('u4'))).toBeUndefined();
	});

	it('may not cancel when seated', async () => {
		const fake = publishedRoom();

		await expectRefusal(
			cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID }),
			'failed-precondition',
			'registration-closed',
		);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});
});

describe('pinnedTablesOf', () => {
	it('lists the published tables in their order with their members', () => {
		const empty = { n: 0, mean: [], sd: [], deviation: 0 };

		expect(
			pinnedTablesOf({
				tables: [
					{ index: 1, topicId: 'b', memberUids: ['u3'], stats: empty },
					{ index: 0, topicId: 'a', memberUids: ['u1', 'u2'], stats: empty },
				],
			}),
		).toEqual([
			{ topicId: 'a', memberIds: ['u1', 'u2'] },
			{ topicId: 'b', memberIds: ['u3'] },
		]);
	});
});

describe('tablesComputePreview once the tables are published', () => {
	function readyRunOf(fake: FakeFirestore, runId: string): TableAssignmentRun {
		return fake.read(`tableAssignmentRuns/${runId}`) as unknown as TableAssignmentRun;
	}

	async function recompute(fake: FakeFirestore): Promise<TableAssignmentRun> {
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID },
			NOW,
			() => 7,
		);

		return readyRunOf(fake, runId);
	}

	function withNewcomers(fake: FakeFirestore): void {
		seedRegistration(fake, 'u5', { preferences: ['a'] });
		seedRegistration(fake, 'u6', { preferences: ['b'] });
		seedCounter(fake, 6);
	}

	it('keeps the seated people at their table and seats only the newcomers', async () => {
		const fake = publishedRoom();

		withNewcomers(fake);
		const run = await recompute(fake);
		const first = run.tables[0];

		expect(first.topicId).toBe('a');
		expect(first.memberUids).toEqual(expect.arrayContaining(['u1', 'u2', 'u3']));

		const everyone = run.tables.flatMap((table) => table.memberUids).sort();

		expect(everyone).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
	});

	it('does not move the published run: it stays published until the host publishes the new one', async () => {
		const fake = publishedRoom();

		withNewcomers(fake);
		await recompute(fake);

		expect((fake.read('tableAssignmentRuns/run-pub') as { status: string }).status).toBe(
			'published',
		);
	});

	it('lets a removed participant simply drop out of a pinned table', async () => {
		const fake = publishedRoom();

		withNewcomers(fake);
		await fake.asFirestore().collection('tableAssignmentParticipants').doc(`${SID}_u2`).delete();
		const run = await recompute(fake);
		const everyone = run.tables.flatMap((table) => table.memberUids);

		expect(everyone).not.toContain('u2');
		expect(run.tables[0].memberUids).toEqual(expect.arrayContaining(['u1', 'u3']));
	});

	it('does not pin anything before the first publication', async () => {
		const fake = publishedRoom('registrationClosed');

		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4, balanceTolerance: 0.3 });
		withNewcomers(fake);
		const run = await recompute(fake);

		expect(run.tables.flatMap((table) => table.memberUids).sort()).toEqual([
			'u1',
			'u2',
			'u3',
			'u4',
			'u5',
			'u6',
		]);
	});
});
