import { useCallback, type FC } from 'react';
import { ActivityType } from '@freedi/shared-types';
import type { ActivityRunState, DerivedActivity } from '@freedi/event-core';
import { FacilitateDrawer } from '@/components/atomic/organisms/FacilitateDrawer';
import type { NudgePayload } from '@/components/atomic/molecules/NudgeComposer';
import { nudgeQuestionSubscribers } from '@/db/orgFunctions';
import type { ProgressMap } from '@/db/progress';
import { reorderChildren } from '@/db/statements';
import { useStatusWithUndo } from '../useStatusWithUndo';

/**
 * DashboardDrawer — wires FacilitateDrawer to the database for the activity
 * selected via `?activity=`. Archive is delegated upward so the confirm
 * dialog opens after the drawer closes (no nested dialogs).
 */
export interface DashboardDrawerProps {
	orgId: string;
	qId: string;
	activity: DerivedActivity;
	activities: DerivedActivity[];
	progressById: ProgressMap;
	canManage: boolean;
	onClose: () => void;
	onArchiveRequest: (statementId: string) => void;
}

const DashboardDrawer: FC<DashboardDrawerProps> = ({
	orgId,
	qId,
	activity,
	activities,
	progressById,
	canManage,
	onClose,
	onArchiveRequest,
}) => {
	const changeStatus = useStatusWithUndo();
	const index = activities.findIndex((a) => a.statementId === activity.statementId);
	const id = activity.statementId;

	const handleStatusChange = useCallback(
		(next: ActivityRunState) => changeStatus(id, activity.runState, next),
		[changeStatus, id, activity.runState],
	);

	const handleNudge = useCallback(
		async (payload: NudgePayload) => {
			await nudgeQuestionSubscribers({ statementId: id, ...payload });
		},
		[id],
	);

	const handleMove = useCallback(
		async (direction: 'up' | 'down') => {
			const target = direction === 'up' ? index - 1 : index + 1;
			if (index < 0 || target < 0 || target >= activities.length) return;
			const ids = activities.map((a) => a.statementId);
			[ids[index], ids[target]] = [ids[target], ids[index]];
			await reorderChildren(ids);
		},
		[activities, index],
	);

	const runHref =
		activity.type === ActivityType.join ? `/orgs/${orgId}/questions/${qId}/run/${id}` : undefined;

	return (
		<FacilitateDrawer
			isOpen
			onClose={onClose}
			activity={activity}
			index={Math.max(0, index)}
			total={activities.length}
			progress={progressById[id]}
			status={activity.runState}
			onStatusChange={handleStatusChange}
			onNudge={handleNudge}
			onMove={handleMove}
			onArchive={() => onArchiveRequest(id)}
			runHref={runHref}
			readOnly={!canManage}
		/>
	);
};

export default DashboardDrawer;
