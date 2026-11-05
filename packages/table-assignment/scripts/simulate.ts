/**
 * Prints how well the engine balances and satisfies preferences on simulated
 * crowds. Run: npm run simulate (from packages/table-assignment).
 */
import { assignTables, createRng, sideStats, tableDeviation, type Participant, type Rng, type Topic } from '../src';

type SideShape = 'polarized' | 'centered' | 'uniform';
type Correlation = 'none' | 'strong';

interface Scenario {
	n: number;
	shape: SideShape;
	correlation: Correlation;
	undeclaredShare: number;
}

const TOPICS: Topic[] = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}` }));
const TOLERANCE = 0.3;

function gaussian(rng: Rng, mean: number, sd: number): number {
	const u = 1 - rng.next();
	const v = rng.next();

	return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function drawSide(shape: SideShape, rng: Rng): number {
	if (shape === 'uniform') return clamp(rng.next() * 100);
	if (shape === 'centered') return clamp(gaussian(rng, 50, 15));

	return clamp(rng.next() < 0.5 ? gaussian(rng, 20, 10) : gaussian(rng, 80, 10));
}

function drawPreferences(side: number, correlation: Correlation, rng: Rng): string[] {
	const pool = TOPICS.map((t) => t.id);
	if (correlation === 'strong') {
		const leaning = side < 50 ? pool.slice(0, 3) : pool.slice(3);
		const other = side < 50 ? pool.slice(3) : pool.slice(0, 3);
		const picks = shuffleCopy(leaning, rng).slice(0, 2);
		picks.push(shuffleCopy(other, rng)[0]);

		return picks;
	}

	return shuffleCopy(pool, rng).slice(0, 3);
}

function shuffleCopy<T>(items: readonly T[], rng: Rng): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = rng.int(i + 1);
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
}

function crowd(scenario: Scenario, rng: Rng): Participant[] {
	return Array.from({ length: scenario.n }, (_, i) => {
		const side = drawSide(scenario.shape, rng);
		const declared = rng.next() >= scenario.undeclaredShare;

		return { id: `p${i}`, side: declared ? [side] : undefined, preferences: drawPreferences(side, scenario.correlation, rng) };
	});
}

/** Worst table deviation when people are simply shuffled into tables of the same sizes. */
function randomBaseline(participants: Participant[], sizes: number[], rng: Rng): number {
	const order = shuffleCopy(participants, rng);
	const population = sideStats(participants);
	let cursor = 0;
	let worst = 0;
	for (const size of sizes) {
		const members = order.slice(cursor, cursor + size);
		cursor += size;
		worst = Math.max(worst, tableDeviation(sideStats(members), population));
	}

	return worst;
}

function pct(part: number, whole: number): string {
	return whole === 0 ? '-' : `${Math.round((100 * part) / whole)}%`;
}

function runScenario(scenario: Scenario, seed: number): Record<string, string | number> {
	const rng = createRng(seed);
	const participants = crowd(scenario, rng);
	const started = Date.now();
	const result = assignTables(participants, TOPICS, { seed, balanceTolerance: TOLERANCE });
	const ms = Date.now() - started;
	const sizes = result.tables.map((t) => t.memberIds.length);
	const free = assignTables(participants, TOPICS, { seed, balanceTolerance: Number.POSITIVE_INFINITY });
	const { preferences: p, balance: b } = result.metrics;
	const withPrefs = participants.length - p.noPreference;

	return {
		n: scenario.n,
		shape: scenario.shape,
		corr: scenario.correlation,
		undeclared: pct(participants.filter((x) => !x.side).length, participants.length),
		tables: result.tables.length,
		'1st': pct(p.byRank[0], withPrefs),
		'2nd': pct(p.byRank[1], withPrefs),
		'3rd': pct(p.byRank[2], withPrefs),
		none: pct(p.none, withPrefs),
		'1st(no balance)': pct(free.metrics.preferences.byRank[0], withPrefs),
		'dev max': b.max.toFixed(2),
		'dev mean': b.mean.toFixed(2),
		'dev max(random)': randomBaseline(participants, sizes, rng).toFixed(2),
		'dev max(no balance)': free.metrics.balance.max.toFixed(2),
		ok: b.withinTolerance ? 'yes' : 'NO',
		ms,
	};
}

const scenarios: Scenario[] = [];
for (const n of [30, 100, 300]) {
	for (const shape of ['polarized', 'centered', 'uniform'] as const) {
		for (const correlation of ['none', 'strong'] as const) {
			scenarios.push({ n, shape, correlation, undeclaredShare: 0 });
		}
	}
}
scenarios.push({ n: 100, shape: 'polarized', correlation: 'strong', undeclaredShare: 0.2 });

console.info(`tolerance ${TOLERANCE} sd, ${TOPICS.length} topics, table size 7, seed 42`);
console.table(scenarios.map((scenario) => runScenario(scenario, 42)));
