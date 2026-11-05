import type { Firestore } from 'firebase-admin/firestore';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { createSession } from '../fn_tablesCreateSession';
import { saveTopics } from '../fn_tablesSaveTopics';
import { saveSettings } from '../fn_tablesSaveSettings';
import { setStatus } from '../fn_tablesSetStatus';
import { register } from '../fn_tablesRegister';
import { savePreferences } from '../fn_tablesSavePreferences';
import { joinTable } from '../fn_tablesJoinTable';
import { computePreview } from '../fn_tablesComputePreview';
import { publishRun } from '../fn_tablesPublishRun';
import { buildDirectLayout } from '../directLayout';
import { TablesError, toHttpsError } from '../tablesErrors';

const HOST = 'host-1';
const SID = 'session-1';
const NOW = 1_800_000_000_000;

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(TablesError);
	await expect(promise).rejects.toMatchObject({ code });
}

/** Firestore serialises conflicting transactions (it re-runs the loser); a mutex gives the same outcome. */
function serialized(fake: FakeFirestore): Firestore {
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

function seedSession(
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
		settings: { tableSize: 7, balanceTolerance: 0.3, ...settings },
		createdAt: NOW,
		lastUpdate: NOW,
		...overrides,
	});
}

function seedTopics(
	fake: FakeFirestore,
	specs: Array<Partial<TableAssignmentTopic> & { topicId: string }>,
): void {
	specs.forEach((spec, order) => {
		fake.seed(`tableAssignmentTopics/${spec.topicId}`, {
			sessionId: SID,
			title: spec.topicId,
			order,
			...spec,
		});
	});
}

function seedParticipant(
	fake: FakeFirestore,
	uid: string,
	extra: Partial<TableAssignmentParticipant> = {},
): void {
	fake.seed(`tableAssignmentParticipants/${SID}_${uid}`, {
		sessionId: SID,
		uid,
		fullName: `Name ${uid}`,
		preferences: [],
		registeredAt: NOW,
		...extra,
	});
}

describe('tablesCreateSession', () => {
	it('refuses an anonymous caller', async () => {
		const fake = new FakeFirestore();
		await expectCode(
			createSession(
				fake.asFirestore(),
				{ uid: 'anon', isAnonymous: true },
				{ title: 'T', mode: 'direct' },
			),
			'permission-denied',
		);
		expect(fake.list('tableAssignments')).toHaveLength(0);
	});

	it('creates a draft with the contract defaults, host = caller', async () => {
		const fake = new FakeFirestore();
		const { session } = await createSession(
			fake.asFirestore(),
			{ uid: HOST, isAnonymous: false },
			{ title: '  Town hall  ', mode: 'ranked', settings: { tableSize: 5 } },
			NOW,
		);
		expect(session).toMatchObject({
			hostUid: HOST,
			title: 'Town hall',
			mode: 'ranked',
			status: 'draft',
			createdAt: NOW,
			settings: { tableSize: 5, balanceTolerance: 0.3 },
		});
		expect(fake.read(`tableAssignments/${session.tableAssignmentId}`)).toEqual(session);
	});

	it('validates input before touching Firestore', async () => {
		const fake = new FakeFirestore();
		const host = { uid: HOST, isAnonymous: false };
		await expectCode(
			createSession(fake.asFirestore(), host, { title: '', mode: 'ranked' }),
			'invalid-argument',
		);
		await expectCode(
			createSession(fake.asFirestore(), host, { title: 'T', mode: 'weird' as 'direct' }),
			'invalid-argument',
		);
		await expectCode(
			createSession(fake.asFirestore(), host, {
				title: 'T',
				mode: 'direct',
				settings: { tableSize: 99 },
			}),
			'invalid-argument',
		);
		expect(fake.list('tableAssignments')).toHaveLength(0);
	});
});

describe('host-only callables', () => {
	it('lets a non-host neither save topics, settings, status, preview nor publish', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		const fs = fake.asFirestore();
		await expectCode(
			saveTopics(fs, 'other', { sessionId: SID, topics: [{ title: 'A' }] }),
			'permission-denied',
		);
		await expectCode(
			saveSettings(fs, 'other', { sessionId: SID, tableSize: 5 }),
			'permission-denied',
		);
		await expectCode(
			setStatus(fs, 'other', { sessionId: SID, status: 'registrationOpen' }),
			'permission-denied',
		);
		await expectCode(computePreview(fs, 'other', { sessionId: SID }), 'permission-denied');
		await expectCode(publishRun(fs, 'other', { sessionId: SID, runId: 'r' }), 'permission-denied');
		expect(fake.list('tableAssignmentTopics')).toHaveLength(0);
	});

	it('reports a missing session as not-found', async () => {
		const fake = new FakeFirestore();
		await expectCode(
			saveTopics(fake.asFirestore(), HOST, { sessionId: 'nope', topics: [] }),
			'not-found',
		);
	});
});

