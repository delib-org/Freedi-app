import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { Collections, type ScheduledAction } from '@freedi/shared-types';
import { db } from '@/firebase';
import { useCollection, type SnapshotState } from './hooks';

/**
 * Scheduled facilitator actions (open / freeze / close / nudge at a time) of
 * one top question. The rules require the organization equality, so the
 * query always carries both filters; ordering is done client-side.
 */
function byRunAtAsc(a: ScheduledAction, b: ScheduledAction): number {
	return a.runAt - b.runAt;
}

export function useScheduledActionsByTop(
	organizationId: string | null | undefined,
	topParentId: string | null | undefined,
): SnapshotState<ScheduledAction[]> {
	const q =
		organizationId && topParentId
			? query(
					collection(db, Collections.scheduledActions),
					where('organizationId', '==', organizationId),
					where('topParentId', '==', topParentId),
				)
			: null;
	const { data, loading, error } = useCollection<ScheduledAction>(
		q,
		`scheduledActions:${organizationId ?? 'none'}:${topParentId ?? 'none'}`,
	);
	const sorted = useMemo(() => [...data].sort(byRunAtAsc), [data]);

	return { data: sorted, loading, error };
}

export interface SplitScheduled {
	/** Still to run (`pending`), soonest first. */
	upcoming: ScheduledAction[];
	/** Everything else (done / failed / cancelled / running), most recent first. */
	past: ScheduledAction[];
}

export function splitScheduled(actions: ScheduledAction[]): SplitScheduled {
	const upcoming = actions.filter((a) => a.status === 'pending').sort(byRunAtAsc);
	const past = actions.filter((a) => a.status !== 'pending').sort((a, b) => b.runAt - a.runAt);

	return { upcoming, past };
}

/** The next pending action targeting `statementId`, if any. */
export function nextActionFor(
	actions: ScheduledAction[],
	statementId: string,
): ScheduledAction | undefined {
	return actions
		.filter((a) => a.status === 'pending' && a.statementId === statementId)
		.sort(byRunAtAsc)[0];
}
