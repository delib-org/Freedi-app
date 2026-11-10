import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Collections } from '@freedi/shared-types';
import { createFakeDb } from '../../progress/__tests__/fakeDb';
import type { FakeDb } from '../../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
	ADMIN_STAT_SHARD_COUNT,
	drainAdminStatShards,
	getAdminStatShardId,
	incrementShardedStat,
} from '../adminStatShards';

const CANONICAL = 'evaluations_2026-11-10';
const PERIOD = {
	docId: CANONICAL,
	collection: 'evaluations',
	periodType: 'day',
	periodKey: '2026-11-10',
};

const shardDocs = (): Array<Record<string, unknown>> => {
	const rows = fake.store.get(Collections.adminStats) ?? new Map();

	return [...rows.entries()].filter(([id]) => id !== CANONICAL).map(([, doc]) => doc);
};
const pendingTotal = (): number =>
	shardDocs().reduce((sum, doc) => sum + Number(doc.pending ?? 0), 0);
const canonical = () => fake.read(Collections.adminStats, CANONICAL);

describe('admin stat shards', () => {
	beforeEach(() => {
		fake = createFakeDb();
	});

	it('writes to shards and never to the shared document', async () => {
		for (let i = 0; i < 25; i += 1) await incrementShardedStat([PERIOD]);

		expect(canonical()).toBeUndefined();
		expect(pendingTotal()).toBe(25);
		expect(shardDocs().length).toBeLessThanOrEqual(ADMIN_STAT_SHARD_COUNT);
	});

	it('adds pending counts to the canonical document, keeping what it already has', async () => {
		fake.seed(Collections.adminStats, CANONICAL, { total: 100 });
		for (let i = 0; i < 25; i += 1) await incrementShardedStat([PERIOD]);

		const result = await drainAdminStatShards();

		expect(result.events).toBe(25);
		expect(canonical()).toMatchObject({
			total: 125,
			collection: 'evaluations',
			periodType: 'day',
			periodKey: '2026-11-10',
		});
		expect(pendingTotal()).toBe(0);
	});

	it('does not double count when a drain runs again', async () => {
		for (let i = 0; i < 10; i += 1) await incrementShardedStat([PERIOD]);

		await drainAdminStatShards();
		const second = await drainAdminStatShards();

		expect(second.events).toBe(0);
		expect(canonical()?.total).toBe(10);
	});

	it('keeps counts that land after a drain for the next one', async () => {
		await incrementShardedStat([PERIOD]);
		await drainAdminStatShards();
		await incrementShardedStat([PERIOD]);
		await drainAdminStatShards();

		expect(canonical()?.total).toBe(2);
	});

	it('uses the shard id format the drain can find', () => {
		expect(getAdminStatShardId(CANONICAL, 3)).toBe(`${CANONICAL}__shard3`);
	});
});
