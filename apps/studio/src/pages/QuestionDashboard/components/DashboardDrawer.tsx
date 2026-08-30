import { activityUrlResolver } from '@/config';
import { useCallback, type FC } from 'react';
import { ActivityType, type ScheduledAction } from '@freedi/shared-types';
import type { ActivityRunState, DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { FacilitateDrawer } from '@/components/atomic/organisms/FacilitateDrawer';
import type { NudgePayload } from '@/components/atomic/molecules/NudgeComposer';
import {
	nudgeQuestionSubscribers,
	studioSetDocumentStatus,
	type DocumentRunStatus,
	type StudioDraftFromResultsResult,
	type StudioSeedOptionsResult,
} from '@/db/orgFunctions';
import type { ProgressMap } from '@/db/progress';
import { nextActionFor } from '@/db/scheduledActions';
import { reorderChildren } from '@/db/statements';
import { useStatusWithUndo } from '../useStatusWithUndo';
import DraftFromResults from './DraftFromResults';
import SeedSuggestions from './SeedSuggestions';

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
	/** Scheduled actions of the whole top question (the drawer picks its own). */
	scheduled?: ScheduledAction[];
	canManage: boolean;
	onClose: () => void;
	onArchiveRequest: (statementId: string) => void;
	/** Plain confirmation toast (e.g. after a draft is written). */
	onToast?: (message: string) => void;
}

const DashboardDrawer: FC<DashboardDrawerProps> = ({
	orgId,
	qId,
	activity,
	activities,
	progressById,
	scheduled = [],
	canManage,
	onClose,
	onArchiveRequest,
	onToast,
}) => {
	const { tWithParams } = useTranslation();
	const changeStatus = useStatusWithUndo();
	const index = activities.findIndex((a) => a.statementId === activity.statementId);
	const id = activity.statementId;
	const isDocument = activity.type === ActivityType.signDocument;
	const isCrowdSurvey = activity.type === ActivityType.massConsensus;

	const handleStatusChange = useCallback(
		async (next: ActivityRunState) => {
			if (isDocument) {
				// Documents keep their state in Sign (`signSettings`), written by
				// the function — not in `questionStatus`.
				if (next === 'queued') return;
				await studioSetDocumentStatus({ statementId: id, status: next as DocumentRunStatus });

				return;
			}
			await changeStatus(id, activity.runState, next);
		},
		[changeStatus, id, activity.runState, isDocument],
	);

	const handleDrafted = useCallback(
		(result: StudioDraftFromResultsResult) => {
			onToast?.(
				tWithParams('{{count}} paragraphs written · {{gaps}} open gaps — review it in Sign', {
					count: result.paragraphCount,
					gaps: result.openGaps,
				}),
			);
		},
		[onToast, tWithParams],
	);

	const handleSeeded = useCallback(
		(result: StudioSeedOptionsResult) => {
			onToast?.(
				tWithParams('{{created}} suggestions added ({{total}} in total)', {
					created: result.created,
					total: result.total,
				}),
			);
		},
		[onToast, tWithParams],
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

	const nextScheduled = nextActionFor(scheduled, id);

	const runHref =
		activity.type === ActivityType.join ? `/orgs/${orgId}/questions/${qId}/run/${id}` : undefined;

	// Crowd survey without a survey yet: send the consultant to MC's pre-seeded
	// "new survey" page and bring them back to this drawer afterwards.
	const setupSurveyHref =
		activity.type === ActivityType.massConsensus && !activity.surveyId
			? activityUrlResolver.getNewSurveyLink({
					questionId: id,
					parentStatementId: qId,
					returnTo: `${window.location.origin}/orgs/${orgId}/questions/${qId}?activity=${id}`,
				}).href
			: undefined;

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
			setupSurveyHref={setupSurveyHref}
			nextScheduled={nextScheduled}
			readOnly={!canManage}
			documentTools={
				isDocument && canManage ? (
					<DraftFromResults
						document={activity}
						activities={activities}
						editorHref={activity.admin?.href}
						onDrafted={handleDrafted}
					/>
				) : undefined
			}
			surveyTools={
				isCrowdSurvey && canManage ? (
					<SeedSuggestions survey={activity} onSeeded={handleSeeded} />
				) : undefined
			}
		/>
	);
};

export default DashboardDrawer;
