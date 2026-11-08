import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

import { LEAVE_FLUSH_LIMIT_MS, createLeaveGuard } from '../leaveGuard';

interface Setup {
	navigate: ReturnType<typeof vi.fn>;
	flush: ReturnType<typeof vi.fn>;
	errored: { value: boolean };
	guard: ReturnType<typeof createLeaveGuard>;
}

function setup(flush: () => Promise<void>): Setup {
	const navigate = vi.fn();
	const errored = { value: false };
	const flushFn = vi.fn(flush);
	const guard = createLeaveGuard({
		flush: flushFn,
		hasError: () => errored.value,
		navigate,
	});

	return { navigate, flush: flushFn, errored, guard };
}

describe('createLeaveGuard', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('flushes first and navigates when the flush finishes', async () => {
		const s = setup(() => Promise.resolve());
		await s.guard.leave('/t');
		expect(s.flush).toHaveBeenCalledTimes(1);
		expect(s.navigate).toHaveBeenCalledWith('/t');
	});

	it('does not navigate before the flush has finished', async () => {
		let finish: () => void = () => undefined;
		const s = setup(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const left = s.guard.leave('/t/plans/p1');
		await vi.advanceTimersByTimeAsync(LEAVE_FLUSH_LIMIT_MS - 1);
		expect(s.navigate).not.toHaveBeenCalled();
		finish();
		await left;
		expect(s.navigate).toHaveBeenCalledWith('/t/plans/p1');
	});

	it('leaves after the named limit when a save hangs', async () => {
		const s = setup(() => new Promise<void>(() => undefined));
		const left = s.guard.leave('/t');
		await vi.advanceTimersByTimeAsync(LEAVE_FLUSH_LIMIT_MS);
		await left;
		expect(s.navigate).toHaveBeenCalledTimes(1);
		expect(s.navigate).toHaveBeenCalledWith('/t');
	});

	it('stays when a save failed, and the second press leaves', async () => {
		const s = setup(() => {
			s.errored.value = true;

			return Promise.resolve();
		});
		await s.guard.leave('/t');
		expect(s.navigate).not.toHaveBeenCalled();
		await s.guard.leave('/t');
		expect(s.navigate).toHaveBeenCalledTimes(1);
		expect(s.navigate).toHaveBeenCalledWith('/t');
		expect(s.flush).toHaveBeenCalledTimes(1);
	});

	it('stays when the flush itself rejects', async () => {
		const s = setup(() => Promise.reject(new Error('offline')));
		await s.guard.leave('/t');
		expect(s.navigate).not.toHaveBeenCalled();
	});

	it('a press while the first is still waiting leaves at once, once', async () => {
		const s = setup(() => new Promise<void>(() => undefined));
		const first = s.guard.leave('/t');
		await s.guard.leave('/t');
		expect(s.navigate).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(LEAVE_FLUSH_LIMIT_MS);
		await first;
		expect(s.navigate).toHaveBeenCalledTimes(1);
	});

	it('forgets a stay when a new screen opens', async () => {
		const s = setup(() => {
			s.errored.value = true;

			return Promise.resolve();
		});
		await s.guard.leave('/t');
		s.guard.reset();
		await s.guard.leave('/t');
		expect(s.navigate).not.toHaveBeenCalled();
		expect(s.flush).toHaveBeenCalledTimes(2);
	});
});
