import type { TableAssignmentRosterEntry, TableAssignmentRun } from '@freedi/shared-types';

/** The published run of a session, from its runs; undefined while there is none or it is not read yet. */
export function publishedRunOf(
	runs: readonly TableAssignmentRun[],
	publishedRunId: string | undefined,
): TableAssignmentRun | undefined {
	return runs.find((run) => run.runId === publishedRunId && run.status === 'published');
}

/**
 * Registered people the published run does not seat: latecomers who registered
 * after publishing. A recompute keeps everyone else where they are and seats only these.
 */
export function unseatedSincePublished(
	published: Pick<TableAssignmentRun, 'tables'> | undefined,
	roster: readonly TableAssignmentRosterEntry[],
): TableAssignmentRosterEntry[] {
	if (!published) return [];

	const seated = new Set(published.tables.flatMap((table) => table.memberUids));

	return roster.filter((person) => !seated.has(person.uid));
}
