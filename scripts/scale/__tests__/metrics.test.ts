import {
	aggregatePhase,
	exposureStats,
	fanOutReads,
	mean,
	percentile,
	perUnit,
	relativeDifference,
	scaleToPopulation,
	TraceRecord,
} from '../metrics';
import { assertEmulatorOnly, configFromArgs } from '../config';

const QUESTION = 'statements/q1';

function record(partial: Partial<TraceRecord> & Pick<TraceRecord, 'k' | 't'>): TraceRecord {
	return { fn: 'newEvaluation', pid: 1, ...partial };
}

describe('percentile and mean', () => {
	it('returns 0 for no values', () => {
		expect(percentile([], 95)).toBe(0);
		expect(mean([])).toBe(0);
	});

	it('picks the nearest-rank value', () => {
		expect(percentile([1, 2, 3, 4], 50)).toBe(2);
		expect(percentile([1, 2, 3, 4], 95)).toBe(4);
		expect(mean([1, 2, 3, 4])).toBe(2.5);
	});
});

describe('aggregatePhase', () => {
	const window = { name: 'rate', from: 100, to: 200, units: 2 };

	it('counts invocations that started in the window and their ops', () => {
		const records: TraceRecord[] = [
			record({ k: 'start', t: 110, inv: 'a' }),
			record({ k: 'r', t: 120, inv: 'a', via: 'query', coll: 'statements', n: 300 }),
			record({
				k: 'r',
				t: 125,
				inv: 'a',
				via: 'doc',
				n: 2,
				byCol: { statements: 1, adminStats: 1 },
			}),
			record({
				k: 'w',
				t: 130,
				inv: 'a',
				n: 2,
				byCol: { statements: 1, adminStats: 1 },
				docs: [QUESTION, 'statements/other'],
				qf: [['results', 'lastUpdate']],
			}),
			record({ k: 'end', t: 150, inv: 'a' }),
			record({ k: 'w', t: 160, inv: 'a', n: 1, ended: true, byCol: { creditLedger: 1 } }),
			record({ k: 'start', t: 90, inv: 'early' }),
			record({ k: 'r', t: 120, inv: 'early', via: 'query', coll: 'statements', n: 1000 }),
		];

		const cost = aggregatePhase(records, window, QUESTION);

		expect(cost.invocationsTotal).toBe(1);
		expect(cost.totalReads).toBe(302);
		expect(cost.totalWrites).toBe(3);
		expect(cost.questionDocWrites).toBe(1);
		expect(cost.questionWriters).toEqual({ 'newEvaluation: lastUpdate, results': 1 });
		expect(cost.readsByCollection).toEqual({ statements: 301, adminStats: 1 });
		expect(cost.writesAfterReturn).toEqual({ creditLedger: 1 });
		expect(cost.byFunction.newEvaluation).toEqual({
			invocations: 1,
			meanMs: 40,
			p95Ms: 40,
			docsRead: 302,
			docsWritten: 3,
		});
	});

	it('records failed commits without counting them as writes', () => {
		const records: TraceRecord[] = [
			record({ k: 'start', t: 110, inv: 'a' }),
			record({ k: 'wf', t: 120, inv: 'a', n: 1 }),
		];

		const cost = aggregatePhase(records, window, QUESTION);

		expect(cost.failedCommits).toBe(1);
		expect(cost.totalWrites).toBe(0);
	});
});

describe('scaling helpers', () => {
	it('multiplies up and divides safely', () => {
		expect(perUnit(10, 4)).toBe(2.5);
		expect(perUnit(10, 0)).toBe(0);
		expect(scaleToPopulation(1.5, 1000)).toBe(1500);
		expect(fanOutReads(3, 1000)).toBe(3000);
	});

	it('computes the spread between two runs', () => {
		expect(relativeDifference(100, 90)).toBeCloseTo(0.1);
		expect(relativeDifference(0, 0)).toBe(0);
	});
});

describe('exposureStats', () => {
	it('splits ratings into age quarters, oldest first', () => {
		const stats = exposureStats([0, 0, 0, 4, 8, 8, 12, 16]);

		expect(stats.totalAnswers).toBe(8);
		expect(stats.ratedAnswers).toBe(5);
		expect(stats.unratedAnswers).toBe(3);
		expect(stats.totalRatings).toBe(48);
		expect(stats.meanByAgeQuarter).toEqual([0, 2, 8, 14]);
		expect(stats.maxRatings).toBe(16);
		expect(stats.topTenthShare).toBe(0.333);
	});

	it('handles no ratings', () => {
		expect(exposureStats([0, 0]).topTenthShare).toBe(0);
	});
});

describe('assertEmulatorOnly', () => {
	const good = {
		FIRESTORE_EMULATOR_HOST: 'localhost:8101',
		FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9119',
		AGORA_PROJECT_ID: 'freedi-test',
	};

	it('accepts the solo suite', () => {
		expect(assertEmulatorOnly(good)).toEqual({ projectId: 'freedi-test' });
	});

	it.each([
		[{ ...good, FIRESTORE_EMULATOR_HOST: undefined }, /not set/],
		[{ ...good, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:8101' }, /not local/],
		[{ ...good, FIRESTORE_EMULATOR_HOST: 'localhost:8081' }, /solo suite/],
		[{ ...good, FIREBASE_AUTH_EMULATOR_HOST: undefined }, /local emulator/],
		[{ ...good, AGORA_PROJECT_ID: 'wizcol-app' }, /production/],
		[{ ...good, AGORA_PROJECT_ID: 'someone-else' }, /expected project/],
	])('refuses %#', (env, message) => {
		expect(() => assertEmulatorOnly(env)).toThrow(message);
	});
});

describe('configFromArgs', () => {
	it('defaults to the full size', () => {
		expect(configFromArgs([]).members).toBe(1000);
	});

	it('accepts the small size and a label', () => {
		const config = configFromArgs(['--size=small', '--label=run3']);

		expect(config.members).toBe(200);
		expect(config.label).toBe('run3');
	});

	it('rejects an unknown size', () => {
		expect(() => configFromArgs(['--size=huge'])).toThrow(/Unknown/);
	});
});
