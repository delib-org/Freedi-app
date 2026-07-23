import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Firestore SDK before importing the SUT. Each onSnapshot call
// records its handlers so tests can push snapshots / errors into the stream.
interface FakeListener {
	onNext: (snap: unknown) => void;
	onError: (err: { code: string }) => void;
	unsubscribe: ReturnType<typeof vi.fn>;
}
const listeners: FakeListener[] = [];

vi.mock('firebase/firestore', () => ({
	onSnapshot: vi.fn((_target: unknown, onNext: FakeListener['onNext'], onError: FakeListener['onError']) => {
		const unsubscribe = vi.fn();
		listeners.push({ onNext, onError, unsubscribe });

		return unsubscribe;
	}),
}));

import {
	resilientOnSnapshot,
	forceResyncAllListeners,
	_registrySize,
} from '../resilientListeners';
import type { DocumentData, Query } from 'firebase/firestore';

const fakeQuery = {} as Query<DocumentData>;

function lastListener(): FakeListener {
	return listeners[listeners.length - 1];
}

describe('resilientOnSnapshot', () => {
	const active: Array<() => void> = [];

	beforeEach(() => {
		vi.useFakeTimers();
		listeners.length = 0;
	});

	afterEach(() => {
		// Tear down anything a test left running so the registry is clean.
		for (const unsub of active.splice(0)) unsub();
		vi.useRealTimers();
	});

	function subscribe(onNext: (snap: unknown) => void = () => undefined): () => void {
		const unsub = resilientOnSnapshot('test', fakeQuery, onNext);
		active.push(unsub);

		return unsub;
	}

	it('delivers snapshots to onNext', () => {
		const received: unknown[] = [];
		subscribe((snap) => received.push(snap));

		lastListener().onNext({ docs: [] });
		expect(received).toHaveLength(1);
	});

	it('rebuilds the listener after a stream error, with backoff', () => {
		subscribe();
		expect(listeners).toHaveLength(1);

		lastListener().onError({ code: 'unavailable' });
		// No rebuild yet — backoff pending.
		expect(listeners).toHaveLength(1);

		vi.advanceTimersByTime(1_000);
		expect(listeners).toHaveLength(2);

		// Second consecutive error doubles the delay.
		lastListener().onError({ code: 'unavailable' });
		vi.advanceTimersByTime(1_000);
		expect(listeners).toHaveLength(2);
		vi.advanceTimersByTime(1_000);
		expect(listeners).toHaveLength(3);
	});

	it('resets the backoff after a healthy snapshot', () => {
		subscribe();
		lastListener().onError({ code: 'unavailable' });
		vi.advanceTimersByTime(1_000);

		// Healthy delivery → retryCount back to 0.
		lastListener().onNext({ docs: [] });
		lastListener().onError({ code: 'unavailable' });
		// Retry fires at base delay again, not the doubled one.
		vi.advanceTimersByTime(1_000);
		expect(listeners).toHaveLength(3);
	});

	it('stops retrying permission-denied after the cap, revives on force resync', () => {
		subscribe();

		// 3 retries allowed; the 4th error goes dormant.
		for (let i = 0; i < 3; i++) {
			lastListener().onError({ code: 'permission-denied' });
			vi.advanceTimersByTime(30_000);
		}
		expect(listeners).toHaveLength(4);
		lastListener().onError({ code: 'permission-denied' });
		vi.advanceTimersByTime(60_000);
		expect(listeners).toHaveLength(4); // dormant — no rebuild

		forceResyncAllListeners();
		expect(listeners).toHaveLength(5); // revived
	});

	it('restarts every registered listener on force resync', () => {
		subscribe();
		subscribe();
		expect(listeners).toHaveLength(2);
		const priorUnsubs = listeners.map((l) => l.unsubscribe);

		forceResyncAllListeners();
		expect(listeners).toHaveLength(4);
		for (const unsub of priorUnsubs) expect(unsub).toHaveBeenCalledTimes(1);
	});

	it('unsubscribe stops the inner listener, pending retries, and deregisters', () => {
		const before = _registrySize();
		const unsub = subscribe();
		expect(_registrySize()).toBe(before + 1);

		lastListener().onError({ code: 'unavailable' });
		unsub();
		expect(_registrySize()).toBe(before);

		// The pending retry must not rebuild after unsubscribe.
		vi.advanceTimersByTime(60_000);
		expect(listeners).toHaveLength(1);

		// And a later resync must not resurrect it.
		forceResyncAllListeners();
		expect(listeners).toHaveLength(1);
	});
});
