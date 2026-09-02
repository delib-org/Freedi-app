/**
 * Where a player is LOOKING, as opposed to where the room IS.
 *
 * The session says which stage is current; the player may step back to any
 * stage already opened and re-read it. That choice is theirs alone, so it
 * lives on their device, and it never outranks the room: the moment the
 * teacher opens the next stage everyone is carried there, and a step back
 * to a stage that was never opened is refused.
 *
 * Pure — no Mithril, no storage. The controller persists the string and runs
 * the redraws.
 */
import type { AgoraStagePlanItem } from '@freedi/shared-types';

export interface StageNavState {
	/** null = looking at the current stage */
	viewingItemId: string | null;
}

export const INITIAL_STAGE_NAV: StageNavState = { viewingItemId: null };

export type StageNavEvent =
	| { kind: 'select'; itemId: string }
	| { kind: 'session-advanced' }
	| { kind: 'restore'; raw: string | null };

function openedIndex(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	itemId: string,
): number {
	const index = plan.findIndex((item) => item.itemId === itemId);

	return index !== -1 && index <= currentIndex ? index : -1;
}

export function stageNavReduce(
	state: StageNavState,
	event: StageNavEvent,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): StageNavState {
	switch (event.kind) {
		case 'select': {
			const index = openedIndex(plan, currentIndex, event.itemId);
			if (index === -1) return state;

			return { viewingItemId: index === currentIndex ? null : event.itemId };
		}
		case 'session-advanced':
			return state.viewingItemId === null ? state : { viewingItemId: null };
		case 'restore': {
			const raw = (event.raw ?? '').trim();
			if (!raw) return INITIAL_STAGE_NAV;
			const index = openedIndex(plan, currentIndex, raw);

			return index === -1 || index === currentIndex ? INITIAL_STAGE_NAV : { viewingItemId: raw };
		}
		default:
			return state;
	}
}

/** The plan position actually on screen: the chosen stage if opened, else the current one */
export function effectiveIndex(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	viewingItemId: string | null,
): number {
	if (viewingItemId === null) return currentIndex;
	const index = openedIndex(plan, currentIndex, viewingItemId);

	return index === -1 ? currentIndex : index;
}

export function serializeStageNav(state: StageNavState): string {
	return state.viewingItemId ?? '';
}
