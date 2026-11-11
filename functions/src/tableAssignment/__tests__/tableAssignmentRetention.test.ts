import type { Firestore } from 'firebase-admin/firestore';
import { logError } from '../../utils/errorHandling';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { WRITE_BATCH_SIZE } from '../constants';
import { deleteSession } from '../fn_tablesDeleteSession';
import { setStatus } from '../fn_tablesSetStatus';
import { eraseSessionAnswers } from '../sessionData';
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

jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

const SESSION = `tableAssignments/${SID}`;
const OTHER = 'session-2';
const WRITE_METHODS = ['update', 'delete'] as const;
type WriteMethod = (typeof WRITE_METHODS)[number];

/** A published session with superseded and ready runs, their inputs, a budget and a seat. */
function endableSession(): FakeFirestore {
	const fake = new FakeFirestore();

	seedSession(fake, { status: 'published', publishedRunId: 'live' });
	seedTopics(fake, ['a', 'b']);
	seedRegistration(fake, 'u1', { preferences: ['a', 'b'], position: 25 });
	seedRegistration(fake, 'u2', { preferences: ['b'], position: 75 });
	seedRegistration(fake, 'u3', { preferences: [] });
	seedCounter(fake, 3);
	seedPublishedRun(fake, 'live', ['u1', 'u2', 'u3']);
	fake.seed('tableAssignmentRuns/old', { runId: 'old', sessionId: SID, status: 'superseded' });
	fake.seed('tableAssignmentRuns/draft', { runId: 'draft', sessionId: SID, status: 'ready' });
	['live', 'old', 'draft'].forEach((runId) =>
		fake.seed(`tableAssignmentRunInputs/${runId}`, { sessionId: SID, inputHash: 'h' }),
	);
	fake.seed(`tableAssignmentPreviewBudgets/${SID}_h`, { sessionId: SID, computed: 2 });
	fake.seed(seatPath(0), { sessionId: SID, tableIndex: 0, topicId: 'a', count: 1 });

	return fake;
}

/** Another session's documents, which neither action may touch. */
function seedBystander(fake: FakeFirestore): void {
	fake.seed(`tableAssignments/${OTHER}`, { tableAssignmentId: OTHER, hostUid: 'h2' });
	fake.seed(`tableAssignmentParticipants/${OTHER}_x`, {
		sessionId: OTHER,
		uid: 'x',
		preferences: ['z'],
		position: 50,
	});
	fake.seed(`tableAssignmentRoster/${OTHER}_x`, { sessionId: OTHER, uid: 'x' });
	fake.seed('tableAssignmentRuns/other', {
		runId: 'other',
		sessionId: OTHER,
		status: 'superseded',
	});
	fake.seed('tableAssignmentRunInputs/other', { sessionId: OTHER, inputHash: 'h' });
}

function expectBystanderUntouched(fake: FakeFirestore): void {
	expect(fake.read(`tableAssignmentParticipants/${OTHER}_x`)).toMatchObject({
		preferences: ['z'],
		position: 50,
	});
	expect(fake.read(`tableAssignmentRoster/${OTHER}_x`)).toBeDefined();
	expect(fake.read('tableAssignmentRuns/other')).toBeDefined();
	expect(fake.read('tableAssignmentRunInputs/other')).toBeDefined();
	expect(fake.read(`tableAssignments/${OTHER}`)).toBeDefined();
}

/**
 * Records how many writes each committed batch held; `failAfter` batches
 * succeed, then commit throws. Counted here because the fake's own `size` is
 * flattened to 0 when its object spread is compiled down.
 */
function trackBatches(fs: Firestore, failAfter = Infinity): number[] {
	const sizes: number[] = [];
	const original = fs.batch.bind(fs);

	fs.batch = (() => {
		const batch = original();
		const commit = batch.commit.bind(batch);
		const writers = batch as unknown as Record<WriteMethod, (...args: unknown[]) => unknown>;
		let writes = 0;

		WRITE_METHODS.forEach((method) => {
			const write = writers[method];

			writers[method] = (...args: unknown[]): unknown => {
				writes += 1;

				return write(...args);
			};
		});
		batch.commit = async () => {
			if (sizes.length >= failAfter) throw new Error('commit failed');
			sizes.push(writes);

			return commit();
		};

		return batch;
	}) as typeof fs.batch;

	return sizes;
}

