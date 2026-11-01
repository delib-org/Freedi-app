import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/deferWork', () => ({ afterLoad: vi.fn() }));

import { prefetchSequentially } from '../prefetchSteps';

describe('prefetchSequentially', () => {
	it('loads the chunks one after the other, in order', async () => {
		const order: string[] = [];
		const loader = (name: string) => async (): Promise<void> => {
			order.push(`start:${name}`);
			await Promise.resolve();
			order.push(`end:${name}`);
		};

		const loaded = await prefetchSequentially([loader('a'), loader('b')]);

		expect(loaded).toBe(2);
		expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
	});

	it('a failing chunk does not stop the others and does not throw', async () => {
		const ok = vi.fn(() => Promise.resolve());
		const loaded = await prefetchSequentially([() => Promise.reject(new Error('offline')), ok]);

		expect(loaded).toBe(1);
		expect(ok).toHaveBeenCalledTimes(1);
	});
});
