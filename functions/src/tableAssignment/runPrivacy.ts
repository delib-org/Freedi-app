import type { Assignment, TableStats } from '@freedi/table-assignment';
import type { TableAssignmentRun, TableAssignmentTableStats } from '@freedi/shared-types';
import {
	RUN_DEVIATION_ROUND_STEP,
	RUN_STATS_ROUND_STEP,
	TABLE_STATS_MIN_KNOWN_POSITIONS,
} from './constants';

/**
 * What a run document may say about positions. The host reads every run and
 * registered participants read the published one, so nothing stored here may
 * let either of them work out one person's answer. The engine's exact numbers
 * stay inside the function that called it: the pass or fail of the tolerance
 * check is taken from them, and only coarse values are written.
 */

type StoredMetrics = TableAssignmentRun['metrics'];
type StoredTable = TableAssignmentRun['tables'][number];

const NO_KNOWN_POSITIONS = { n: 0, mean: [], sd: [] };

/** Guards against 0.15 / 0.05 being 3.0000000000000004, which would climb a step on every pass. */
const FLOAT_EPSILON = 1e-9;
const DEVIATION_DECIMALS = 2;

function toStep(value: number, step: number): number {
	return Math.round(value / step) * step;
}

function coarse(values: readonly number[]): number[] {
	return values.map((value) => toStep(value, RUN_STATS_ROUND_STEP));
}

/** How many gave a position, in steps: 0 means "fewer than the anonymity floor". */
function coarseKnownCount(known: number): number {
	if (known < TABLE_STATS_MIN_KNOWN_POSITIONS) return 0;

	return Math.max(RUN_STATS_ROUND_STEP, toStep(known, RUN_STATS_ROUND_STEP));
}

/**
 * Up to the next step, so a table past the limit never reads as within it, and
 * capped at the limit for a table that is within it, so a rounded number never
 * contradicts the exact pass or fail.
 */
function coarseDeviation(exact: number, tolerance: number): number {
	const steps = Math.ceil(exact / RUN_DEVIATION_ROUND_STEP - FLOAT_EPSILON);
	const rounded = Number((steps * RUN_DEVIATION_ROUND_STEP).toFixed(DEVIATION_DECIMALS));

	return exact <= tolerance ? Math.min(rounded, tolerance) : rounded;
}

/** Too few known positions: nothing about the table's positions is stored, its distance included. */
export function coarseTableStats(
	stats: TableAssignmentTableStats,
	tolerance: number,
): TableAssignmentTableStats {
	if (stats.n < TABLE_STATS_MIN_KNOWN_POSITIONS) return { ...NO_KNOWN_POSITIONS, deviation: 0 };

	return {
		n: coarseKnownCount(stats.n),
		mean: coarse(stats.mean),
		sd: coarse(stats.sd),
		deviation: coarseDeviation(stats.deviation, tolerance),
	};
}

function coarsePopulation(population: StoredMetrics['population']): StoredMetrics['population'] {
	if (population.n < TABLE_STATS_MIN_KNOWN_POSITIONS) return { ...NO_KNOWN_POSITIONS };

	return {
		n: coarseKnownCount(population.n),
		mean: coarse(population.mean),
		sd: coarse(population.sd),
	};
}

/**
 * Worst and average distance over the tables whose stats are stored. A table
 * of one or two known positions would otherwise leak through the maximum.
 * `withinTolerance` is the exact check; a failed check always reads past the limit.
 */
function coarseBalance(
	tables: readonly TableStats[],
	balance: StoredMetrics['balance'],
): StoredMetrics['balance'] {
	const { tolerance, withinTolerance } = balance;
	const visible = tables
		.filter((stats) => stats.n >= TABLE_STATS_MIN_KNOWN_POSITIONS)
		.map((stats) => coarseDeviation(stats.deviation, tolerance));
	const worst = Math.max(0, ...visible);
	const average = visible.length === 0 ? 0 : visible.reduce((a, b) => a + b, 0) / visible.length;

	return {
		tolerance,
		withinTolerance,
		max: withinTolerance
			? Math.min(worst, tolerance)
			: Math.max(worst, coarseDeviation(tolerance + RUN_DEVIATION_ROUND_STEP, tolerance)),
		mean: coarseDeviation(average, tolerance),
	};
}

/** The run's tables and metrics as they may be written, from the engine's exact result. */
export function coarseRunFields(
	assignment: Pick<Assignment, 'tables' | 'metrics'>,
): Pick<TableAssignmentRun, 'tables' | 'metrics'> {
	const { population, balance, preferences } = assignment.metrics;

	return {
		tables: assignment.tables.map((table) => ({
			index: table.index,
			topicId: table.topicId,
			memberUids: table.memberIds,
			stats: coarseTableStats(table.stats, balance.tolerance),
		})),
		metrics: {
			population: coarsePopulation(population),
			balance: coarseBalance(
				assignment.tables.map((table) => table.stats),
				balance,
			),
			preferences,
		},
	};
}

/**
 * Participants read a published run and need only who sits where. The host's
 * check of the tables is over by then, so the position figures are dropped.
 */
export function publishedRunFields(
	run: Pick<TableAssignmentRun, 'tables' | 'metrics'>,
): Pick<TableAssignmentRun, 'tables' | 'metrics'> {
	return {
		tables: run.tables.map(
			(table: StoredTable): StoredTable => ({
				...table,
				stats: { ...NO_KNOWN_POSITIONS, deviation: 0 },
			}),
		),
		metrics: {
			...run.metrics,
			population: { ...NO_KNOWN_POSITIONS },
			balance: { ...run.metrics.balance, max: 0, mean: 0 },
		},
	};
}

/** An older stored run, exact figures and all, brought to what is stored today. Idempotent. */
export function scrubStoredRun(
	run: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'>,
): Pick<TableAssignmentRun, 'tables' | 'metrics'> {
	const coarsened = coarseRunFields({
		tables: run.tables.map((table) => ({
			index: table.index,
			topicId: table.topicId,
			memberIds: table.memberUids,
			stats: table.stats,
		})),
		metrics: run.metrics,
	});

	return run.status === 'published' ? publishedRunFields(coarsened) : coarsened;
}
