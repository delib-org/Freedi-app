import crypto from 'crypto';
import { assignTables } from '@freedi/table-assignment';
import type { Assignment, Participant } from '@freedi/table-assignment';
import type { TableAssignmentRun, TablesComputePreviewRequest } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { ENGINE_SEED_RANGE } from '../constants';
import { computePreview } from '../fn_tablesComputePreview';
import { publishRun } from '../fn_tablesPublishRun';
import { removeParticipant } from '../fn_tablesRemoveParticipant';
import { coarseRunFields, publishedRunFields, scrubStoredRun } from '../runPrivacy';
import {
	HOST,
	NOW,
	SID,
	expectRefusal,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

const STOPS = [0, 25, 50, 75, 100];
const EMPTY_STATS = { n: 0, mean: [], sd: [], deviation: 0 };
const EMPTY_POPULATION = { n: 0, mean: [], sd: [] };
const TOLERANCE = 0.3;

function seedRoom(fake: FakeFirestore, positions: readonly number[]): void {
	seedSession(
		fake,
		{ status: 'registrationClosed' },
		{ tableSize: 4, balanceTolerance: TOLERANCE },
	);
	seedTopics(fake, ['a', 'b']);
	positions.forEach((position, i) => {
		seedRegistration(fake, `u${i}`, { preferences: ['a', 'b'], position });
	});
}

function runOf(fake: FakeFirestore, runId: string): TableAssignmentRun {
	return fake.read(`tableAssignmentRuns/${runId}`) as unknown as TableAssignmentRun;
}

function expectNoFigures(run: Pick<TableAssignmentRun, 'tables' | 'metrics'>): void {
	expect(run.metrics.population).toEqual(EMPTY_POPULATION);
	expect(run.metrics.balance).toMatchObject({ max: 0, mean: 0 });
	run.tables.forEach((table) => expect(table.stats).toEqual(EMPTY_STATS));
}

function assignmentOf(
	stats: Assignment['tables'][number]['stats'],
	population: Assignment['metrics']['population'],
): Pick<Assignment, 'tables' | 'metrics'> {
	return {
		tables: [{ index: 0, topicId: 'a', memberIds: ['u1', 'u2', 'u3', 'u4'], stats }],
		metrics: {
			population,
			balance: {
				max: stats.deviation,
				mean: stats.deviation,
				tolerance: TOLERANCE,
				withinTolerance: true,
			},
			preferences: { byRank: [4], none: 0, noPreference: 0, score: 12, maxScore: 12 },
		},
	};
}

/** Every number stored in the value, with its path; array indexes read as `[]`. */
function numbersIn(value: unknown, path = ''): Array<[string, number]> {
	if (typeof value === 'number') return [[path, value]];
	if (Array.isArray(value)) return value.flatMap((item) => numbersIn(item, `${path}[]`));
	if (typeof value === 'object' && value !== null) {
		return Object.entries(value).flatMap(([key, item]) => numbersIn(item, `${path}.${key}`));
	}

	return [];
}

describe('what a run stores about positions', () => {
	it('stores a closeness pill per table and no figure about positions', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 25, 50, 75, 100, 100, 50]);
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID },
			NOW,
			() => 3,
		);
		const run = runOf(fake, runId);

		expectNoFigures(run);
		run.tables.forEach((table) =>
			expect(['veryClose', 'close', 'far', 'notEnough']).toContain(table.closeness),
		);
		expect(run.metrics.hasEnoughPositions).toBe(true);
		expect(run.metrics.balance.tolerance).toBe(TOLERANCE);
		expect(typeof run.metrics.balance.withinTolerance).toBe('boolean');
	});

	it('keeps the input hash out of the run, where a client could guess the answers from it', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID },
			NOW,
			() => 3,
		);

		expect(runOf(fake, runId).inputHash).toBe('');
		expect(fake.read(`tableAssignmentRunInputs/${runId}`)?.inputHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('still refuses a stale preview now that the hash lives apart', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 3);

		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u0' });
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).rejects.toMatchObject({
			reason: 'stale-run',
		});
	});

	it('takes the pill and the pass or fail from the exact numbers', () => {
		const stats = { n: 4, mean: [50], sd: [20], deviation: 0.31 };
		const assignment = assignmentOf(stats, { n: 8, mean: [52], sd: [21] });
		const fields = coarseRunFields({
			...assignment,
			metrics: {
				...assignment.metrics,
				balance: { max: 0.31, mean: 0.31, tolerance: TOLERANCE, withinTolerance: false },
			},
		});

		expect(fields.metrics.balance.withinTolerance).toBe(false);
		expect(fields.tables[0].closeness).toBe('far');
	});

	it('says not enough for a table below three known positions, however far it is', () => {
		const fields = coarseRunFields(
			assignmentOf({ n: 2, mean: [40], sd: [10], deviation: 1.2 }, { n: 8, mean: [52], sd: [21] }),
		);

		expect(fields.tables[0].closeness).toBe('notEnough');
		expect(fields.metrics.hasEnoughPositions).toBe(true);
	});

	it('reports too few positions when fewer than three in the room gave one', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4 });
		seedTopics(fake, ['a', 'b']);
		seedRegistration(fake, 'u0', { preferences: ['a'], position: 100 });
		seedRegistration(fake, 'u1', { preferences: ['a'], position: 0 });
		['u2', 'u3', 'u4'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID },
			NOW,
			() => 1,
		);
		const run = runOf(fake, runId);

		expect(run.metrics.hasEnoughPositions).toBe(false);
		run.tables.forEach((table) => expect(table.closeness).toBe('notEnough'));
	});

	it('leaves participants only the seating once published', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 25, 50, 75, 100, 100, 50]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 3);

		await publishRun(fs, HOST, { sessionId: SID, runId }, NOW);
		const run = runOf(fake, runId);

		expectNoFigures(run);
		run.tables.forEach((table) => expect(table).not.toHaveProperty('closeness'));
		expect(run.metrics.preferences).toEqual({
			byRank: [],
			none: 0,
			noPreference: 0,
			score: 0,
			maxScore: 0,
		});
		expect(run.tables.flatMap((table) => table.memberUids)).toHaveLength(8);
	});

	it('keeps the seating and the pass or fail when the rest is dropped', () => {
		const stripped = publishedRunFields(
			coarseRunFields(
				assignmentOf(
					{ n: 5, mean: [50], sd: [20], deviation: 0.1 },
					{ n: 5, mean: [50], sd: [20] },
				),
			),
		);

		expect(stripped.tables[0]).toMatchObject({
			index: 0,
			topicId: 'a',
			memberUids: ['u1', 'u2', 'u3', 'u4'],
		});
		expect(stripped.metrics.balance).toMatchObject({ tolerance: TOLERANCE, withinTolerance: true });
	});
});

