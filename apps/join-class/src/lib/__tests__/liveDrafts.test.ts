import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (before importing the SUT) ────────────────────────────────────────

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

// Fake RTDB surface: records writes per path and lets tests push snapshots
// into the onValue listener.
interface FakeRef {
	path: string;
}
let rtdbAvailable = true;
const writes: Array<{ op: 'set' | 'update' | 'remove'; path: string; data?: unknown }> = [];
const disconnects: Array<{
	path: string;
	remove: ReturnType<typeof vi.fn>;
	cancel: ReturnType<typeof vi.fn>;
}> = [];
// One live listener per RTDB path — initLiveDrafts attaches two (drafts +
// watchers), so the fake keys them by path.
const valueListeners = new Map<string, (snap: { val: () => unknown }) => void>();
const unsubscribeListener = vi.fn();

vi.mock('@/lib/firebase', () => ({
	getRtdb: () => (rtdbAvailable ? {} : null),
	rtdbRef: (_db: unknown, path: string): FakeRef => ({ path }),
	rtdbSet: vi.fn((ref: FakeRef, data: unknown) => {
		writes.push({ op: 'set', path: ref.path, data });

		return Promise.resolve();
	}),
	rtdbUpdate: vi.fn((ref: FakeRef, data: unknown) => {
		writes.push({ op: 'update', path: ref.path, data });

		return Promise.resolve();
	}),
	rtdbRemove: vi.fn((ref: FakeRef) => {
		writes.push({ op: 'remove', path: ref.path });

		return Promise.resolve();
	}),
	rtdbOnValue: vi.fn((ref: FakeRef, onNext: (snap: { val: () => unknown }) => void) => {
		valueListeners.set(ref.path, onNext);

		return () => {
			valueListeners.delete(ref.path);
			unsubscribeListener();
		};
	}),
	rtdbOnDisconnect: vi.fn((ref: FakeRef) => {
		const d = {
			path: ref.path,
			remove: vi.fn(() => Promise.resolve()),
			cancel: vi.fn(() => Promise.resolve()),
		};
		disconnects.push(d);

		return d;
	}),
}));

let mockCreator: { uid: string; displayName: string } | null = {
	uid: 'me-uid',
	displayName: 'Dana',
};
vi.mock('@/lib/store', () => ({
	getCreator: () => mockCreator,
}));

import m from 'mithril';
import {
	initLiveDrafts,
	teardownLiveDrafts,
	startBroadcast,
	updateBroadcastText,
	stopBroadcast,
	isBroadcasting,
	getLiveDrafts,
	getMyDraft,
	sendReaction,
	getRecentReactions,
	getMyRecentReactions,
	getUserColor,
	startWatching,
	stopWatching,
	getWatcherCount,
	LiveDraft,
} from '../liveDrafts';

function pushToPath(path: string, value: unknown): void {
	const listener = valueListeners.get(path);
	if (!listener) throw new Error(`no active onValue listener for ${path}`);
	listener({ val: () => value });
}

function pushSnapshot(value: unknown, questionId = 'q1'): void {
	pushToPath(`liveDrafts/${questionId}`, value);
}

function pushWatchers(value: unknown, questionId = 'q1'): void {
	pushToPath(`liveDraftWatchers/${questionId}`, value);
}

function draftNode(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		userId: 'other-uid',
		displayName: 'Yossi',
		color: '#ef4444',
		text: 'hello',
		lastUpdate: Date.now(),
		ttl: Date.now() + 900_000,
		...overrides,
	};
}

