import type { TableAssignmentStatus } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { register } from '../fn_tablesRegister';
import { cancelRegistration } from '../fn_tablesCancelRegistration';
import { removeParticipant } from '../fn_tablesRemoveParticipant';
import { savePreferences } from '../fn_tablesSavePreferences';
import { joinTable } from '../fn_tablesJoinTable';
import { computePreview } from '../fn_tablesComputePreview';
import { publishRun } from '../fn_tablesPublishRun';
import { planRosterBackfill, rosterEntryFrom } from '../roster';
import {
	HOST,
	NOW,
	SID,
	counterPath,
	expectRefusal,
	participantPath,
	rosterPath,
	seatPath,
	seedCounter,
	seedPublishedRun,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

const NAME = 'Dana Levi';
const RETURN_BY_NAME = { allowReturnByName: true };

/** A session with return by name on and one earlier registration under NAME who has answered. */
function sessionWithNamesake(): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, {}, RETURN_BY_NAME);
	seedTopics(fake, ['a']);
	seedRegistration(fake, 'old', { fullName: NAME, preferences: ['a'], position: 80 });
	seedCounter(fake, 1);

	return fake;
}

describe('tablesRegister: the two records and the count', () => {
	it('writes the private record, the name card and the counter', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		const result = await register(
			fake.asFirestore(),
			'u1',
			{ sessionId: SID, fullName: '  Dana   Levi ' },
			NOW,
		);
		expect(result.outcome).toBe('registered');
		expect(result.participant).toMatchObject({ uid: 'u1', preferences: [], registeredAt: NOW });
		expect(fake.read(participantPath('u1'))).toMatchObject({ sessionId: SID, uid: 'u1' });
		expect(fake.read(rosterPath('u1'))).toEqual({
			sessionId: SID,
			uid: 'u1',
			fullName: 'Dana   Levi',
			nameKey: 'dana levi',
			registeredAt: NOW,
			hasPreferences: false,
		});
		expect(fake.read(counterPath)).toEqual({ sessionId: SID, registered: 1 });
	});

	it('renames both records on a second call and does not count twice', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		const fs = fake.asFirestore();
		await register(fs, 'u1', { sessionId: SID, fullName: NAME }, NOW);
		await register(fs, 'u1', { sessionId: SID, fullName: 'Dana L.' }, NOW + 5);
		expect(fake.read(participantPath('u1'))).toMatchObject({
			fullName: 'Dana L.',
			registeredAt: NOW,
		});
		expect(fake.read(rosterPath('u1'))).toMatchObject({ fullName: 'Dana L.', nameKey: 'dana l.' });
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('refuses an unknown nameMatch before touching Firestore', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		await expectRefusal(
			register(fake.asFirestore(), 'u1', {
				sessionId: SID,
				fullName: NAME,
				nameMatch: 'steal' as 'ask',
			}),
			'invalid-argument',
		);
		expect(fake.read(participantPath('u1'))).toBeUndefined();
	});
});

