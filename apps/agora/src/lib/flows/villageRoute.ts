import { canWritePlanItem } from './stageAccess';
import { AgoraStage, questionKindOf, type AgoraStagePlanItem } from '@freedi/shared-types';

/**
 * A place in the village. Three are fixed — the library (learning scenes),
 * the study house (the meeting point) and the council (the scoreboard, the
 * vote, the decision) — and every QUESTION of the plan, the deliberation
 * included, has a booth of its own: `booth:<itemId>`. The plan item's stable
 * id stays the data identity; the place is presentation only.
 */
export type VillagePlace = 'library' | 'challenge' | 'council' | `booth:${string}`;

/** What a booth asks for — the writing desk's copy and the pavilion's colour follow it */
export type VillageBoothKind = 'story' | 'needs' | 'vision' | 'open' | 'proposal';

export interface VillageBooth {
	itemId: string;
	place: VillagePlace;
	label: string;
	kind: VillageBoothKind;
	/** Position in the plan, so the world can order the booths as the lesson runs */
	index: number;
	/** The teacher has reached this question — its board and desk are usable */
	open: boolean;
	/** The question the room is on right now — the pennant flies here */
	current: boolean;
}

/** Who moves students between stations — see `AgoraSession.villageNavigation` */
export type VillageNavigation = 'teacher' | 'free';

export interface VillagePlaceStatus {
	/** The student may walk in: the room has reached it (the meeting point and the council always) */
	open: boolean;
	/** The room is here right now */
	current: boolean;
	/** The lesson uses this place at all — a library with no scenes stays off the map */
	inPlan: boolean;
}

/**
 * The fixed places' state for the village map. The study house is where the
 * lesson gathers and the council holds the scoreboard, so both are always
 * open; the library opens with its first scene.
 */
export function villageFixedPlaces(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): Record<'library' | 'challenge' | 'council', VillagePlaceStatus> {
	const status = (place: VillagePlace): VillagePlaceStatus => {
		const indices = plan.flatMap((item, index) => (villagePlace(item) === place ? [index] : []));

		return {
			open: indices.some((index) => index <= currentIndex),
			current: indices.includes(currentIndex),
			inPlan: indices.length > 0,
		};
	};

	return {
		library: status('library'),
		challenge: { ...status('challenge'), open: true, inPlan: true },
		council: { ...status('council'), open: true, inPlan: true },
	};
}

export function boothPlace(itemId: string): VillagePlace {
	return `booth:${itemId}`;
}

export function isBoothPlace(place: string): place is `booth:${string}` {
	return place.startsWith('booth:');
}

/** The item a booth place stands for, or null for a fixed place */
export function boothItemId(place: string): string | null {
	return isBoothPlace(place) ? place.slice('booth:'.length) : null;
}

export function villageBoothKind(item: AgoraStagePlanItem): VillageBoothKind | null {
	if (item.stage === AgoraStage.question) return questionKindOf(item);
	if (item.stage === AgoraStage.deliberation) return 'proposal';

	return null;
}

export function villagePlace(item: AgoraStagePlanItem): VillagePlace {
	if (villageBoothKind(item) !== null) return boothPlace(item.itemId);
	switch (item.stage) {
		case AgoraStage.framing:
		case AgoraStage.perspectives:
		case AgoraStage.needs:
		case AgoraStage.valueIdentification:
		case AgoraStage.positioning:
			return 'library';
		case AgoraStage.voting:
		case AgoraStage.results:
		case AgoraStage.ended:
			return 'council';
		default:
			return 'challenge';
	}
}

/**
 * Every booth of this lesson, in plan order — one per question, whether the
 * teacher has reached it or not. A booth ahead of the room stands in the
 * village closed, so the class can see the whole road; it opens when the
 * teacher gets there.
 */
export function villageBooths(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	labelOf: (item: AgoraStagePlanItem) => string,
): VillageBooth[] {
	const booths: VillageBooth[] = [];
	plan.forEach((item, index) => {
		const kind = villageBoothKind(item);
		if (kind === null) return;
		booths.push({
			itemId: item.itemId,
			place: boothPlace(item.itemId),
			label: item.title?.trim() || labelOf(item),
			kind,
			index,
			open: index <= currentIndex,
			current: index === currentIndex,
		});
	});

	return booths;
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
		canWritePlanItem(plan, currentIndex, viewingIndex) &&
		viewingIndex >= 0 &&
		plan[viewingIndex]?.itemId === payload.itemId &&
		villageDesk(plan[viewingIndex]) !== null
	);
}