describe('liveDrafts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		rtdbAvailable = true;
		mockCreator = { uid: 'me-uid', displayName: 'Dana' };
		writes.length = 0;
		disconnects.length = 0;
		valueListeners.clear();
		unsubscribeListener.mockClear();
	});

	afterEach(async () => {
		teardownLiveDrafts();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
	});

	describe('initLiveDrafts / teardownLiveDrafts', () => {
		it('attaches drafts + watchers listeners and parses snapshots', () => {
			initLiveDrafts('q1');
			expect(valueListeners.has('liveDrafts/q1')).toBe(true);
			expect(valueListeners.has('liveDraftWatchers/q1')).toBe(true);

			pushSnapshot({ 'other-uid': draftNode() });
			const drafts = getLiveDrafts();
			expect(drafts).toHaveLength(1);
			expect(drafts[0].displayName).toBe('Yossi');
		});

		it('is idempotent for the same question id', () => {
			initLiveDrafts('q1');
			const first = valueListeners.get('liveDrafts/q1');
			initLiveDrafts('q1');
			expect(valueListeners.get('liveDrafts/q1')).toBe(first);
		});

		it('re-inits for a new question id and clears old drafts', () => {
			initLiveDrafts('q1');
			pushSnapshot({ 'other-uid': draftNode() });
			expect(getLiveDrafts()).toHaveLength(1);

			initLiveDrafts('q2');
			expect(unsubscribeListener).toHaveBeenCalled();
			expect(valueListeners.has('liveDrafts/q2')).toBe(true);
			expect(valueListeners.has('liveDrafts/q1')).toBe(false);
			expect(getLiveDrafts()).toHaveLength(0);
		});

		it('no-ops when RTDB is unavailable', () => {
			rtdbAvailable = false;
			initLiveDrafts('q1');
			expect(valueListeners.size).toBe(0);
			expect(getLiveDrafts()).toHaveLength(0);
		});
	});

	describe('broadcasting', () => {
		it('startBroadcast writes the full node and arms onDisconnect', async () => {
			initLiveDrafts('q1');
			await startBroadcast('first words');

			expect(isBroadcasting()).toBe(true);
			const set = writes.find((w) => w.op === 'set');
			expect(set?.path).toBe('liveDrafts/q1/me-uid');
			expect(set?.data).toMatchObject({
				userId: 'me-uid',
				displayName: 'Dana',
				text: 'first words',
			});
			expect(disconnects).toHaveLength(1);
			expect(disconnects[0].remove).toHaveBeenCalled();
		});

		it('debounces rapid text updates into a single write', async () => {
			initLiveDrafts('q1');
			await startBroadcast('');
			writes.length = 0;

			updateBroadcastText('h');
			updateBroadcastText('he');
			updateBroadcastText('hello');
			expect(writes).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(300);
			const updates = writes.filter((w) => w.op === 'update');
			expect(updates).toHaveLength(1);
			expect(updates[0].data).toMatchObject({ text: 'hello' });
		});

		it('stopBroadcast cancels onDisconnect, removes the node, and clears timers', async () => {
			initLiveDrafts('q1');
			await startBroadcast('text');
			writes.length = 0;

			updateBroadcastText('pending never flushed');
			await stopBroadcast();

			expect(isBroadcasting()).toBe(false);
			expect(disconnects[0].cancel).toHaveBeenCalled();
			expect(writes.some((w) => w.op === 'remove' && w.path === 'liveDrafts/q1/me-uid')).toBe(true);

			// The debounced write must not fire after stop.
			await vi.advanceTimersByTimeAsync(1000);
			expect(writes.filter((w) => w.op === 'update')).toHaveLength(0);
		});

		it('teardown while broadcasting removes the node', async () => {
			initLiveDrafts('q1');
			await startBroadcast('text');
			writes.length = 0;

			teardownLiveDrafts();
			await vi.runAllTimersAsync();

			expect(isBroadcasting()).toBe(false);
			expect(writes.some((w) => w.op === 'remove')).toBe(true);
		});

		it('heartbeat refreshes lastUpdate while broadcasting', async () => {
			initLiveDrafts('q1');
			await startBroadcast('text');
			writes.length = 0;

			await vi.advanceTimersByTimeAsync(45_000);
			const heartbeat = writes.find((w) => w.op === 'update');
			expect(heartbeat).toBeDefined();
			expect(heartbeat?.data).toHaveProperty('lastUpdate');
			expect(heartbeat?.data).toHaveProperty('ttl');
		});

		it('is a safe no-op without RTDB', async () => {
			rtdbAvailable = false;
			initLiveDrafts('q1');
			await startBroadcast('text');
			expect(isBroadcasting()).toBe(false);
			expect(writes).toHaveLength(0);
		});
	});

	describe('getLiveDrafts', () => {
		it('filters out stale drafts (lastUpdate older than 120s)', () => {
			initLiveDrafts('q1');
			pushSnapshot({
				fresh: draftNode({ userId: 'fresh', lastUpdate: Date.now() - 1_000 }),
				stale: draftNode({ userId: 'stale', lastUpdate: Date.now() - 200_000 }),
			});

			const drafts = getLiveDrafts();
			expect(drafts.map((d) => d.userId)).toEqual(['fresh']);
		});

		it('excludeSelf hides my own draft', () => {
			initLiveDrafts('q1');
			pushSnapshot({
				'me-uid': draftNode({ userId: 'me-uid' }),
				'other-uid': draftNode({ userId: 'other-uid' }),
			});

			expect(getLiveDrafts()).toHaveLength(2);
			expect(getLiveDrafts({ excludeSelf: true }).map((d) => d.userId)).toEqual(['other-uid']);
		});

		it('ignores malformed nodes', () => {
			initLiveDrafts('q1');
			pushSnapshot({
				ok: draftNode({ userId: 'ok' }),
				junk: { nonsense: true },
				alsoJunk: 'string',
			});

			expect(getLiveDrafts().map((d) => d.userId)).toEqual(['ok']);
		});
	});

	describe('reactions', () => {
		it('writes my reaction under the broadcaster node', async () => {
			initLiveDrafts('q1');
			await sendReaction('other-uid', '👍');

			const set = writes.find((w) => w.op === 'set');
			expect(set?.path).toBe('liveDrafts/q1/other-uid/reactions/me-uid');
			expect(set?.data).toMatchObject({ emoji: '👍', displayName: 'Dana' });
		});

		it('throttles rapid reactions to one per second', async () => {
			initLiveDrafts('q1');
			await sendReaction('other-uid', '👍');
			await sendReaction('other-uid', '❤️');
			expect(writes.filter((w) => w.op === 'set')).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(1_100);
			await sendReaction('other-uid', '❤️');
			expect(writes.filter((w) => w.op === 'set')).toHaveLength(2);
		});

		it('getRecentReactions keeps only the fresh window', () => {
			const draft: LiveDraft = {
				userId: 'other-uid',
				displayName: 'Yossi',
				color: '#ef4444',
				text: '',
				lastUpdate: Date.now(),
				reactions: [
					{ reactorId: 'a', emoji: '👍', displayName: 'A', timestamp: Date.now() - 1_000 },
					{ reactorId: 'b', emoji: '🔥', displayName: 'B', timestamp: Date.now() - 60_000 },
				],
			};

			expect(getRecentReactions(draft).map((r) => r.reactorId)).toEqual(['a']);
		});

		it('getMyRecentReactions surfaces cheers landing on my own draft', () => {
			initLiveDrafts('q1');
			pushSnapshot({
				'me-uid': draftNode({
					userId: 'me-uid',
					reactions: {
						'watcher-1': { emoji: '❤️', displayName: 'Yossi', timestamp: Date.now() },
					},
				}),
				'other-uid': draftNode({
					reactions: {
						'watcher-1': { emoji: '🔥', displayName: 'Yossi', timestamp: Date.now() },
					},
				}),
			});

			expect(getMyRecentReactions()).toEqual([
				{ reactorId: 'watcher-1', emoji: '❤️', displayName: 'Yossi', timestamp: Date.now() },
			]);
		});

		it('schedules a redraw so a stale cheer clears itself', async () => {
			initLiveDrafts('q1');
			pushSnapshot({
				'me-uid': draftNode({
					userId: 'me-uid',
					reactions: {
						'watcher-1': { emoji: '❤️', displayName: 'Yossi', timestamp: Date.now() },
					},
				}),
			});
			expect(getMyRecentReactions()).toHaveLength(1);

			// Nothing arrives from RTDB to clear a cheer, so without the scheduled
			// expiry redraw the chip would sit on screen until the next snapshot.
			const redrawsBefore = vi.mocked(m.redraw).mock.calls.length;
			await vi.advanceTimersByTimeAsync(16_000);

			expect(vi.mocked(m.redraw).mock.calls.length).toBeGreaterThan(redrawsBefore);
			expect(getMyRecentReactions()).toHaveLength(0);
		});

		it('getMyRecentReactions is empty without a signed-in creator', () => {
			initLiveDrafts('q1');
			pushSnapshot({ 'me-uid': draftNode({ userId: 'me-uid' }) });
			mockCreator = null;

			expect(getMyRecentReactions()).toEqual([]);
		});
	});

	describe('getMyDraft', () => {
		it('returns my own draft with its reactions', () => {
			initLiveDrafts('q1');
			pushSnapshot({
				'me-uid': draftNode({
					userId: 'me-uid',
					reactions: {
						'other-uid': { emoji: '👍', displayName: 'Yossi', timestamp: Date.now() },
					},
				}),
			});

			const mine = getMyDraft();
			expect(mine?.userId).toBe('me-uid');
			expect(mine?.reactions).toHaveLength(1);
			expect(mine?.reactions[0].emoji).toBe('👍');
		});

		it('returns null when I am not in the snapshot', () => {
			initLiveDrafts('q1');
			pushSnapshot({ 'other-uid': draftNode() });
			expect(getMyDraft()).toBeNull();
		});
	});

	describe('watcher presence', () => {
		it('startWatching writes my presence node and arms onDisconnect', async () => {
			initLiveDrafts('q1');
			await startWatching();

			const set = writes.find((w) => w.op === 'set' && w.path === 'liveDraftWatchers/q1/me-uid');
			expect(set?.data).toHaveProperty('lastActive');
			expect(disconnects.some((d) => d.path === 'liveDraftWatchers/q1/me-uid')).toBe(true);
		});

		it('stopWatching removes my presence node', async () => {
			initLiveDrafts('q1');
			await startWatching();
			writes.length = 0;

			await stopWatching();
			expect(
				writes.some((w) => w.op === 'remove' && w.path === 'liveDraftWatchers/q1/me-uid'),
			).toBe(true);
		});

		it('heartbeat refreshes presence while watching', async () => {
			initLiveDrafts('q1');
			await startWatching();
			writes.length = 0;

			await vi.advanceTimersByTimeAsync(30_000);
			expect(
				writes.some((w) => w.op === 'update' && w.path === 'liveDraftWatchers/q1/me-uid'),
			).toBe(true);
		});

		it('getWatcherCount filters stale entries and excludes me', () => {
			initLiveDrafts('q1');
			pushWatchers({
				'me-uid': { lastActive: Date.now() },
				fresh1: { lastActive: Date.now() - 1_000 },
				fresh2: { lastActive: Date.now() - 5_000 },
				stale: { lastActive: Date.now() - 200_000 },
				junk: { nope: true },
			});

			expect(getWatcherCount()).toBe(2);
		});

		it('is a safe no-op without RTDB', async () => {
			rtdbAvailable = false;
			initLiveDrafts('q1');
			await startWatching();
			expect(writes).toHaveLength(0);
			expect(getWatcherCount()).toBe(0);
		});
	});

	describe('getUserColor', () => {
		it('is deterministic per uid', () => {
			expect(getUserColor('abc')).toBe(getUserColor('abc'));
		});

		it('returns a hex color', () => {
			expect(getUserColor('anything')).toMatch(/^#[0-9a-f]{6}$/);
		});
	});
});
