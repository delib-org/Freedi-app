import {
	TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
} from '@freedi/shared-types';
import type { TableAssignmentRun, TableAssignmentSettings } from '@freedi/shared-types';

/**
 * A draft is stale when its input changed after it was computed. The server
 * owns the real check (`inputHash`) and refuses to publish a stale run; this
 * is the client's early warning so the Publish button is blocked with a
 * message instead of failing later.
 *
 * Signals the browser can see without the server's hash:
 *  - the run was marked superseded;
 *  - the registrant count differs from the number of seated members;
 *  - the balance tolerance or table size in the settings no longer matches;
 *  - a table's topic is no longer in the topic list.
 * Anything subtler is caught by the server on publish (failed-precondition).
 */
export interface StaleInput {
	run: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'>;
	settings: TableAssignmentSettings;
	registeredCount: number;
	topicIds: readonly string[];
}

const TOLERANCE_EPSILON = 1e-9;

export function seatedCount(tables: TableAssignmentRun['tables']): number {
	return tables.reduce((sum, table) => sum + table.memberUids.length, 0);
}

export function isDraftStale({ run, settings, registeredCount, topicIds }: StaleInput): boolean {
	if (run.status === 'superseded') return true;
	if (seatedCount(run.tables) !== registeredCount) return true;

	const tolerance = settings.balanceTolerance ?? TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT;

	if (Math.abs(run.metrics.balance.tolerance - tolerance) > TOLERANCE_EPSILON) return true;

	const tableSize = settings.tableSize ?? TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT;
	const known = new Set(topicIds);

	return run.tables.some(
		(table) => table.memberUids.length > tableSize || !known.has(table.topicId),
	);
}

/** Only a finished, current draft can be published. */
export function canPublish(input: StaleInput): boolean {
	return input.run.status === 'ready' && !isDraftStale(input);
}
