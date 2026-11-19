import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
	OPTIMISTIC_CALL_TIMEOUT_MS,
	OPTIMISTIC_SETTLE_MS,
	OptimisticOverlay,
	type OptimisticChange,
} from '../optimisticOverlay';

const plus = (n: number): OptimisticChange<number> => ({
	apply: (base) => base + n,
	isConfirmedBy: (base) => base >= n,
});

/** A promise the test settles by hand. */
function deferred<R>(): {
	promise: Promise<R>;
	resolve: (value: R) => void;
	reject: (error: unknown) => void;
} {
	let resolve!: (value: R) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<R>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

describe('OptimisticOverlay', () => {
	let onChange: Mock<() => void>;
	let overlay: OptimisticOverlay<number>;

	beforeEach(() => {
		vi.useFakeTimers();
		onChange = vi.fn<() => void>();
		overlay = new OptimisticOverlay<number>(onChange);
	});
	afterEach(() => {
		overlay.clear();
		vi.useRealTimers();
	});

	it('shows the base untouched when nothing is pending', () => {
		expect(overlay.view(5)).toBe(5);
		expect(overlay.size).toBe(0);
	});

	it('applies the change at once, before the call answers', () => {
		const call = deferred<string>();
		void overlay.track(plus(3), () => call.promise);
		expect(overlay.view(0)).toBe(3);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('applies several changes oldest first', () => {
		const order: string[] = [];
		void overlay.track(
			{
				apply: (n) => {
					order.push('a');

					return n + 1;
				},
				isConfirmedBy: () => false,
			},
			() => deferred<void>().promise,
		);
		void overlay.track(
			{
				apply: (n) => {
					order.push('b');

					return n * 10;
				},
				isConfirmedBy: () => false,
			},
			() => deferred<void>().promise,
		);
		expect(overlay.view(1)).toBe(20);
		expect(order).toEqual(['a', 'b']);
	});

	it('drops the change when a snapshot confirms it', () => {
		void overlay.track(plus(3), () => deferred<void>().promise);
		overlay.reconcile(3);
		expect(overlay.size).toBe(0);
		expect(overlay.view(3)).toBe(3);
	});

	it('keeps the change when a snapshot does not show it yet', () => {
		void overlay.track(plus(3), () => deferred<void>().promise);
		overlay.reconcile(1);
		expect(overlay.size).toBe(1);
		expect(overlay.view(1)).toBe(4);
	});

	it('keeps the change after the call succeeded until the snapshot arrives', async () => {
		const call = deferred<string>();
		const tracked = overlay.track(plus(3), () => call.promise);
		call.resolve('ok');
		await expect(tracked).resolves.toBe('ok');
		expect(overlay.view(0)).toBe(3);
		overlay.reconcile(3);
		expect(overlay.size).toBe(0);
	});

	it('rolls back at once and rethrows when the call fails', async () => {
		const call = deferred<string>();
		const tracked = overlay.track(plus(3), () => call.promise);
		onChange.mockClear();
		call.reject(new Error('refused'));
		await expect(tracked).rejects.toThrow('refused');
		expect(overlay.view(0)).toBe(0);
		expect(overlay.size).toBe(0);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('rolls back when the call throws synchronously inside the callback', async () => {
		await expect(
			overlay.track(plus(3), () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(overlay.size).toBe(0);
	});

	it('lets the server win when it said ok but the snapshot never shows the change', async () => {
		const call = deferred<void>();
		const tracked = overlay.track(plus(3), () => call.promise);
		call.resolve();
		await tracked;
		onChange.mockClear();
		vi.advanceTimersByTime(OPTIMISTIC_SETTLE_MS);
		expect(overlay.size).toBe(0);
		expect(overlay.view(0)).toBe(0);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('does not drop an acknowledged change before the settle time', async () => {
		const call = deferred<void>();
		const tracked = overlay.track(plus(3), () => call.promise);
		call.resolve();
		await tracked;
		vi.advanceTimersByTime(OPTIMISTIC_SETTLE_MS - 1);
		expect(overlay.view(0)).toBe(3);
	});

	it('stops guessing when the call never answers', () => {
		void overlay.track(plus(3), () => deferred<void>().promise);
		onChange.mockClear();
		vi.advanceTimersByTime(OPTIMISTIC_CALL_TIMEOUT_MS);
		expect(overlay.size).toBe(0);
		expect(overlay.view(0)).toBe(0);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('a late failure after the timeout still rejects and changes nothing more', async () => {
		const call = deferred<void>();
		const tracked = overlay.track(plus(3), () => call.promise);
		vi.advanceTimersByTime(OPTIMISTIC_CALL_TIMEOUT_MS);
		onChange.mockClear();
		call.reject(new Error('late'));
		await expect(tracked).rejects.toThrow('late');
		expect(onChange).not.toHaveBeenCalled();
	});

	it('settles each change on its own: one failing leaves the other', async () => {
		const first = deferred<void>();
		const second = deferred<void>();
		const a = overlay.track(plus(1), () => first.promise);
		void overlay.track(plus(10), () => second.promise);
		first.reject(new Error('no'));
		await expect(a).rejects.toThrow('no');
		expect(overlay.view(0)).toBe(10);
	});

	it('drops a change whose apply throws and reports it', () => {
		const onError = vi.fn();
		const guarded = new OptimisticOverlay<number>(onChange, onError);
		void guarded.track(
			{
				apply: () => {
					throw new Error('bad patch');
				},
				isConfirmedBy: () => false,
			},
			() => deferred<void>().promise,
		);
		expect(guarded.view(7)).toBe(7);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(guarded.size).toBe(0);
		guarded.clear();
	});

	it('clear forgets everything and cancels the timers', () => {
		void overlay.track(plus(3), () => deferred<void>().promise);
		overlay.clear();
		onChange.mockClear();
		vi.advanceTimersByTime(OPTIMISTIC_CALL_TIMEOUT_MS);
		expect(onChange).not.toHaveBeenCalled();
		expect(overlay.view(0)).toBe(0);
	});
	it('a snapshot that repeats what was already true does not confirm the change', () => {
		// "to 3" while the server data already shows 3: a stale snapshot must not drop it.
		void overlay.track(plus(3), () => deferred<void>().promise, 3);
		overlay.reconcile(3);
		expect(overlay.size).toBe(1);
	});

	it('two sequential changes: a stale snapshot between them confirms neither early', () => {
		// Start at 0: first +1 ("to 1"), then a -1 that brings it back, before any snapshot.
		const up: OptimisticChange<number> = { apply: () => 1, isConfirmedBy: (n) => n === 1 };
		const back: OptimisticChange<number> = { apply: () => 0, isConfirmedBy: (n) => n === 0 };
		void overlay.track(up, () => deferred<void>().promise, 0);
		void overlay.track(back, () => deferred<void>().promise, 0);
		// The stale snapshot (still 0) satisfies "back" but it was already true: only "up" is unconfirmed.
		overlay.reconcile(0);
		expect(overlay.size).toBe(2);
		expect(overlay.view(0)).toBe(0);
		// The server catches up with "up": it is dropped; "back" stays until its own call settles.
		overlay.reconcile(1);
		expect(overlay.size).toBe(1);
	});

	it('a change that was not true before is still confirmed by news', () => {
		void overlay.track(plus(3), () => deferred<void>().promise, 0);
		overlay.reconcile(3);
		expect(overlay.size).toBe(0);
	});
});
