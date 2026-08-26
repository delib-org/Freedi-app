/**
 * Odyssey digest scheduler — runs hourly, finds users whose chosen local
 * hours resolve to the current UTC hour, builds each one's voyage-story
 * digest and rides it through the engagement notification queue (which
 * handles retries, status, quiet hours and the email channel).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
	functionConfig,
} from '@freedi/shared-types';
import type { NotificationQueueItem, NotificationSettings } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { buildOdysseyDigest } from '../digest/odysseyDigestBuilder';
import { odysseyUnsubscribeToken } from '../fn_odysseyDigestUnsubscribe';

const getDb = () => getFirestore();

const ODYSSEY_BASE_URL = process.env.ODYSSEY_APP_URL || 'https://wizcol-od.web.app';

/** The functions origin hosting the unsubscribe HTTP endpoint. */
const UNSUBSCRIBE_BASE =
	process.env.FUNCTIONS_PUBLIC_URL || 'https://me-west1-wizcol-app.cloudfunctions.net';

function getHourInTimezone(timezone: string): number {
	try {
		return Number(
			new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				hour: 'numeric',
				hour12: false,
			}).format(new Date()),
		);
	} catch {
		return new Date().getUTCHours();
	}
}

export const sendOdysseyDigests = onSchedule(
	{
		schedule: '0 * * * *',
		timeZone: 'UTC',
		retryCount: 2,
		memory: '512MiB',
		region: functionConfig.region,
	},
	async (): Promise<void> => {
		const start = Date.now();
		try {
			const result = await processOdysseyDigests();
			logger.info('Odyssey digest run complete', { ...result, durationMs: Date.now() - start });
		} catch (error) {
			logError(error, { operation: 'odyssey.sendOdysseyDigests' });
		}
	},
);

/**
 * One run: everyone opted in whose local hour matches now.
 * Exported for tests and manual emulator invocation.
 */
export async function processOdysseyDigests(): Promise<{
	usersMatched: number;
	digestsSent: number;
	skippedQuiet: number;
	errors: number;
}> {
	const db = getDb();
	let usersMatched = 0;
	let digestsSent = 0;
	let errors = 0;

	const settingsSnap = await db
		.collection(Collections.notificationSettings)
		.where('odysseyDigest.enabled', '==', true)
		.limit(500)
		.get();

	for (const doc of settingsSnap.docs) {
		const settings = doc.data() as NotificationSettings;
		const cadence = settings.odysseyDigest;
		if (!cadence?.enabled || (!cadence.everyUpdate && cadence.hoursLocal.length === 0)) continue;
		if (settings.muted || settings.perApp?.[SourceApp.ODYSSEY]?.muted) continue;

		// "Every update" rides every hourly run — the builder's nothing-changed
		// guard is what keeps it from being every hour in practice.
		const localHour = getHourInTimezone(cadence.timezone || 'Asia/Jerusalem');
		if (!cadence.everyUpdate && !cadence.hoursLocal.includes(localHour)) continue;
		usersMatched += 1;

		try {
			const unsubscribeUrl = `${UNSUBSCRIBE_BASE}/odysseyDigestUnsubscribe?userId=${encodeURIComponent(settings.userId)}&t=${odysseyUnsubscribeToken(settings.userId)}`;
			const built = await buildOdysseyDigest({
				userId: settings.userId,
				appBaseUrl: ODYSSEY_BASE_URL,
				unsubscribeUrl,
			});
			if (!built) continue;

			const now = Date.now();
			const queueItemId = `odyssey-digest--${settings.userId}--${now}`;
			const item: NotificationQueueItem = {
				queueItemId,
				userId: settings.userId,
				title: built.digest.subject,
				body: built.digest.bodyText,
				emailHtml: built.digest.emailHtml,
				// Also as a header (List-Unsubscribe), not only a footer link —
				// the header is what mail providers actually read
				unsubscribeUrl,
				channels: [NotificationChannel.EMAIL],
				sourceApp: SourceApp.ODYSSEY,
				targetPath: '/map',
				deliverAt: null,
				frequency: NotificationFrequency.DAILY,
				triggerType: NotificationTriggerType.ODYSSEY_DIGEST,
				status: NotificationQueueStatus.PENDING,
				createdAt: now,
			};

			await db.collection(Collections.notificationQueue).doc(queueItemId).set(item);
			// State advances only after the item is safely queued — a failed
			// enqueue leaves the diff baseline where it was, so nothing is lost.
			await db.collection(Collections.odysseyDigestState).doc(settings.userId).set(built.nextState);
			digestsSent += 1;
		} catch (error) {
			errors += 1;
			logError(error, {
				operation: 'odyssey.processOdysseyDigests',
				userId: settings.userId,
			});
		}
	}

	return { usersMatched, digestsSent, skippedQuiet: 0, errors };
}
