import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver } from '../autosave';
import type { SaveOutcome } from '../autosave';

const OPTIONS = { debounceMs: 100, retryDelayMs: 1000, maxAutoRetries: 2 };

function deferred(): { promise: Promise<SaveOutcome>; resolve: (value: SaveOutcome) => void } {
	let resolve: (value: SaveOutcome) => void = () => undefined;
	const promise = new Promise<SaveOutcome>((done) => {
		resolve = done;
	});

	return { promise, resolve };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('Autosaver', () => {
	it('waits for the typing to pause and saves once', async () => {
		const save = vi.fn(async (): Promise<SaveOutcome> => 'saved');
		const saver = new Autosaver({ title: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(50);
		saver.touch('title');
		await vi.advanceTimersByTimeAsync(99);
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('says saved only after the server confirmed', async () => {
		const pending = deferred();
		const saver = new Autosaver({ title: () => pending.promise }, undefined, undefined, OPTIONS);

		saver.touch('title');
		expect(saver.state).toBe('saving');
		await vi.advanceTimersByTimeAsync(100);
		expect(saver.state).toBe('saving');
		pending.resolve('saved');
		await vi.advanceTimersByTimeAsync(0);
		expect(saver.state).toBe('saved');
		expect(saver.hasUnsaved).toBe(false);
	});

	it('keeps one save in flight per kind and sends the newest value next', async () => {
		const first = deferred();
		const second = deferred();
		const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const saver = new Autosaver({ title: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		expect(save).toHaveBeenCalledTimes(1);
		first.resolve('saved');
		await vi.advanceTimersByTimeAsync(0);
		expect(save).toHaveBeenCalledTimes(2);
		expect(saver.state).toBe('saving');
		second.resolve('saved');
		await vi.advanceTimersByTimeAsync(0);
		expect(saver.state).toBe('saved');
	});

	it('runs kinds apart: one slow kind does not hold another', async () => {
		const slow = deferred();
		const quick = vi.fn(async (): Promise<SaveOutcome> => 'saved');
		const saver = new Autosaver(
			{ title: () => slow.promise, topics: quick },
			undefined,
			undefined,
			OPTIONS,
		);

		saver.touch('title');
		saver.touch('topics');
		await vi.advanceTimersByTimeAsync(100);
		expect(quick).toHaveBeenCalledTimes(1);
		expect(saver.state).toBe('saving');
		slow.resolve('saved');
		await vi.advanceTimersByTimeAsync(0);
		expect(saver.state).toBe('saved');
	});

	it('shows a failure, keeps the value unsaved and retries by itself', async () => {
		const save = vi
			.fn<() => Promise<SaveOutcome>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce('saved');
		const onError = vi.fn();
		const saver = new Autosaver({ title: save }, undefined, onError, OPTIONS);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		expect(saver.state).toBe('failed');
		expect(saver.hasUnsaved).toBe(true);
		expect(onError).toHaveBeenCalledWith('title', expect.any(Error));
		await vi.advanceTimersByTimeAsync(1000);
		expect(saver.state).toBe('saved');
		expect(saver.hasUnsaved).toBe(false);
	});

	it('stops retrying on its own after the limit, and retries when asked', async () => {
		const save = vi.fn<() => Promise<SaveOutcome>>().mockRejectedValue(new Error('offline'));
		const saver = new Autosaver({ title: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(5000);
		expect(save).toHaveBeenCalledTimes(3);
		save.mockResolvedValue('saved');
		saver.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(saver.state).toBe('saved');
	});

	it('reports input that cannot be sent yet as blocked, not saved', async () => {
		const saver = new Autosaver(
			{ title: async (): Promise<SaveOutcome> => 'blocked' },
			undefined,
			undefined,
			OPTIONS,
		);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		expect(saver.state).toBe('blocked');
	});

	it('flush sends at once and resolves true when everything is confirmed', async () => {
		const save = vi.fn(async (): Promise<SaveOutcome> => 'saved');
		const saver = new Autosaver({ title: save, topics: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		saver.touch('topics');
		await expect(saver.flush()).resolves.toBe(true);
		expect(save).toHaveBeenCalledTimes(2);
	});

	it('flush waits for a save already under way and for a newer value', async () => {
		const first = deferred();
		const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('saved');
		const saver = new Autosaver({ title: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		await vi.advanceTimersByTimeAsync(100);
		saver.touch('title');
		const flushed = saver.flush();

		first.resolve('saved');
		await expect(flushed).resolves.toBe(true);
		expect(save).toHaveBeenCalledTimes(2);
	});

	it('flush resolves false when a save fails, so a screen cannot move on', async () => {
		const save = vi.fn<() => Promise<SaveOutcome>>().mockRejectedValue(new Error('offline'));
		const saver = new Autosaver({ title: save }, undefined, undefined, OPTIONS);

		saver.touch('title');
		await expect(saver.flush()).resolves.toBe(false);
		expect(saver.state).toBe('failed');
	});
});
