import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * The reads behind a supervisor's scope, with Firestore and the sys-admin
 * flag replaced by in-memory stubs — the same technique classes.test.ts uses.
 */

type SchoolDoc = Record<string, unknown>;

const schools = new Map<string, SchoolDoc>();
let adminUids = new Set<string>();

jest.mock('../../utils/httpAuth', () => ({
	isSystemAdmin: async (uid: string) => adminUids.has(uid),
}));

jest.mock('../../db', () => ({
	db: {
		collection: (name: string) => ({
			doc: (id: string) => ({
				get: async () => ({ data: () => (name === 'agoraSchools' ? schools.get(id) : undefined) }),
			}),
			where: (field: string, _op: string, value: unknown) => ({
				get: async () => ({
					docs: [...schools.values()]
						.filter((school) => {
							if (field === 'status') return school.status === value;
							const [root, uid] = field.split('.');
							const map = school[root] as Record<string, boolean> | undefined;

							return map?.[uid] === value;
						})
						.map((school) => ({ data: () => school })),
				}),
			}),
		}),
	},
}));

import { requireScope, supervisedSchools, supervisorScopeFor } from '../supervisorScope';
import { toSupervisorSessionRow } from '../consoleShapes';
import {
	AgoraSession,
	AgoraSessionOutcome,
	AgoraSessionStatus,
	AgoraStage,
} from '@freedi/shared-types';

describe('supervisorScopeFor', () => {
	beforeEach(() => {
		schools.clear();
		adminUids = new Set(['root']);
		schools.set('s1', {
			schoolId: 's1',
			name: 'Alpha',
			status: 'active',
			supervisorMap: { sup: true, narrow: true },
			supervisorScopes: { narrow: { teacherIds: ['t1'] } },
		});
		schools.set('s2', {
			schoolId: 's2',
			name: 'Beta',
			status: 'archived',
			supervisorMap: { sup: true },
		});
	});

	it('gives the sys-admin admin scope, school or no school', async () => {
		expect((await supervisorScopeFor('root', 's1')).scope).toEqual({ kind: 'admin' });
		expect((await supervisorScopeFor('root', 'missing')).scope).toEqual({ kind: 'admin' });
	});

	it('gives an attached supervisor the whole school', async () => {
		const { scope, school } = await supervisorScopeFor('sup', 's1');
		expect(scope).toEqual({ kind: 'all', schoolId: 's1' });
		expect(school?.name).toBe('Alpha');
	});

	it('narrows to the listed teachers', async () => {
		const { scope } = await supervisorScopeFor('narrow', 's1');
		expect(scope?.kind).toBe('teachers');
	});

	it('is null for a plain teacher, a missing school, and an archived one', async () => {
		expect((await supervisorScopeFor('teacher', 's1')).scope).toBeNull();
		expect((await supervisorScopeFor('sup', 'missing')).scope).toBeNull();
		expect((await supervisorScopeFor('sup', 's2')).scope).toBeNull();
	});

	it('lists the active schools a caller supervises, all of them for the sys-admin', async () => {
		schools.set('s3', { schoolId: 's3', name: 'Gamma', status: 'active', supervisorMap: {} });
		expect((await supervisedSchools('sup', false)).map((school) => school.schoolId)).toEqual([
			's1',
		]);
		expect((await supervisedSchools('root', true)).map((school) => school.schoolId)).toEqual([
			's1',
			's3',
		]);
		expect(await supervisedSchools('teacher', false)).toEqual([]);
	});

	it('requireScope refuses null with permission-denied', () => {
		expect(() => requireScope(null)).toThrow(/do not supervise/);
		expect(requireScope({ kind: 'admin' })).toEqual({ kind: 'admin' });
	});
});

describe('toSupervisorSessionRow', () => {
	const NOW = 1_756_000_000_000;
	const HOUR = 60 * 60 * 1000;

	function session(overrides: Partial<AgoraSession> = {}): AgoraSession {
		return {
			sessionId: 'sess-1',
			code: '12345',
			teacherId: 't1',
			topicPackageId: 'topic-1',
			challengeQuestionId: 'q1',
			deviceMode: 'individual',
			teamSizeMax: 1,
			stage: AgoraStage.results,
			roundNumber: 0,
			participantCount: 9,
			status: AgoraSessionStatus.live,
			createdAt: NOW,
			lastUpdate: NOW,
			...overrides,
		} as AgoraSession;
	}

	it('projects the span, score and outcome and nothing private', () => {
		const row = toSupervisorSessionRow(
			session({
				classId: 'c1',
				stageState: { a: { openedAt: NOW } },
				classScore: {
					maxConsensus: 0,
					personalPointsSum: 0,
					avgPlausibility: 0,
					total: 72,
					threshold: 60,
					success: true,
					outcome: AgoraSessionOutcome.success,
					healthMetricOutcomes: [],
					debrief: { whatWentWell: ['secret'], whatToTryNextTime: [], encouragement: '' },
					computedAt: NOW + HOUR,
				},
			}),
		);
		expect(row).toEqual({
			sessionId: 'sess-1',
			topicPackageId: 'topic-1',
			teacherId: 't1',
			classId: 'c1',
			createdAt: NOW,
			status: AgoraSessionStatus.live,
			stage: AgoraStage.results,
			participantCount: 9,
			startedAt: NOW,
			durationMs: HOUR,
			playedAt: NOW + HOUR,
			classScoreTotal: 72,
			outcome: AgoraSessionOutcome.success,
		});
		expect(Object.keys(row)).not.toContain('code');
		expect(JSON.stringify(row)).not.toContain('secret');
	});

	it('leaves the optional fields off a guest game that only ended', () => {
		const row = toSupervisorSessionRow(
			session({ status: AgoraSessionStatus.ended, lastUpdate: NOW + 30 * 60_000 }),
		);
		expect(row.classId).toBeUndefined();
		expect(row.classScoreTotal).toBeUndefined();
		expect(row.outcome).toBeUndefined();
		expect(row.playedAt).toBe(NOW + 30 * 60_000);
		expect(row.durationMs).toBe(30 * 60_000);
	});
});