describe('tablesSaveTopics', () => {
	it('replaces the topics, keeps given ids, deletes the rest, stores order', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		seedTopics(fake, [{ topicId: 'keep' }, { topicId: 'drop' }]);
		const { topicIds } = await saveTopics(fake.asFirestore(), HOST, {
			sessionId: SID,
			topics: [
				{ title: 'New one', sourceStatementId: 'st-1', consensus: 0.4 },
				{ topicId: 'keep', title: 'Kept', maxTables: 2 },
			],
		});
		expect(topicIds).toHaveLength(2);
		expect(topicIds[1]).toBe('keep');
		expect(fake.read('tableAssignmentTopics/drop')).toBeUndefined();
		expect(fake.read(`tableAssignmentTopics/${topicIds[0]}`)).toMatchObject({
			sessionId: SID,
			title: 'New one',
			sourceStatementId: 'st-1',
			consensus: 0.4,
			order: 0,
		});
		expect(fake.read('tableAssignmentTopics/keep')).toMatchObject({
			title: 'Kept',
			maxTables: 2,
			order: 1,
		});
	});

	it('refuses once registration has opened and a topicId of another session', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationOpen' });
		await expectCode(
			saveTopics(fake.asFirestore(), HOST, { sessionId: SID, topics: [{ title: 'A' }] }),
			'failed-precondition',
		);
		seedSession(fake, { status: 'draft' });
		await expectCode(
			saveTopics(fake.asFirestore(), HOST, {
				sessionId: SID,
				topics: [{ topicId: 'foreign', title: 'A' }],
			}),
			'invalid-argument',
		);
	});
});

describe('tablesSaveSettings', () => {
	it('merges settings, removes the position question with null', async () => {
		const fake = new FakeFirestore();
		seedSession(
			fake,
			{ status: 'draft' },
			{ positionQuestion: { label: 'L', poleA: 'a', poleB: 'b' } },
		);
		const withTolerance = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			balanceTolerance: 0.5,
			tableSize: 5,
		});
		expect(withTolerance.settings).toMatchObject({ tableSize: 5, balanceTolerance: 0.5 });
		expect(withTolerance.settings.positionQuestion).toBeDefined();
		const removed = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			positionQuestion: null,
		});
		expect(removed.settings.positionQuestion).toBeUndefined();
		await expectCode(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, tableSize: 1 }),
			'invalid-argument',
		);
	});
});

describe('tablesSetStatus', () => {
	it('walks draft -> registrationOpen -> registrationClosed -> ended and nothing else', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		seedTopics(fake, [{ topicId: 't1' }]);
		const fs = fake.asFirestore();
		await expectCode(
			setStatus(fs, HOST, { sessionId: SID, status: 'registrationClosed' }),
			'failed-precondition',
		);
		await expect(
			setStatus(fs, HOST, { sessionId: SID, status: 'registrationOpen' }),
		).resolves.toEqual({
			status: 'registrationOpen',
		});
		await expectCode(
			setStatus(fs, HOST, { sessionId: SID, status: 'ended' }),
			'failed-precondition',
		);
		await setStatus(fs, HOST, { sessionId: SID, status: 'registrationClosed' });
		await expectCode(
			setStatus(fs, HOST, { sessionId: SID, status: 'registrationOpen' }),
			'failed-precondition',
		);
		await setStatus(fs, HOST, { sessionId: SID, status: 'ended' });
		await expectCode(
			setStatus(fs, HOST, { sessionId: SID, status: 'ended' }),
			'failed-precondition',
		);
		await expectCode(
			setStatus(fs, HOST, { sessionId: SID, status: 'published' as 'ended' }),
			'invalid-argument',
		);
	});

	it('will not open registration with no topics', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		await expectCode(
			setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'registrationOpen' }),
			'failed-precondition',
		);
	});
});

