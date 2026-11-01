import type { Statement } from '@freedi/shared-types';
import { GOAL_BOX, GoalWatch, PITCH_HEIGHT, goalLayout, slotsIn } from '../goalBalls';

function p(id: string, consensus?: number, hide?: boolean): Statement {
	return { statementId: id, statement: id, consensus, hide } as unknown as Statement;
}

describe('goalLayout', () => {
	it('puts a proposal in the goal once its C_p reaches the gate', () => {
		const { balls } = goalLayout([p('a', 0.8), p('b', 0.6), p('c', 0.59)], 0.6);
		const inGoal = balls.filter((b) => b.inGoal).map((b) => b.id);
		expect(inGoal).toEqual(['a', 'b']);
		expect(balls.find((b) => b.id === 'c')?.inGoal).toBe(false);
	});

	it('leaves unrated proposals outside the goal', () => {
		const { balls } = goalLayout([p('a'), p('b')], 0.6);
		expect(balls.every((b) => !b.inGoal)).toBe(true);
	});

	it('skips hidden proposals', () => {
		expect(goalLayout([p('a', 0.9, true), p('b', 0.9)], 0.6).balls.map((b) => b.id)).toEqual(['b']);
	});

	it('keeps goal balls inside the goal box and field balls below the goal line', () => {
		const options = Array.from({ length: 30 }, (_, i) => p(`id${i}`, i % 2 ? 0.9 : 0.1));
		for (const ball of goalLayout(options, 0.6).balls) {
			if (ball.inGoal) {
				expect(ball.x).toBeGreaterThan(GOAL_BOX.x);
				expect(ball.x).toBeLessThan(GOAL_BOX.x + GOAL_BOX.width);
				expect(ball.y).toBeLessThan(GOAL_BOX.height);
			} else {
				expect(ball.y).toBeGreaterThan(GOAL_BOX.height);
				expect(ball.y).toBeLessThan(PITCH_HEIGHT);
			}
		}
	});

	it('shrinks the balls as more proposals arrive', () => {
		const few = goalLayout([p('a')], 0.6).size;
		const many = goalLayout(
			Array.from({ length: 60 }, (_, i) => p(`id${i}`)),
			0.6,
		).size;
		expect(many).toBeLessThan(few);
	});

	it('moves a ball into the goal when it scores', () => {
		const before = goalLayout([p('a', 0.1), p('b', 0.1), p('c', 0.1)], 0.6);
		const after = goalLayout([p('a', 0.9), p('b', 0.1), p('c', 0.1)], 0.6);
		expect(before.balls.find((b) => b.id === 'a')?.inGoal).toBe(false);
		expect(after.balls.find((b) => b.id === 'a')?.inGoal).toBe(true);
	});
});

describe('slotsIn', () => {
	it('centres a short row', () => {
		const [only] = slotsIn({ x: 0, y: 0, width: 100, height: 10 }, 1, 10);
		expect(only.x).toBe(50);
	});
});

describe('GoalWatch', () => {
	it('does not report proposals already in the goal at the first full load', () => {
		const watch = new GoalWatch();
		expect(watch.update('l', true, ['a'])).toEqual([]);
	});

	it('takes no baseline from a partial first snapshot', () => {
		const watch = new GoalWatch();
		// partial (cache) snapshot: a is in, the rest has not arrived
		expect(watch.update('l', false, ['a'])).toEqual([]);
		// the full load adds b, which was already in: no whistle for either
		expect(watch.update('l', true, ['a', 'b'])).toEqual([]);
		expect(watch.update('l', true, ['a', 'b', 'c'])).toEqual(['c']);
	});

	it('reports a proposal once when it crosses the gate', () => {
		const watch = new GoalWatch();
		watch.update('l', true, []);
		expect(watch.update('l', true, ['a'])).toEqual(['a']);
		expect(watch.update('l', true, ['a'])).toEqual([]);
	});

	it('does not whistle again when a proposal drops out and comes back', () => {
		const watch = new GoalWatch();
		watch.update('l', true, []);
		expect(watch.update('l', true, ['a'])).toEqual(['a']);
		expect(watch.update('l', true, [])).toEqual([]);
		expect(watch.update('l', true, ['a'])).toEqual([]);
	});

	it('a new watch (re-entering the step) rebaselines from the current state', () => {
		const first = new GoalWatch();
		first.update('l', true, []);
		expect(first.update('l', true, ['a'])).toEqual(['a']);
		const second = new GoalWatch();
		expect(second.update('l', true, ['a'])).toEqual([]);
	});

	it('starts over for another lesson', () => {
		const watch = new GoalWatch();
		watch.update('one', true, ['a']);
		expect(watch.update('two', true, ['a'])).toEqual([]);
	});
});