describe('no stored field depends on positions beyond the pill', () => {
	it('stores the same document for any positions that land on the same pill', () => {
		const first = coarseRunFields(
			assignmentOf({ n: 4, mean: [25], sd: [10], deviation: 0.05 }, { n: 8, mean: [30], sd: [20] }),
		);
		const second = coarseRunFields(
			assignmentOf(
				{ n: 3, mean: [75], sd: [40], deviation: 0.14 },
				{ n: 40, mean: [70], sd: [33] },
			),
		);

		expect(second).toEqual(first);
	});

	it('stores only the tolerance, table indexes, choice counts and zeros as numbers', () => {
		const people: Participant[] = Array.from({ length: 12 }, (_, i) => ({
			id: `u${i}`,
			side: [STOPS[i % STOPS.length]],
			preferences: [i % 2 === 0 ? 'a' : 'b'],
		}));
		const stored = coarseRunFields(
			assignTables(people, [{ id: 'a' }, { id: 'b' }], {
				tableSize: 4,
				balanceTolerance: TOLERANCE,
				seed: 5,
			}),
		);
		const figures = numbersIn(stored).filter(
			([path]) =>
				path !== '.metrics.balance.tolerance' &&
				path !== '.tables[].index' &&
				!path.startsWith('.metrics.preferences.'),
		);

		expect(figures.every(([, value]) => value === 0)).toBe(true);
	});

	it('keeps the seed out of everything stored, so the engine cannot be replayed', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 424242);

		expect(runOf(fake, runId)).not.toHaveProperty('seed');
		expect(JSON.stringify([...fake.docs.entries()])).not.toContain('424242');
		await publishRun(fs, HOST, { sessionId: SID, runId }, NOW);
		expect(runOf(fake, runId)).not.toHaveProperty('seed');
	});

	it('refuses a seed from the client, even a null one', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100]);
		for (const seed of [7, 0, null, 'x']) {
			await expectRefusal(
				computePreview(
					fake.asFirestore(),
					HOST,
					{ sessionId: SID, seed } as TablesComputePreviewRequest,
					NOW,
				),
				'invalid-argument',
			);
		}
		expect(fake.list('tableAssignmentRuns')).toHaveLength(0);
	});

	it('draws the seed at random, not from the clock', async () => {
		const draw = jest
			.spyOn(crypto, 'randomInt')
			.mockImplementation((() => 77) as unknown as typeof crypto.randomInt);
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25, 50, 75]);
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID }, NOW);
		const second = await computePreview(fs, HOST, { sessionId: SID }, NOW + 123456);

		expect(draw).toHaveBeenCalledTimes(2);
		expect(draw).toHaveBeenCalledWith(0, ENGINE_SEED_RANGE);
		expect(runOf(fake, second.runId).tables).toEqual(runOf(fake, first.runId).tables);
		draw.mockRestore();
	});
});