describe('tablesRegister and tablesSavePreferences', () => {
	it('registers with a trimmed name, and registering again only renames', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedTopics(fake, [{ topicId: 't1' }, { topicId: 't2' }]);
		const fs = fake.asFirestore();
		const first = await register(fs, 'u1', { sessionId: SID, fullName: '  Dana Levi ' }, NOW);
		expect(first.participant).toEqual({
			sessionId: SID,
			uid: 'u1',
			fullName: 'Dana Levi',
			preferences: [],
			registeredAt: NOW,
		});
		await savePreferences(fs, 'u1', { sessionId: SID, preferences: ['t2'], position: 30 });
		const again = await register(fs, 'u1', { sessionId: SID, fullName: 'Dana L.' }, NOW + 5);
		expect(again.participant).toMatchObject({
			fullName: 'Dana L.',
			preferences: ['t2'],
			position: 30,
			registeredAt: NOW,
		});
	});

	it('rejects short names, long names and a closed registration', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		const fs = fake.asFirestore();
		await expectCode(register(fs, 'u1', { sessionId: SID, fullName: ' a ' }), 'invalid-argument');
		await expectCode(
			register(fs, 'u1', { sessionId: SID, fullName: 'x'.repeat(101) }),
			'invalid-argument',
		);
		seedSession(fake, { status: 'registrationClosed' });
		await expectCode(
			register(fs, 'u1', { sessionId: SID, fullName: 'Dana Levi' }),
			'failed-precondition',
		);
		seedSession(fake, { status: 'published' });
		await expect(
			register(fs, 'u1', { sessionId: SID, fullName: 'Dana Levi' }),
		).resolves.toBeDefined();
	});

	it('saves up to three distinct topics of the session, position optional (not specified, not the middle)', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedTopics(fake, [{ topicId: 't1' }, { topicId: 't2' }, { topicId: 't3' }, { topicId: 't4' }]);
		seedParticipant(fake, 'u1', { position: 80 });
		const fs = fake.asFirestore();
		const { participant } = await savePreferences(fs, 'u1', {
			sessionId: SID,
			preferences: ['t3', 't2', 't1'],
		});
		expect(participant.preferences).toEqual(['t3', 't2', 't1']);
		expect(participant.position).toBeUndefined();
		expect('position' in (fake.read(`tableAssignmentParticipants/${SID}_u1`) ?? {})).toBe(false);

		await expectCode(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: ['t1', 't2', 't3', 't4'] }),
			'invalid-argument',
		);
		await expectCode(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: ['t1', 't1'] }),
			'invalid-argument',
		);
		await expectCode(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: ['other-session-topic'] }),
			'invalid-argument',
		);
		await expectCode(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: ['t1'], position: 101 }),
			'invalid-argument',
		);
		await expect(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: [], position: 0 }),
		).resolves.toMatchObject({
			participant: { position: 0 },
		});
	});

	it('needs a registration first and an open registration', async () => {
		const fake = new FakeFirestore();
		seedSession(fake);
		seedTopics(fake, [{ topicId: 't1' }]);
		const fs = fake.asFirestore();
		await expectCode(
			savePreferences(fs, 'ghost', { sessionId: SID, preferences: ['t1'] }),
			'failed-precondition',
		);
		seedParticipant(fake, 'u1');
		seedSession(fake, { status: 'registrationClosed' });
		await expectCode(
			savePreferences(fs, 'u1', { sessionId: SID, preferences: ['t1'] }),
			'failed-precondition',
		);
	});
});

