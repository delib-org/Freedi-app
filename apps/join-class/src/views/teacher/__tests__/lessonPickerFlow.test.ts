import { describe, it, expect } from 'vitest';
import type { ClassPlan } from '@freedi/shared-types';
import type { PlanRow } from '@/lib/planTree';
import {
	IDLE_PICKER,
	PLAN_FILTER_FROM,
	chooseNewPlan,
	countsKnown,
	createReadGuard,
	listablePlans,
	needsFilter,
	openPicker,
	pickGame,
	pickPlan,
	stepBack,
	type PickerStep,
} from '../lessonPickerFlow';

function row(planId: string, withDoc: boolean): PlanRow {
	return {
		planId,
		title: planId,
		doc: withDoc ? ({ planId } as ClassPlan) : null,
		lessons: [],
		lastActivity: 0,
	};
}

const one = [{ gameId: 'g1', title: 'one' }];
const two = [...one, { gameId: 'g2', title: 'two' }];
const planStep: PickerStep = { kind: 'plan' };

describe('listablePlans', () => {
	it('keeps plans with a game doc and drops old lessons standing in as plans', () => {
		const counts: Record<string, number> = { a: 1, b: 3, c: 0 };
		const rows = [row('a', true), row('old', false), row('b', true), row('c', true)];
		expect(listablePlans(rows, (id) => counts[id]).map((r) => r.planId)).toEqual(['a', 'b']);
	});

	it('drops a plan whose count is unknown yet', () => {
		expect(listablePlans([row('a', true)], () => undefined)).toEqual([]);
	});

	it('keeps a plan whose count read failed, so the list is never empty because of a read', () => {
		expect(
			listablePlans([row('a', true), row('old', false)], () => null).map((r) => r.planId),
		).toEqual(['a']);
	});

	it('keeps the order it was given (by last activity)', () => {
		const rows = [row('z', true), row('a', true)];
		expect(listablePlans(rows, () => 1).map((r) => r.planId)).toEqual(['z', 'a']);
	});
});

describe('countsKnown', () => {
	it('waits for plan docs only', () => {
		expect(countsKnown([row('old', false)], () => undefined)).toBe(true);
		expect(countsKnown([row('a', true)], () => undefined)).toBe(false);
		expect(countsKnown([row('a', true)], () => 0)).toBe(true);
	});

	it('counts a failed read as known, so "loading" cannot stay forever', () => {
		expect(countsKnown([row('a', true)], () => null)).toBe(true);
		expect(
			openPicker(
				IDLE_PICKER,
				1,
				countsKnown([row('a', true)], () => null),
			).step,
		).toEqual(planStep);
	});
});

describe('createReadGuard', () => {
	it('only the latest round is current', () => {
		const guard = createReadGuard();
		const first = guard.begin();
		expect(guard.isCurrent(first)).toBe(true);
		const second = guard.begin();
		expect(guard.isCurrent(first)).toBe(false);
		expect(guard.isCurrent(second)).toBe(true);
	});

	it('a read started before a close/reopen is stale', () => {
		const guard = createReadGuard();
		const inFlight = guard.begin();
		guard.begin(); // close
		guard.begin(); // reopen
		expect(guard.isCurrent(inFlight)).toBe(false);
	});
});

describe('needsFilter', () => {
	it('shows above the threshold only', () => {
		expect(needsFilter(PLAN_FILTER_FROM)).toBe(false);
		expect(needsFilter(PLAN_FILTER_FROM + 1)).toBe(true);
	});
});

describe('openPicker', () => {
	it('opens the plan list when a plan can be listed', () => {
		expect(openPicker(IDLE_PICKER, 2, true)).toEqual({ step: planStep, focus: 'lead' });
	});

	it('goes straight to the name form when none can be listed', () => {
		expect(openPicker(IDLE_PICKER, 0, true)).toEqual({
			step: { kind: 'name', fromList: false },
			focus: 'input',
		});
	});

	it('does not decide "none" while counts are still loading', () => {
		expect(openPicker(IDLE_PICKER, 0, false).step).toEqual(planStep);
	});

	it('does nothing when already open', () => {
		expect(openPicker(planStep, 0, true).step).toBe(planStep);
	});
});

describe('pickPlan and pickGame', () => {
	it('a plan with one game goes straight to the class form', () => {
		expect(pickPlan(planStep, 'p', one)?.step).toEqual({
			kind: 'class',
			planId: 'p',
			gameId: 'g1',
			viaGames: false,
		});
	});

	it('a plan with two or more games asks which game', () => {
		const move = pickPlan(planStep, 'p', two);
		expect(move?.step).toEqual({ kind: 'game', planId: 'p' });
		expect(pickGame(move?.step ?? IDLE_PICKER, 'g2')?.step).toEqual({
			kind: 'class',
			planId: 'p',
			gameId: 'g2',
			viaGames: true,
		});
	});

	it('a plan with no games stays put', () => {
		expect(pickPlan(planStep, 'p', [])).toBeNull();
	});

	it('ignores picks from the wrong step', () => {
		expect(pickPlan(IDLE_PICKER, 'p', one)).toBeNull();
		expect(pickGame(planStep, 'g1')).toBeNull();
	});
});

describe('chooseNewPlan', () => {
	it('opens the name form with the list behind it', () => {
		expect(chooseNewPlan(planStep)?.step).toEqual({ kind: 'name', fromList: true });
	});

	it('is only offered on the plan list', () => {
		expect(chooseNewPlan(IDLE_PICKER)).toBeNull();
	});
});

describe('stepBack', () => {
	it('the plan list closes and focus returns to Add lesson', () => {
		expect(stepBack(planStep)).toEqual({ step: IDLE_PICKER, focus: 'addLesson' });
	});

	it('the game list goes back to the plan list', () => {
		expect(stepBack({ kind: 'game', planId: 'p' }).step).toEqual(planStep);
	});

	it('the name form goes back to the plan list, or closes when it opened first', () => {
		expect(stepBack({ kind: 'name', fromList: true }).step).toEqual(planStep);
		expect(stepBack({ kind: 'name', fromList: false })).toEqual({
			step: IDLE_PICKER,
			focus: 'addLesson',
		});
	});

	it('the class form goes back one step: games when it came from them, else plans', () => {
		expect(stepBack({ kind: 'class', planId: 'p', gameId: 'g', viaGames: true }).step).toEqual({
			kind: 'game',
			planId: 'p',
		});
		expect(stepBack({ kind: 'class', planId: 'p', gameId: 'g', viaGames: false }).step).toEqual(
			planStep,
		);
	});

	it('idle stays idle', () => {
		expect(stepBack(IDLE_PICKER).step).toEqual(IDLE_PICKER);
	});
});
