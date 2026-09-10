import { AgoraStage, questionKindOf, type AgoraStagePlanItem } from '@freedi/shared-types';

export type VillagePlace = 'library' | 'challenge' | 'story' | 'needs' | 'solution' | 'council';

/** A place is presentation only. The plan item's stable ID remains the data identity. */
export function villagePlace(item: AgoraStagePlanItem): VillagePlace {
	if (item.stage === AgoraStage.question) {
		const kind = questionKindOf(item);
		if (kind === 'story') return 'story';
		if (kind === 'needs') return 'needs';

		return 'solution';
	}
	switch (item.stage) {
		case AgoraStage.framing:
		case AgoraStage.perspectives:
			return 'library';
		case AgoraStage.needs:
		case AgoraStage.valueIdentification:
		case AgoraStage.positioning:
			return 'library';
		case AgoraStage.deliberation:
			return 'solution';
		case AgoraStage.voting:
		case AgoraStage.results:
		case AgoraStage.ended:
			return 'council';
		default:
			return 'challenge';
	}
}

/** The iframe may request entry, never change a stage or open a future item. */
export function acceptsVillageEntry(
	payload: unknown,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	viewingIndex: number,
): boolean {
	if (!payload || typeof payload !== 'object' || !('type' in payload) || !('itemId' in payload))
		return false;

	return (
		payload.type === 'agora-village-enter' &&
		viewingIndex >= 0 &&
		viewingIndex <= currentIndex &&
		plan[viewingIndex]?.itemId === payload.itemId
	);
}
