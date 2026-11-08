/**
 * The per-question rebuild lease, and the synthesis-queue in-flight check.
 */

const docs = new Map<string, Record<string, unknown>>();

jest.mock('firebase-admin/firestore', () => {
	const ref = (path: string) => ({
		path,
		get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
		collection: (sub: string) => ({ doc: (id: string) => ref(`${path}/${sub}/${id}`) }),
	});

	return {
		getFirestore: jest.fn(() => ({
			collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
			runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
				fn({
					get: async (r: { path: string }) => ({
						exists: docs.has(r.path),
						data: () => docs.get(r.path),
					}),
					set: (r: { path: string }, data: Record<string, unknown>) => {
						docs.set(r.path, { ...(docs.get(r.path) ?? {}), ...data });
					},
				}),
		})),
	};
});
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { acquireLease, isSynthesisRunInFlight, releaseLease } from '../rebuildStore';

beforeEach(() => docs.clear());

describe('rebuild lease', () => {
	it('a second holder is refused while the lease is live', async () => {
		expect(await acquireLease('q1', 'h1')).toBe(true);
		expect(await acquireLease('q1', 'h2')).toBe(false);
	});

	it('is free again once released by its holder', async () => {
		await acquireLease('q1', 'h1');
		await releaseLease('q1', 'h1');

		expect(await acquireLease('q1', 'h2')).toBe(true);
	});

	it('a stranger cannot release it', async () => {
		await acquireLease('q1', 'h1');
		await releaseLease('q1', 'intruder');

		expect(await acquireLease('q1', 'h2')).toBe(false);
	});

	it('an expired lease can be taken', async () => {
		docs.set('_themeRebuild/q1', { leaseUntil: Date.now() - 1, holder: 'crashed' });

		expect(await acquireLease('q1', 'h2')).toBe(true);
	});
});

describe('isSynthesisRunInFlight', () => {
	it('is true while the queue run is running, false when done', async () => {
		docs.set('synthesisQueue/q1', { status: 'running' });
		expect(await isSynthesisRunInFlight('q1')).toBe(true);

		docs.set('synthesisQueue/q1', { status: 'done' });
		expect(await isSynthesisRunInFlight('q1')).toBe(false);
		expect(await isSynthesisRunInFlight('q2')).toBe(false);
	});
});
