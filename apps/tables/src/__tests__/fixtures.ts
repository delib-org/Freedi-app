import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';

export const SESSION_ID = 'session-1';
export const HOST_UID = 'host-1';
export const NOW = 1_700_000_000_000;

export function makeSession(patch: Partial<TableAssignment> = {}): TableAssignment {
	return {
		tableAssignmentId: SESSION_ID,
		hostUid: HOST_UID,
		title: 'Town hall',
		mode: 'ranked',
		status: 'draft',
		settings: { tableSize: 7, balanceTolerance: 0.3 },
		createdAt: NOW,
		lastUpdate: NOW,
		...patch,
	};
}

export function makeTopic(
	topicId: string,
	order: number,
	patch: Partial<TableAssignmentTopic> = {},
): TableAssignmentTopic {
	return { topicId, sessionId: SESSION_ID, title: `Topic ${topicId}`, order, ...patch };
}

export function makeParticipant(
	uid: string,
	patch: Partial<TableAssignmentParticipant> = {},
): TableAssignmentParticipant {
	return {
		sessionId: SESSION_ID,
		uid,
		fullName: `Name ${uid}`,
		preferences: [],
		registeredAt: NOW,
		...patch,
	};
}

export function makeRosterEntry(
	uid: string,
	patch: Partial<TableAssignmentRosterEntry> = {},
): TableAssignmentRosterEntry {
	return {
		sessionId: SESSION_ID,
		uid,
		fullName: `Name ${uid}`,
		nameKey: `name ${uid}`,
		registeredAt: NOW,
		hasPreferences: false,
		...patch,
	};
}

export function makeRun(patch: Partial<TableAssignmentRun> = {}): TableAssignmentRun {
	return {
		runId: 'run-1',
		sessionId: SESSION_ID,
		seed: 1,
		status: 'ready',
		tables: [
			{
				index: 0,
				topicId: 'a',
				memberUids: ['u1', 'u2'],
				stats: { n: 2, mean: [0.5], sd: [0.1], deviation: 0.1 },
			},
			{
				index: 1,
				topicId: 'b',
				memberUids: ['u3'],
				stats: { n: 1, mean: [0.4], sd: [0], deviation: 0.2 },
			},
		],
		metrics: {
			population: { n: 3, mean: [0.45], sd: [0.1] },
			balance: { max: 0.2, mean: 0.15, tolerance: 0.3, withinTolerance: true },
			preferences: { byRank: [2, 1, 0], none: 0, noPreference: 0, score: 8, maxScore: 9 },
		},
		inputHash: 'hash',
		createdAt: NOW,
		...patch,
	};
}
