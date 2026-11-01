import { StatementSubscription } from '@freedi/shared-types';
import { UI } from '@/constants/common';
import { nextPageSize, oldestCreatedAt, planShowMore } from '../membersPaging';

const withCreatedAt = (createdAt: number) => ({ createdAt }) as StatementSubscription;

describe('membersPaging', () => {
	describe('oldestCreatedAt', () => {
		it('is null for an empty list', () => {
			expect(oldestCreatedAt([])).toBeNull();
		});

		it('returns the smallest createdAt — the cursor for the next older page', () => {
			expect(oldestCreatedAt([withCreatedAt(30), withCreatedAt(10), withCreatedAt(20)])).toBe(10);
		});
	});

	describe('planShowMore', () => {
		it('pages locally while loaded rows remain hidden', () => {
			expect(planShowMore({ shownCount: 10, matchingCount: 25, hasMoreOnServer: true })).toBe(
				'local',
			);
		});

		it('asks Firestore once every loaded row is shown and more exist there', () => {
			expect(planShowMore({ shownCount: 100, matchingCount: 100, hasMoreOnServer: true })).toBe(
				'server',
			);
		});

		it('stops when everything is loaded and shown', () => {
			expect(planShowMore({ shownCount: 5, matchingCount: 5, hasMoreOnServer: false })).toBe(
				'none',
			);
		});
	});

	describe('nextPageSize', () => {
		it('caps a local page at the remaining rows', () => {
			expect(nextPageSize({ shownCount: 10, matchingCount: 15, hasMoreOnServer: false })).toBe(5);
		});

		it('offers a full page when the next one comes from Firestore', () => {
			expect(nextPageSize({ shownCount: 10, matchingCount: 10, hasMoreOnServer: true })).toBe(
				UI.MEMBERS_LOAD_MORE_COUNT,
			);
		});

		it('is 0 when there is nothing more', () => {
			expect(nextPageSize({ shownCount: 10, matchingCount: 10, hasMoreOnServer: false })).toBe(0);
		});
	});
});