describe('tablesJoinTable (direct mode)', () => {
	function seedDirect(tableSize: number): FakeFirestore {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct' }, { tableSize });
		seedTopics(fake, [{ topicId: 'a', maxTables: 2 }, { topicId: 'b' }]);

		return fake;
	}

	it('indexes tables globally across topics in topic order', () => {
		const layout = buildDirectLayout([
			{ topicId: 'a', sessionId: SID, title: 'a', order: 0, maxTables: 2 },
			{ topicId: 'b', sessionId: SID, title: 'b', order: 1 },
		]);
		expect(layout).toEqual([
			{ tableIndex: 0, topicId: 'a' },
			{ tableIndex: 1, topicId: 'a' },
			{ tableIndex: 2, topicId: 'b' },
		]);
	});

	it('seats a participant, returns the topic, and a move frees the old seat', async () => {
		const fake = seedDirect(2);
		seedParticipant(fake, 'u1');
		const fs = fake.asFirestore();
		await expect(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 1 })).resolves.toEqual({
			tableIndex: 1,
			topicId: 'a',
		});
		expect(fake.read(`tableAssignmentSeats/${SID}_1`)).toMatchObject({ count: 1 });
		await expect(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 2 })).resolves.toEqual({
			tableIndex: 2,
			topicId: 'b',
		});
		expect(fake.read(`tableAssignmentSeats/${SID}_1`)).toMatchObject({ count: 0 });
		expect(fake.read(`tableAssignmentSeats/${SID}_2`)).toMatchObject({ count: 1 });
		expect(fake.read(`tableAssignmentParticipants/${SID}_u1`)).toMatchObject({
			chosenTableIndex: 2,
		});
		// Joining the table you are already at is a no-op, not a second seat.
		await joinTable(fs, 'u1', { sessionId: SID, tableIndex: 2 });
		expect(fake.read(`tableAssignmentSeats/${SID}_2`)).toMatchObject({ count: 1 });
	});

	it('refuses a full table and keeps the old seat', async () => {
		const fake = seedDirect(2);
		['u1', 'u2', 'u3'].forEach((u) => seedParticipant(fake, u));
		const fs = fake.asFirestore();
		await joinTable(fs, 'u1', { sessionId: SID, tableIndex: 0 });
		await joinTable(fs, 'u2', { sessionId: SID, tableIndex: 0 });
		await joinTable(fs, 'u3', { sessionId: SID, tableIndex: 1 });
		await expectCode(joinTable(fs, 'u3', { sessionId: SID, tableIndex: 0 }), 'failed-precondition');
		expect(fake.read(`tableAssignmentParticipants/${SID}_u3`)).toMatchObject({
			chosenTableIndex: 1,
		});
		expect(fake.read(`tableAssignmentSeats/${SID}_1`)).toMatchObject({ count: 1 });
	});

	it('never exceeds the table size when two join the last seat at once', async () => {
		const fake = seedDirect(2);
		['u1', 'u2', 'u3'].forEach((u) => seedParticipant(fake, u));
		const fs = serialized(fake);
		await joinTable(fs, 'u1', { sessionId: SID, tableIndex: 0 });
		const results = await Promise.allSettled([
			joinTable(fs, 'u2', { sessionId: SID, tableIndex: 0 }),
			joinTable(fs, 'u3', { sessionId: SID, tableIndex: 0 }),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const failed = results.find((r) => r.status === 'rejected');
		expect(failed).toMatchObject({ status: 'rejected' });
		expect((failed as { reason: unknown }).reason).toMatchObject({
			code: 'failed-precondition',
			reason: 'table-full',
		});
		expect(fake.read(`tableAssignmentSeats/${SID}_0`)).toMatchObject({ count: 2 });
		const seated = ['u1', 'u2', 'u3'].filter(
			(u) => fake.read(`tableAssignmentParticipants/${SID}_${u}`)?.chosenTableIndex === 0,
		);
		expect(seated).toHaveLength(2);
	});

	it('refuses ranked sessions, unregistered callers, unknown tables and closed registration', async () => {
		const fake = seedDirect(2);
		const fs = fake.asFirestore();
		await expectCode(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 0 }), 'failed-precondition');
		seedParticipant(fake, 'u1');
		await expectCode(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 3 }), 'invalid-argument');
		await expectCode(joinTable(fs, 'u1', { sessionId: SID, tableIndex: -1 }), 'invalid-argument');
		seedSession(fake, { mode: 'direct', status: 'registrationClosed' });
		await expectCode(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 0 }), 'failed-precondition');
		seedSession(fake, { mode: 'ranked' });
		await expectCode(joinTable(fs, 'u1', { sessionId: SID, tableIndex: 0 }), 'failed-precondition');
	});
});

