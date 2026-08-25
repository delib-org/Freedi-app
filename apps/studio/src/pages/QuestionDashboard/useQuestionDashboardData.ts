import { useMemo } from 'react';
import { ActivityType, type Statement } from '@freedi/shared-types';
import { deriveActivities, type ActivityRunState, type DerivedActivity } from '@freedi/event-core';
import { activityUrlResolver } from '@/config';
import { useChildren, useStatement } from '@/db/orgStatements';
import {
	sumProgress,
	useQuestionProgressByTop,
	type ProgressCounts,
	type ProgressMap,
} from '@/db/progress';

/**
 * Everything the question dashboard reads, derived from three live
 * subscriptions: the top question, its direct children and the progress
 * records of the whole subtree.
 */

export interface RollupStatus {
	state: ActivityRunState;
	openCount: number;
	total: number;
}

/** any open → open; else any frozen → frozen; else all closed → closed; else queued. */
export function computeRollup(activities: DerivedActivity[]): RollupStatus {
	const total = activities.length;
	const openCount = activities.filter((a) => a.runState === 'open').length;
	if (openCount > 0) return { state: 'open', openCount, total };
	if (activities.some((a) => a.runState === 'frozen')) return { state: 'frozen', openCount, total };
	if (total > 0 && activities.every((a) => a.runState === 'closed')) {
		return { state: 'closed', openCount, total };
	}

	return { state: 'queued', openCount, total };
}

export interface QuestionDashboardData {
	question: Statement | null;
	questionLoading: boolean;
	activities: DerivedActivity[];
	activitiesLoading: boolean;
	progressById: ProgressMap;
	totals: ProgressCounts;
	membersById: Record<string, number>;
	lastActivityById: Record<string, number>;
	rollup: RollupStatus;
	hasJoin: boolean;
}

export function useQuestionDashboardData(qId: string | undefined): QuestionDashboardData {
	const { data: question, loading: questionLoading } = useStatement(qId);
	const { data: children, loading: activitiesLoading } = useChildren(qId);
	const { data: progressById } = useQuestionProgressByTop(qId);

	const activities = useMemo(
		() =>
			deriveActivities(
				children.filter((child) => !child.hide),
				activityUrlResolver,
			),
		[children],
	);

	const membersById = useMemo(
		() =>
			children.reduce<Record<string, number>>((acc, child) => {
				if (typeof child.numberOfMembers === 'number') {
					acc[child.statementId] = child.numberOfMembers;
				}

				return acc;
			}, {}),
		[children],
	);

	const lastActivityById = useMemo(
		() =>
			children.reduce<Record<string, number>>((acc, child) => {
				const recorded = progressById[child.statementId]?.lastActivity;
				const stamp =
					recorded && recorded > 0 ? recorded : (child.lastChildUpdate ?? child.lastUpdate);
				if (stamp) acc[child.statementId] = stamp;

				return acc;
			}, {}),
		[children, progressById],
	);

	const totals = useMemo(() => sumProgress(progressById), [progressById]);
	const rollup = useMemo(() => computeRollup(activities), [activities]);
	const hasJoin = activities.some((a) => a.type === ActivityType.join);

	return {
		question,
		questionLoading,
		activities,
		activitiesLoading,
		progressById,
		totals,
		membersById,
		lastActivityById,
		rollup,
		hasJoin,
	};
}
