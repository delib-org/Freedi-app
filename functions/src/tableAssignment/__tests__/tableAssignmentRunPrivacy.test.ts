import { sideStats } from '@freedi/table-assignment';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { computePreview } from '../fn_tablesComputePreview';
import { publishRun } from '../fn_tablesPublishRun';
import { removeParticipant } from '../fn_tablesRemoveParticipant';
import {
	coarseRunFields,
	coarseTableStats,
	publishedRunFields,
	scrubStoredRun,
} from '../runPrivacy';
import { HOST, NOW, SID, seedRegistration, seedSession, seedTopics } from './tablesTestKit';

const STEP = 5;
const STOPS = [0, 25, 50, 75, 100];
const isStep = (value: number): boolean => value % STEP === 0;

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

function expectNoExactValues(run: TableAssignmentRun): void {
	const { population } = run.metrics;

	[...population.mean, ...population.sd, population.n].forEach((value) =>
		expect(isStep(value)).toBe(true),
	);
	run.tables.forEach(({ stats }) => {
		[...stats.mean, ...stats.sd, stats.n].forEach((value) => expect(isStep(value)).toBe(true));
	});
}

/** The stops a removed person's answer can be, from the room before and after removing them. */
function stopsConsistentWith(
	before: { mean: number; n: number },
	after: { mean: number; n: number },
): number[] {
	const half = STEP / 2;
	const lowest = (before.mean - half) * before.n - (after.mean + half) * after.n;
	const highest = (before.mean + half) * before.n - (after.mean - half) * after.n;

	return STOPS.filter((stop) => stop >= lowest && stop <= highest);
}

function roomMean(positions: readonly number[]): { mean: number; n: number } {
	const { mean, n } = sideStats(
		positions.map((position) => ({ id: 'x', side: [position], preferences: [] })),
	);

	return { mean: Math.round(mean[0] / STEP) * STEP, n };
}

/** A deterministic sweep of rooms: how often the two stored means leave only one possible stop. */
function shareOfRoomsPinningOneStop(size: number): number {
	const rooms = 4000;
	let random = 7;
	const nextStop = (): number => {
		random = (random * 1103515245 + 12345) % 2147483648;

		return STOPS[random % STOPS.length];
	};
	let pinned = 0;

	for (let room = 0; room < rooms; room += 1) {
		const rest = Array.from({ length: size - 1 }, nextStop);
		const candidates = stopsConsistentWith(roomMean([...rest, nextStop()]), roomMean(rest));

		if (candidates.length === 1) pinned += 1;
	}

	return pinned / rooms;
}

describe('what a run stores about positions', () => {
	it('stores coarse values only, and exact ones nowhere in the run', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 25, 50, 75, 100, 100, 50]);
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID, seed: 3 },
			NOW,
		);

		expectNoExactValues(runOf(fake, runId));
	});

	it('keeps the input hash out of the run, where a client could guess the answers from it', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75]);
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID, seed: 3 },
			NOW,
		);

		expect(runOf(fake, runId).inputHash).toBe('');
		expect(fake.read(`tableAssignmentRunInputs/${runId}`)?.inputHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('still refuses a stale preview now that the hash lives apart', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 3 }, NOW);

		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u0' });
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).rejects.toMatchObject({
			reason: 'stale-run',
		});
	});

	it('takes the pass or fail from the exact numbers', () => {
		const stats = { n: 4, mean: [50], sd: [20], deviation: 0.31 };
		const table = { index: 0, topicId: 'a', memberIds: ['u'], stats };
		const fields = coarseRunFields({
			tables: [table],
			metrics: {
				population: { n: 8, mean: [52], sd: [21] },
				balance: { max: 0.31, mean: 0.31, tolerance: 0.3, withinTolerance: false },
				preferences: { byRank: [1], none: 0, noPreference: 0, score: 3, maxScore: 3 },
			},
		});

		expect(fields.metrics.balance.withinTolerance).toBe(false);
		expect(fields.metrics.balance.max).toBeCloseTo(0.35);
		expect(fields.tables[0].stats.deviation).toBeCloseTo(0.35);
	});

	it('never shows a table within the limit as past it', () => {
		const within = coarseTableStats({ n: 4, mean: [50], sd: [20], deviation: 0.29 }, 0.29);

		expect(within.deviation).toBe(0.29);
	});

	it('stores nothing about a table below three known positions, its distance included', () => {
		expect(coarseTableStats({ n: 2, mean: [40], sd: [10], deviation: 1.2 }, 0.3)).toEqual({
			n: 0,
			mean: [],
			sd: [],
			deviation: 0,
		});
	});

	it('does not let a tiny table set the worst distance', () => {
		const tiny = { n: 1, mean: [100], sd: [0], deviation: 1.9 };
		const fair = { n: 4, mean: [50], sd: [20], deviation: 0.1 };
		const fields = coarseRunFields({
			tables: [
				{ index: 0, topicId: 'a', memberIds: ['a'], stats: tiny },
				{ index: 1, topicId: 'b', memberIds: ['b'], stats: fair },
			],
			metrics: {
				population: { n: 5, mean: [60], sd: [30] },
				balance: { max: 1.9, mean: 1, tolerance: 0.3, withinTolerance: false },
				preferences: { byRank: [2], none: 0, noPreference: 0, score: 6, maxScore: 6 },
			},
		});

		expect(fields.metrics.balance.max).toBeCloseTo(0.35);
	});

	it('hides the room when fewer than three gave a position', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'registrationClosed' }, { tableSize: 4 });
		seedTopics(fake, ['a']);
		seedRegistration(fake, 'u0', { preferences: ['a'], position: 100 });
		seedRegistration(fake, 'u1', { preferences: ['a'] });
		const { runId } = await computePreview(
			fake.asFirestore(),
			HOST,
			{ sessionId: SID, seed: 1 },
			NOW,
		);

		expect(runOf(fake, runId).metrics.population).toEqual({ n: 0, mean: [], sd: [] });
	});

	it('leaves participants no position figures once published', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 25, 50, 75, 100, 100, 50]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 3 }, NOW);

		await publishRun(fs, HOST, { sessionId: SID, runId }, NOW);
		const run = runOf(fake, runId);

		expect(run.metrics.population).toEqual({ n: 0, mean: [], sd: [] });
		expect(run.metrics.balance).toMatchObject({ max: 0, mean: 0 });
		run.tables.forEach((table) =>
			expect(table.stats).toEqual({ n: 0, mean: [], sd: [], deviation: 0 }),
		);
		expect(run.tables.flatMap((table) => table.memberUids)).toHaveLength(8);
	});

	it('keeps the seating when the figures are dropped', () => {
		const stripped = publishedRunFields({
			tables: [
				{
					index: 0,
					topicId: 'a',
					memberUids: ['u'],
					stats: { n: 5, mean: [50], sd: [20], deviation: 0.1 },
				},
			],
			metrics: {
				population: { n: 5, mean: [50], sd: [20] },
				balance: { max: 0.1, mean: 0.1, tolerance: 0.3, withinTolerance: true },
				preferences: { byRank: [1], none: 0, noPreference: 0, score: 3, maxScore: 3 },
			},
		});

		expect(stripped.tables[0]).toMatchObject({ index: 0, topicId: 'a', memberUids: ['u'] });
		expect(stripped.metrics.balance).toMatchObject({ tolerance: 0.3, withinTolerance: true });
	});
});

