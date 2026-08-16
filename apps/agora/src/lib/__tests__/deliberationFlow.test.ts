import { describe, it, expect } from 'vitest';
import {
	INITIAL_CYCLE,
	advanceCycle,
	applyCyclePatch,
	restoreCycle,
	screenForStep,
	type DeliberationCycle,
} from '../flows/deliberationFlow';

/**
 * These rules lived inside a 2,899-line view and had never been tested: when a
 * lap turns, which tab a step lands you on, when the square is finished, and
 * what a corrupt sessionStorage value does to a student mid-lesson.
 */
describe('deliberation cycle', () => {
	describe('screenForStep', () => {
		it('puts the mine step on the My screen and everything else on the square', () => {
			expect(screenForStep('mine')).toBe('my');
			expect(screenForStep('rate')).toBe('others');
			expect(screenForStep('help')).toBe('others');
			expect(screenForStep('done')).toBe('others');
		});
	});

	describe('applyCyclePatch', () => {
		it('reports a step change and where it lands', () => {
			const t = applyCyclePatch(INITIAL_CYCLE, { step: 'rate', rated: 0 });
			expect(t.stepChanged).toBe(true);
			expect(t.screen).toBe('others');
			expect(t.cycle.step).toBe('rate');
		});

		it('leaves the screen alone when only the count moves', () => {
			// Rating a classmate must not yank the student to another tab
			const t = applyCyclePatch({ round: 1, step: 'rate', rated: 1 }, { rated: 2 });
			expect(t.stepChanged).toBe(false);
			expect(t.screen).toBeNull();
			expect(t.splash).toBeNull();
			expect(t.cycle.rated).toBe(2);
		});

		it('re-setting the same step is not a change', () => {
			const t = applyCyclePatch({ round: 1, step: 'rate', rated: 3 }, { step: 'rate' });
			expect(t.stepChanged).toBe(false);
			expect(t.splash).toBeNull();
		});

		it('announces a new lap, not the step inside it', () => {
			// One splash at a time, or arriving at a new round announces itself twice
			const t = applyCyclePatch({ round: 1, step: 'help', rated: 3 }, { round: 2, step: 'mine' });
			expect(t.splash).toEqual({ kind: 'round', round: 2 });
		});

		it('says nothing when the square closes', () => {
			// `done` is not a place you walked into
			const t = applyCyclePatch({ round: 3, step: 'help', rated: 3 }, { step: 'done' });
			expect(t.stepChanged).toBe(true);
			expect(t.splash).toBeNull();
		});

		it('does not mutate the state it was given', () => {
			const before: DeliberationCycle = { round: 1, step: 'mine', rated: 0 };
			applyCyclePatch(before, { round: 2, step: 'rate' });
			expect(before).toEqual({ round: 1, step: 'mine', rated: 0 });
		});
	});

	describe('advanceCycle', () => {
		it('turns the lap over and starts it on my own proposal', () => {
			const a = advanceCycle({ round: 1, step: 'help', rated: 3 }, 3);
			expect(a.finished).toBe(false);
			expect(a.cycle).toEqual({ round: 2, step: 'mine', rated: 0 });
			expect(a.splash).toEqual({ kind: 'round', round: 2 });
		});

		it('finishes on the last lap instead of starting a fourth', () => {
			const a = advanceCycle({ round: 3, step: 'help', rated: 3 }, 3);
			expect(a.finished).toBe(true);
			expect(a.cycle.step).toBe('done');
			expect(a.cycle.round).toBe(3);
		});

		it('finishes if a stored round somehow ran past the end', () => {
			expect(advanceCycle({ round: 9, step: 'help', rated: 0 }, 3).finished).toBe(true);
		});

		it('a one-lap game is over after its only lap', () => {
			expect(advanceCycle({ round: 1, step: 'help', rated: 2 }, 1).finished).toBe(true);
		});
	});

	describe('restoreCycle', () => {
		it('starts a fresh student at lap one, writing', () => {
			expect(restoreCycle(null)).toEqual(INITIAL_CYCLE);
		});

		it('puts a returning student back where they were', () => {
			expect(restoreCycle(JSON.stringify({ round: 2, step: 'help', rated: 3 }))).toEqual({
				round: 2,
				step: 'help',
				rated: 3,
			});
		});

		// A student mid-lesson must never be crashed out by a bad stored value
		it('survives corrupt JSON', () => {
			expect(restoreCycle('{not json')).toEqual(INITIAL_CYCLE);
		});

		it('rejects a step that is not a step', () => {
			expect(restoreCycle(JSON.stringify({ step: 'nonsense' })).step).toBe('mine');
		});

		it('rejects impossible numbers', () => {
			expect(restoreCycle(JSON.stringify({ round: 0, rated: -5 }))).toEqual(INITIAL_CYCLE);
			expect(restoreCycle(JSON.stringify({ round: 'two' })).round).toBe(1);
		});

		it('fills in what a partial value leaves out', () => {
			expect(restoreCycle(JSON.stringify({ step: 'rate' }))).toEqual({
				round: 1,
				step: 'rate',
				rated: 0,
			});
		});
	});
});