describe('tablesRegister: return by full name', () => {
	it("'ask' reports the match, writes nothing and carries nobody's data", async () => {
		const fake = sessionWithNamesake();
		const result = await register(fake.asFirestore(), 'new', { sessionId: SID, fullName: NAME });
		expect(result).toEqual({ outcome: 'nameExists' });
		expect(fake.read(participantPath('new'))).toBeUndefined();
		expect(fake.read(rosterPath('new'))).toBeUndefined();
		expect(fake.read(participantPath('old'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('asks by default and matches through spacing and case', async () => {
		const fake = sessionWithNamesake();
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: '  DANA   levi',
		});
		expect(result.outcome).toBe('nameExists');
	});

	it("'claim' leaves no trace of the old answers, keeps the count and flags the record", async () => {
		const fake = sessionWithNamesake();
		const result = await register(
			fake.asFirestore(),
			'new',
			{ sessionId: SID, fullName: NAME, nameMatch: 'claim' },
			NOW + 9,
		);
		expect(result.outcome).toBe('registered');
		expect(result.participant).toEqual({
			sessionId: SID,
			uid: 'new',
			fullName: NAME,
			preferences: [],
			registeredAt: NOW + 9,
			claimedByName: true,
		});
		expect(fake.read(participantPath('old'))).toBeUndefined();
		expect(fake.read(rosterPath('old'))).toBeUndefined();
		expect(fake.list('tableAssignmentParticipants')).toHaveLength(1);
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('puts the claim flag on the name card, so the host can see it', async () => {
		const fake = sessionWithNamesake();
		await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(fake.read(rosterPath('new'))).toMatchObject({ claimedByName: true });
	});

	it("'separate' registers a second person under the same name", async () => {
		const fake = sessionWithNamesake();
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'separate',
		});
		expect(result.outcome).toBe('registered');
		expect(result.participant).not.toHaveProperty('claimedByName');
		expect(fake.read(participantPath('old'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 2 });
	});

	it('ignores the name when the setting is off, and a claim sets no flag', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedRegistration(fake, 'old', { fullName: NAME, preferences: ['a'] });
		seedCounter(fake, 1);
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(result.outcome).toBe('registered');
		expect(result.participant).not.toHaveProperty('claimedByName');
		expect(fake.read(participantPath('old'))).toMatchObject({ preferences: ['a'] });
		expect(fake.read(counterPath)).toMatchObject({ registered: 2 });
	});

	it('does not ask or claim when two registrations share the name', async () => {
		const fake = sessionWithNamesake();
		seedRegistration(fake, 'twin', { fullName: NAME });
		seedCounter(fake, 2);
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(result.outcome).toBe('registered');
		expect(fake.read(participantPath('old'))).toBeDefined();
		expect(fake.read(participantPath('twin'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 3 });
	});

	it('does not act after publishing: a latecomer with the same name registers separately', async () => {
		const fake = sessionWithNamesake();
		seedSession(fake, { status: 'published', publishedRunId: 'r' }, RETURN_BY_NAME);
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(result.participant).not.toHaveProperty('claimedByName');
		expect(fake.read(participantPath('old'))).toBeDefined();
	});

	it('treats a registered caller as a rename, even onto a taken name', async () => {
		const fake = sessionWithNamesake();
		seedRegistration(fake, 'me', { fullName: 'Someone Else' });
		seedCounter(fake, 2);
		const result = await register(fake.asFirestore(), 'me', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(result.outcome).toBe('registered');
		expect(result.participant).not.toHaveProperty('claimedByName');
		expect(fake.read(participantPath('old'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 2 });
	});

	it('keeps the claim flag through a save of answers', async () => {
		const fake = sessionWithNamesake();
		const fs = fake.asFirestore();
		await register(fs, 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' });
		await savePreferences(fs, 'new', { sessionId: SID, preferences: ['a'] });
		expect(fake.read(participantPath('new'))).toMatchObject({
			fullName: NAME,
			claimedByName: true,
		});
		expect(fake.read(rosterPath('new'))).toMatchObject({ claimedByName: true });
	});
});

describe('name card stays in step', () => {
	it('tablesSavePreferences sets hasPreferences and never copies the answer', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedTopics(fake, ['a']);
		seedRegistration(fake, 'u1');
		const fs = fake.asFirestore();
		await savePreferences(fs, 'u1', { sessionId: SID, preferences: ['a'], position: 50 });
		expect(fake.read(rosterPath('u1'))).toMatchObject({ hasPreferences: true });
		expect(fake.read(rosterPath('u1'))).not.toHaveProperty('position');
		expect(fake.read(rosterPath('u1'))).not.toHaveProperty('preferences');
		await savePreferences(fs, 'u1', { sessionId: SID, preferences: [] });
		expect(fake.read(rosterPath('u1'))).toMatchObject({ hasPreferences: false });
	});

	it('tablesJoinTable sets the table on the name card', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct' });
		seedTopics(fake, ['a', 'b']);
		seedRegistration(fake, 'u1');
		await joinTable(fake.asFirestore(), 'u1', { sessionId: SID, tableIndex: 1 });
		expect(fake.read(rosterPath('u1'))).toMatchObject({ chosenTableIndex: 1 });
	});
});

describe('tablesCancelRegistration', () => {
	function oneRegistered(status: TableAssignmentStatus = 'registrationOpen'): FakeFirestore {
		const fake = new FakeFirestore();
		seedSession(fake, { status });
		seedRegistration(fake, 'u1', { preferences: ['a'], position: 10 });
		seedCounter(fake, 1);

		return fake;
	}

	it('deletes both records and takes one off the count', async () => {
		const fake = oneRegistered();
		await expect(cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID })).resolves.toEqual(
			{
				cancelled: true,
			},
		);
		expect(fake.read(participantPath('u1'))).toBeUndefined();
		expect(fake.read(rosterPath('u1'))).toBeUndefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 0 });
	});

	it.each<TableAssignmentStatus>(['draft', 'registrationClosed', 'published', 'ended'])(
		'is refused in %s and keeps the registration',
		async (status) => {
			const fake = oneRegistered(status);
			await expectRefusal(
				cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID }),
				'failed-precondition',
				'registration-closed',
			);
			expect(fake.read(participantPath('u1'))).toBeDefined();
		},
	);

	it('frees a direct-mode seat', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct' });
		seedRegistration(fake, 'u1', { chosenTableIndex: 3 });
		seedCounter(fake, 1);
		fake.seed(seatPath(3), { sessionId: SID, tableIndex: 3, topicId: 'a', count: 2 });
		await cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID });
		expect(fake.read(seatPath(3))).toMatchObject({ count: 1, topicId: 'a' });
	});

	it('cancelled twice is a quiet success that counts once', async () => {
		const fake = oneRegistered();
		seedRegistration(fake, 'u2');
		seedCounter(fake, 2);
		const fs = fake.asFirestore();
		await cancelRegistration(fs, 'u1', { sessionId: SID });
		await expect(cancelRegistration(fs, 'u1', { sessionId: SID })).resolves.toEqual({
			cancelled: true,
		});
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
		expect(fake.read(participantPath('u2'))).toBeDefined();
	});

	it('never takes the counter below zero, even when the backfill has not written it', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedRegistration(fake, 'u1');
		await cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID });
		expect(fake.read(counterPath)).toMatchObject({ registered: 0 });
	});

	it('refuses a registration created by a name claim, and it stays', async () => {
		const fake = sessionWithNamesake();
		const fs = fake.asFirestore();
		await register(fs, 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' });
		await expectRefusal(
			cancelRegistration(fs, 'new', { sessionId: SID }),
			'failed-precondition',
			'claimed-by-name',
		);
		expect(fake.read(participantPath('new'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('still refuses after the claimant sends their name again', async () => {
		const fake = sessionWithNamesake();
		const fs = fake.asFirestore();
		await register(fs, 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' });
		await register(fs, 'new', { sessionId: SID, fullName: NAME });
		await expectRefusal(
			cancelRegistration(fs, 'new', { sessionId: SID }),
			'failed-precondition',
			'claimed-by-name',
		);
	});
});

describe('tablesRemoveParticipant', () => {
	function ranked(status: TableAssignmentStatus = 'registrationOpen'): FakeFirestore {
		const fake = new FakeFirestore();
		seedSession(fake, { status });
		seedTopics(fake, ['a', 'b']);
		['u1', 'u2', 'u3', 'u4'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
		seedCounter(fake, 4);

		return fake;
	}

	it('is for the host only', async () => {
		const fake = ranked();
		await expectRefusal(
			removeParticipant(fake.asFirestore(), 'u2', { sessionId: SID, uid: 'u1' }),
			'permission-denied',
		);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});

	it.each<TableAssignmentStatus>(['draft', 'registrationOpen', 'registrationClosed'])(
		'deletes both records and takes one off the count in %s',
		async (status) => {
			const fake = ranked(status);
			await expect(
				removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u1' }),
			).resolves.toEqual({ removed: true });
			expect(fake.read(participantPath('u1'))).toBeUndefined();
			expect(fake.read(rosterPath('u1'))).toBeUndefined();
			expect(fake.read(counterPath)).toMatchObject({ registered: 3 });
		},
	);

	it('is refused once the session has ended', async () => {
		const fake = ranked('ended');
		await expectRefusal(
			removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u1' }),
			'failed-precondition',
		);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});

	it('removes a claimed registration too: the refusal is about the participant, not the host', async () => {
		const fake = ranked();
		seedRegistration(fake, 'claimed', { claimedByName: true });
		await removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'claimed' });
		expect(fake.read(participantPath('claimed'))).toBeUndefined();
	});

	it('frees a direct-mode seat', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct', status: 'registrationClosed' });
		seedRegistration(fake, 'u1', { chosenTableIndex: 0 });
		seedCounter(fake, 1);
		fake.seed(seatPath(0), { sessionId: SID, tableIndex: 0, topicId: 'a', count: 1 });
		await removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u1' });
		expect(fake.read(seatPath(0))).toMatchObject({ count: 0 });
	});

	it('is a quiet success for someone not registered, and the count does not move', async () => {
		const fake = ranked();
		await expect(
			removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'nobody' }),
		).resolves.toEqual({ removed: true });
		expect(fake.read(counterPath)).toMatchObject({ registered: 4 });
	});

	it('makes a ready preview stale: publishing it is refused like after a new registration', async () => {
		const fake = ranked('registrationClosed');
		seedRegistration(fake, 'u5', { preferences: ['a'] });
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 7);
		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u4' });
		await expectRefusal(
			publishRun(fs, HOST, { sessionId: SID, runId }),
			'failed-precondition',
			'stale-run',
		);
		expect(fake.read(`tableAssignments/${SID}`)).not.toHaveProperty('publishedRunId');
	});

	it('a preview computed after the removal can be published', async () => {
		const fake = ranked('registrationClosed');
		seedRegistration(fake, 'u5', { preferences: ['a'] });
		seedRegistration(fake, 'u6', { preferences: ['a'] });
		const fs = fake.asFirestore();
		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u4' });
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 7);
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).resolves.toEqual({
			publishedRunId: runId,
		});
	});

	describe('after publishing', () => {
		function published(): FakeFirestore {
			const fake = ranked('published');
			seedSession(fake, { status: 'published', publishedRunId: 'run-pub' });
			seedPublishedRun(fake, 'run-pub', ['u1', 'u2', 'u3']);

			return fake;
		}

		it('refuses someone seated in the published assignment and changes nothing', async () => {
			const fake = published();
			const runBefore = fake.read('tableAssignmentRuns/run-pub');
			await expectRefusal(
				removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u1' }),
				'failed-precondition',
				'seated-in-published-run',
			);
			expect(fake.read(participantPath('u1'))).toBeDefined();
			expect(fake.read(rosterPath('u1'))).toBeDefined();
			expect(fake.read(counterPath)).toMatchObject({ registered: 4 });
			expect(fake.read('tableAssignmentRuns/run-pub')).toEqual(runBefore);
		});

		it('removes an unseated latecomer, leaving the published assignment as it was', async () => {
			const fake = published();
			const runBefore = fake.read('tableAssignmentRuns/run-pub');
			await removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u4' });
			expect(fake.read(participantPath('u4'))).toBeUndefined();
			expect(fake.read('tableAssignmentRuns/run-pub')).toEqual(runBefore);
		});

		it('refuses when the published run cannot be read, rather than guess', async () => {
			const fake = ranked('published');
			seedSession(fake, { status: 'published', publishedRunId: 'missing' });
			await expectRefusal(
				removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u4' }),
				'failed-precondition',
				'seated-in-published-run',
			);
		});
	});
});

