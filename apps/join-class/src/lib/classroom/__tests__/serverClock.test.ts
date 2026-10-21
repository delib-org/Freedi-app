import { describe, expect, it } from 'vitest';
import { remainingMs } from '../clockMath';

describe('remainingMs', () => {
	it('is endsAt minus server now', () => {
		expect(remainingMs(10_000, 4_000, 0, { speed: 1 })).toBe(6_000);
	});

	it('applies the server offset', () => {
		// local clock is 2 s behind the server
		expect(remainingMs(10_000, 4_000, 2_000, { speed: 1 })).toBe(4_000);
	});

	it('never goes negative', () => {
		expect(remainingMs(1_000, 9_000, 0, { speed: 1 })).toBe(0);
	});

	it('runs faster by the speed factor, anchored at the start', () => {
		const total = 60_000;
		// start of the minute: full display
		expect(remainingMs(total, 0, 0, { speed: 20, totalMs: total })).toBe(total);
		// 1 real second in: 20 display seconds gone
		expect(remainingMs(total, 1_000, 0, { speed: 20, totalMs: total })).toBe(40_000);
		// 3 real seconds in: over
		expect(remainingMs(total, 3_000, 0, { speed: 20, totalMs: total })).toBe(0);
	});

	it('clamps a clock that is ahead of the interval start when speeding', () => {
		expect(remainingMs(120_000, 0, 0, { speed: 2, totalMs: 60_000 })).toBe(60_000);
	});
});
