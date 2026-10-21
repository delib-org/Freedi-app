import { describe, expect, it } from 'vitest';
import {
	DRAG_START_DISTANCE,
	IDLE,
	arrowDelta,
	dragReducer,
	nextKeyboardTarget,
} from '../dragReducer';
import type { DragState } from '../dragReducer';

const TABLES = [1, 2, 3];

function run(state: DragState, ...actions: Parameters<typeof dragReducer>[1][]) {
	let current = state;
	let effect = null as ReturnType<typeof dragReducer>['effect'];
	for (const action of actions) {
		const result = dragReducer(current, action);
		current = result.state;
		effect = result.effect;
	}

	return { state: current, effect };
}

describe('dragReducer pointer path', () => {
	it('stays pressed under the start distance', () => {
		const { state } = run(
			IDLE,
			{ type: 'press', uid: 'u1', from: 1, x: 0, y: 0 },
			{ type: 'pointerMove', x: DRAG_START_DISTANCE - 1, y: 0, over: 2 },
		);
		expect(state.mode).toBe('pressed');
	});

	it('lifts after the distance and drops on another table', () => {
		const { state, effect } = run(
			IDLE,
			{ type: 'press', uid: 'u1', from: 1, x: 0, y: 0 },
			{ type: 'pointerMove', x: 20, y: 0, over: 2 },
			{ type: 'pointerMove', x: 30, y: 0, over: 3 },
			{ type: 'drop' },
		);
		expect(state).toEqual(IDLE);
		expect(effect).toEqual({ uid: 'u1', toTable: 3 });
	});

	it('a press released without moving is not a move', () => {
		const { effect } = run(
			IDLE,
			{ type: 'press', uid: 'u1', from: 1, x: 0, y: 0 },
			{ type: 'drop' },
		);
		expect(effect).toBeNull();
	});

	it('dropping on the source table is not a move; the strip means unseat', () => {
		const same = run(
			IDLE,
			{ type: 'press', uid: 'u1', from: 2, x: 0, y: 0 },
			{ type: 'pointerMove', x: 50, y: 0, over: 2 },
			{ type: 'drop' },
		);
		expect(same.effect).toBeNull();
		const strip = run(
			IDLE,
			{ type: 'press', uid: 'u1', from: 2, x: 0, y: 0 },
			{ type: 'pointerMove', x: 50, y: 0, over: null },
			{ type: 'drop' },
		);
		expect(strip.effect).toEqual({ uid: 'u1', toTable: null });
	});
});

describe('dragReducer keyboard path', () => {
	it('picks up, steps through the tables and drops', () => {
		const { state, effect } = run(
			IDLE,
			{ type: 'pickUp', uid: 'u1', from: 1 },
			{ type: 'step', delta: 1, tableNumbers: TABLES },
			{ type: 'step', delta: 1, tableNumbers: TABLES },
			{ type: 'drop' },
		);
		expect(state).toEqual(IDLE);
		expect(effect).toEqual({ uid: 'u1', toTable: 3 });
	});

	it('wraps around through the unplaced strip', () => {
		expect(nextKeyboardTarget(3, 1, TABLES)).toBeNull();
		expect(nextKeyboardTarget(null, -1, TABLES)).toBe(3);
		expect(nextKeyboardTarget(1, -1, TABLES)).toBeNull();
	});

	it('escape cancels without an effect', () => {
		const { state, effect } = run(
			IDLE,
			{ type: 'pickUp', uid: 'u1', from: 1 },
			{ type: 'step', delta: 1, tableNumbers: TABLES },
			{ type: 'cancel' },
		);
		expect(state).toEqual(IDLE);
		expect(effect).toBeNull();
	});

	it('steps are ignored when nothing is picked up', () => {
		expect(run(IDLE, { type: 'step', delta: 1, tableNumbers: TABLES }).state).toEqual(IDLE);
	});

	it('arrow keys flip in a right-to-left page', () => {
		expect(arrowDelta('ArrowRight', true)).toBe(-1);
		expect(arrowDelta('ArrowRight', false)).toBe(1);
		expect(arrowDelta('ArrowDown', true)).toBe(1);
		expect(arrowDelta('a', true)).toBeNull();
	});
});
