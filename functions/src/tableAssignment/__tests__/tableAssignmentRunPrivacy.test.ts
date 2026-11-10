import { assignTables, sideStats, tableStats } from '@freedi/table-assignment';
import type { Assignment, Participant } from '@freedi/table-assignment';
import { tableAssignmentCloseness } from '@freedi/shared-types';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { computePreview } from '../fn_tablesComputePreview';
import { publishRun } from '../fn_tablesPublishRun';
import { removeParticipant } from '../fn_tablesRemoveParticipant';
import { coarseRunFields, publishedRunFields, scrubStoredRun } from '../runPrivacy';
import { HOST, NOW, SID, seedRegistration, seedSession, seedTopics } from './tablesTestKit';

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
			{ sessionId: SID, seed: 3 },
			NOW,
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
			{ sessionId: SID, seed: 3 },
			NOW,
		);

		expect(runOf(fake, runId).inputHash).toBe('');
		expect(fake.read(`tableAssignmentRunInputs/${runId}`)?.inputHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('still refuses a stale preview now that the hash lives apart', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 50, 75, 100, 25]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 3 }, NOW);

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
			{ sessionId: SID, seed: 1 },
			NOW,
		);
		const run = runOf(fake, runId);

		expect(run.metrics.hasEnoughPositions).toBe(false);
		run.tables.forEach((table) => expect(table.closeness).toBe('notEnough'));
	});

	it('leaves participants only the seating once published', async () => {
		const fake = new FakeFirestore();

		seedRoom(fake, [0, 25, 25, 50, 75, 100, 100, 50]);
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 3 }, NOW);

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

	/**
	 * The reviewer's attack, against what is stored now: try every possible set
	 * of answers and keep those that give the pills the host saw in five previews.
	 */
	it('leaves every position open after five previews', () => {
		const truth = [25, 50, 75, 25, 50, 75];
		const ids = truth.map((_, i) => `u${i}`);
		const topics = [{ id: 'a' }, { id: 'b' }];
		const asPeople = (answers: readonly number[]): Participant[] =>
			answers.map((position, i) => ({
				id: ids[i],
				side: position < 0 ? undefined : [position],
				preferences: [],
			}));
		const previews = [1, 2, 3, 4, 5].map((seed) =>
			coarseRunFields(
				assignTables(asPeople(truth), topics, {
					tableSize: 3,
					balanceTolerance: TOLERANCE,
					seed,
				}),
			),
		);
		const fitsAllPills = (answers: readonly number[]): boolean => {
			const people = asPeople(answers);
			const population = sideStats(people);

			return previews.every((preview) =>
				preview.tables.every((table) => {
					const seated = people.filter((person) => table.memberUids.includes(person.id));

					return (
						tableAssignmentCloseness(tableStats(seated, population), TOLERANCE) === table.closeness
					);
				}),
			);
		};
		const options = [-1, ...STOPS];
		const possible = ids.map(() => new Set<number>());
		const answers = new Array<number>(ids.length).fill(0);
		const tryFrom = (person: number): void => {
			if (person === ids.length) {
				if (fitsAllPills(answers)) answers.forEach((value, i) => possible[i].add(value));

				return;
			}
			options.forEach((option) => {
				answers[person] = option;
				tryFrom(person + 1);
			});
		};

		tryFrom(0);

		possible.forEach((values, i) => {
			expect(values.has(truth[i])).toBe(true);
			expect(values.size).toBeGreaterThan(1);
		});
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
		const first = await computePreview(fs, HOST, { sessionId: SID, seed: 9 }, NOW);

		await removeParticipant(fs, HOST, { sessionId: SID, uid: 'u3' });
		const second = await computePreview(fs, HOST, { sessionId: SID, seed: 9 }, NOW + 1);

		expectNoFigures(runOf(fake, first.runId));
		expectNoFigures(runOf(fake, second.runId));
	});
});

describe('rationing previews', () => {
	const compute = (fake: FakeFirestore, seed: number): ReturnType<typeof computePreview> =>
		computePreview(fake.asFirestore(), HOST, { sessionId: SID, seed }, NOW + seed);

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
		expect(fake.list('tableAssignmentPreviewBudgets')).toEqual([{ sessionId: SID, computed: 1 }]);
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
			const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 4 }, NOW);

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
});
