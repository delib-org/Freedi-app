import type { Firestore } from 'firebase-admin/firestore';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { rosterEntryFrom } from '../roster';
import { TablesError } from '../tablesErrors';

/** Fixtures shared by the Tables registration and fix-details suites. */
export const HOST = 'host-1';
/** The token shape of a host: only a Google sign-in may create a session. */
export const GOOGLE_HOST = { uid: HOST, hasGoogleAccount: true };
export const SID = 'session-1';
export const NOW = 1_800_000_000_000;

export const participantPath = (uid: string): string => `tableAssignmentParticipants/${SID}_${uid}`;
export const rosterPath = (uid: string): string => `tableAssignmentRoster/${SID}_${uid}`;
export const counterPath = `tableAssignmentCounters/${SID}`;
export const seatPath = (tableIndex: number): string => `tableAssignmentSeats/${SID}_${tableIndex}`;

/** Firestore serialises conflicting transactions (it re-runs the loser); a mutex gives the same outcome. */
export function serialized(fake: FakeFirestore): Firestore {
	const firestore = fake.asFirestore();
	const original = firestore.runTransaction.bind(firestore);
	let chain: Promise<unknown> = Promise.resolve();
	firestore.runTransaction = ((fn: Parameters<typeof original>[0]) => {
		const run = chain.then(() => original(fn));
		chain = run.catch(() => undefined);

		return run;
	}) as typeof firestore.runTransaction;

	return firestore;
}

export async function expectRefusal(
	promise: Promise<unknown>,
	code: string,
	reason?: string,
): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(TablesError);
	await expect(promise).rejects.toMatchObject(reason ? { code, reason } : { code });
}

export function seedSession(
	fake: FakeFirestore,
	overrides: Partial<TableAssignment> = {},
	settings: Partial<TableAssignment['settings']> = {},
): void {
	fake.seed(`tableAssignments/${SID}`, {
		tableAssignmentId: SID,
		hostUid: HOST,
		title: 'Town hall',
		mode: 'ranked',
		status: 'registrationOpen',
		settings: { tableSize: 2, balanceTolerance: 0.3, ...settings },
		createdAt: NOW,
		lastUpdate: NOW,
		...overrides,
	});
}

export function seedTopics(fake: FakeFirestore, topicIds: readonly string[]): void {
	topicIds.forEach((topicId, order) => {
		const topic: TableAssignmentTopic = {
			topicId,
			sessionId: SID,
			title: `Title ${topicId}`,
			order,
		};
		fake.seed(`tableAssignmentTopics/${topicId}`, topic);
	});
}

/** A registration as the callables leave it: private record, name card. The count is seeded apart. */
export function seedRegistration(
	fake: FakeFirestore,
	uid: string,
	extra: Partial<TableAssignmentParticipant> = {},
): void {
	const participant: TableAssignmentParticipant = {
		sessionId: SID,
		uid,
		fullName: `Name ${uid}`,
		preferences: [],
		registeredAt: NOW,
		...extra,
	};
	fake.seed(participantPath(uid), participant);
	fake.seed(rosterPath(uid), rosterEntryFrom(participant));
}

export function seedCounter(fake: FakeFirestore, registered: number): void {
	fake.seed(counterPath, { sessionId: SID, registered });
}

export function seedPublishedRun(fake: FakeFirestore, runId: string, memberUids: string[]): void {
	const run: Partial<TableAssignmentRun> = {
		runId,
		sessionId: SID,
		status: 'published',
		tables: [
			{ index: 0, topicId: 'a', memberUids, stats: { n: 0, mean: [], sd: [], deviation: 0 } },
		],
	};
	fake.seed(`tableAssignmentRuns/${runId}`, run);
}
