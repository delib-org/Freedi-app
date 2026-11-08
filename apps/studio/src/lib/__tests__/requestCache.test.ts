import { describe, it, expect, vi } from 'vitest';
import { createRequestCache } from '../requestCache';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

describe('createRequestCache', () => {
	it('serves a fresh value without calling the fetcher again', async () => {
		let clock = 1000;
		const cache = createRequestCache<number>({ ttlMs: 60000, now: () => clock });
		const fetcher = vi.fn(async () => 42);

		expect(await cache.get('a', fetcher)).toBe(42);
		clock += 30000;
		expect(await cache.get('a', fetcher)).toBe(42);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(cache.peek('a')).toBe(42);
	});

	it('refetches once the TTL has passed', async () => {
		let clock = 0;
		const cache = createRequestCache<number>({ ttlMs: 1000, now: () => clock });
		let n = 0;
		const fetcher = vi.fn(async () => ++n);

		expect(await cache.get('a', fetcher)).toBe(1);
		clock = 1000;
		expect(cache.peek('a')).toBeUndefined();
		expect(await cache.get('a', fetcher)).toBe(2);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('shares one in-flight promise between concurrent callers', async () => {
		const cache = createRequestCache<string>({ ttlMs: 1000 });
		const d = deferred<string>();
		const fetcher = vi.fn(() => d.promise);

		const first = cache.get('k', fetcher);
		const second = cache.get('k', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
		d.resolve('ok');
		expect(await first).toBe('ok');
		expect(await second).toBe('ok');
		expect(cache.size()).toBe(1);
	});

	it('bypass ignores a fresh entry and fetches again', async () => {
		const cache = createRequestCache<number>({ ttlMs: 60000 });
		let n = 0;
		const fetcher = vi.fn(async () => ++n);

		expect(await cache.get('a', fetcher)).toBe(1);
		expect(await cache.get('a', fetcher, { bypass: true })).toBe(2);
		expect(await cache.get('a', fetcher)).toBe(2);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('does not cache a rejected fetch', async () => {
		const cache = createRequestCache<number>({ ttlMs: 60000 });
		const fetcher = vi
			.fn<() => Promise<number>>()
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValueOnce(7);

		await expect(cache.get('a', fetcher)).rejects.toThrow('boom');
		expect(cache.size()).toBe(0);
		expect(await cache.get('a', fetcher)).toBe(7);
	});

	it('keeps the value of a later bypass over a slower earlier fetch', async () => {
		const cache = createRequestCache<string>({ ttlMs: 60000 });
		const slow = deferred<string>();
		const fast = deferred<string>();
		const fetcher = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

		const a = cache.get('k', fetcher);
		const b = cache.get('k', fetcher, { bypass: true });
		fast.resolve('new');
		expect(await b).toBe('new');
		slow.resolve('old');
		expect(await a).toBe('old');
		expect(cache.peek('k')).toBe('new');
	});

	it('invalidate drops one key or everything', async () => {
		const cache = createRequestCache<number>({ ttlMs: 60000 });
		await cache.get('a', async () => 1);
		await cache.get('b', async () => 2);
		cache.invalidate('a');
		expect(cache.peek('a')).toBeUndefined();
		expect(cache.peek('b')).toBe(2);
		cache.invalidate();
		expect(cache.size()).toBe(0);
	});

	it('evicts the oldest entries past maxEntries', async () => {
		const cache = createRequestCache<number>({ ttlMs: 60000, maxEntries: 2 });
		await cache.get('a', async () => 1);
		await cache.get('b', async () => 2);
		await cache.get('c', async () => 3);
		expect(cache.size()).toBe(2);
		expect(cache.peek('a')).toBeUndefined();
		expect(cache.peek('c')).toBe(3);
	});
});
