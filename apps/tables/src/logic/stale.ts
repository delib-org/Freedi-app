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
 *  - the people registered are not exactly the people seated;
 *  - the balance tolerance or table size in the settings no longer matches;
 *  - a table's topic is no longer in the topic list.
 * Anything subtler is caught by the server on publish (failed-precondition).
 */
export interface StaleInput {
	run: Pick<TableAssignmentRun, 'status' | 'tables' | 'metrics'>;
	settings: TableAssignmentSettings;
	registeredUids: readonly string[];
	topicIds: readonly string[];
}

const TOLERANCE_EPSILON = 1e-9;

function seatedUids(tables: TableAssignmentRun['tables']): Set<string> {
	return new Set(tables.flatMap((table) => table.memberUids));
}

function isSameCrowd(tables: TableAssignmentRun['tables'], uids: readonly string[]): boolean {
	const seated = seatedUids(tables);

	return seated.size === new Set(uids).size && uids.every((uid) => seated.has(uid));
}

export function isDraftStale({ run, settings, registeredUids, topicIds }: StaleInput): boolean {
	if (run.status === 'superseded') return true;
	if (!isSameCrowd(run.tables, registeredUids)) return true;

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