describe('scrubbing an older run', () => {
	const older: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'> = {
		status: 'ready',
		tables: [
			{
				index: 0,
				topicId: 'a',
				memberUids: ['u1', 'u2', 'u3', 'u4'],
				stats: { n: 4, mean: [51.25], sd: [33.3], deviation: 0.123 },
			},
		],
		metrics: {
			population: { n: 7, mean: [52.4], sd: [31.1] },
			balance: { max: 0.123, mean: 0.123, tolerance: 0.3, withinTolerance: true },
			preferences: { byRank: [4], none: 0, noPreference: 0, score: 12, maxScore: 12 },
		},
	};

	it('coarsens it and gives the same answer the second time', () => {
		const once = scrubStoredRun(older);

		expect(once.tables[0].stats).toEqual({ n: 5, mean: [50], sd: [35], deviation: 0.15 });
		expect(once.metrics.population).toEqual({ n: 5, mean: [50], sd: [30] });
		expect(scrubStoredRun({ ...older, ...once })).toEqual(once);
	});

	it('leaves a published one without any position figures', () => {
		const scrubbed = scrubStoredRun({ ...older, status: 'published' });

		expect(scrubbed.tables[0].stats).toEqual({ n: 0, mean: [], sd: [], deviation: 0 });
		expect(scrubbed.metrics.population).toEqual({ n: 0, mean: [], sd: [] });
	});
});

describe('remove, then compute again', () => {
	it('stores nothing exact on either run', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [10, 35, 60, 85, 20, 40, 65, 90, 15, 55]);
		const fs = fake.asFirestore();
		const first = await computePreview(fs, HOST, { sessionId: SID, seed: 9 }, NOW);

		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u3' });
		const second = await computePreview(fs, HOST, { sessionId: SID, seed: 9 }, NOW + 1);

		expectNoExactValues(runOf(fake, first.runId));
		expectNoExactValues(runOf(fake, second.runId));
	});

	it('rarely pins a stop once ten answered, and almost never from fifteen', () => {
		expect(shareOfRoomsPinningOneStop(10)).toBeLessThan(0.1);
		expect(shareOfRoomsPinningOneStop(15)).toBeLessThan(0.01);
	});

	it('gives two different answers the same stored room in a larger group', () => {
		const rest = Array.from({ length: 39 }, (_, i) => STOPS[i % STOPS.length]);

		expect(roomMean([...rest, 50]).mean).toBe(roomMean([...rest, 75]).mean);
	});

	it('still pins most answers in a room of four: the limit this rounding has', () => {
		expect(shareOfRoomsPinningOneStop(4)).toBeGreaterThan(0.5);
	});
});