describe('scrubbing a stored run', () => {
	const older: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'> = {
		status: 'ready',
		tables: [
			{
				index: 0,
				topicId: 'a',
				memberUids: ['u1', 'u2', 'u3', 'u4'],
				stats: { n: 5, mean: [50], sd: [35], deviation: 0.15 },
			},
			{
				index: 1,
				topicId: 'b',
				memberUids: ['u5', 'u6'],
				stats: { n: 0, mean: [], sd: [], deviation: 0 },
			},
		],
		metrics: {
			population: { n: 5, mean: [50], sd: [30] },
			balance: { max: 0.15, mean: 0.15, tolerance: TOLERANCE, withinTolerance: true },
			preferences: { byRank: [4], none: 0, noPreference: 0, score: 12, maxScore: 12 },
		},
	};

	it('turns the figures into pills and gives the same answer the second time', () => {
		const once = scrubStoredRun(older);

		expectNoFigures(once);
		expect(once.tables.map((table) => table.closeness)).toEqual(['veryClose', 'notEnough']);
		expect(once.metrics.hasEnoughPositions).toBe(true);
		expect(once.metrics.preferences).toEqual(older.metrics.preferences);
		expect(scrubStoredRun({ ...older, ...once })).toEqual(once);
	});

	it('leaves a published one with the seating only', () => {
		const once = scrubStoredRun({ ...older, status: 'published' });

		expectNoFigures(once);
		once.tables.forEach((table) => expect(table).not.toHaveProperty('closeness'));
		expect(once.metrics.preferences.byRank).toEqual([]);
		expect(scrubStoredRun({ ...older, ...once, status: 'published' })).toEqual(once);
	});
});

describe('remove, then compute again', () => {
	it('stores no figure on either run', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25, 50, 75, 0, 100]);
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID }, NOW, () => 9);

		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u3' });
		const second = await computePreview(fs, HOST, { sessionId: SID }, NOW + 1, () => 9);

		expectNoFigures(runOf(fake, first.runId));
		expectNoFigures(runOf(fake, second.runId));
	});
});
