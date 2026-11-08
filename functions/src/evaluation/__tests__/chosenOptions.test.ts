import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CutoffBy, ResultsBy } from '@freedi/shared-types';
import type { ResultsSettings } from '@freedi/shared-types';
import { FakeFirestore } from './helpers/fakeFirestore';
import { makeLegacy } from './helpers/legacyChosenOptions';

const mockFake = new FakeFirestore();
jest.mock('../../index', () => ({
	get db() {
		return mockFake;
	},
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { increment: (n: number) => ({ __increment: n }), arrayUnion: jest.fn() },
	getFirestore: jest.fn(),
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { updateParentStatementWithChosenOptions } from '../updateChosenOptions';
import { recordEvaluatorParticipation } from '../evaluatorParticipation';

const Q = 'q1';
type Doc = Record<string, unknown>;

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number): () => number {
	let a = seed;

	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function optionDoc(i: number, over: Doc = {}): Doc {
	return {
		statementId: `o${String(i).padStart(3, '0')}`,
		parentId: Q,
		topParentId: Q,
		statementType: 'option',
		statement: `option ${i}`,
		creatorId: 'c',
		creator: { uid: 'c', displayName: 'c' },
		createdAt: 10 + i,
		lastUpdate: 10 + i,
		consensus: 0,
		isChosen: false,
		hide: false,
		evaluation: {
			agreement: (over.consensus as number | undefined) ?? 0,
			sumPro: 0,
			sumEvaluations: 0,
			numberOfEvaluators: 0,
		},
		...over,
	};
}

function seedQuestion(settings?: ResultsSettings, over: Doc = {}): void {
	mockFake.seed(`statements/${Q}`, {
		statementId: Q,
		statementType: 'question',
		...(settings ? { resultsSettings: settings } : {}),
		...over,
	});
}

function seedOptions(docs: Doc[]): void {
	docs.forEach((d) => mockFake.seed(`statements/${d.statementId}`, d));
}

function snapshotState(): { flags: Record<string, unknown>; parent: Doc } {
	const flags: Record<string, unknown> = {};
	mockFake
		.list('statements')
		.filter((row) => row.id !== Q)
		.forEach((row) => {
			flags[row.id] = row.data.isChosen;
		});
	const parent = mockFake.peek(`statements/${Q}`) as Doc;

	return { flags, parent: { results: parent.results, totalResults: parent.totalResults } };
}

function chosenIds(): string[] {
	return ((mockFake.peek(`statements/${Q}`)?.results as Doc[]) ?? []).map(
		(r) => r.statementId as string,
	);
}

function randomOptions(random: () => number, count: number): Doc[] {
	return Array.from({ length: count }, (_, i) => {
		const consensusChoices = [undefined, 0, 0.25, 0.5, 0.5, 0.75, -0.2];
		const consensus = consensusChoices[Math.floor(random() * consensusChoices.length)];
		const sumPro = Math.floor(random() * 4);
		const sumEvaluations = Math.floor(random() * 7) - 3;

		return optionDoc(i, {
			consensus,
			hide: random() < 0.25,
			isChosen: random() < 0.4, // stale flags, hidden ones included
			evaluation: { agreement: consensus ?? 0, sumPro, sumEvaluations, numberOfEvaluators: 1 },
		});
	});
}

const legacy = makeLegacy(mockFake);

describe('golden: new selection == old selection', () => {
	const settingsMatrix: Array<ResultsSettings | undefined> = [undefined];
	[
		ResultsBy.consensus,
		ResultsBy.mostLiked,
		ResultsBy.averageLikesDislikes,
		ResultsBy.topOptions,
	].forEach((resultsBy) => {
		[
			undefined,
			CutoffBy.topOptions,
			CutoffBy.aboveThreshold,
			CutoffBy.all,
			'bogus' as CutoffBy,
		].forEach((cutoffBy) => {
			[undefined, 1, 3, 2.4].forEach((numberOfResults) => {
				[undefined, 0, 0.5].forEach((cutoffNumber) => {
					settingsMatrix.push({
						resultsBy,
						cutoffBy,
						numberOfResults,
						cutoffNumber,
					} as ResultsSettings);
				});
			});
		});
	});

	it('produces identical isChosen flags and parent results over a randomized settings x options matrix', async () => {
		const random = rng(20261020);
		let cases = 0;

		for (const settings of settingsMatrix) {
			const options = randomOptions(random, 1 + Math.floor(random() * 12));

			// Old logic on its own copy of the data
			mockFake.clear();
			seedQuestion(settings, { results: [], totalResults: 0 });
			seedOptions(options);
			await legacy.updateParentStatementWithChosenOptions(Q);
			const expected = snapshotState();

			// New logic on an identical copy
			mockFake.clear();
			seedQuestion(settings, { results: [], totalResults: 0 });
			seedOptions(options);
			await updateParentStatementWithChosenOptions(Q);
			const actual = snapshotState();

			expect({ settings, actual }).toEqual({ settings, actual: expected });
			cases++;

			// A second run on settled data writes nothing at all
			mockFake.resetCounts();
			await updateParentStatementWithChosenOptions(Q);
			expect(mockFake.writeLog).toEqual([]);
		}

		expect(cases).toBeGreaterThan(200);
	});

	it('hidden options never get chosen, including hidden originals inside clusters', async () => {
		seedQuestion(
			{
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.topOptions,
				numberOfResults: 2,
			} as ResultsSettings,
			{
				results: [],
				totalResults: 0,
			},
		);
		seedOptions([
			optionDoc(0, { consensus: 0.95, hide: true, isChosen: true }), // hidden original, stale chosen
			optionDoc(1, { consensus: 0.9 }),
			optionDoc(2, { consensus: 0.8 }),
			optionDoc(3, { consensus: 0.7 }),
		]);

		await updateParentStatementWithChosenOptions(Q);

		expect(chosenIds()).toEqual(['o001', 'o002']);
		expect(mockFake.peek('statements/o000')?.isChosen).toBe(false);
	});

	it('rounds numberOfResults up and falls back to the default settings', async () => {
		seedQuestion({
			resultsBy: ResultsBy.consensus,
			cutoffBy: CutoffBy.topOptions,
			numberOfResults: 2.4,
		} as ResultsSettings);
		seedOptions(Array.from({ length: 6 }, (_, i) => optionDoc(i, { consensus: 0.9 - i * 0.1 })));
		await updateParentStatementWithChosenOptions(Q);
		expect(chosenIds()).toHaveLength(3);

		mockFake.clear();
		seedQuestion(undefined); // defaultResultsSettings: top 5 by consensus
		seedOptions(Array.from({ length: 8 }, (_, i) => optionDoc(i, { consensus: 0.9 - i * 0.1 })));
		await updateParentStatementWithChosenOptions(Q);
		expect(chosenIds()).toHaveLength(5);
	});
});

describe('diff writes', () => {
	const top3 = {
		resultsBy: ResultsBy.consensus,
		cutoffBy: CutoffBy.topOptions,
		numberOfResults: 3,
	} as ResultsSettings;

	beforeEach(() => {
		mockFake.clear();
		seedQuestion(top3, { results: [], totalResults: 0 });
		seedOptions(Array.from({ length: 6 }, (_, i) => optionDoc(i, { consensus: 0.9 - i * 0.1 })));
	});

	it('unchanged selection: zero option writes and no parent write', async () => {
		await updateParentStatementWithChosenOptions(Q);
		mockFake.resetCounts();

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.writeLog).toEqual([]);
	});

	it('changed selection: only the entering and leaving options are written', async () => {
		await updateParentStatementWithChosenOptions(Q);
		// o003 overtakes o002
		mockFake.seed('statements/o003', optionDoc(3, { consensus: 0.95 }));
		mockFake.resetCounts();

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.writeLog.sort()).toEqual(
			['update statements/o002', 'update statements/o003', `update statements/${Q}`].sort(),
		);
		expect(chosenIds()).toEqual(['o003', 'o000', 'o001']);
	});

	it('same members, new order: parent is written, no option is touched', async () => {
		await updateParentStatementWithChosenOptions(Q);
		mockFake.seed('statements/o000', optionDoc(0, { consensus: 0.75, isChosen: true }));
		mockFake.resetCounts();

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.writeLog).toEqual([`update statements/${Q}`]);
		expect(chosenIds()).toEqual(['o001', 'o000', 'o002']);
	});

	it('a chosen option whose copied consensus changed refreshes the parent copy only', async () => {
		await updateParentStatementWithChosenOptions(Q);
		mockFake.seed('statements/o001', optionDoc(1, { consensus: 0.85, isChosen: true }));
		mockFake.resetCounts();

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.writeLog).toEqual([`update statements/${Q}`]);
	});

	it('advances lastUpdate on the question and on flipped options only, never otherwise', async () => {
		let clock = 1_800_000_000_000;
		const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => (clock += 10));
		await updateParentStatementWithChosenOptions(Q);
		const stamp = (id: string): unknown => mockFake.peek(`statements/${id}`)?.lastUpdate;
		const before = { q: stamp(Q), o001: stamp('o001'), o002: stamp('o002'), o003: stamp('o003') };

		// nothing changed: nothing moves
		await updateParentStatementWithChosenOptions(Q);
		expect(stamp(Q)).toBe(before.q);
		expect(stamp('o003')).toBe(before.o003);

		// o003 overtakes o002: question results change, o002 and o003 flip, o001 untouched
		mockFake.seed('statements/o003', optionDoc(3, { consensus: 0.95 }));
		const o003Seeded = stamp('o003');
		await updateParentStatementWithChosenOptions(Q);

		expect(stamp(Q) as number).toBeGreaterThan(before.q as number);
		expect(stamp('o003') as number).toBeGreaterThan(o003Seeded as number);
		expect(stamp('o002') as number).toBeGreaterThan(before.o002 as number);
		expect(stamp('o001')).toBe(before.o001);
		nowSpy.mockRestore();
	});

	it('ignores a bare lastUpdate bump on a chosen option', async () => {
		await updateParentStatementWithChosenOptions(Q);
		mockFake.seed(
			'statements/o001',
			optionDoc(1, { consensus: 0.8, isChosen: true, lastUpdate: 99999 }),
		);
		mockFake.resetCounts();

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.writeLog).toEqual([]);
	});

	it('writes more than 500 flag changes in chunked batches', async () => {
		mockFake.clear();
		seedQuestion({ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.all } as ResultsSettings, {
			results: [],
			totalResults: 0,
		});
		seedOptions(Array.from({ length: 1100 }, (_, i) => optionDoc(i, { consensus: 0.5 })));

		await updateParentStatementWithChosenOptions(Q);

		expect(mockFake.list('statements').filter((r) => r.data.isChosen === true)).toHaveLength(1100);
	});
});

