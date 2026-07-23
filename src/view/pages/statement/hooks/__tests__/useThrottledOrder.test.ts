import { act, renderHook } from '@testing-library/react';

import { useThrottledOrder } from '../useThrottledOrder';

interface Item {
	id: string;
}

interface Scored extends Item {
	score: number;
}

const getId = (item: Item): string => item.id;
const getScoredId = (item: Scored): string => item.id;
const ids = (items: Item[]): string[] => items.map(getId);
const make = (...values: string[]): Item[] => values.map((id) => ({ id }));

const INTERVAL = 1000;

describe('useThrottledOrder', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it('returns the initial order as-is', () => {
		const { result } = renderHook(() =>
			useThrottledOrder(make('a', 'b', 'c'), getId, { intervalMs: INTERVAL }),
		);

		expect(ids(result.current)).toEqual(['a', 'b', 'c']);
	});

	it('applies the first reorder immediately', () => {
		const { result, rerender } = renderHook(
			({ items }) => useThrottledOrder(items, getId, { intervalMs: INTERVAL }),
			{ initialProps: { items: make('a', 'b', 'c') } },
		);

		rerender({ items: make('c', 'a', 'b') });

		expect(ids(result.current)).toEqual(['c', 'a', 'b']);
	});

	it('holds a second reorder inside the window, then flushes the newest order', () => {
		const { result, rerender } = renderHook(
			({ items }) => useThrottledOrder(items, getId, { intervalMs: INTERVAL }),
			{ initialProps: { items: make('a', 'b', 'c') } },
		);

		rerender({ items: make('c', 'a', 'b') });
		rerender({ items: make('b', 'c', 'a') });
		expect(ids(result.current)).toEqual(['c', 'a', 'b']);

		// A third shuffle before the flush must not queue a second timer — the
		// pending one picks up whatever is newest.
		rerender({ items: make('a', 'c', 'b') });
		expect(ids(result.current)).toEqual(['c', 'a', 'b']);

		act(() => {
			jest.advanceTimersByTime(INTERVAL);
		});

		expect(ids(result.current)).toEqual(['a', 'c', 'b']);
	});

	it('applies membership changes immediately, without waiting for the window', () => {
		const { result, rerender } = renderHook(
			({ items }) => useThrottledOrder(items, getId, { intervalMs: INTERVAL }),
			{ initialProps: { items: make('a', 'b', 'c') } },
		);

		rerender({ items: make('c', 'a', 'b') });
		rerender({ items: make('d', 'c', 'a', 'b') });

		expect(ids(result.current)).toEqual(['d', 'c', 'a', 'b']);
	});

	it('bypasses the throttle when the ordering intent changes', () => {
		const { result, rerender } = renderHook(
			({ items, intentKey }) =>
				useThrottledOrder(items, getId, { intervalMs: INTERVAL, intentKey }),
			{ initialProps: { items: make('a', 'b', 'c'), intentKey: 'newest' } },
		);

		rerender({ items: make('c', 'a', 'b'), intentKey: 'newest' });
		rerender({ items: make('b', 'a', 'c'), intentKey: 'newest' });
		expect(ids(result.current)).toEqual(['c', 'a', 'b']);

		rerender({ items: make('a', 'b', 'c'), intentKey: 'accepted' });
		expect(ids(result.current)).toEqual(['a', 'b', 'c']);
	});

	it('keeps item data live while positions are held back', () => {
		const { result, rerender } = renderHook(
			({ items }) => useThrottledOrder(items, getScoredId, { intervalMs: INTERVAL }),
			{
				initialProps: {
					items: [
						{ id: 'a', score: 1 },
						{ id: 'b', score: 2 },
					] as Scored[],
				},
			},
		);

		rerender({
			items: [
				{ id: 'b', score: 2 },
				{ id: 'a', score: 1 },
			] as Scored[],
		});

		// Held order, fresh objects.
		rerender({
			items: [
				{ id: 'a', score: 99 },
				{ id: 'b', score: 2 },
			] as Scored[],
		});

		expect(ids(result.current)).toEqual(['b', 'a']);
		expect(result.current.find((item) => item.id === 'a')?.score).toBe(99);
	});

	it('renders newly added items even before the order state catches up', () => {
		const { result, rerender } = renderHook(
			({ items }) => useThrottledOrder(items, getId, { intervalMs: INTERVAL }),
			{ initialProps: { items: make('a', 'b') } },
		);

		rerender({ items: make('a', 'b', 'c') });

		expect(ids(result.current)).toEqual(['a', 'b', 'c']);
	});
});
