import {
	AgoraSessionStatus,
	AgoraStage,
	currentPlanIndex,
	resolveStagePlan,
	type AgoraSession,
	type AgoraStagePlanItem,
	type StagePlanSession,
} from '@freedi/shared-types';

/** Questions stay open for catch-up; the proposal round and ballot keep their own closing time. */
export function canWritePlanItem(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	viewingIndex: number,
): boolean {
	const current: AgoraStagePlanItem | undefined = plan[currentIndex];
	const viewing: AgoraStagePlanItem | undefined = plan[viewingIndex];
	if (!current || !viewing || viewingIndex > currentIndex) return false;
	if (current.stage === AgoraStage.results || current.stage === AgoraStage.ended) return false;

	return (
		viewing.stage === AgoraStage.question ||
		(viewing.stage === AgoraStage.deliberation && viewingIndex === currentIndex)
	);
}

export function canWriteStage(
	session: StagePlanSession & Pick<AgoraSession, 'status'>,
	itemId: string,
): boolean {
	if (session.status === AgoraSessionStatus.ended) return false;
	const plan: AgoraStagePlanItem[] = resolveStagePlan(session);

	return canWritePlanItem(
		plan,
		currentPlanIndex(session),
		plan.findIndex((item) => item.itemId === itemId),
	);
}
