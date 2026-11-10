import { describe, expect, it, vi } from 'vitest';
import { FLIP_ANIMATION_ID, FLIP_DURATION_MS, cancelFlips, flipDeltas, playFlip } from '../flip';

function fakeRow(): HTMLElement {
	return { animate: vi.fn(() => ({})) } as unknown as HTMLElement;
}

describe('flipDeltas', () => {
	it('gives the distance back to the old place, only for rows that moved', () => {
		const first = new Map([
			['a', 100],
			['b', 200],
			['c', 300],
		]);
		const last = new Map([
			['a', 100],
			['b', 300],
			['c', 200],
		]);

		expect(flipDeltas(first, last)).toEqual(
			new Map([
				['b', -100],
				['c', 100],
			]),
		);
	});

	it('ignores rounding noise and rows that are new', () => {
		const first = new Map([['a', 100]]);
		const last = new Map([
			['a', 100.2],
			['z', 50],
		]);

		expect(flipDeltas(first, last).size).toBe(0);
	});
});

describe('playFlip', () => {
	it('slides each moved row and lights the landing row', () => {
		const a = fakeRow();
		const b = fakeRow();
		const glow = fakeRow();
		const rows = new Map([
			['a', a],
			['b', b],
		]);
		const deltas = new Map([
			['a', -50],
			['b', 50],
		]);

		playFlip(rows, deltas, 'a', (row) => (row === a ? glow : null), false);

		expect(a.animate).toHaveBeenCalledWith(
			[{ transform: 'translateY(-50px)' }, { transform: 'translateY(0)' }],
			expect.objectContaining({ duration: FLIP_DURATION_MS, id: FLIP_ANIMATION_ID }),
		);
		expect(b.animate).toHaveBeenCalledTimes(1);
		expect(glow.animate).toHaveBeenCalledTimes(1);
	});

	it('does nothing when reduced motion is requested', () => {
		const a = fakeRow();
		const glow = fakeRow();

		playFlip(new Map([['a', a]]), new Map([['a', -50]]), 'a', () => glow, true);

		expect(a.animate).not.toHaveBeenCalled();
		expect(glow.animate).not.toHaveBeenCalled();
	});

	it('does not fail for a landing row without a highlight element', () => {
		const a = fakeRow();

		expect(() => playFlip(new Map([['a', a]]), new Map(), 'a', () => null, false)).not.toThrow();
	});
});

describe('cancelFlips', () => {
	it('cancels only our slides', () => {
		const ours = { id: FLIP_ANIMATION_ID, cancel: vi.fn() };
		const other = { id: 'other', cancel: vi.fn() };
		const row = { getAnimations: () => [ours, other] } as unknown as HTMLElement;

		cancelFlips([row]);

		expect(ours.cancel).toHaveBeenCalled();
		expect(other.cancel).not.toHaveBeenCalled();
	});
});
