import { Collections, EngagementLevel, NotificationChannel, SourceApp } from '@freedi/shared-types';
import type { NotificationQueueItem, UserEngagement } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fake.db,
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogError = jest.fn();
jest.mock('../../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import { checkAndNotifyLevelUp } from '../levelProgression';
import { checkAndAwardBadges } from '../badgeEngine';
import { badgeCopy } from '../../notifications/noticeText';

const USER = 'u1';

function queued(): NotificationQueueItem[] {
	return [
		...(fake.store.get(Collections.notificationQueue)?.values() ?? []),
	] as unknown as NotificationQueueItem[];
}

function engagement(overrides: Partial<UserEngagement>): UserEngagement {
	return {
		badges: [],
		streak: { currentStreak: 0 },
		...overrides,
	} as unknown as UserEngagement;
}

function storeLanguage(defaultLanguage: string): void {
	fake.seed(Collections.users, USER, { defaultLanguage });
}

describe('level and badge notices', () => {
	beforeEach(() => {
		fake = createFakeDb();
		mockLogError.mockClear();
	});

	describe('checkAndNotifyLevelUp', () => {
		const levelUp = (from: EngagementLevel, to: EngagementLevel): Promise<EngagementLevel | null> =>
			checkAndNotifyLevelUp(USER, from, to, SourceApp.MAIN);

		it('sends nothing when the level did not rise', async () => {
			await expect(
				levelUp(EngagementLevel.CONTRIBUTOR, EngagementLevel.CONTRIBUTOR),
			).resolves.toBeNull();
			expect(queued()).toHaveLength(0);
		});

		it('goes in-app only, to the screen that exists', async () => {
			await levelUp(EngagementLevel.OBSERVER, EngagementLevel.PARTICIPANT);

			expect(queued()[0].channels).toEqual([NotificationChannel.IN_APP]);
			expect(queued()[0].targetPath).toBe('/my/engagement');
		});

		it.each([
			[EngagementLevel.PARTICIPANT, 2],
			[EngagementLevel.CONTRIBUTOR, 3],
			[EngagementLevel.ADVOCATE, 4],
			[EngagementLevel.LEADER, 5],
		])('shows stored level %i as level %i', async (stored, shown) => {
			storeLanguage('en');

			await levelUp(EngagementLevel.OBSERVER, stored);

			expect(queued()[0].body).toBe(`Thanks for taking part. You've reached level ${shown}.`);
		});

		it('uses no level name', async () => {
			storeLanguage('en');

			await levelUp(EngagementLevel.CONTRIBUTOR, EngagementLevel.ADVOCATE);

			expect(`${queued()[0].title} ${queued()[0].body}`).not.toMatch(
				/advocate|leader|contributor/i,
			);
			expect(queued()[0].title).toBe('New level');
		});

		it('writes Hebrew to someone stored as Hebrew', async () => {
			storeLanguage('he');

			await levelUp(EngagementLevel.OBSERVER, EngagementLevel.PARTICIPANT);

			expect(queued()[0]).toMatchObject({
				title: 'רמה חדשה',
				body: 'תודה על ההשתתפות. הגעת לרמה 2.',
			});
		});

		it('defaults to Hebrew when no language is stored', async () => {
			await levelUp(EngagementLevel.OBSERVER, EngagementLevel.PARTICIPANT);

			expect(queued()[0].title).toBe('רמה חדשה');
		});

		it('still reports the level when the notice cannot be written', async () => {
			const realCollection = fake.db.collection;
			fake.db.collection = (name: string) => {
				if (name === Collections.notificationQueue) throw new Error('unavailable');

				return realCollection(name);
			};

			await expect(levelUp(EngagementLevel.OBSERVER, EngagementLevel.PARTICIPANT)).resolves.toBe(
				EngagementLevel.PARTICIPANT,
			);
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({ operation: 'engagement.checkAndNotifyLevelUp', userId: USER }),
			);
		});
	});

	describe('checkAndAwardBadges', () => {
		const award = (overrides: Partial<UserEngagement>): ReturnType<typeof checkAndAwardBadges> =>
			checkAndAwardBadges(USER, engagement(overrides), SourceApp.MAIN);

		it('goes in-app only, to the screen that exists', async () => {
			await award({ totalVotes: 1 });

			expect(queued()[0].channels).toEqual([NotificationChannel.IN_APP]);
			expect(queued()[0].targetPath).toBe('/my/engagement');
		});

		it('writes the badge in English to someone stored as English', async () => {
			storeLanguage('en');

			await award({ totalEvaluations: 1 });

			expect(queued()[0]).toMatchObject({
				title: 'New badge',
				body: 'You earned the "First Voice" badge: Rated your first answer',
			});
		});

		it('writes the badge in Hebrew by default', async () => {
			await award({ totalEvaluations: 1 });

			expect(queued()[0]).toMatchObject({
				title: 'תג חדש',
				body: 'קיבלת את התג "קול ראשון": דירגת את התשובה הראשונה שלך',
			});
		});

		it("keeps to the person's language for a badge with no words", () => {
			expect(badgeCopy('he', 'badge_without_words').body).toBe('קיבלת תג חדש.');
		});

		it('awards nothing for a streak, since streak badges are gone', async () => {
			await expect(
				award({ streak: { currentStreak: 3 } } as Partial<UserEngagement>),
			).resolves.toEqual([]);
			expect(queued()).toHaveLength(0);
		});

		it('still awards the badge when the language cannot be read', async () => {
			const realCollection = fake.db.collection;
			fake.db.collection = (name: string) => {
				if (name === Collections.users) throw new Error('unavailable');

				return realCollection(name);
			};

			const badges = await award({ totalVotes: 1 });

			expect(badges.map((b) => b.badgeId)).toEqual(['first_vote']);
			expect(queued()[0].title).toBe('תג חדש');
		});
	});
});