describe('tablesComputePreview and tablesPublishRun (ranked mode)', () => {
	function seedRanked(): FakeFirestore {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4, balanceTolerance: 0.5 });
		seedTopics(fake, [{ topicId: 'alpha', maxTables: 3 }, { topicId: 'beta' }]);
		for (let i = 0; i < 8; i++) {
			seedParticipant(fake, `u${i}`, {
				preferences: i % 2 === 0 ? ['alpha', 'beta'] : ['beta'],
				...(i < 6 ? { position: i * 20 } : {}),
			});
		}

		return fake;
	}

	it('maps registrants to the engine, stores a ready run with metrics, seed and hash', async () => {
		const fake = seedRanked();
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID, seed: 42 },
			NOW,
		);
		const run = fake.read(`tableAssignmentRuns/${runId}`) as unknown as TableAssignmentRun;
		expect(run).toMatchObject({ runId, sessionId: SID, seed: 42, status: 'ready', createdAt: NOW });
		expect(run.inputHash).toMatch(/^[0-9a-f]{64}$/);
		const seated = run.tables.flatMap((t) => t.memberUids).sort();
		expect(seated).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
		expect(run.tables.every((t) => t.memberUids.length <= 4)).toBe(true);
		expect(new Set(run.tables.map((t) => t.topicId)).size).toBeGreaterThan(0);
		// 8 registrants, 6 with a position: the engine counted exactly those.
		expect(run.metrics.population.n).toBe(6);
		expect(run.metrics.balance.tolerance).toBe(0.5);
		const prefs = run.metrics.preferences;
		expect(prefs.byRank.reduce((a, b) => a + b, 0) + prefs.none + prefs.noPreference).toBe(8);
		expect(prefs.maxScore).toBeGreaterThan(0);
		// Positions are never copied into the run: only uids and aggregate stats.
		expect(JSON.stringify(run.tables)).not.toContain('position');
	});

	it('suppresses position mean/sd on tables with fewer than 3 known positions', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 5, balanceTolerance: 5 });
		seedTopics(fake, [
			{ topicId: 'alpha', maxTables: 1 },
			{ topicId: 'beta', maxTables: 1 },
		]);
		// alpha table: 5 seats, 3 known positions; beta table: 5 seats, 2 known positions.
		for (let i = 0; i < 10; i++) {
			const known = i < 5 ? i < 3 : i < 7;
			seedParticipant(fake, `u${i}`, {
				preferences: [i < 5 ? 'alpha' : 'beta'],
				...(known ? { position: 10 + i * 5 } : {}),
			});
		}
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID, seed: 1 },
			NOW,
		);
		const run = fake.read(`tableAssignmentRuns/${runId}`) as unknown as TableAssignmentRun;
		const small = run.tables.filter((t) => t.stats.n < 3);
		const big = run.tables.filter((t) => t.stats.n >= 3);
		expect(small.length).toBeGreaterThan(0);
		expect(big.length).toBeGreaterThan(0);
		small.forEach((t) => expect(t.stats).toMatchObject({ mean: [], sd: [] }));
		big.forEach((t) => {
			expect(t.stats.mean).toHaveLength(1);
			expect(t.stats.sd).toHaveLength(1);
		});
		expect(run.metrics.population.n).toBe(5);
		expect(run.metrics.population.mean).toHaveLength(1);
	});

	it('is reproducible for a seed and supersedes the older ready run', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID, seed: 7 }, NOW);
		const second = await computePreview(fs, HOST, { sessionId: SID, seed: 7 }, NOW + 1);
		const a = fake.read(`tableAssignmentRuns/${first.runId}`) as unknown as TableAssignmentRun;
		const b = fake.read(`tableAssignmentRuns/${second.runId}`) as unknown as TableAssignmentRun;
		expect(a.status).toBe('superseded');
		expect(b.status).toBe('ready');
		expect(b.tables).toEqual(a.tables);
		expect(b.inputHash).toBe(a.inputHash);
	});

	it('uses Date.now() as the seed when the request has none', async () => {
		const fake = seedRanked();
		const { runId } = await computePreview(fake.asFirestore(), HOST, { sessionId: SID }, NOW);
		expect(fake.read(`tableAssignmentRuns/${runId}`)).toMatchObject({ seed: NOW });
	});

	it('answers an engine refusal as failed-precondition with the engine message', async () => {
		const fake = seedRanked();
		// 8 people, one topic capped at 1 table of 4 seats: not enough room.
		seedTopics(fake, [{ topicId: 'alpha', maxTables: 1 }]);
		fake.docs.delete('tableAssignmentTopics/beta');
		await expect(
			computePreview(fake.asFirestore(), HOST, { sessionId: SID }),
		).rejects.toMatchObject({
			code: 'failed-precondition',
			message: expect.stringContaining('Topic caps'),
		});
	});

	it('refuses direct sessions, drafts and an empty room', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		seedSession(fake, { mode: 'direct', status: 'registrationClosed' });
		await expectCode(computePreview(fs, HOST, { sessionId: SID }), 'failed-precondition');
		seedSession(fake, { status: 'draft' });
		await expectCode(computePreview(fs, HOST, { sessionId: SID }), 'failed-precondition');
		const empty = new FakeFirestore();
		seedSession(empty, { status: 'registrationClosed' });
		seedTopics(empty, [{ topicId: 'alpha' }]);
		await expectCode(
			computePreview(empty.asFirestore(), HOST, { sessionId: SID }),
			'failed-precondition',
		);
	});

	it('publishes a fresh run: session points at it, older published run is superseded', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID, seed: 1 }, NOW);
		await publishRun(fs, HOST, { sessionId: SID, runId: first.runId }, NOW + 10);
		expect(fake.read(`tableAssignments/${SID}`)).toMatchObject({
			status: 'published',
			publishedRunId: first.runId,
		});
		expect(fake.read(`tableAssignmentRuns/${first.runId}`)).toMatchObject({
			status: 'published',
			publishedAt: NOW + 10,
		});

		const second = await computePreview(fs, HOST, { sessionId: SID, seed: 2 }, NOW + 20);
		await publishRun(fs, HOST, { sessionId: SID, runId: second.runId }, NOW + 30);
		expect(fake.read(`tableAssignmentRuns/${first.runId}`)).toMatchObject({ status: 'superseded' });
		expect(fake.read(`tableAssignmentRuns/${second.runId}`)).toMatchObject({ status: 'published' });
		expect(fake.read(`tableAssignments/${SID}`)).toMatchObject({ publishedRunId: second.runId });
	});

	it('publishing the already-published run again changes nothing', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 1 }, NOW);
		await publishRun(fs, HOST, { sessionId: SID, runId }, NOW + 10);
		await expect(publishRun(fs, HOST, { sessionId: SID, runId }, NOW + 99)).resolves.toEqual({
			publishedRunId: runId,
		});
		expect(fake.read(`tableAssignmentRuns/${runId}`)).toMatchObject({ publishedAt: NOW + 10 });
	});

	it('rejects a stale run once preferences, positions or settings move on', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 1 }, NOW);

		seedParticipant(fake, 'u0', { preferences: ['beta'], position: 5 });
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'stale-run',
		});
		expect(fake.read(`tableAssignments/${SID}`)?.publishedRunId).toBeUndefined();
		expect(fake.read(`tableAssignmentRuns/${runId}`)).toMatchObject({ status: 'ready' });

		// A new preview over the new input publishes fine; then a new registrant makes it stale again.
		const fresh = await computePreview(fs, HOST, { sessionId: SID, seed: 1 }, NOW + 1);
		seedParticipant(fake, 'late', {});
		await expect(
			publishRun(fs, HOST, { sessionId: SID, runId: fresh.runId }),
		).rejects.toMatchObject({ reason: 'stale-run' });
		fake.docs.delete(`tableAssignmentParticipants/${SID}_late`);
		await expect(
			publishRun(fs, HOST, { sessionId: SID, runId: fresh.runId }),
		).resolves.toBeDefined();

		// Tolerance is part of the input.
		const another = await computePreview(fs, HOST, { sessionId: SID, seed: 3 }, NOW + 2);
		const session = fake.read(`tableAssignments/${SID}`) as unknown as TableAssignment;
		fake.seed(`tableAssignments/${SID}`, {
			...session,
			settings: { ...session.settings, balanceTolerance: 0.1 },
		});
		await expect(
			publishRun(fs, HOST, { sessionId: SID, runId: another.runId }),
		).rejects.toMatchObject({ reason: 'stale-run' });
	});

	it('refuses a run that is not ready or belongs to another session', async () => {
		const fake = seedRanked();
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID, seed: 1 }, NOW);
		await computePreview(fs, HOST, { sessionId: SID, seed: 2 }, NOW + 1);
		await expectCode(
			publishRun(fs, HOST, { sessionId: SID, runId: first.runId }),
			'failed-precondition',
		);
		fake.seed('tableAssignmentRuns/foreign', {
			runId: 'foreign',
			sessionId: 'other',
			status: 'ready',
			inputHash: 'x',
		});
		await expectCode(publishRun(fs, HOST, { sessionId: SID, runId: 'foreign' }), 'not-found');
		await expectCode(publishRun(fs, HOST, { sessionId: SID, runId: 'missing' }), 'not-found');
	});
});

describe('toHttpsError', () => {
	it('passes refusals through with code and reason, hides everything else', () => {
		const refusal = toHttpsError(new TablesError('failed-precondition', 'full', 'table-full'), {
			operation: 't',
		});
		expect(refusal.code).toBe('failed-precondition');
		expect(refusal.details).toEqual({ reason: 'table-full' });
		const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const unknown = toHttpsError(new Error('secret db detail'), { operation: 't', userId: 'u' });
		spy.mockRestore();
		expect(unknown.code).toBe('internal');
		expect(unknown.message).not.toContain('secret');
	});
});
