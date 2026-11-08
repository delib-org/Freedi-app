import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';

/**
 * The move-class sheet's rows and the consequences of a jump — pure, so the
 * sheet is a renderer and the rules live where a test can reach them.
 *
 * Two different moves hide behind "move the class to a station", and the
 * sheet must never blur them:
 *
 * - GATHER: every student's village walks to an opened station (the one the
 *   class is on, or an earlier one). The room's position does not change;
 *   nothing closes. This is the teacher's `villageCall`.
 * - ADVANCE: the room's pointer moves forward, through the one callable that
 *   ever moves it. The question just left closes and gets its summary; any
 *   station skipped over never opens. Always behind a confirm that names
 *   those consequences.
 *
 * Backwards is not a move: a past station can be gathered at, not reopened.
 */
export type MoveRowKind = 'walk-me' | 'gather' | 'next' | 'jump';

export interface MoveRow {
	kind: MoveRowKind;
	itemId: string;
	/** Position in the plan */
	index: number;
	/** The room is here right now */
	current: boolean;
	/** "4 of 9 wrote" — only known for the room's current item */
	done?: number;
	total?: number;
}

export interface MoveClassInput {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	/** Where the teacher's own class view is standing (= currentIndex on the board) */
	viewingIndex: number;
	/** The class's progress on the current item, when the console knows it */
	currentProgress?: { done: number; total: number };
	/** Forward rows (next + jumps) — off, and the sheet only gathers */
	allowForward: boolean;
}

/** A station students can stand at: not the waiting room, not the lesson's end marker */
function isStation(item: AgoraStagePlanItem): boolean {
	return item.stage !== AgoraStage.lobby && item.stage !== AgoraStage.ended;
}

export function moveClassRows(input: MoveClassInput): MoveRow[] {
	const { plan, currentIndex, viewingIndex, currentProgress, allowForward } = input;
	const rows: MoveRow[] = [];
	const current = plan[currentIndex];

	// First, when the teacher is reading somewhere else: the way back to the class
	if (current && viewingIndex !== currentIndex) {
		rows.push({ kind: 'walk-me', itemId: current.itemId, index: currentIndex, current: true });
	}

	plan.forEach((item, index) => {
		if (!isStation(item)) return;
		if (index <= currentIndex) {
			rows.push({
				kind: 'gather',
				itemId: item.itemId,
				index,
				current: index === currentIndex,
				...(index === currentIndex && currentProgress ? currentProgress : {}),
			});

			return;
		}
		if (!allowForward) return;
		rows.push({
			kind: index === currentIndex + 1 ? 'next' : 'jump',
			itemId: item.itemId,
			index,
			current: false,
		});
	});

	return rows;
}

export interface JumpConsequences {
	/** The question the room leaves closes and gets its summary; how many had not finished */
	closes: { itemId: string; unfinished: number } | null;
	/** Stations between here and there that will never open */
	skipped: string[];
	/** The target is the lesson's end: the room goes straight to the results */
	ends: boolean;
}

export function jumpConsequences(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	toIndex: number,
	currentProgress?: { done: number; total: number },
): JumpConsequences {
	const current = plan[currentIndex];
	const target = plan[toIndex];
	const closes =
		current && current.stage === AgoraStage.question
			? {
					itemId: current.itemId,
					unfinished: currentProgress
						? Math.max(0, currentProgress.total - currentProgress.done)
						: 0,
				}
			: null;
	const skipped = plan
		.slice(currentIndex + 1, toIndex)
		.filter(isStation)
		.map((item) => item.itemId);
	const ends =
		!!target && (target.stage === AgoraStage.results || target.stage === AgoraStage.ended);

	return { closes, skipped, ends };
}
