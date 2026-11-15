import { TABLE_ASSIGNMENT_REMOVE_BATCH_MAX } from '@freedi/shared-types';
import type { TableAssignmentRun, TableAssignmentStatus } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { removeParticipants } from '../fn_tablesRemoveParticipants';
import {
	HOST,
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
} from './tablesTestKit';

const RUN_ID = 'run-1';

function session(status: TableAssignmentStatus = 'registrationOpen'): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, { status });
	['u1', 'u2', 'u3', 'u4'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
	seedCounter(fake, 4);

	return fake;
}

function publishedSession(): FakeFirestore {
	const fake = session('published');
	fake.seed(`tableAssignments/${SID}`, {
		...(fake.read(`tableAssignments/${SID}`) as object),
		publishedRunId: RUN_ID,
	});
	seedPublishedRun(fake, RUN_ID, ['u1', 'u2', 'u3']);

	return fake;
}

describe('tablesRemoveParticipants', () => {
	it('is for the host only, and removes nobody otherwise', async () => {
		const fake = session();
		await expectRefusal(
			removeParticipants(fake.asFirestore(), 'stranger', { sessionId: SID, uids: ['u1'] }),
			'permission-denied',
		);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});

	it('is refused once the session has ended', async () => {
		const fake = session('ended');
		await expectRefusal(
			removeParticipants(fake.asFirestore(), HOST, { sessionId: SID, uids: ['u1'] }),
			'failed-precondition',
		);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});

	it('refuses an empty list and a list over the cap', async () => {
		const fake = session();
		await expectRefusal(
			removeParticipants(fake.asFirestore(), HOST, { sessionId: SID, uids: [] }),
			'invalid-argument',
		);
		const tooMany = Array.from(
			{ length: TABLE_ASSIGNMENT_REMOVE_BATCH_MAX + 1 },
			(_, i) => `x${i}`,
		);
		await expectRefusal(
			removeParticipants(fake.asFirestore(), HOST, { sessionId: SID, uids: tooMany }),
			'invalid-argument',
		);
	});

	it('removes both records of each person and takes each off the count', async () => {
		const fake = session();
		const result = await removeParticipants(fake.asFirestore(), HOST, {
			sessionId: SID,
			uids: ['u1', 'u2', 'u2'],
		});
		expect(result).toEqual({ removed: ['u1', 'u2'], failed: [] });
		expect(fake.read(participantPath('u1'))).toBeUndefined();
		expect(fake.read(rosterPath('u2'))).toBeUndefined();
		expect(fake.read(participantPath('u3'))).toBeDefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 2 });
	});

	it('frees a direct-mode seat', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct', status: 'registrationClosed' });
		seedRegistration(fake, 'u1', { chosenTableIndex: 0 });
		seedCounter(fake, 1);
		fake.seed(seatPath(0), { sessionId: SID, tableIndex: 0, topicId: 'a', count: 1 });
		await removeParticipants(fake.asFirestore(), HOST, { sessionId: SID, uids: ['u1'] });
		expect(fake.read(seatPath(0))).toMatchObject({ count: 0 });
	});

	it('removes people seated at the published tables and frees their seats', async () => {
		const fake = publishedSession();
		const result = await removeParticipants(fake.asFirestore(), HOST, {
			sessionId: SID,
			uids: ['u1', 'u3', 'u4'],
		});
		expect(result.removed).toEqual(['u1', 'u3', 'u4']);
		expect(result.failed).toEqual([]);
		const run = fake.read(`tableAssignmentRuns/${RUN_ID}`) as TableAssignmentRun;
		expect(run.tables[0].memberUids).toEqual(['u2']);
		expect(run.tables[0]).toMatchObject({ index: 0, topicId: 'a' });
		expect(fake.read(participantPath('u1'))).toBeUndefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('reports a person who is not registered and still removes the others', async () => {
		const fake = session();
		const result = await removeParticipants(fake.asFirestore(), HOST, {
			sessionId: SID,
			uids: ['nobody', 'u1'],
		});
		expect(result).toEqual({
			removed: ['u1'],
			failed: [{ uid: 'nobody', reason: 'not-registered' }],
		});
		expect(fake.read(counterPath)).toMatchObject({ registered: 3 });
	});

	it('keeps going when one removal fails, and reports it', async () => {
		const fake = session();
		const firestore = fake.asFirestore();
		const original = firestore.runTransaction.bind(firestore);
		let calls = 0;
		firestore.runTransaction = ((fn: Parameters<typeof original>[0]) => {
			calls += 1;
			// Call 1 is the host check; call 2 is the first person.
			if (calls === 2) return Promise.reject(new Error('boom'));

			return original(fn);
		}) as typeof firestore.runTransaction;
		const result = await removeParticipants(firestore, HOST, {
			sessionId: SID,
			uids: ['u1', 'u2'],
		});
		expect(result.removed).toEqual(['u2']);
		expect(result.failed).toEqual([{ uid: 'u1', reason: 'internal' }]);
		expect(fake.read(participantPath('u1'))).toBeDefined();
	});
});
