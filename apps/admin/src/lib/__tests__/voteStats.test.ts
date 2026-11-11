import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDoc, getDocs, getCountFromServer, doc, collection } = vi.hoisted(() => ({
	getDoc: vi.fn(),
	getDocs: vi.fn(),
	getCountFromServer: vi.fn(),
	doc: vi.fn((_db: unknown, _name: string, id: string) => ({ id })),
	collection: vi.fn(),
}));

vi.mock('../firebase', () => ({
	db: {},
	collection,
	doc,
	getDoc,
	getDocs,
	getCountFromServer,
	updateDoc: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
	orderBy: vi.fn(),
	limit: vi.fn(),
	startAfter: vi.fn(),
	onSnapshot: vi.fn(),
}));

const { fetchVoteCount, fetchVotesPerDay, sumAdminStats } = await import('../queries');

type StatTotals = Record<string, number>;

function serveStats(totals: StatTotals): void {
	getDoc.mockImplementation(async (ref: { id: string }) => {
		const match = Object.entries(totals).find(([key]) => ref.id.includes(key));

		return match
			? { exists: () => true, data: () => ({ total: match[1] }) }
			: { exists: () => false, data: () => undefined };
	});
}

describe('vote totals on the admin dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('adds the yearly counters into one all-time total', async () => {
		const thisYear = new Date().getFullYear();
		serveStats({ [String(thisYear)]: 40, [String(thisYear - 1)]: 2 });

		await expect(fetchVoteCount()).resolves.toBe(42);
	});

	it('reads daily counters, one bucket per day and zero for a quiet day', async () => {
		const today = new Date().toISOString().slice(0, 10);
		serveStats({ [today]: 7 });

		const buckets = await fetchVotesPerDay(3);

		expect(buckets).toHaveLength(3);
		expect(buckets[2]).toEqual({ date: today, count: 7 });
		expect(buckets[0].count).toBe(0);
	});

	it('never touches the vote documents', async () => {
		serveStats({});

		await fetchVoteCount();
		await fetchVotesPerDay(1);

		expect(getCountFromServer).not.toHaveBeenCalled();
		expect(getDocs).not.toHaveBeenCalled();
		expect(collection).not.toHaveBeenCalled();
	});

	it('counts a missing stat doc as zero', () => {
		expect(sumAdminStats([null, null])).toBe(0);
	});
});
