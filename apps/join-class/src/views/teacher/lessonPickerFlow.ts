import type { PlanRow } from '@/lib/planTree';

/**
 * "+ שיעור עם כיתה" on the teacher home (task dr6ZNqxq, extends
 * docs/ia/join-class-lesson-plan.md): which lesson plan, which game when the plan has
 * two or more, then the class form. Or a new plan, written first. A pure state machine:
 * no DOM, no Firebase. The view asks for the next step and, for a back move, where
 * focus goes. Nothing here writes.
 *
 *   idle -> plan -> game -> class
 *               \-> class          (a plan with one game)
 *               \-> name -> (the game screen, via createPlan)
 *   idle -> name                  (no plan can be listed)
 */

/** The plan list shows a name filter above this many plans (IA 8). */
export const PLAN_FILTER_FROM = 10;

export type PickerStep =
	| { kind: 'idle' }
	| { kind: 'plan' }
	| { kind: 'game'; planId: string }
	/** `fromList`: the plan list is behind it, so back goes there; otherwise back closes. */
	| { kind: 'name'; fromList: boolean }
	/** `viaGames`: the game list is behind it, so back goes there; otherwise to the plan list. */
	| { kind: 'class'; planId: string; gameId: string; viaGames: boolean };

/** Where focus goes after a move. */
export type PickerFocus = 'addLesson' | 'lead' | 'input';

export interface PickerMove {
	step: PickerStep;
	focus: PickerFocus;
}

/** The game fields the picker needs. */
export interface PickerGame {
	gameId: string;
	title: string;
}

export const IDLE_PICKER: PickerStep = { kind: 'idle' };

/** Games per plan: undefined while the count is still being read. */
export type GameCountOf = (planId: string) => number | undefined;

/** Only plans with a game doc can start a lesson: an old lesson standing in as a plan has none. */
export function listablePlans(rows: readonly PlanRow[], countOf: GameCountOf): PlanRow[] {
	return rows.filter((row) => row.doc !== null && (countOf(row.planId) ?? 0) > 0);
}

/** Every plan that could have games has had its count read. */
export function countsKnown(rows: readonly PlanRow[], countOf: GameCountOf): boolean {
	return rows.every((row) => row.doc === null || countOf(row.planId) !== undefined);
}

export function needsFilter(planCount: number): boolean {
	return planCount > PLAN_FILTER_FROM;
}

/** "+ שיעור עם כיתה": the plan list, or straight to the name form when no plan can be listed. */
export function openPicker(step: PickerStep, listable: number, allKnown: boolean): PickerMove {
	if (step.kind !== 'idle') return { step, focus: 'lead' };
	if (listable === 0 && allKnown) {
		return { step: { kind: 'name', fromList: false }, focus: 'input' };
	}

	return { step: { kind: 'plan' }, focus: 'lead' };
}

/**
 * A plan was picked and its games read. One game: the class form. Two or more: the
 * game list. None (the plan lost its games): null, the view says so and stays.
 */
export function pickPlan(
	step: PickerStep,
	planId: string,
	games: readonly PickerGame[],
): PickerMove | null {
	if (step.kind !== 'plan') return null;
	if (games.length === 0) return null;
	if (games.length === 1) {
		return {
			step: { kind: 'class', planId, gameId: games[0].gameId, viaGames: false },
			focus: 'lead',
		};
	}

	return { step: { kind: 'game', planId }, focus: 'lead' };
}

export function pickGame(step: PickerStep, gameId: string): PickerMove | null {
	if (step.kind !== 'game') return null;

	return { step: { kind: 'class', planId: step.planId, gameId, viaGames: true }, focus: 'lead' };
}

/** "+ מערך שיעור חדש" at the end of the plan list. */
export function chooseNewPlan(step: PickerStep): PickerMove | null {
	if (step.kind !== 'plan') return null;

	return { step: { kind: 'name', fromList: true }, focus: 'input' };
}

/** One step back. From the first step it closes, and focus returns to "+ שיעור עם כיתה". */
export function stepBack(step: PickerStep): PickerMove {
	switch (step.kind) {
		case 'game':
			return { step: { kind: 'plan' }, focus: 'lead' };
		case 'name':
			return step.fromList
				? { step: { kind: 'plan' }, focus: 'lead' }
				: { step: IDLE_PICKER, focus: 'addLesson' };
		case 'class':
			return step.viaGames
				? { step: { kind: 'game', planId: step.planId }, focus: 'lead' }
				: { step: { kind: 'plan' }, focus: 'lead' };
		default:
			return { step: IDLE_PICKER, focus: 'addLesson' };
	}
}