describe('compute and publish with name cards present', () => {
	it('still run from the private records', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationClosed' });
		seedTopics(fake, ['a', 'b']);
		['u1', 'u2', 'u3', 'u4', 'u5'].forEach((uid, index) =>
			seedRegistration(fake, uid, { preferences: ['a'], position: index * 20 }),
		);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 3);
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).resolves.toEqual({
			publishedRunId: runId,
		});
	});

	it('a rename does not make a ready preview stale', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedTopics(fake, ['a', 'b']);
		['u1', 'u2', 'u3', 'u4', 'u5'].forEach((uid) =>
			seedRegistration(fake, uid, { preferences: ['a'] }),
		);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 3);
		await register(fs, 'u1', { sessionId: SID, fullName: 'New Name' });
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).resolves.toEqual({
			publishedRunId: runId,
		});
	});
});

describe('roster builders', () => {
	const participant = {
		sessionId: SID,
		uid: 'u1',
		fullName: 'דנה  לוי',
		preferences: ['a'],
		position: 25,
		registeredAt: NOW,
		claimedByName: true,
	};

	it('copies only what the host may see', () => {
		expect(rosterEntryFrom({ ...participant, chosenTableIndex: 1 })).toEqual({
			sessionId: SID,
			uid: 'u1',
			fullName: 'דנה  לוי',
			nameKey: 'דנה לוי',
			registeredAt: NOW,
			hasPreferences: true,
			chosenTableIndex: 1,
			claimedByName: true,
		});
	});

	it('leaves the claim flag off a card that was never claimed', () => {
		expect(rosterEntryFrom({ ...participant, claimedByName: undefined })).not.toHaveProperty(
			'claimedByName',
		);
	});

	it('plans one card per registration and a true count per session, zero included', () => {
		const plan = planRosterBackfill(
			[SID, 'empty'],
			[participant, { ...participant, uid: 'u2', preferences: [] }],
		);
		expect(plan.entries.map((e) => [e.uid, e.hasPreferences])).toEqual([
			['u1', true],
			['u2', false],
		]);
		expect(plan.counters).toEqual([
			{ sessionId: SID, registered: 2 },
			{ sessionId: 'empty', registered: 0 },
		]);
	});
});
