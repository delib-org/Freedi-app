import { describe, expect, it } from 'vitest';
import {
	ADVANCE_TIMEOUT_MS,
	INITIAL_ADVANCE_LATCH,
	advanceReduce,
	type AdvanceEvent,
	type AdvanceLatch,
} from '../flows/advanceLatch';

const run = (events: AdvanceEvent[], from: AdvanceLatch = INITIAL_ADVANCE_LATCH): AdvanceLatch =>
	events.reduce(advanceReduce, from);

describe('advanceReduce', () => {
	it('presses once: a second press while one is in flight is ignored', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 1000 },
			{ kind: 'press', toIndex: 4, now: 1001 },
		]);
		expect(state).toMatchObject({ advancing: true, intended: 3, pressedAt: 1000 });
	});

	it('an ok answer clears the flight; the snapshot that follows is not "elsewhere"', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 0 },
			{ kind: 'ok' },
			{ kind: 'snapshot', stageIndex: 3 },
		]);
		expect(state).toMatchObject({ advancing: false, failed: false, movedElsewhere: false });
	});

	it('stale while the room is already there is the other device, not a failure', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 0 },
			{ kind: 'stale', stageIndex: 3 },
		]);
		expect(state).toMatchObject({ advancing: false, failed: false, movedElsewhere: true });
	});

	it('stale with the room still behind is a real failure', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 0 },
			{ kind: 'stale', stageIndex: 2 },
		]);
		expect(state).toMatchObject({ advancing: false, failed: true, movedElsewhere: false });
	});

	it('a failure turns quiet once a later snapshot shows the move landed', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 0 },
			{ kind: 'stale', stageIndex: 2 },
			{ kind: 'snapshot', stageIndex: 3 },
		]);
		expect(state).toMatchObject({ failed: false, movedElsewhere: true });
	});

	it('the snapshot that lands the intended move ends the flight, whoever made it', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'press', toIndex: 3, now: 0 },
			{ kind: 'snapshot', stageIndex: 3 },
		]);
		expect(state).toMatchObject({ advancing: false, intended: null, movedElsewhere: false });
	});

	it('a move this device never asked for is from elsewhere', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'snapshot', stageIndex: 3 },
		]);
		expect(state).toMatchObject({ movedElsewhere: true });
		// the first snapshot of a session is where the room already is, not a move
		expect(run([{ kind: 'snapshot', stageIndex: 5 }]).movedElsewhere).toBe(false);
	});

	it('an unanswered press fails after the timeout, not before', () => {
		const pressed = run([{ kind: 'press', toIndex: 1, now: 0 }]);
		expect(advanceReduce(pressed, { kind: 'tick', now: ADVANCE_TIMEOUT_MS - 1 }).failed).toBe(
			false,
		);
		expect(advanceReduce(pressed, { kind: 'tick', now: ADVANCE_TIMEOUT_MS }).failed).toBe(true);
	});

	it('dismiss only clears the quiet line', () => {
		const state = run([
			{ kind: 'snapshot', stageIndex: 2 },
			{ kind: 'snapshot', stageIndex: 3 },
			{ kind: 'dismiss' },
		]);
		expect(state.movedElsewhere).toBe(false);
		expect(state.lastStageIndex).toBe(3);
	});
});