describe('ending a session erases the answers', () => {
	it('clears every position and ranking and reports it', async () => {
		const fake = endableSession();

		await expect(
			setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW),
		).resolves.toEqual({ status: 'ended', answersErased: true });
		['u1', 'u2', 'u3'].forEach((uid) => {
			const record = fake.read(participantPath(uid));

			expect(record).not.toHaveProperty('position');
			expect(record).toMatchObject({ preferences: [] });
		});
		expect(fake.read(SESSION)).toMatchObject({ status: 'ended', answersErasedAt: NOW });
	});

	it('deletes run inputs, budgets and every run but the published one', async () => {
		const fake = endableSession();

		await setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW);
		expect(fake.list('tableAssignmentRunInputs')).toHaveLength(0);
		expect(fake.list('tableAssignmentPreviewBudgets')).toHaveLength(0);
		expect(fake.list('tableAssignmentRuns').map((run) => run.runId)).toEqual(['live']);
	});

	it('keeps names and seats, which are the result', async () => {
		const fake = endableSession();

		await setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW);
		expect(fake.read(participantPath('u1'))).toMatchObject({ fullName: 'Name u1' });
		expect(fake.read(rosterPath('u1'))).toBeDefined();
		expect(fake.read(seatPath(0))).toBeDefined();
	});

	it('touches no other session', async () => {
		const fake = endableSession();

		seedBystander(fake);
		await setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW);
		expectBystanderUntouched(fake);
	});

	it('does not erase on any other status change', async () => {
		const fake = endableSession();

		seedSession(fake, { status: 'registrationOpen' });
		await expect(
			setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'registrationClosed' }, NOW),
		).resolves.toEqual({ status: 'registrationClosed' });
		expect(fake.read(participantPath('u1'))).toMatchObject({ position: 25 });
	});

	it('keeps batches under the Firestore limit on a large session', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'registrationClosed' });
		for (let i = 0; i < 2 * WRITE_BATCH_SIZE + 1; i += 1) {
			seedRegistration(fake, `u${i}`, { preferences: ['a'], position: 50 });
		}
		const fs = fake.asFirestore();
		const sizes = trackBatches(fs);

		await setStatus(fs, HOST, { sessionId: SID, status: 'ended' }, NOW);
		expect(sizes).toEqual([WRITE_BATCH_SIZE, WRITE_BATCH_SIZE, 1]);
		expect(fake.read(participantPath('u0'))).not.toHaveProperty('position');
	});

	it('runs twice with the same result', async () => {
		const fake = endableSession();
		const fs = fake.asFirestore();
		const session = { tableAssignmentId: SID, publishedRunId: 'live' };

		await eraseSessionAnswers(fs, session, NOW);
		const once = new Map(fake.docs);

		await eraseSessionAnswers(fs, session, NOW);
		expect(new Map(fake.docs)).toEqual(once);
	});

	describe('when the erase fails', () => {
		it('still ends the session, logs it, says so and leaves it marked as not erased', async () => {
			const fake = endableSession();
			const fs = fake.asFirestore();

			trackBatches(fs, 0);
			await expect(setStatus(fs, HOST, { sessionId: SID, status: 'ended' }, NOW)).resolves.toEqual({
				status: 'ended',
				answersErased: false,
			});
			expect(fake.read(SESSION)).toMatchObject({ status: 'ended' });
			expect(fake.read(SESSION)).not.toHaveProperty('answersErasedAt');
			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					operation: 'tableAssignment.eraseSessionAnswers',
					userId: HOST,
					metadata: { sessionId: SID },
				}),
			);
		});

		it('finishes the job when the host asks for ended again', async () => {
			const fake = endableSession();
			const failing = fake.asFirestore();

			trackBatches(failing, 0);
			await setStatus(failing, HOST, { sessionId: SID, status: 'ended' }, NOW);
			await expect(
				setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW + 1),
			).resolves.toEqual({ status: 'ended', answersErased: true });
			expect(fake.read(participantPath('u1'))).not.toHaveProperty('position');
			expect(fake.read(SESSION)).toMatchObject({ answersErasedAt: NOW + 1 });
		});
	});

	it('does not redo an erase that finished', async () => {
		const fake = endableSession();
		const fs = fake.asFirestore();

		await setStatus(fs, HOST, { sessionId: SID, status: 'ended' }, NOW);
		await expect(
			setStatus(fs, HOST, { sessionId: SID, status: 'ended' }, NOW + 9),
		).resolves.toEqual({ status: 'ended', answersErased: true });
		expect(fake.read(SESSION)).toMatchObject({ answersErasedAt: NOW });
	});

	it('still refuses anyone but the host, even on an ended session', async () => {
		const fake = endableSession();

		seedSession(fake, { status: 'ended' });
		await expectRefusal(
			setStatus(fake.asFirestore(), 'stranger', { sessionId: SID, status: 'ended' }, NOW),
			'permission-denied',
		);
		expect(fake.read(participantPath('u1'))).toMatchObject({ position: 25 });
	});
});

