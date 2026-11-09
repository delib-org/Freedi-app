import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlideTapGate } from '../glideTapGate';

const GLIDE_MS = 560;

describe('createGlideTapGate', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends a tap at once when nothing is gliding', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });

		expect(gate.tap('a')).toBe('sent');
		expect(deliver).toHaveBeenCalledExactlyOnceWith('a');
	});

	it('holds a tap made during the glide and sends it when the glide ends', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });
		gate.startGlide(GLIDE_MS);

		expect(gate.tap('a')).toBe('queued');
		expect(gate.pendingId()).toBe('a');
		vi.advanceTimersByTime(GLIDE_MS - 1);
		expect(deliver).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(deliver).toHaveBeenCalledExactlyOnceWith('a');
		expect(gate.pendingId()).toBeNull();
	});

	it('lets a later tap replace an earlier remembered one', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });
		gate.startGlide(GLIDE_MS);
		gate.tap('a');
		gate.tap('b');
		vi.advanceTimersByTime(GLIDE_MS);

		expect(deliver).toHaveBeenCalledExactlyOnceWith('b');
	});

	it('drops the remembered tap when cancelled (voting closed, screen gone)', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });
		gate.startGlide(GLIDE_MS);
		gate.tap('a');
		gate.cancel();
		vi.advanceTimersByTime(GLIDE_MS * 2);

		expect(deliver).not.toHaveBeenCalled();
		expect(gate.pendingId()).toBeNull();
	});

	it('waits for the end of a glide that is extended while a tap is held', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });
		gate.startGlide(GLIDE_MS);
		gate.tap('a');
		vi.advanceTimersByTime(GLIDE_MS / 2);
		gate.startGlide(GLIDE_MS);
		vi.advanceTimersByTime(GLIDE_MS - 1);
		expect(deliver).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);

		expect(deliver).toHaveBeenCalledExactlyOnceWith('a');
	});

	it('sends taps straight away again once the glide is over', () => {
		const deliver = vi.fn();
		const gate = createGlideTapGate({ deliver });
		gate.startGlide(GLIDE_MS);
		vi.advanceTimersByTime(GLIDE_MS);

		expect(gate.tap('a')).toBe('sent');
	});
});
