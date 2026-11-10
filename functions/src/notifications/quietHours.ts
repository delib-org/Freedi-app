/**
 * Quiet hours: when a person asked not to be interrupted. Shared by the instant
 * push, which drops the push, and the large-question digest, which waits.
 */
import { Collections, type QuietHours } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';

const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60 * 1000;

function toMinutes(time: string): number {
	const [hour, minute] = time.split(':').map(Number);

	return hour * 60 + minute;
}

/** Minutes past local midnight. `% day` because this formatter can print midnight as 24:00. */
function localMinutes(timezone: string, at: Date): number {
	const formatted = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: timezone,
	}).format(at);

	return toMinutes(formatted) % MINUTES_PER_DAY;
}

/** Check if `at` falls within quiet hours for a user. */
export function isInQuietHours(
	config: QuietHours | null | undefined,
	at: Date = new Date(),
): boolean {
	if (!config || !config.enabled) return false;

	try {
		const current = localMinutes(config.timezone, at);
		const start = toMinutes(config.startTime);
		const end = toMinutes(config.endTime);

		// Overnight quiet hours (e.g. 22:00 - 08:00) span midnight.
		return start > end ? current >= start || current < end : current >= start && current < end;
	} catch (error) {
		logger.error('Error checking quiet hours:', error);

		return false;
	}
}

/** The moment the current quiet window ends. Call only while `isInQuietHours` is true. */
export function quietHoursEndAt(config: QuietHours, now: number): number {
	const current = localMinutes(config.timezone, new Date(now));
	const minutesLeft =
		(toMinutes(config.endTime) - current + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY;

	return now + minutesLeft * MINUTE_MS;
}

/**
 * Quiet hours per user. They live on `notificationSettings/{uid}`; during
 * migration the legacy per-device value on `pushNotifications` is the fallback.
 * A failed read counts as no quiet hours, so nobody loses a push to an error.
 */
export async function loadQuietHours(
	db: Firestore,
	userIds: readonly string[],
): Promise<Map<string, QuietHours | null>> {
	const quietHours = new Map<string, QuietHours | null>();

	await Promise.all(
		[...new Set(userIds)].map(async (userId) => {
			try {
				const settings = await db.collection(Collections.notificationSettings).doc(userId).get();
				const fromSettings = settings.exists
					? (settings.data()?.quietHours as QuietHours | undefined)
					: undefined;
				if (fromSettings) {
					quietHours.set(userId, fromSettings);

					return;
				}

				const tokens = await db
					.collection(Collections.pushNotifications)
					.where('userId', '==', userId)
					.limit(1)
					.get();
				quietHours.set(
					userId,
					tokens.empty
						? null
						: (tokens.docs[0].data().quietHours as QuietHours | undefined) || null,
				);
			} catch (error) {
				logger.warn(`Error fetching quiet hours for user ${userId}:`, error);
				quietHours.set(userId, null);
			}
		}),
	);

	return quietHours;
}