describe('tablesDeleteSession', () => {
	const COLLECTIONS = [
		'tableAssignments',
		'tableAssignmentTopics',
		'tableAssignmentParticipants',
		'tableAssignmentRoster',
		'tableAssignmentCounters',
		'tableAssignmentSeats',
		'tableAssignmentRuns',
		'tableAssignmentRunInputs',
		'tableAssignmentPreviewBudgets',
	];

	it('deletes everything stored under the session', async () => {
		const fake = endableSession();

		await expect(deleteSession(fake.asFirestore(), HOST, { sessionId: SID }, NOW)).resolves.toEqual(
			{ deleted: true },
		);
		COLLECTIONS.forEach((collection) => expect(fake.list(collection)).toHaveLength(0));
	});

	it('leaves other sessions alone', async () => {
		const fake = endableSession();

		seedBystander(fake);
		await deleteSession(fake.asFirestore(), HOST, { sessionId: SID }, NOW);
		expectBystanderUntouched(fake);
		expect(fake.read(counterPath)).toBeUndefined();
	});

	it('refuses anyone but the host and deletes nothing', async () => {
		const fake = endableSession();
		const before = new Map(fake.docs);

		await expectRefusal(
			deleteSession(fake.asFirestore(), 'stranger', { sessionId: SID }, NOW),
			'permission-denied',
		);
		expect(new Map(fake.docs)).toEqual(before);
	});

	it('refuses a bad session id', async () => {
		const fake = new FakeFirestore();

		await expectRefusal(
			deleteSession(fake.asFirestore(), HOST, { sessionId: 'a/b' }),
			'invalid-argument',
		);
	});

	it('succeeds when the session is already gone', async () => {
		const fake = new FakeFirestore();

		await expect(deleteSession(fake.asFirestore(), HOST, { sessionId: SID }, NOW)).resolves.toEqual(
			{ deleted: true },
		);
	});

	it('keeps batches under the Firestore limit on a large session', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		for (let i = 0; i < WRITE_BATCH_SIZE; i += 1) seedRegistration(fake, `u${i}`);
		const fs = fake.asFirestore();
		const sizes = trackBatches(fs);

		await deleteSession(fs, HOST, { sessionId: SID }, NOW);
		expect(Math.max(...sizes)).toBe(WRITE_BATCH_SIZE);
		expect(fake.list('tableAssignmentParticipants')).toHaveLength(0);
	});

	it('leaves the session in place if a batch fails, closed and ready for a retry', async () => {
		const fake = endableSession();
		const failing = fake.asFirestore();

		seedSession(fake, { status: 'registrationOpen' });
		trackBatches(failing, 0);
		await expect(deleteSession(failing, HOST, { sessionId: SID }, NOW)).rejects.toThrow(
			'commit failed',
		);
		expect(fake.read(SESSION)).toMatchObject({ status: 'ended' });
		await deleteSession(fake.asFirestore(), HOST, { sessionId: SID }, NOW);
		expect(fake.read(SESSION)).toBeUndefined();
		expect(fake.list('tableAssignmentParticipants')).toHaveLength(0);
	});
});
