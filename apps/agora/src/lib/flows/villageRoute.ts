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
		typeof payload.itemId === 'string' &&
		viewingIndex >= 0 &&
		viewingIndex <= currentIndex &&
		plan[viewingIndex]?.itemId === payload.itemId
	);
}

/** The desk follows the item, so another question in the same building has its own paper. */
export function villageDesk(
	item: AgoraStagePlanItem | undefined,
): { label: string; prompt: string } | null {
	if (!item || (item.stage !== AgoraStage.question && item.stage !== AgoraStage.deliberation))
		return null;
	const kind = item.stage === AgoraStage.question ? questionKindOf(item) : 'proposal';
	const copy = {
		story: { label: 'הסיפור שלי', prompt: 'הפתק שלך מחכה על השולחן. איזה סיפור אישי תרצה לשתף?' },
		needs: {
			label: 'הצרכים שלי',
			prompt: 'מה חשוב לך? כתוב על הפתק שלך את הצרכים שחשוב לך שנכיר.',
		},
		vision: { label: 'החזון שלי', prompt: 'איך היית רוצה שייראה העתיד? הפתק שלך מחכה על השולחן.' },
		open: { label: 'התשובה שלי', prompt: 'מה דעתך? כתוב את התשובה שלך על הפתק שעל השולחן.' },
		proposal: {
			label: 'ההצעה שלי',
			prompt: 'איזה פתרון אתה מציע? כתוב את ההצעה שלך על הפתק שעל השולחן.',
		},
	};

	return copy[kind];
}

export function acceptsVillageWrite(
	payload: unknown,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	viewingIndex: number,
): boolean {
	if (!payload || typeof payload !== 'object' || !('type' in payload) || !('itemId' in payload))
		return false;

	return (
		payload.type === 'agora-village-write' &&
		typeof payload.itemId === 'string' &&
		viewingIndex === currentIndex &&
		viewingIndex >= 0 &&
		plan[viewingIndex]?.itemId === payload.itemId &&
		villageDesk(plan[viewingIndex]) !== null
	);
}
