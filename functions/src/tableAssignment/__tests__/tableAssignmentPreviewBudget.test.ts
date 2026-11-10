import type { Firestore } from 'firebase-admin/firestore';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { MAX_PREVIEWS_PER_ANSWERS, MAX_PREVIEWS_PER_SESSION } from '../constants';
import { computePreview } from '../fn_tablesComputePreview';
import { removeParticipant } from '../fn_tablesRemoveParticipant';
import {
	HOST,
	NOW,
	SID,
	seedRegistration,
	seedSession,
	seedTopics,
	serialized,
} from './tablesTestKit';

const SESSION_BUDGET = `tableAssignmentPreviewBudgets/${SID}`;

function seedRoom(fake: FakeFirestore, positions: readonly number[]): void {
	seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4, balanceTolerance: 0.3 });
	seedTopics(fake, ['a', 'b']);
	positions.forEach((position, i) => {
		seedRegistration(fake, `u${i}`, { preferences: ['a', 'b'], position });
	});
}

function runOf(fake: FakeFirestore, runId: string): TableAssignmentRun {
	return fake.read(`tableAssignmentRuns/${runId}`) as unknown as TableAssignmentRun;
}

describe('rationing previews', () => {
	const compute = (fake: FakeFirestore, seed: number): ReturnType<typeof computePreview> =>
		computePreview(fake.asFirestore(), HOST, { sessionId: SID }, NOW + seed, () => seed);

	it('refuses fewer than five registrants, with a reason the client can read', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75]);
		await expect(compute(fake, 1)).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'too-few-registrants',
		});
		expect(fake.list('tableAssignmentRuns')).toHaveLength(0);
	});

	it('computes for exactly five', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		await expect(compute(fake, 1)).resolves.toBeDefined();
	});

	it('stops at five previews over the same answers and writes nothing more', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		for (let seed = 1; seed <= 5; seed += 1) await compute(fake, seed);
		await expect(compute(fake, 6)).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'preview-limit',
		});
		expect(fake.list('tableAssignmentRuns')).toHaveLength(5);
	});

	it('gives a fresh budget when an answer changes', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		for (let seed = 1; seed <= 5; seed += 1) await compute(fake, seed);
		seedRegistration(fake, 'u0', { preferences: ['b'], position: 100 });
		await expect(compute(fake, 6)).resolves.toBeDefined();
	});

	it('does not refill when the answers change and change back', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		for (let seed = 1; seed <= 5; seed += 1) await compute(fake, seed);
		seedRegistration(fake, 'u0', { preferences: ['b'], position: 100 });
		await compute(fake, 6);
		seedRegistration(fake, 'u0', { preferences: ['a', 'b'], position: 0 });
		await expect(compute(fake, 7)).rejects.toMatchObject({ reason: 'preview-limit' });
	});

	it('does not refill when only a setting moves: that would locate a table by sweeping the tolerance', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		for (let seed = 1; seed <= 5; seed += 1) await compute(fake, seed);
		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4, balanceTolerance: 0.31 });
		await expect(compute(fake, 6)).rejects.toMatchObject({ reason: 'preview-limit' });
	});

	it('keeps the budget in a collection only the server knows, with no answer in it', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		await compute(fake, 1);
		expect(fake.list('tableAssignmentPreviewBudgets')).toEqual([
			{ sessionId: SID, computed: 1 },
			{ sessionId: SID, computed: 1 },
		]);
	});

	it('seats the same whatever order the registrations are read in', async () => {
		const positions = [0, 25, 50, 75, 100, 25, 50, 75];
		const seatingOf = async (order: readonly number[]): Promise<TableAssignmentRun['tables']> => {
			const fake = new FakeFirestore();

			seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4 });
			seedTopics(fake, ['a', 'b']);
			order.forEach((i) =>
				seedRegistration(fake, `u${i}`, { preferences: ['a', 'b'], position: positions[i] }),
			);
			const fs = fake.asFirestore();
			const collection = fs.collection.bind(fs);

			fs.collection = ((name: string) => {
				const api = collection(name);
				if (name !== 'tableAssignmentParticipants') return api;

				return {
					...api,
					where: (...args: Parameters<typeof api.where>) => {
						const query = api.where(...args);

						return {
							...query,
							get: async () => {
								const snap = await query.get();

								return { ...snap, docs: [...snap.docs].reverse() };
							},
						};
					},
				};
			}) as typeof fs.collection;
			const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 4);

			return runOf(fake, runId).tables;
		};

		const forward = await seatingOf(positions.map((_, i) => i));
		const backward = await seatingOf(positions.map((_, i) => positions.length - 1 - i));

		expect(backward).toEqual(forward);
	});

	it('writes no run when the session ended while the engine ran', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		const fs = fake.asFirestore();
		const original = fs.runTransaction.bind(fs);

		fs.runTransaction = ((fn: Parameters<typeof original>[0]) => {
			seedSession(fake, { status: 'ended' });

			return original(fn);
		}) as typeof fs.runTransaction;
		await expect(computePreview(fs, HOST, { sessionId: SID }, NOW)).rejects.toMatchObject({
			code: 'failed-precondition',
		});
		expect(fake.list('tableAssignmentRuns')).toHaveLength(0);
	});

	it('stops at thirty in a session, however often dummy registrations refill the budget', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		for (let round = 0; round < MAX_PREVIEWS_PER_SESSION / MAX_PREVIEWS_PER_ANSWERS; round += 1) {
			seedRegistration(fake, `dummy${round}`);
			for (let preview = 1; preview <= MAX_PREVIEWS_PER_ANSWERS; preview += 1) {
				await compute(fake, preview);
			}
		}
		expect(fake.list('tableAssignmentRuns')).toHaveLength(MAX_PREVIEWS_PER_SESSION);
		seedRegistration(fake, 'one-more-dummy');
		await expect(compute(fake, 1)).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'preview-limit',
		});
		expect(fake.list('tableAssignmentRuns')).toHaveLength(MAX_PREVIEWS_PER_SESSION);
	});

	it('does not refill the session count when a participant is removed', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		fake.seed(SESSION_BUDGET, { sessionId: SID, computed: MAX_PREVIEWS_PER_SESSION });
		await removeParticipant(fake.asFirestore(), HOST, { sessionId: SID, uid: 'u0' });
		await expect(compute(fake, 1)).rejects.toMatchObject({ reason: 'preview-limit' });
	});

	/** Fires the calls at once and returns the refusals. */
	async function race(fs: Firestore, calls: number): Promise<unknown[]> {
		const results = await Promise.allSettled(
			Array.from({ length: calls }, (_, i) =>
				computePreview(fs, HOST, { sessionId: SID }, NOW + i, () => i),
			),
		);

		return results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
	}

	it('never passes five over the same answers when calls race', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		const refusals = await race(serialized(fake), 8);

		expect(fake.list('tableAssignmentRuns')).toHaveLength(MAX_PREVIEWS_PER_ANSWERS);
		expect(refusals).toHaveLength(3);
		refusals.forEach((refusal) => expect(refusal).toMatchObject({ reason: 'preview-limit' }));
		expect(fake.read(SESSION_BUDGET)).toMatchObject({ computed: MAX_PREVIEWS_PER_ANSWERS });
	});

	it('never passes the session total when calls race', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		fake.seed(SESSION_BUDGET, { sessionId: SID, computed: MAX_PREVIEWS_PER_SESSION - 2 });
		const refusals = await race(serialized(fake), 4);

		expect(fake.list('tableAssignmentRuns')).toHaveLength(2);
		expect(refusals).toHaveLength(2);
		expect(fake.read(SESSION_BUDGET)).toMatchObject({ computed: MAX_PREVIEWS_PER_SESSION });
	});
});
