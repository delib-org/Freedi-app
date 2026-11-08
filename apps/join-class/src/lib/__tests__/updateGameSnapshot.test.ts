import { describe, expect, it, vi } from 'vitest';
import type { ClassGameSnapshot } from '@freedi/shared-types';

/**
 * A fake Firestore document with optimistic transactions like the real one: a transaction
 * that read the doc and finds it changed before it writes is run again from a fresh read.
 */
interface Tx {
	get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>;
	update: (ref: unknown, data: Record<string, unknown>) => void;
}

const store = { version: 0, data: {} as Record<string, unknown> };
let attempts = 0;

vi.mock('../firebase', () => ({
	db: {},
	collection: vi.fn(),
	doc: vi.fn(() => ({ path: 'game' })),
	getDoc: vi.fn(),
	getDocs: vi.fn(),
	query: vi.fn(),
	setDoc: vi.fn(),
	updateDoc: vi.fn(),
	where: vi.fn(),
	runTransaction: async (_db: unknown, fn: (tx: Tx) => Promise<unknown>): Promise<unknown> => {
		for (;;) {
			attempts += 1;
			const readAt = store.version;
			const pending: Array<Record<string, unknown>> = [];
			const tx: Tx = {
				get: async () => {
					const copy = JSON.parse(JSON.stringify(store.data)) as unknown;
					// let the other transaction run between this read and this write
					await Promise.resolve();

					return { exists: () => true, data: () => copy };
				},
				update: (_ref, data) => pending.push(data),
			};
			const result = await fn(tx);
			await Promise.resolve();
			if (readAt !== store.version) continue;
			for (const data of pending) store.data = { ...store.data, ...data };
			store.version += 1;

			return result;
		}
	},
}));
vi.mock('../resilientListeners', () => ({ resilientOnSnapshot: vi.fn() }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

import { updateGameSnapshot } from '../classPlans';
import { addQuestion, setQuestionText } from '../classroom/gameSnapshotEdit';

const base: ClassGameSnapshot = {
	questions: [
		{ key: 'a', text: 'A?', order: 0, classRole: 'guiding' },
		{ key: 'b', text: 'B?', order: 1, classRole: 'guiding' },
	],
	paragraphs: [],
	introVideos: [],
	settings: {},
};

function reset(): void {
	store.version = 0;
	attempts = 0;
	store.data = {
		gameId: 'g',
		planId: 'p',
		ownerUid: 'u',
		title: 'Game',
		order: 0,
		snapshot: base,
		createdAt: 1,
		lastUpdate: 1,
	};
}

const snapshotNow = (): ClassGameSnapshot => store.data.snapshot as ClassGameSnapshot;

describe('updateGameSnapshot', () => {
	it('two interleaved edits of different questions both land', async () => {
		reset();
		await Promise.all([
			updateGameSnapshot('p', 'g', (s) => setQuestionText(s, 'a', 'A edited in tab 1')),
			updateGameSnapshot('p', 'g', (s) => setQuestionText(s, 'b', 'B edited in tab 2')),
		]);
		const texts = Object.fromEntries(snapshotNow().questions.map((q) => [q.key, q.text]));
		expect(texts).toEqual({ a: 'A edited in tab 1', b: 'B edited in tab 2' });
		expect(attempts).toBeGreaterThan(2); // the loser was run again on the fresh doc
	});

	it('an added question and an edit of another both land', async () => {
		reset();
		await Promise.all([
			updateGameSnapshot('p', 'g', (s) =>
				addQuestion(s, { key: 'c', text: 'C?', role: 'guiding' }),
			),
			updateGameSnapshot('p', 'g', (s) => setQuestionText(s, 'a', 'A2')),
		]);
		const keys = snapshotNow()
			.questions.map((q) => q.key)
			.sort();
		expect(keys).toEqual(['a', 'b', 'c']);
		expect(snapshotNow().questions.find((q) => q.key === 'a')?.text).toBe('A2');
	});

	it('an edit that throws writes nothing', async () => {
		reset();
		const tooLong = 'x'.repeat(2001);
		await expect(
			updateGameSnapshot('p', 'g', (s) => setQuestionText(s, 'a', tooLong)),
		).rejects.toThrow(/at most/);
		expect(snapshotNow()).toEqual(base);
		expect(store.version).toBe(0);
	});
});