describe('op counts: one new evaluation on a question with N existing evaluations', () => {
	const settings = {
		resultsBy: ResultsBy.consensus,
		cutoffBy: CutoffBy.topOptions,
		numberOfResults: 5,
	} as ResultsSettings;
	const OPTIONS = 10;
	const sizes = [10, 100, 1000, 10000];

	interface Counts {
		reads: number;
		writes: number;
		optionWrites: number;
		parentWrites: number;
		markerWrites: number;
		statementTriggers: number;
	}

	function summarize(): Counts {
		const log = mockFake.writeLog;
		const optionWrites = log.filter((l) => /statements\/o\d+/.test(l)).length;
		const parentWrites = log.filter((l) => l.endsWith(`statements/${Q}`)).length;
		const markerWrites = log.filter((l) => l.includes('evaluationParticipants/')).length;

		return {
			reads: mockFake.counts.reads,
			writes: mockFake.counts.writes,
			optionWrites,
			parentWrites,
			markerWrites,
			// every write to a statements doc fires the onUpdate-statement trigger (+ fan-out)
			statementTriggers: optionWrites + parentWrites,
		};
	}

	function seedWorld(n: number, withMarkers: boolean): void {
		mockFake.clear();
		seedQuestion(settings, {
			results: [],
			totalResults: 0,
			evaluation: { agreement: 0, numberOfEvaluators: 0, asParentTotalEvaluators: n },
			totalEvaluators: n,
		});
		seedOptions(
			Array.from({ length: OPTIONS }, (_, i) => optionDoc(i, { consensus: 0.9 - i * 0.05 })),
		);
		for (let i = 0; i < n; i++) {
			mockFake.seed(`evaluations/ev${String(i).padStart(6, '0')}`, {
				parentId: Q,
				statementId: `o${String(i % OPTIONS).padStart(3, '0')}`,
				evaluation: 1,
				evaluator: { uid: `user${i}` },
			});
			if (withMarkers) {
				mockFake.seed(`evaluationParticipants/${Q}--user${i}`, {
					parentId: Q,
					userId: `user${i}`,
					createdAt: 1,
				});
			}
		}
	}

	// What an evaluation does to the evaluated option before the shared step runs
	// (identical before/after, not measured): scenario -> option mutation.
	const scenarios: Record<string, () => void> = {
		'A: vote on a non-top option, selection and copies unchanged': () => undefined,
		'B: vote on a top option, its consensus moves, order unchanged': () =>
			mockFake.seed('statements/o000', optionDoc(0, { consensus: 0.92, isChosen: true })),
		'C: vote makes option 6 overtake option 5 (rank swap)': () =>
			mockFake.seed('statements/o005', optionDoc(5, { consensus: 0.99 })),
		'D: existing participant edits a vote, nothing else changes': () => undefined,
	};
	const evaluatorFor = (name: string): string => (name.startsWith('D') ? 'user0' : 'newcomer');

	it('measures before vs after and proves the new cost is independent of N', async () => {
		const table: Array<Record<string, string | number>> = [];
		const afterReads: Record<string, number[]> = {};
		const beforeReads: Record<string, number[]> = {};

		for (const [name, mutate] of Object.entries(scenarios)) {
			afterReads[name] = [];
			beforeReads[name] = [];
			for (const n of sizes) {
				// BEFORE
				seedWorld(n, false);
				await legacy.updateParentStatementWithChosenOptions(Q); // settle isChosen/results
				mutate();
				mockFake.seed(`evaluations/new-eval`, {
					parentId: Q,
					statementId: 'o009',
					evaluation: 1,
					evaluator: { uid: 'newcomer' },
				});
				mockFake.resetCounts();
				await legacy.updateParentStatementWithChosenOptions(Q);
				const before = summarize();

				// AFTER
				seedWorld(n, true);
				await updateParentStatementWithChosenOptions(Q); // settle
				mutate();
				mockFake.seed(`evaluations/new-eval`, {
					parentId: Q,
					statementId: 'o009',
					evaluation: 1,
					evaluator: { uid: 'newcomer' },
				});
				mockFake.resetCounts();
				await recordEvaluatorParticipation(Q, evaluatorFor(name), mockFake as never);
				await updateParentStatementWithChosenOptions(Q);
				const after = summarize();

				afterReads[name].push(after.reads);
				beforeReads[name].push(before.reads);
				table.push({
					scenario: name.slice(0, 1),
					N: n,
					'reads before': before.reads,
					'reads after': after.reads,
					'writes before': before.writes,
					'writes after': after.writes,
					'stmt-update triggers before': before.statementTriggers,
					'stmt-update triggers after': after.statementTriggers,
				});
			}
		}

		console.info(
			`OP COUNTS (one new evaluation, shared update step)\n${JSON.stringify(table, null, 1)}`,
		);

		Object.keys(scenarios).forEach((name) => {
			// after: constant in N; before: grows with N
			expect(new Set(afterReads[name]).size).toBe(1);
			expect(beforeReads[name][3]).toBeGreaterThan(beforeReads[name][0] * 100);
		});
	}, 120000);
});
