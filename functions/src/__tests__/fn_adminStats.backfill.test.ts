import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Collections } from '@freedi/shared-types';
import { createFakeDb } from '../progress/__tests__/fakeDb';
import type { FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('../index', () => ({
	get db() {
		return fake.db;
	},
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { drainAdminStatShards, incrementShardedStat } from '../adminStats/adminStatShards';
import { backfillAdminStats } from '../fn_adminStats';

const CREATED_AT = Date.UTC(2026, 10, 10);
const DAY = 'evaluations_2026-11-10';
const PERIOD = {
	docId: DAY,
	collection: 'evaluations',
	periodType: 'day',
	periodKey: '2026-11-10',
};

function respond() {
	const res = { status: jest.fn(() => res), json: jest.fn(() => res) };

	return res as never;
}

describe('backfillAdminStats and the shards', () => {
	beforeEach(() => {
		fake = createFakeDb();
	});

	it('does not count again what was waiting in a shard', async () => {
		fake.seed(Collections.evaluations, 'e1', { createdAt: CREATED_AT });
		await incrementShardedStat([PERIOD]);

		await backfillAdminStats({ body: { collection: 'evaluations' } } as never, respond());
		await drainAdminStatShards();

		expect(fake.read(Collections.adminStats, DAY)?.total).toBe(1);
	});
});
