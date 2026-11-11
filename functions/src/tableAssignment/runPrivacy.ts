import type { Assignment } from '@freedi/table-assignment';
import type { TableAssignmentCloseness, TableAssignmentRun } from '@freedi/shared-types';
import {
	TABLE_ASSIGNMENT_MIN_KNOWN_POSITIONS,
	tableAssignmentCloseness,
} from '@freedi/shared-types';

/**
 * What a run document may say about positions. The host reads every run and
 * registered participants read the published one. Positions have only five
 * stops, so even rounded means and spreads, compared across a few previews,
 * were enough to solve for each person. A run therefore stores no figure about
 * positions: per table a closeness pill, for the room whether the tolerance
 * held and whether enough people answered. The engine's numbers stay inside
 * the function that called it.
 *
 * The figure fields stay in the document, empty, because the type requires them.
 */

type StoredMetrics = TableAssignmentRun['metrics'];
type StoredTable = TableAssignmentRun['tables'][number];
type StoredFields = Pick<TableAssignmentRun, 'tables' | 'metrics'>;

const EMPTY_POPULATION: StoredMetrics['population'] = { n: 0, mean: [], sd: [] };
const EMPTY_TABLE_STATS: StoredTable['stats'] = { n: 0, mean: [], sd: [], deviation: 0 };
const EMPTY_PREFERENCES: StoredMetrics['preferences'] = {
	byRank: [],
	none: 0,
	noPreference: 0,
	score: 0,
	maxScore: 0,
};

function storedTable(
	{ index, topicId, memberUids }: Pick<StoredTable, 'index' | 'topicId' | 'memberUids'>,
	closeness: TableAssignmentCloseness,
): StoredTable {
	return { index, topicId, memberUids, stats: EMPTY_TABLE_STATS, closeness };
}

function storedMetrics(
	{ tolerance, withinTolerance }: Pick<StoredMetrics['balance'], 'tolerance' | 'withinTolerance'>,
	preferences: StoredMetrics['preferences'],
	hasEnoughPositions: boolean,
): StoredMetrics {
	return {
		population: EMPTY_POPULATION,
		balance: { max: 0, mean: 0, tolerance, withinTolerance },
		preferences,
		hasEnoughPositions,
	};
}

/** The run's tables and metrics as they may be written, from the engine's exact result. */
export function coarseRunFields(assignment: Pick<Assignment, 'tables' | 'metrics'>): StoredFields {
	const { population, balance, preferences } = assignment.metrics;

	return {
		tables: assignment.tables.map((table) =>
			storedTable(
				{ index: table.index, topicId: table.topicId, memberUids: table.memberIds },
				tableAssignmentCloseness(table.stats, balance.tolerance),
			),
		),
		metrics: storedMetrics(
			balance,
			preferences,
			population.n >= TABLE_ASSIGNMENT_MIN_KNOWN_POSITIONS,
		),
	};
}

/**
 * Participants read a published run and need only who sits where. The host's
 * check of the tables is over by then, so the pills and the count of who got
 * which choice are dropped as well.
 */
export function publishedRunFields(run: StoredFields): StoredFields {
	return {
		tables: run.tables.map(
			({ index, topicId, memberUids }): StoredTable => ({
				index,
				topicId,
				memberUids,
				stats: EMPTY_TABLE_STATS,
			}),
		),
		metrics: {
			...run.metrics,
			population: EMPTY_POPULATION,
			balance: { ...run.metrics.balance, max: 0, mean: 0 },
			preferences: EMPTY_PREFERENCES,
		},
	};
}

/**
 * A stored run of any age brought to what is stored today. Idempotent: a pill
 * already there is kept, since the figures it came from are gone.
 */
export function scrubStoredRun(
	run: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'>,
): StoredFields {
	const { population, balance, preferences, hasEnoughPositions } = run.metrics;
	const scrubbed: StoredFields = {
		tables: run.tables.map((table) =>
			storedTable(
				table,
				table.closeness ?? tableAssignmentCloseness(table.stats, balance.tolerance),
			),
		),
		metrics: storedMetrics(
			balance,
			preferences,
			hasEnoughPositions ?? population.n >= TABLE_ASSIGNMENT_MIN_KNOWN_POSITIONS,
		),
	};

	return run.status === 'published' ? publishedRunFields(scrubbed) : scrubbed;
}
